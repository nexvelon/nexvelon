"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 *
 * Uses the publishable (anon) key, which is safe to ship in the JS bundle.
 * Reads/writes are constrained by Row-Level Security policies defined on
 * the database — anything sensitive must be protected by RLS, not by
 * keeping the key secret.
 *
 * Usage (client component):
 *   import { supabase } from "@/lib/supabase/client";
 *   const { data, error } = await supabase.from("clients").select("*");
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in real values."
    );
  }

  return createBrowserClient(url, key);
}

/** Singleton — most components should import this rather than calling createClient() each render. */
export const supabase = createClient();
