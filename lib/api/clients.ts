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
  DbSiteUpdate,
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
    .is("deleted_at", null)
    .order("name", { ascending: true });

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
  id: string
): Promise<ClientWithRelations | null> {
  const supabase = await db();
  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
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
  const { data, error } = await supabase
    .from("clients")
    .insert(payload)
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

export async function softDeleteClient(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("clients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`softDeleteClient: ${error.message}`);
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

export async function createSite(payload: DbSiteInsert): Promise<DbSite> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("sites")
    .insert(payload)
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
