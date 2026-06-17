import "server-only";

// QUOTE-LABOUR — tiny key/value app-settings store (public.app_settings,
// migration 0055). Cookie-aware server client so RLS is enforced. Reads are
// open to authenticated callers; writes are gated by requireAdmin at the action
// layer (settings/app-settings-actions.ts). Today it holds a single numeric
// setting (default_labour_sell_rate); the table is generic for future keys.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

async function db() {
  return createSupabaseServerClient();
}

/** Read a numeric setting by key, or null when unset. */
export async function getNumericSetting(key: string): Promise<number | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value_numeric")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`getNumericSetting: ${error.message}`);
  const v = (data as { value_numeric: number | null } | null)?.value_numeric;
  return v == null ? null : Number(v);
}

/** Upsert a numeric setting by key. */
export async function setNumericSetting(
  key: string,
  value: number
): Promise<number> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("app_settings")
    .upsert({ key, value_numeric: value }, { onConflict: "key" })
    .select("value_numeric")
    .single();
  if (error) throw new Error(`setNumericSetting: ${error.message}`);
  return Number((data as { value_numeric: number }).value_numeric);
}
