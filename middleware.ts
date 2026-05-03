import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// ============================================================================
// Nexvelon middleware
// ----------------------------------------------------------------------------
// Runs on every matched request to:
//   1. Refresh the Supabase session cookie (so SSR sees the user).
//   2. Redirect anonymous users away from protected routes → /login.
//   3. Redirect authenticated-but-MFA-pending users → /auth/verify-otp.
//   4. Redirect already-signed-in users away from /login.
//
// The matcher excludes static assets and Next internals; everything else
// flows through the routing logic below.
// ============================================================================

/**
 * Routes that an anonymous visitor may load directly. /auth/callback +
 * /auth/confirm are listed because Supabase Auth lands on them with no
 * session cookie set yet — the route handlers themselves set the cookie.
 */
const ANON_ALLOWED = new Set<string>([
  "/login",
  "/auth/callback",
  "/auth/confirm",
]);

/**
 * Routes an authenticated user may visit DURING the MFA-pending window
 * (i.e. has_pending_otp() === true). Anything else funnels through
 * /auth/verify-otp until the second factor is consumed.
 */
const MFA_PENDING_ALLOWED = new Set<string>([
  "/auth/verify-otp",
  "/auth/callback",
  "/auth/confirm",
]);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const { supabaseResponse, user, hasPendingOtp } = await updateSession(
    request
  );

  // ---- 1. Anonymous --------------------------------------------------------
  if (!user) {
    if (pathname === "/" || ANON_ALLOWED.has(pathname)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/login") {
      url.searchParams.set("next", pathname + (search || ""));
    } else {
      url.searchParams.delete("next");
    }
    return redirectWithCookies(url, supabaseResponse);
  }

  // ---- 2. Authenticated + MFA pending → /auth/verify-otp ------------------
  if (hasPendingOtp) {
    if (MFA_PENDING_ALLOWED.has(pathname)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/auth/verify-otp";
    // Preserve the originally-requested path so post-OTP we can land back.
    url.search = "";
    if (pathname !== "/" && pathname !== "/login") {
      url.searchParams.set("next", pathname + (search || ""));
    }
    return redirectWithCookies(url, supabaseResponse);
  }

  // ---- 3. Authenticated + no MFA pending ---------------------------------
  // /auth/verify-otp shouldn't be reachable without a pending OTP.
  if (pathname === "/auth/verify-otp") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectWithCookies(url, supabaseResponse);
  }

  // /login → /dashboard (or to ?next= if it points at a protected app route).
  if (pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    const url = request.nextUrl.clone();
    url.pathname = next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
    url.search = "";
    return redirectWithCookies(url, supabaseResponse);
  }

  // / → /dashboard
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectWithCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}

/**
 * Build a redirect response that preserves any cookies that updateSession
 * wrote (refreshed access/refresh tokens). Without this, a token refresh
 * during a redirect-bound request silently drops the new cookies.
 */
function redirectWithCookies(
  url: URL,
  source: NextResponse
): NextResponse {
  const target = NextResponse.redirect(url);
  source.cookies.getAll().forEach((c) => {
    target.cookies.set(c.name, c.value, c);
  });
  return target;
}

export const config = {
  matcher: [
    /*
     * Match every path except:
     *   - _next/static, _next/image, _next/data        Next internals
     *   - favicon, robots, sitemap, icon (root files)
     *   - any file with an extension (static assets)
     *
     * We INCLUDE /login, /auth/*, and /api/* — middleware decides per route.
     */
    "/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|icon\\.svg|.*\\..*).*)",
  ],
};
