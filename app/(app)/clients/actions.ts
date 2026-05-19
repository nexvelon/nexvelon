"use server";

import { revalidatePath } from "next/cache";
import {
  createClient,
  createContact,
  createSite,
  getClients,
  getContactsByClient,
  getSitesByClient,
  restoreClient,
  softDeleteClient,
  softDeleteContact,
  softDeleteSite,
  updateClient,
  updateContact,
  updateSite,
} from "@/lib/api/clients";
import { getCurrentProfile } from "@/lib/auth/profile";
import type {
  DbClientInsert,
  DbClientUpdate,
  DbClientWithCounts,
  DbContact,
  DbContactInsert,
  DbContactUpdate,
  DbSiteInsert,
  DbSiteUpdate,
} from "@/lib/types/database";

// Server actions return a uniform { ok, ... } shape so client callers can
// toast failures without unwrapping thrown errors across the network.
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return { ok: false, error: message };
}

// ----------------------------------------------------------------------------
// CL-2 Phase 3 — expanded-field validation
// ----------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBlank(v: unknown): boolean {
  return v == null || (typeof v === "string" && v.trim() === "");
}

/**
 * Validates the CL-2 expanded client payload. Partial-update friendly: each
 * rule only fires when its triggering field is present (and truthy) in the
 * payload, so an update that doesn't touch tax/portal/payment fields isn't
 * blocked by the stored row's state.
 *
 * The Guardian-OpCo rule additionally requires the caller to be an Admin —
 * mirrors the `requireAdmin()` gate used by app/(app)/users/actions.ts
 * (getCurrentProfile().role === "Admin").
 *
 * @returns null when valid, or the uniform { ok:false, error } on the first
 *          violation found.
 */
async function validateClientPayload(
  payload: DbClientInsert | DbClientUpdate
): Promise<{ ok: false; error: string } | null> {
  // tax_exempt = true → certificate number required
  if (payload.tax_exempt === true && isBlank(payload.tax_exempt_certificate_number)) {
    return {
      ok: false,
      error: "A tax-exempt certificate number is required when tax-exempt is enabled.",
    };
  }

  // portal_access_enabled = true → valid portal contact email required
  if (payload.portal_access_enabled === true) {
    const email = (payload.portal_contact_email ?? "").trim();
    if (email === "") {
      return {
        ok: false,
        error: "A portal contact email is required when portal access is enabled.",
      };
    }
    if (!EMAIL_RE.test(email)) {
      return { ok: false, error: "Portal contact email is not a valid email address." };
    }
  }

  // payment_terms = 'custom' → custom terms text required
  if (payload.payment_terms === "custom" && isBlank(payload.payment_terms_custom)) {
    return {
      ok: false,
      error: "Custom payment terms text is required when payment terms is 'custom'.",
    };
  }

  // allowed_opcos includes 'guardian' → caller must be Admin
  if (
    Array.isArray(payload.allowed_opcos) &&
    payload.allowed_opcos.includes("guardian")
  ) {
    const me = await getCurrentProfile();
    if (!me || me.role !== "Admin") {
      return { ok: false, error: "Only admins can grant Guardian access" };
    }
  }

  return null;
}

/**
 * When billing_same_as_primary_site is set, copy the address off the client's
 * first non-deleted site into the billing_* fields server-side (Phase 4 spec:
 * "server action handles the copy"). Returns a payload patch; on create there
 * is no client id / no sites yet, so this is effectively an edit-mode feature
 * and a no-op otherwise.
 */
async function applyBillingSameAsSite<T extends DbClientInsert | DbClientUpdate>(
  payload: T,
  clientId: string | null
): Promise<T> {
  if (payload.billing_same_as_primary_site !== true || !clientId) return payload;
  const sites = await getSitesByClient(clientId);
  const site = sites[0]; // getSitesByClient already filters deleted + orders
  if (!site) return payload;
  return {
    ...payload,
    billing_street: site.address_line1 ?? null,
    billing_unit: site.address_line2 ?? null,
    billing_city: site.city ?? null,
    billing_province: site.province ?? null,
    billing_postal: site.postal_code ?? null,
    billing_country: site.country ?? null,
  };
}

/**
 * Read helper exposed to the client drawer (a "use client" component can't
 * import the server-only lib/api). Mirrors the Phase 3 Guardian gate:
 * getCurrentProfile().role === "Admin".
 */
export async function getCurrentUserIsAdminAction(): Promise<
  ActionResult<{ isAdmin: boolean }>
> {
  try {
    const me = await getCurrentProfile();
    return { ok: true, data: { isAdmin: me?.role === "Admin" } };
  } catch (e) {
    return fail(e);
  }
}

/** The current primary contact for a client (or null), for the drawer's
 *  Primary Contact section. Wraps the existing getContactsByClient helper. */
export async function getPrimaryContactAction(
  clientId: string
): Promise<ActionResult<DbContact | null>> {
  try {
    const contacts = await getContactsByClient(clientId);
    const primary = contacts.find((c) => c.is_primary) ?? null;
    return { ok: true, data: primary };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Asserts the caller is an authenticated active Admin. Mirrors the
 * requireAdmin() gate in app/(app)/users/actions.ts (the canonical
 * admin-gate pattern).
 */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (me.status !== "Active")
    return { ok: false, error: "Your account is not active." };
  if (me.role !== "Admin")
    return { ok: false, error: "Admin access required." };
  return { ok: true };
}

/**
 * List clients for the view. `includeDeleted` is admin-gated — non-admins
 * can never pull archived rows even if the flag is forced. Used by the
 * "Show archived" toggle and to refresh the list after delete/restore.
 */
export async function listClientsAction(
  includeDeleted = false
): Promise<ActionResult<DbClientWithCounts[]>> {
  try {
    if (includeDeleted) {
      const gate = await requireAdmin();
      if (!gate.ok) return gate;
    }
    const rows = await getClients({ includeDeleted });
    return { ok: true, data: rows };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Restore a soft-deleted client (admin only). Never touches a live row.
 */
export async function restoreClientAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    const restored = await restoreClient(id);
    if (!restored) {
      return { ok: false, error: "Client not found or not archived" };
    }
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------

export async function createClientAction(
  payload: DbClientInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const invalid = await validateClientPayload(payload);
    if (invalid) return invalid;
    // No site exists yet on first create, so the billing-copy is a no-op
    // here; kept for symmetry / future create-with-site flows.
    const finalPayload = await applyBillingSameAsSite(payload, null);
    const row = await createClient(finalPayload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateClientAction(
  id: string,
  payload: DbClientUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const invalid = await validateClientPayload(payload);
    if (invalid) return invalid;
    const finalPayload = await applyBillingSameAsSite(payload, id);
    const row = await updateClient(id, finalPayload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteClientAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const deleted = await softDeleteClient(id);
    if (!deleted) {
      return { ok: false, error: "Client not found or already deleted" };
    }
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ----------------------------------------------------------------------------
// Sites
// ----------------------------------------------------------------------------

export async function createSiteAction(
  payload: DbSiteInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await createSite(payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSiteAction(
  id: string,
  payload: DbSiteUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateSite(id, payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSiteAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await softDeleteSite(id);
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ----------------------------------------------------------------------------
// Contacts
// ----------------------------------------------------------------------------

export async function createContactAction(
  payload: DbContactInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await createContact(payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateContactAction(
  id: string,
  payload: DbContactUpdate
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateContact(id, payload);
    revalidatePath("/clients");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContactAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await softDeleteContact(id);
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
