"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
//      status never resolves (most likely cause: a thrown await in its
//      init that we now also catch via try/catch/finally — but defence in
//      depth), bounce to /login?error=session_check_timeout so the user
//      isn't stuck on the spinner.
//
// Routing decisions for first-time loads live in the middleware. Don't add
// auth logic here — middleware is the source of truth.
// ============================================================================

const SESSION_CHECK_TIMEOUT_MS = 10_000;

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  // Hard timeout: while status === 'loading', start a 10s timer. If it fires
  // before status flips, treat as anonymous and redirect with an error code.
  useEffect(() => {
    if (status !== "loading") {
      // Status moved on (auth resolved one way or the other) — clear flag.
      if (timedOut) setTimedOut(false);
      return;
    }
    const t = setTimeout(() => {
      console.error(
        "[RequireAuth] session check timed out after 10s; redirecting to /login"
      );
      setTimedOut(true);
    }, SESSION_CHECK_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (timedOut) {
      router.replace("/login?error=session_check_timeout");
      return;
    }
    if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, timedOut, router]);

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
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status !== "authenticated") return <>{children}</>;
  return null;
}
