import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ClientListFilters,
  DbClient,
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

// ============================================================================
// Server-only client API.
//
// Auth posture (Session A onwards)
// --------------------------------
// Backed by the cookie-aware server client from lib/supabase/server.ts. Every
// call carries the caller's Supabase Auth session, so RLS on the clients /
// sites / contacts tables is enforced (currently any authenticated user has
// SELECT / INSERT / UPDATE; per-role row scoping lands in Session C).
//
// Anonymous callers will get RLS-denied errors — guard pages with the auth
// middleware (middleware.ts) and the <RequireAuth> wrapper.
// ============================================================================

async function db() {
  return createSupabaseServerClient();
}

// ----------------------------------------------------------------------------
// Clients
// ----------------------------------------------------------------------------

export async function getClients(
  filters: ClientListFilters = {}
): Promise<DbClientWithCounts[]> {
  const supabase = await db();

  let query = supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  // POLISH-44 — soft-delete model: the list (and every picker fed by it) shows
  // ACTIVE clients only. Archived clients (deleted_at set) are hidden here but
  // remain in the DB so related rows keep their reference.
  query = query.is("deleted_at", null);

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    query = query.or(
      `name.ilike.%${q}%,legal_name.ilike.%${q}%,client_code.ilike.%${q}%`
    );
  }
  if (filters.tier) query = query.eq("tier", filters.tier);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);

  const { data: clientsRaw, error } = await query;
  if (error) throw new Error(`getClients: ${error.message}`);
  if (!clientsRaw || clientsRaw.length === 0) return [];

  // POLISH-3 — split out invite-created clients awaiting review. Filtered in JS
  // (not a DB `.eq`) so the list still works if migration 0056 hasn't been
  // applied yet (a missing column reads as undefined → treated as not-pending).
  const clients = clientsRaw.filter((c) => {
    const pending = (c as { pending_review?: boolean }).pending_review === true;
    return filters.pending_review ? pending : !pending;
  });
  if (clients.length === 0) return [];

  // Roll up site / contact counts in a single round-trip each (so we don't
  // N+1 against postgres).
  const ids = clients.map((c) => c.id);

  // FIX-1: dropped `is("deleted_at", null)` from these count rollups.
  // Hard delete means deleted rows don't exist; the filter is moot.
  const [sitesRes, contactsRes] = await Promise.all([
    supabase
      .from("sites")
      .select("client_id")
      .in("client_id", ids),
    supabase
      .from("contacts")
      .select("client_id")
      .in("client_id", ids),
  ]);

  if (sitesRes.error) throw new Error(`getClients/sites: ${sitesRes.error.message}`);
  if (contactsRes.error) throw new Error(`getClients/contacts: ${contactsRes.error.message}`);

  const siteCounts = new Map<string, number>();
  for (const row of sitesRes.data ?? []) {
    if (!row.client_id) continue;
    siteCounts.set(row.client_id, (siteCounts.get(row.client_id) ?? 0) + 1);
  }
  const contactCounts = new Map<string, number>();
  for (const row of contactsRes.data ?? []) {
    if (!row.client_id) continue;
    contactCounts.set(row.client_id, (contactCounts.get(row.client_id) ?? 0) + 1);
  }

  return (clients as DbClient[]).map((c) => ({
    ...c,
    site_count: siteCounts.get(c.id) ?? 0,
    contact_count: contactCounts.get(c.id) ?? 0,
  }));
}

export interface ClientWithRelations {
  client: DbClient;
  sites: DbSite[];
  contacts: DbContact[];
}

export async function getClientById(
  id: string
): Promise<ClientWithRelations | null> {
  const supabase = await db();
  // FIX-1: hard-delete model — `includeDeleted` param dropped; the
  // deleted_at filter is moot because deleted rows don't exist.
  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getClientById: ${error.message}`);
  if (!client) return null;

  const [sites, contacts] = await Promise.all([
    getSitesByClient(id),
    getContactsByClient(id),
  ]);

  return { client: client as DbClient, sites, contacts };
}

export async function createClient(payload: DbClientInsert): Promise<DbClient> {
  const supabase = await db();

  // CL-3a: auto-generate client_code if not provided. Format
  // C-{OPCO_PREFIX}-{YEAR}-{NNNN}, sequenced per opco+year combo. A
  // manually-entered code is left untouched (the guard skips it).
  const finalPayload: DbClientInsert = { ...payload };
  const OPCO_PREFIX: Record<string, string> = {
    integrated_solutions: "IS",
    guardian: "GD",
  };
  if (!finalPayload.client_code || finalPayload.client_code.trim() === "") {
    const year = new Date().getFullYear();
    const prefix = OPCO_PREFIX[finalPayload.default_opco ?? ""] ?? "XX";
    const codePrefix = `C-${prefix}-${year}-`;

    const { data: existing } = await supabase
      .from("clients")
      .select("client_code")
      .eq("default_opco", finalPayload.default_opco ?? "")
      .like("client_code", `${codePrefix}%`)
      .order("client_code", { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (existing && existing.length > 0 && existing[0].client_code) {
      const lastCode = existing[0].client_code as string;
      const match = lastCode.match(/-(\d{4})$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }

    finalPayload.client_code = `${codePrefix}${String(nextNum).padStart(4, "0")}`;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert(finalPayload)
    .select("*")
    .single();
  if (error) throw new Error(`createClient: ${error.message}`);
  return data as DbClient;
}

export async function updateClient(
  id: string,
  payload: DbClientUpdate
): Promise<DbClient> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("clients")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateClient: ${error.message}`);
  return data as DbClient;
}

/**
 * POLISH-44: SOFT-delete a client (stamp deleted_at) instead of a hard DELETE.
 * The row stays in the DB so related sites / quotes / jobs / invoices / contacts
 * keep their client_id reference intact (and the inventory_stock site FK is
 * never triggered, since no sites are deleted). Runs as an UPDATE, so it uses
 * the existing clients_update_authenticated RLS policy.
 *
 * Idempotent: deleting an already-archived client matches no row (the
 * `deleted_at IS NULL` guard), so it returns false — a safe no-op.
 *
 * Activity-log rows survive per ACT-1 design (no FK on activity_log.entity_id).
 *
 * @returns true when a row was archived; false when the id didn't match an
 *          active client (unknown id, or already archived).
 */
export async function deleteClient(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`deleteClient: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ----------------------------------------------------------------------------
// Sites
// ----------------------------------------------------------------------------

export async function getSitesByClient(clientId: string): Promise<DbSite[]> {
  const supabase = await db();
  // POLISH-46 — soft-delete model: only active sites (archived ones hidden).
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getSitesByClient: ${error.message}`);
  return (data ?? []) as DbSite[];
}

/**
 * SITES-1 — cross-client site list joined with a thin client slice.
 * Optional filters by client, status, and a name/site_code search.
 *
 * FIX-1: dropped the `is("deleted_at", null)` filter — hard-delete model
 * means deleted rows don't exist.
 */
export async function listSites(
  filters: {
    clientId?: string;
    status?: DbSiteStatus;
    search?: string;
  } = {}
): Promise<DbSiteWithClient[]> {
  const supabase = await db();
  let query = supabase
    .from("sites")
    .select("*, client:clients(id,name,client_code,default_opco,deleted_at)")
    // POLISH-46 — soft-delete model: the /sites list (and pickers) show active
    // sites only. Archived sites stay in the DB for related-record references.
    .is("deleted_at", null);

  if (filters.clientId) {
    query = query.eq("client_id", filters.clientId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    query = query.or(`name.ilike.%${q}%,site_code.ilike.%${q}%`);
  }

  // POLISH-48 — order by created_at DESC (newest first). Was `site_code ASC`,
  // which buried invite-created sites at the bottom: they have site_code = NULL
  // (siteInsertFrom omits it, unlike createSite's auto-generated code) and
  // Postgres sorts NULLs LAST for ASC, so a freshly-approved site appeared below
  // every coded site. Newest-first surfaces it immediately after approval.
  console.error("[LIST SITES]", { filters });
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listSites: ${error.message}`);
  const rows = (data ?? []) as DbSiteWithClient[];

  // POLISH-48 (CHANGE 2) — diagnostic: compare what the embed query returned to
  // the raw active-site count. A mismatch would prove a query/RLS drop (it does
  // not in our analysis); equality confirms the issue was ordering/visibility.
  const { count: totalInDb } = await supabase
    .from("sites")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  console.error("[LIST SITES RESULT]", {
    returnedCount: rows.length,
    totalInDb: totalInDb ?? null,
  });
  return rows;
}

/**
 * SITE-DETAIL — fetch one site joined with a thin slice of its parent client
 * (id/name/code/opco), for the /sites/[id] detail header + back-link. Mirrors
 * getClientById's single-row shape; returns null when the id is unknown.
 */
export async function getSiteById(
  id: string
): Promise<DbSiteWithClient | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("sites")
    .select("*, client:clients(id,name,client_code,default_opco,deleted_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSiteById: ${error.message}`);
  if (!data) return null;
  return data as DbSiteWithClient;
}

export async function createSite(payload: DbSiteInsert): Promise<DbSite> {
  const supabase = await db();

  // SITES-1: auto-generate site_code if not provided. Format
  // S-{client_code}-{NNN}, sequenced per client. A manually-entered code is
  // left untouched. Mirrors the createClient code-generation pattern.
  let finalPayload: DbSiteInsert = payload;
  if (!payload.site_code) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("client_code")
      .eq("id", payload.client_id)
      .single();

    const clientCode = clientRow?.client_code;
    if (clientCode) {
      const prefix = `S-${clientCode}-`;
      const { data: existing } = await supabase
        .from("sites")
        .select("site_code")
        .like("site_code", `${prefix}%`)
        .order("site_code", { ascending: false })
        .limit(1);

      let next = 1;
      if (existing && existing.length > 0 && existing[0].site_code) {
        const match = (existing[0].site_code as string).match(/-(\d+)$/);
        if (match) {
          next = parseInt(match[1], 10) + 1;
        }
      }

      finalPayload = {
        ...payload,
        site_code: `${prefix}${next.toString().padStart(3, "0")}`,
      };
    }
  }

  const { data, error } = await supabase
    .from("sites")
    .insert(finalPayload)
    .select("*")
    .single();
  if (error) throw new Error(`createSite: ${error.message}`);
  return data as DbSite;
}

export async function updateSite(
  id: string,
  payload: DbSiteUpdate
): Promise<DbSite> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("sites")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateSite: ${error.message}`);
  return data as DbSite;
}

/**
 * FIX-1: hard-delete a site. Contacts referencing this site via
 * site_id stay (their site_id flips to NULL via FK ON DELETE SET NULL,
 * preserving the contact at client-level).
 */
/**
 * POLISH-46: SOFT-delete a site (stamp deleted_at) instead of a hard DELETE.
 * Related records (invoices/quotes/projects/contacts/inventory/attachments) and
 * the parent client are preserved. Runs as an UPDATE (existing update RLS).
 * Idempotent: an already-archived site matches no row → returns false.
 */
export async function deleteSite(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("sites")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`deleteSite: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ----------------------------------------------------------------------------
// Contacts
// ----------------------------------------------------------------------------

/**
 * POLISH-50 — site-scoped contacts for the /sites/[id] Contacts section.
 * (Invite submit writes site contacts keyed by site_id; POLISH-49.)
 */
export async function getContactsBySite(siteId: string): Promise<DbContact[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("is_accounts_payable", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getContactsBySite: ${error.message}`);
  return (data ?? []) as DbContact[];
}

export async function getContactsByClient(
  clientId: string
): Promise<DbContact[]> {
  const supabase = await db();
  // FIX-1: deleted_at filter dropped (hard-delete model).
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("is_primary", { ascending: false })
    .order("last_name", { ascending: true });
  if (error) throw new Error(`getContactsByClient: ${error.message}`);
  return (data ?? []) as DbContact[];
}

export async function createContact(
  payload: DbContactInsert
): Promise<DbContact> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("contacts")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createContact: ${error.message}`);
  return data as DbContact;
}

export async function updateContact(
  id: string,
  payload: DbContactUpdate
): Promise<DbContact> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("contacts")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateContact: ${error.message}`);
  return data as DbContact;
}

/**
 * FIX-1: hard-delete a contact.
 */
export async function deleteContact(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteContact: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
