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

  const row = {
    id: quote.id,
    number: quote.number ?? null,
    name: quote.name ?? null,
    client_id: asUuidOrNull(quote.clientId),
    site_id: asUuidOrNull(quote.siteId),
    status: quote.status as QuoteStatus,
    owner_id: user?.id ?? null,
    total: quote.total ?? null,
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
