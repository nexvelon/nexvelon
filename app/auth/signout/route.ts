import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// /auth/signout — server-side cookie cleanup endpoint.
//
// TWO entry points with different speed/thoroughness tradeoffs:
//
// GET — the FAST PATH used as the navigation target from
//       AuthProvider.signOut. Synchronously deletes the browser's
//       `sb-*` auth cookies via Set-Cookie headers on the redirect
//       response, then 307s to /login?signout=ok. Does NOT await the
//       network call to Supabase Auth's /logout endpoint (that's
//       1-3s on free-tier and would block the navigation behind it).
//       Cookies are gone from the browser before middleware sees the
//       follow-up /login request, so middleware can't bounce us back
//       to /dashboard.
//
// POST — the THOROUGH PATH fired as a keepalive background request by
//        AuthProvider.signOut after the GET-driven navigation is
//        already underway. Awaits supabase.auth.signOut(), which
//        revokes the refresh token on Supabase Auth AND writes
//        delete-cookie instructions. Idempotent; safe to run after
//        the cookies are already cleared.
//
// Allowlisted in middleware for both anonymous AND MFA-pending callers
// so a user with corrupted/stale cookies can always reach either entry
// point to clear them.
// ============================================================================

async function clearSessionThorough(): Promise<void> {
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
  await clearSessionThorough();
  // 204 with no body. Cookie deletions queued via cookieStore.set during
  // clearSessionThorough() are merged into this response by the Next.js
  // runtime. The client (AuthProvider.signOut) ignores the body and is
  // already mid-navigation when this lands.
  return new NextResponse(null, { status: 204 });
}

export async function GET(): Promise<never> {
  console.info("[/auth/signout] entry");
  // Fast path — synchronously clear every `sb-*` cookie via
  // cookieStore.set with maxAge=0. The Set-Cookie headers ride the
  // redirect() response, so the browser deletes them before sending the
  // follow-up /login request. Middleware on /login then sees no auth
  // cookies, no getUser() match, anonymous → allows /login through
  // (instead of redirecting to /dashboard and stripping our
  // ?signout=ok hint along the way, which is exactly the regression
  // we're fixing).
  const cookieStore = await cookies();
  let cleared = 0;
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith("sb-")) {
      cookieStore.set(c.name, "", { path: "/", maxAge: 0 });
      cleared++;
    }
  }
  console.info("[/auth/signout] cookies_cleared", { cleared });
  const dest = "/login?signout=ok";
  console.info("[/auth/signout] redirecting_to", { url: dest });
  redirect(dest);
}
