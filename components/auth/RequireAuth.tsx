"use client";

import { useEffect, useState, type ReactNode } from "react";
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

  if (status === "authenticated") return <>{children}</>;

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
  const [timedOut, setTimedOut] = useState(false);

  // Same 10s safety net as RequireAuth, but flipped — if status stays
  // 'loading' on a page like /login (which renders this wrapper), force
  // a hard reload back to /login itself so the AuthProvider remounts
  // fresh.
  useEffect(() => {
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
  }, [status]);

  useEffect(() => {
    if (timedOut) {
      hardReload("/login?error=session_check_timeout", "timed_out");
      return;
    }
    if (status === "authenticated") {
      hardReload("/dashboard", "authenticated");
    }
  }, [status, timedOut]);

  if (status === "anonymous") return <>{children}</>;

  return (
    <div className="bg-background flex min-h-[100dvh] items-center justify-center">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
        {timedOut ? "Redirecting…" : "Loading…"}
      </p>
    </div>
  );
}
