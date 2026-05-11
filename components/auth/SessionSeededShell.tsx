"use client";

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import type { DbProfile } from "@/lib/types/database";

// ============================================================================
// SessionSeededShell — used by app/(app)/layout.tsx to hand a server-fetched
// profile to AuthProvider BEFORE the first paint, eliminating the duplicate
// client-side getUser+fetchProfile chain that was costing 1–60s of
// "Verifying session…" placeholder on every dashboard load.
//
// How it works:
//   1. (app)/layout.tsx is an async server component. It calls
//      supabase.auth.getUser() (cookie-aware) and fetches the profile
//      row in the same request. If either fails, it server-side
//      redirects to /login. So by the time we render, we KNOW the user
//      is authenticated and we have the profile in hand.
//   2. This shell receives the profile as a prop and calls
//      AuthProvider.seedSession(profile) in a useLayoutEffect — which
//      runs synchronously after DOM commit, BEFORE the browser paints.
//      seedSession sets status='authenticated' + profile, and flips a
//      ref that AuthProvider's mount-time useEffect checks to skip the
//      now-redundant client-side getUser+fetchProfile.
//   3. Result: dashboard renders on the first client paint, no
//      "Verifying session…" flash, no client-side Supabase round-trip
//      on this load. Middleware + server layout did the work once.
//
// useIsomorphicLayoutEffect: useLayoutEffect doesn't run on the server
// and emits a noisy warning when SSR'd. Falling back to useEffect on
// the server suppresses the warning; client behaviour is unchanged.
// ============================================================================

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface SessionSeededShellProps {
  profile: DbProfile;
  children: ReactNode;
}

export function SessionSeededShell({
  profile,
  children,
}: SessionSeededShellProps) {
  const { seedSession } = useAuth();

  useIsomorphicLayoutEffect(() => {
    seedSession(profile);
    // Re-seed on profile.id change (e.g. impersonation, rapid re-auth in
    // same tab). seedSession is a stable useCallback from AuthProvider
    // so depending on it is a no-op cost but keeps the rule happy.
  }, [profile, profile.id, seedSession]);

  return <>{children}</>;
}
