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

  // Soft-delete filter is on by default; admin views opt in via includeDeleted.
  if (!filters.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    query = query.or(
      `name.ilike.%${q}%,legal_name.ilike.%${q}%,client_code.ilike.%${q}%`
    );
  }
  if (filters.tier) query = query.eq("tier", filters.tier);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);

  const { data: clients, error } = await query;
  if (error) throw new Error(`getClients: ${error.message}`);
  if (!clients || clients.length === 0) return [];

  // Roll up site / contact counts in a single round-trip each (so we don't
  // N+1 against postgres).
  const ids = clients.map((c) => c.id);

  const [sitesRes, contactsRes] = await Promise.all([
    supabase
      .from("sites")
      .select("client_id")
      .is("deleted_at", null)
      .in("client_id", ids),
    supabase
      .from("contacts")
      .select("client_id")
      .is("deleted_at", null)
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
  id: string,
  includeDeleted = false
): Promise<ClientWithRelations | null> {
  const supabase = await db();
  let query = supabase.from("clients").select("*").eq("id", id);
  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }
  const { data: client, error } = await query.maybeSingle();

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
 * Soft-delete a client. Never hard-deletes.
 *
 * Stamps deleted_at + deleted_by (resolved from the caller's Supabase Auth
 * session — the JS query builder can't call SQL `auth.uid()` directly, so we
 * resolve the uid in-process and pass it). Guarded by `deleted_at IS NULL`
 * so a second delete on an already-deleted row is a no-op.
 *
 * @returns true if a live row was soft-deleted; false if the client didn't
 *          exist or was already deleted.
 */
export async function softDeleteClient(id: string): Promise<boolean> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("clients")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`softDeleteClient: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Restore a soft-deleted client. Clears deleted_at + deleted_by, guarded by
 * `deleted_at IS NOT NULL` so a restore on a live row is a no-op.
 *
 * @returns true if an archived row was restored; false if the client didn't
 *          exist or was not archived.
 */
export async function restoreClient(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("clients")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("id");
  if (error) throw new Error(`restoreClient: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ----------------------------------------------------------------------------
// Sites
// ----------------------------------------------------------------------------

export async function getSitesByClient(clientId: string): Promise<DbSite[]> {
  const supabase = await db();
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
 * SITES-1 — cross-client site list joined with a thin client slice. Optional
 * filters by client, status, and a name/site_code search. Soft-deleted rows
 * are always excluded.
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
    .select("*, client:clients(id,name,client_code,default_opco)")
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

  const { data, error } = await query.order("site_code", { ascending: true });
  if (error) throw new Error(`listSites: ${error.message}`);
  return (data ?? []) as DbSiteWithClient[];
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

export async function softDeleteSite(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("sites")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`softDeleteSite: ${error.message}`);
}

// ----------------------------------------------------------------------------
// Contacts
// ----------------------------------------------------------------------------

export async function getContactsByClient(
  clientId: string
): Promise<DbContact[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("client_id", clientId)
    .is("deleted_at", null)
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

export async function softDeleteContact(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`softDeleteContact: ${error.message}`);
}
