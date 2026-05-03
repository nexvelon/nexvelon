"use client";

import { useEffect, type ReactNode } from "react";
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
//
// Routing decisions for first-time loads live in the middleware. Don't add
// auth logic here — middleware is the source of truth.
// ============================================================================

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <div className="bg-background flex min-h-[100dvh] items-center justify-center">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
        Verifying session…
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
