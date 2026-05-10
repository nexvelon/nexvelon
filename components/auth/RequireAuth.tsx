"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";

// ============================================================================
// RequireAuth / RedirectIfAuthed
//
// Since Session A the real gate lives in `middleware.ts` — anonymous
// browsers never reach a protected route. These two components are now a
// thin SAFETY NET that:
//
//   1. Show a "Verifying session…" placeholder during the AuthProvider's
//      initial getUser() round-trip (avoids flashing protected UI).
//   2. Bounce to /login if the session fails revalidation client-side
//      (Supabase says the cookie is no longer valid mid-render).
//   3. **Hard 10-second timeout** on the loading state. If AuthProvider's
//      status never resolves (a thrown await we can't catch, a stuck
//      cookie state, etc.), navigate via window.location.replace so a
//      fresh document load wipes any frozen React state. router.replace
//      is a soft client navigation that itself can hang on the same kind
//      of bug — window.location.replace is the escape hatch.
//
// Routing decisions for first-time loads live in the middleware. Don't add
// auth logic here — middleware is the source of truth.
// ============================================================================

const SESSION_CHECK_TIMEOUT_MS = 10_000;

/** Same hard-reload helper used by AuthProvider.signOut — bypasses the
 *  client-side router entirely so a stuck React tree can't block the
 *  navigation. Falls back to assigning location.href if `replace` is
 *  somehow unavailable. */
function hardReload(href: string, reason: string): void {
  if (typeof window === "undefined") return;
  console.info("[RequireAuth] hard_reload", { href, reason });
  try {
    window.location.replace(href);
  } catch {
    window.location.href = href;
  }
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Post-OTP fast-path hint. AuthProvider also reads this and flips status
  // to 'authenticated' optimistically; reading it here too means we render
  // children even on the one frame between hydration and AuthProvider's
  // first state update — eliminating the "Verifying session…" flash. The
  // 10s timeout below stays active as a safety net in case AuthProvider's
  // background hydration hangs.
  const [justSignedIn, setJustSignedIn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("just_signed_in") === "ok") setJustSignedIn(true);
    } catch {
      // No window.location.search available — leave flag false.
    }
  }, []);

  // Hard timeout: while status === 'loading', start a 10s timer. If it
  // fires before status flips, fall through to the redirect effect below.
  useEffect(() => {
    if (status !== "loading") {
      if (timedOut) setTimedOut(false);
      return;
    }
    console.info("[RequireAuth] mount_loading_start_timer");
    const t = setTimeout(() => {
      console.error(
        "[RequireAuth] session_check_timeout after",
        SESSION_CHECK_TIMEOUT_MS,
        "ms"
      );
      setTimedOut(true);
    }, SESSION_CHECK_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Drive the browser away from the protected page when we're not
  // authenticated. Both paths use window.location.replace because soft
  // navigation has been observed to hang in the same conditions that put
  // us in the timeout / anonymous state.
  useEffect(() => {
    if (timedOut) {
      hardReload("/login?error=session_check_timeout", "timed_out");
      return;
    }
    if (status === "anonymous") {
      hardReload("/login", "anonymous");
    }
  }, [status, timedOut]);

  // Fast-path: render optimistically when we know we just signed in, even
  // if AuthProvider's status is still 'loading' for this frame.
  if (status === "authenticated") return <>{children}</>;
  if (justSignedIn && status === "loading") return <>{children}</>;

  return (
    <div className="bg-background flex min-h-[100dvh] items-center justify-center">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
        {timedOut ? "Redirecting…" : "Verifying session…"}
      </p>
    </div>
  );
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const searchParams = useSearchParams();
  const [timedOut, setTimedOut] = useState(false);

  // ?signout=ok is appended to /login by the /auth/signout GET handler,
  // which is now the navigation target of AuthProvider.signOut. By the time
  // we render here the cookies are already cleared server-side (Set-Cookie
  // headers rode that redirect), so we can confidently render the form
  // without waiting for AuthProvider's getUser() to confirm anonymous.
  const signOutHint = searchParams?.get("signout") === "ok";
  console.info("[RedirectIfAuthed] entry", {
    has_signout_param: signOutHint,
    status,
  });
  if (signOutHint) {
    console.info("[RedirectIfAuthed] signout_fast_path");
  }

  // Same 10s safety net as RequireAuth, but flipped — if status stays
  // 'loading' on a page like /login (which renders this wrapper), force
  // a hard reload back to /login itself so the AuthProvider remounts
  // fresh. Skipped during a signout flow.
  useEffect(() => {
    if (signOutHint) return;
    if (status !== "loading") {
      if (timedOut) setTimedOut(false);
      return;
    }
    const t = setTimeout(() => {
      console.error(
        "[RedirectIfAuthed] session_check_timeout after",
        SESSION_CHECK_TIMEOUT_MS,
        "ms"
      );
      setTimedOut(true);
    }, SESSION_CHECK_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, signOutHint]);

  useEffect(() => {
    // During a signout flow, never bounce to /dashboard even if the
    // background cookie clear hasn't completed yet and getUser() briefly
    // returns the stale user. The user explicitly asked to sign out.
    if (signOutHint) return;
    if (timedOut) {
      hardReload("/login?error=session_check_timeout", "timed_out");
      return;
    }
    if (status === "authenticated") {
      hardReload("/dashboard", "authenticated");
    }
  }, [status, timedOut, signOutHint]);

  if (signOutHint || status === "anonymous") return <>{children}</>;

  return (
    <div className="bg-background flex min-h-[100dvh] items-center justify-center">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
        {timedOut ? "Redirecting…" : "Loading…"}
      </p>
    </div>
  );
}
