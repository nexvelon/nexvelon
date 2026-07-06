import "server-only";

// Chunk F-1a — quotes persistence API (plumbing only; no UI cutover yet).
//
// The full Quote object lives in the `data` jsonb column; the top-level columns
// (number / name / client_id / site_id / status / owner_id / total) are a
// derived, queryable mirror for listing/filtering. listQuotes/getQuoteById
// return the assembled Quote straight from `data` so the builder + table can
// consume these unchanged at F-1b cutover.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { Quote, QuoteStatus } from "@/lib/types";

async function db() {
  return createSupabaseServerClient();
}

interface QuoteRow {
  id: string;
  data: Quote;
}

// uuid columns reject app strings like "" — coerce non-uuid/empty to null.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function asUuidOrNull(v: string | undefined | null): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

/** The assembled Quote is exactly the stored `data` blob. */
function toQuote(row: QuoteRow): Quote {
  return row.data;
}

export async function listQuotes(): Promise<Quote[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, data")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listQuotes: ${error.message}`);
  return ((data ?? []) as QuoteRow[]).map(toQuote);
}

// BUGFIX (quotes) — read-only "Quotes for this site/client" lists on the Site
// and Client detail pages. Filter on the queryable mirror columns (site_id /
// client_id), newest-updated first. Returns a lean view-model (not the whole
// Quote blob) carrying exactly the columns those sections render, plus the row
// `updated_at` (which the Quote blob doesn't hold).
export interface QuoteListItem {
  id: string;
  number: string | null;
  name: string | null;
  status: QuoteStatus;
  total: number | null;
  clientId?: string;
  siteId?: string;
  updatedAt: string | null;
}

interface QuoteListRow {
  id: string;
  data: Quote;
  updated_at: string | null;
}

function toListItem(row: QuoteListRow): QuoteListItem {
  const q = row.data;
  return {
    id: row.id,
    number: q.number ?? null,
    name: q.name ?? null,
    status: q.status,
    total: q.total ?? null,
    clientId: q.clientId,
    siteId: q.siteId,
    updatedAt: row.updated_at,
  };
}

export async function listQuotesForSite(
  siteId: string
): Promise<QuoteListItem[]> {
  const id = asUuidOrNull(siteId);
  if (!id) return [];
  const supabase = await db();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, data, updated_at")
    .eq("site_id", id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listQuotesForSite: ${error.message}`);
  return ((data ?? []) as QuoteListRow[]).map(toListItem);
}

export async function listQuotesForClient(
  clientId: string
): Promise<QuoteListItem[]> {
  const id = asUuidOrNull(clientId);
  if (!id) return [];
  const supabase = await db();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, data, updated_at")
    .eq("client_id", id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listQuotesForClient: ${error.message}`);
  return ((data ?? []) as QuoteListRow[]).map(toListItem);
}

export async function getQuoteById(id: string): Promise<Quote | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getQuoteById: ${error.message}`);
  return data ? toQuote(data as QuoteRow) : null;
}

/**
 * Insert-or-update a quote by id. The whole Quote is stored in `data`; the
 * mirror columns are derived from it. owner_id is stamped from the caller's
 * session. updated_at is maintained by the quotes_set_updated_at trigger.
 */
export async function upsertQuote(quote: Quote): Promise<Quote> {
  const supabase = await db();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // PROJ2-5 — mirror the intended conversion target to indexable columns. Keep
  // them shape-consistent with the 0086 CHECK: change_order requires a project
  // id; anything else stores NULL project id.
  const intendedKind = quote.intendedTargetKind ?? null;
  const intendedProjectId =
    intendedKind === "change_order"
      ? asUuidOrNull(quote.intendedTargetProjectId)
      : null;

  const row = {
    id: quote.id,
    number: quote.number ?? null,
    name: quote.name ?? null,
    client_id: asUuidOrNull(quote.clientId),
    site_id: asUuidOrNull(quote.siteId),
    status: quote.status as QuoteStatus,
    owner_id: user?.id ?? null,
    total: quote.total ?? null,
    intended_target_kind: intendedKind,
    intended_target_project_id: intendedProjectId,
    data: quote,
  };

  const { data, error } = await supabase
    .from("quotes")
    .upsert(row, { onConflict: "id" })
    .select("id, data")
    .single();
  if (error) throw new Error(`upsertQuote: ${error.message}`);
  return toQuote(data as QuoteRow);
}

export async function deleteQuote(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("quotes")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteQuote: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// QUOTES-3 — project cost centers that were sourced from this quote
// (0042_cost_center_source_quote: project_cost_centers.source_quote_id). Used as
// a delete guard so we never sever a project's link back to its origin quote.
export async function listProjectsReferencingQuote(
  quoteId: string
): Promise<{ id: string }[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("project_cost_centers")
    .select("id")
    .eq("source_quote_id", quoteId);
  if (error)
    throw new Error(`listProjectsReferencingQuote: ${error.message}`);
  return (data ?? []) as { id: string }[];
}
