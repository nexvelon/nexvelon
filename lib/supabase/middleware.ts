import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-runtime Supabase helper for use in `middleware.ts`.
 *
 * Refreshes the user's session cookies on every request and exposes the
 * resolved Supabase user (or null). The returned NextResponse is what the
 * middleware should return — it has the refreshed cookies attached.
 *
 * IMPORTANT: never read `request.cookies` after calling this and then
 * forward those cookies into a redirect response — re-create the response
 * (using NextResponse.redirect) and copy our `supabaseResponse.cookies`
 * onto it. The middleware does this dance below.
 */
export async function updateSession(request: NextRequest): Promise<{
  supabaseResponse: NextResponse;
  user: { id: string; email: string | null } | null;
  hasPendingOtp: boolean;
}> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // No env → can't talk to Supabase. Allow the request through; downstream
    // rendering will surface the missing-env error visibly.
    return { supabaseResponse, user: null, hasPendingOtp: false };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        // Rebuild the response so cookie writes from token-refresh land on
        // the actual outgoing response.
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the JWT against Supabase Auth — it's the secure
  // call. getSession() is faster but trusts the cookie blindly; never
  // use it for authorisation decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasPendingOtp = false;
  if (user) {
    // RPC is SECURITY DEFINER; it bypasses the no-policy lockdown on
    // auth_otp and returns just a boolean.
    const { data, error } = await supabase.rpc("has_pending_otp");
    if (error) {
      // Don't gate the request on a transient RPC error — fall through and
      // log. If the migration hasn't been run, this will surface here.
      console.error("[middleware] has_pending_otp RPC failed:", error.message);
    } else {
      hasPendingOtp = data === true;
    }
  }

  return {
    supabaseResponse,
    user: user
      ? { id: user.id, email: user.email ?? null }
      : null,
    hasPendingOtp,
  };
}
