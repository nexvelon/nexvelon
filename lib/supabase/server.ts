import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for use in:
 *   - React server components
 *   - Server actions
 *   - Route handlers (app/api/*)
 *
 * Wires Supabase auth cookies through Next.js's cookies() store so that
 * a signed-in user is recognised on the server during SSR.
 *
 * Usage (server component):
 *   import { createClient } from "@/lib/supabase/server";
 *   const supabase = await createClient();
 *   const { data } = await supabase.from("projects").select("*");
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Configure them in .env.local."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // The set() handler runs server-side and will throw inside server
          // components that don't allow cookie mutation. That's fine — the
          // session refresh will happen on the next request via middleware.
        }
      },
    },
  });
}
