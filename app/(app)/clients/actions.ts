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
import { getCurrentProfile } from "@/lib/auth/profile";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteInvitationStorage } from "@/lib/api/invitation-storage";
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
  // POLISH-43 — optional `code` lets callers branch on a failure kind (e.g.
  // "not_found" → self-heal the list) without string-matching the message.
  | { ok: false; error: string; code?: string };

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
    // POLISH-44 (CHANGE 5) — diagnostic logging on the soft-delete path.
    const me = await getCurrentProfile();
    console.error("[CLIENT SOFT DELETE]", { clientId: id, role: me?.role ?? null });
    // POLISH-44 — soft delete (stamp deleted_at). Sites/quotes/jobs/invoices/
    // contacts/attachments are intentionally PRESERVED (not cascaded).
    const deleted = await deleteClient(id);
    if (!deleted) {
      // 0-row means the client is already archived or the id is unknown — either
      // way the list is stale, so ask the caller to refresh (CHANGE 2 reuse).
      const result = {
        ok: false as const,
        error:
          "This client is already archived or no longer exists. Refreshing the list…",
        code: "not_found",
      };
      console.error("[CLIENT SOFT DELETE RESULT]", {
        ok: false,
        error: result.error,
      });
      return result;
    }
    // ACT-1: activity log survives (no FK on activity_log.entity_id).
    await logActivity("client", id, "delete", {});
    revalidatePath("/clients");
    console.error("[CLIENT SOFT DELETE RESULT]", { ok: true, error: null });
    return { ok: true, data: { id } };
  } catch (e) {
    const result = fail(e);
    console.error("[CLIENT SOFT DELETE RESULT]", {
      ok: false,
      error: result.error,
    });
    return result;
  }
}

/**
 * POLISH-45 — IRREVERSIBLE hard delete of a client and every related record
 * (sites, quotes, invoices, projects, contacts, inventory, attachments). Admin
 * only. Requires the caller to re-type the client's legal name (verified again
 * server-side). The DB cascade runs in a single atomic plpgsql function
 * (hard_delete_client, migration 0069) so a missed FK rolls back cleanly rather
 * than leaving partial state. Storage objects are removed best-effort after the
 * DB cascade succeeds. activity_log is intentionally preserved.
 */
export async function hardDeleteClientAction(
  clientId: string,
  confirmedName: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await getCurrentProfile();
    console.error("[HARD DELETE START]", {
      clientId,
      role: me?.role ?? null,
      confirmedName,
    });
    if (me?.role !== "Admin") {
      return {
        ok: false,
        error: "Only admins can permanently delete a client.",
        code: "forbidden",
      };
    }

    const admin = createAdminClient();
    const { data: client, error: cErr } = await admin
      .from("clients")
      .select("id, name, legal_name")
      .eq("id", clientId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) return { ok: false, error: "Client not found.", code: "not_found" };

    // Server-side confirmation (never trust the client-side gate alone). The
    // expected string is the legal name, falling back to the display name.
    const expected = (client.legal_name?.trim() || client.name?.trim() || "");
    if (confirmedName.trim() !== expected) {
      console.error("[HARD DELETE FAILED]", {
        error: "name_mismatch",
        stepFailed: "verify",
      });
      return {
        ok: false,
        error: "Confirmation text does not match client name",
        code: "name_mismatch",
      };
    }

    // Collect owned entity ids + storage paths BEFORE the cascade removes them.
    const [siteRes, quoteRes, invRes, projRes, inviteRes] = await Promise.all([
      admin.from("sites").select("id").eq("client_id", clientId),
      admin.from("quotes").select("id").eq("client_id", clientId),
      admin.from("invoices").select("id").eq("client_id", clientId),
      admin.from("projects").select("id").eq("client_id", clientId),
      admin.from("client_invitations").select("token").eq("client_id", clientId),
    ]);
    const siteIds = (siteRes.data ?? []).map((r) => r.id as string);
    const quoteIds = (quoteRes.data ?? []).map((r) => r.id as string);
    const invoiceIds = (invRes.data ?? []).map((r) => r.id as string);
    const projectIds = (projRes.data ?? []).map((r) => r.id as string);
    const tokens = (inviteRes.data ?? [])
      .map((r) => r.token as string | null)
      .filter((t): t is string => !!t);

    const attach = (type: string, ids: string[]) =>
      admin.from("attachments").select("bucket,path").eq("entity_type", type).in("entity_id", ids);
    type AttachRow = { bucket: string; path: string };
    type AttachRes = { data: AttachRow[] | null };
    const attachPromises: PromiseLike<AttachRes>[] = [attach("client", [clientId])];
    if (siteIds.length) attachPromises.push(attach("site", siteIds));
    if (quoteIds.length) attachPromises.push(attach("quote", quoteIds));
    if (invoiceIds.length) attachPromises.push(attach("invoice", invoiceIds));
    if (projectIds.length) attachPromises.push(attach("project", projectIds));
    const attachResults = await Promise.all(attachPromises);
    const objects = attachResults.flatMap((r) => r.data ?? []);

    // Atomic DB cascade (migration 0069). All-or-nothing: a missed FK rolls back.
    const { error: rpcErr } = await admin.rpc("hard_delete_client", {
      p_client_id: clientId,
    });
    if (rpcErr) {
      console.error("[HARD DELETE FAILED]", {
        error: rpcErr.message,
        stepFailed: "rpc_cascade",
      });
      return {
        ok: false,
        error: `Permanent delete failed (no records were removed): ${rpcErr.message}`,
        code: "cascade_failed",
      };
    }

    // DB is gone; clean up storage objects (best-effort — files only).
    const byBucket = new Map<string, string[]>();
    for (const o of objects) {
      if (!o.path) continue;
      const arr = byBucket.get(o.bucket) ?? [];
      arr.push(o.path);
      byBucket.set(o.bucket, arr);
    }
    let removedFiles = 0;
    for (const [bucket, paths] of byBucket) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
      if (rmErr) console.error("[HARD DELETE STEP]", { step: `storage:${bucket}`, error: rmErr.message });
      else removedFiles += paths.length;
    }
    for (const token of tokens) {
      await deleteInvitationStorage(token).catch(() => {});
    }
    console.error("[HARD DELETE STEP]", {
      step: "storage",
      removedFiles,
      invitationTokens: tokens.length,
    });

    await logActivity("client", clientId, "delete", {});
    revalidatePath("/clients");
    console.error("[HARD DELETE SUCCESS]", { clientId });
    return { ok: true, data: { id: clientId } };
  } catch (e) {
    const result = fail(e);
    console.error("[HARD DELETE FAILED]", { error: result.error, stepFailed: "exception" });
    return result;
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
    // POLISH-46 (CHANGE 8) — soft-delete logging.
    const me = await getCurrentProfile();
    console.error("[SITE SOFT DELETE]", { siteId: id, role: me?.role ?? null });
    // POLISH-46 — soft delete (stamp deleted_at). Related records and the parent
    // client are intentionally PRESERVED (not cascaded, attachments kept).
    const deleted = await deleteSite(id);
    if (!deleted) {
      const result = {
        ok: false as const,
        error:
          "This site is already archived or no longer exists. Refreshing the list…",
        code: "not_found",
      };
      console.error("[SITE SOFT DELETE RESULT]", { ok: false, error: result.error });
      return result;
    }
    await logActivity("site", id, "delete", {});
    revalidatePath("/sites");
    revalidatePath("/clients");
    console.error("[SITE SOFT DELETE RESULT]", { ok: true, error: null });
    return { ok: true, data: { id } };
  } catch (e) {
    const result = fail(e);
    console.error("[SITE SOFT DELETE RESULT]", { ok: false, error: result.error });
    return result;
  }
}

/**
 * POLISH-46 — IRREVERSIBLE hard delete of a SINGLE site and everything beneath
 * it (invoices, projects, contacts, inventory, attachments), via the atomic
 * hard_delete_site() function (0070). Quotes are preserved (site link cleared).
 * The parent client is NEVER touched. Admin only; re-verifies the site name
 * server-side. Storage objects removed best-effort after the DB cascade.
 */
export async function hardDeleteSiteAction(
  siteId: string,
  confirmedName: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await getCurrentProfile();
    console.error("[HARD DELETE SITE]", {
      siteId,
      role: me?.role ?? null,
      confirmedName,
    });
    if (me?.role !== "Admin") {
      return {
        ok: false,
        error: "Only admins can permanently delete a site.",
        code: "forbidden",
      };
    }

    const admin = createAdminClient();
    const { data: site, error: sErr } = await admin
      .from("sites")
      .select("id, name")
      .eq("id", siteId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!site) return { ok: false, error: "Site not found.", code: "not_found" };

    const expected = (site.name?.trim() || "");
    if (confirmedName.trim() !== expected) {
      console.error("[HARD DELETE SITE RESULT]", { ok: false, error: "name_mismatch" });
      return {
        ok: false,
        error: "Confirmation text does not match site name",
        code: "name_mismatch",
      };
    }

    // Collect owned project/invoice ids + attachment storage paths BEFORE the
    // cascade removes them. Quote attachments are NOT collected (quotes survive).
    const [projRes, invRes] = await Promise.all([
      admin.from("projects").select("id").eq("site_id", siteId),
      admin.from("invoices").select("id").eq("site_id", siteId),
    ]);
    const projectIds = (projRes.data ?? []).map((r) => r.id as string);
    const invoiceIds = (invRes.data ?? []).map((r) => r.id as string);

    const attach = (type: string, ids: string[]) =>
      admin.from("attachments").select("bucket,path").eq("entity_type", type).in("entity_id", ids);
    type AttachRes = { data: { bucket: string; path: string }[] | null };
    const attachPromises: PromiseLike<AttachRes>[] = [attach("site", [siteId])];
    if (projectIds.length) attachPromises.push(attach("project", projectIds));
    if (invoiceIds.length) attachPromises.push(attach("invoice", invoiceIds));
    const attachResults = await Promise.all(attachPromises);
    const objects = attachResults.flatMap((r) => r.data ?? []);

    const { error: rpcErr } = await admin.rpc("hard_delete_site", {
      p_site_id: siteId,
    });
    if (rpcErr) {
      console.error("[HARD DELETE SITE RESULT]", {
        ok: false,
        error: rpcErr.message,
        stepFailed: "rpc_cascade",
      });
      return {
        ok: false,
        error: `Permanent delete failed (no records were removed): ${rpcErr.message}`,
        code: "cascade_failed",
      };
    }

    const byBucket = new Map<string, string[]>();
    for (const o of objects) {
      if (!o.path) continue;
      const arr = byBucket.get(o.bucket) ?? [];
      arr.push(o.path);
      byBucket.set(o.bucket, arr);
    }
    let removedFiles = 0;
    for (const [bucket, paths] of byBucket) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
      if (rmErr) console.error("[HARD DELETE SITE RESULT]", { step: `storage:${bucket}`, error: rmErr.message });
      else removedFiles += paths.length;
    }

    await logActivity("site", siteId, "delete", {});
    revalidatePath("/sites");
    revalidatePath("/clients");
    console.error("[HARD DELETE SITE RESULT]", { ok: true, siteId, removedFiles });
    return { ok: true, data: { id: siteId } };
  } catch (e) {
    const result = fail(e);
    console.error("[HARD DELETE SITE RESULT]", { ok: false, error: result.error });
    return result;
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
