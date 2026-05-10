import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// /auth/signout — server-side cookie cleanup endpoint.
//
// Belt-and-braces partner to the client-side `useAuth().signOut()` call.
// AuthProvider's signOut wraps `supabase.auth.signOut()` in a 5s
// Promise.race so a hung client-side call no longer locks the user on the
// "Signing out…" spinner. After that race resolves (or times out), the
// client POSTs here to GUARANTEE that any auth cookies still on the
// browser get deleted server-side via the cookie-aware Supabase server
// client's `setAll` callback.
//
// Always returns 204; never throws to the caller. Idempotent — repeated
// calls have no extra effect beyond writing the same delete-cookie
// instructions onto the response.
//
// Allowlisted in middleware for both anonymous AND MFA-pending callers
// so a user with corrupted/stale cookies can still reach this route to
// clear them.
// ============================================================================

async function clearSession(): Promise<void> {
  try {
    const supabase = await createClient();
    // signOut writes Supabase's expire-cookie instructions onto the
    // outgoing response via the cookie-aware client's setAll callback.
    // It also revokes the refresh token server-side at Supabase Auth.
    await supabase.auth.signOut();
  } catch (e) {
    // Don't throw — the client is going to hard-reload regardless.
    console.error("[signout route] signOut failed:", e);
  }
}

export async function POST(): Promise<NextResponse> {
  await clearSession();
  // 204 with no body. Cookie deletions queued via cookieStore.set during
  // clearSession() are merged into this response by the Next.js runtime.
  // The client (AuthProvider.signOut) ignores the body and immediately
  // hard-reloads to /login.
  return new NextResponse(null, { status: 204 });
}

// Also accept GET for direct-navigation fallback (e.g. "stuck" sessions
// where the user types the URL into the address bar).
//
// `redirect()` from next/navigation (not `NextResponse.redirect`) so the
// cookieStore deletions queued during clearSession() reliably ride the
// redirect response. Same fix pattern as /auth/confirm — see comments
// there for the why.
export async function GET(): Promise<never> {
  await clearSession();
  redirect("/login");
}
