"use server";

import { revalidatePath } from "next/cache";
import {
  createClient,
  createContact,
  createSite,
  deleteClient,
  deleteContact,
  deleteSite,
  getClientById,
  getClients,
  getContactsByClient,
  getSitesByClient,
  listSites,
  updateClient,
  updateContact,
  updateSite,
} from "@/lib/api/clients";
import { computeChanges, logActivity } from "@/lib/api/activity-log";
import { deleteAttachmentsForEntity } from "@/app/(app)/attachments/actions";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DbClientInsert,
  DbClientUpdate,
  DbClientWithCounts,
  DbContact,
  DbContactInsert,
  DbContactUpdate,
  DbSite,
  DbSiteInsert,
  DbSiteStatus,
  DbSiteUpdate,
  DbSiteWithClient,
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
// ACT-1 — per-entity "before" fetchers for the activity-log diff. Clients
// reuse the existing getClientById helper; sites + contacts get a thin
// inline lookup since the lib/api/clients.ts file only exposes by-parent
// listers for those (getSitesByClient / getContactsByClient).
// ----------------------------------------------------------------------------

async function getSiteByIdForDiff(id: string): Promise<DbSite | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSiteByIdForDiff: ${error.message}`);
  return (data as DbSite | null) ?? null;
}

async function getContactByIdForDiff(id: string): Promise<DbContact | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getContactByIdForDiff: ${error.message}`);
  return (data as DbContact | null) ?? null;
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

// FIX-1: local requireAdmin() helper removed — its only consumers
// (listClientsAction's includeDeleted gate + restoreClientAction) were
// dropped with the hard-delete switch. The Guardian-OpCo Admin check in
// validateClientPayload reads getCurrentProfile().role directly inline.

/**
 * List clients for the view. FIX-1: dropped the `includeDeleted` param
 * + admin gate — hard-delete model means deleted rows don't exist.
 */
export async function listClientsAction(): Promise<
  ActionResult<DbClientWithCounts[]>
> {
  try {
    const rows = await getClients();
    return { ok: true, data: rows };
  } catch (e) {
    return fail(e);
  }
}

// FIX-1: restoreClientAction removed entirely. There is no longer a
// soft-deleted state to restore from; deletes are immediate. Activity
// log entries for the deleted entity survive per ACT-1 design.

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
    // ACT-1: best-effort log; never blocks the main mutation.
    await logActivity("client", row.id, "create", {});
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

    // ACT-1: fetch the row BEFORE mutating so we can compute the diff.
    // Reuses the existing getClientById (returns {client, sites, contacts}
    // — we only need .client).
    const before = await getClientById(id);
    if (!before) return { ok: false, error: "Client not found" };

    const row = await updateClient(id, finalPayload);

    // ACT-1: log only when there's an actual change (skip no-op saves).
    const changes = computeChanges(
      before.client as unknown as Record<string, unknown>,
      finalPayload as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("client", id, "update", changes);
    }

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
    // FIX-1: hard delete. Sites + contacts cascade via FK ON DELETE
    // CASCADE on their client_id (0001_clients_schema.sql).
    const deleted = await deleteClient(id);
    if (!deleted) {
      return { ok: false, error: "Client not found" };
    }
    // ATTACH-2: remove this client's attachments (objects + rows). Best-effort.
    await deleteAttachmentsForEntity("client", id).catch(() => {});
    // ACT-1: log survives the hard delete (no FK on activity_log.entity_id).
    await logActivity("client", id, "delete", {});
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ----------------------------------------------------------------------------
// Sites
// ----------------------------------------------------------------------------

/**
 * SITES-1 — cross-client site list for the dedicated /sites page. No
 * requireAdmin gate (general-purpose read, mirrors listClientsAction).
 */
export async function listSitesAction(
  filters?: { clientId?: string; status?: DbSiteStatus; search?: string }
): Promise<ActionResult<DbSiteWithClient[]>> {
  try {
    return { ok: true, data: await listSites(filters ?? {}) };
  } catch (e) {
    return fail(e);
  }
}

export async function createSiteAction(
  payload: DbSiteInsert
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await createSite(payload);
    await logActivity("site", row.id, "create", {});
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
    const before = await getSiteByIdForDiff(id);
    if (!before) return { ok: false, error: "Site not found" };

    const row = await updateSite(id, payload);

    const changes = computeChanges(
      before as unknown as Record<string, unknown>,
      payload as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("site", id, "update", changes);
    }

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
    // FIX-1: hard delete. Contacts referencing this site keep their
    // client_id (their site_id flips to NULL via FK ON DELETE SET NULL).
    const deleted = await deleteSite(id);
    if (!deleted) {
      return { ok: false, error: "Site not found" };
    }
    // SITE-DETAIL: remove this site's attachments (objects + rows). Best-effort,
    // mirrors the client/quote/product hard-delete cleanup.
    await deleteAttachmentsForEntity("site", id).catch(() => {});
    await logActivity("site", id, "delete", {});
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
    await logActivity("contact", row.id, "create", {});
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
    const before = await getContactByIdForDiff(id);
    if (!before) return { ok: false, error: "Contact not found" };

    const row = await updateContact(id, payload);

    const changes = computeChanges(
      before as unknown as Record<string, unknown>,
      payload as Record<string, unknown>
    );
    if (Object.keys(changes).length > 0) {
      await logActivity("contact", id, "update", changes);
    }

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
    // FIX-1: hard delete.
    const deleted = await deleteContact(id);
    if (!deleted) {
      return { ok: false, error: "Contact not found" };
    }
    await logActivity("contact", id, "delete", {});
    revalidatePath("/clients");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}
