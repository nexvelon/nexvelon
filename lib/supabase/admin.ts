import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Supabase client — service-role key, bypasses Row-Level Security.
 *
 * MUST ONLY BE USED ON THE SERVER. The "server-only" import above causes a
 * build-time error if any client component tries to import this file.
 *
 * Use cases:
 *   - Seeding data
 *   - Cron jobs / scheduled migrations
 *   - Privileged operations triggered from API routes after the caller
 *     has been authenticated and authorised by the route handler itself
 *
 * Never use this in a server component that renders untrusted user input
 * — RLS is bypassed, so authorisation is entirely your responsibility.
 *
 * Usage:
 *   import { createAdminClient } from "@/lib/supabase/admin";
 *   const admin = createAdminClient();
 *   await admin.from("users").insert({ ... });
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (!serviceKey || serviceKey === "PASTE_SECRET_KEY_HERE") {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Paste your real service-role key " +
        "into .env.local — never commit it."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      // Admin client doesn't represent a user — disable session persistence
      // so we don't accidentally write the service key to localStorage etc.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
