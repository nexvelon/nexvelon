import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SessionSeededShell } from "@/components/auth/SessionSeededShell";
import type { DbProfile } from "@/lib/types/database";

// ============================================================================
// (app) route group layout — async server component.
//
// Two responsibilities, both server-side, no client-side network call:
//
//   1. AUTH GATE. Cookie-aware getUser() validates the session. If null
//      → redirect("/login") server-side. The user never reaches the
//      client. Previously this was enforced only at the client via
//      RequireAuth's anonymous-redirect effect, which created a window
//      where a slow Supabase Auth call (free tier, Toronto region) could
//      leave the dashboard rendering "Verifying session…" for 30–60s
//      while two duplicate getUser+fetchProfile chains raced (middleware
//      did it once, AuthProvider's IIFE did it again client-side).
//
//   2. PROFILE PRE-FETCH + SEED. Fetch the profile row in the same
//      request, hand it down to <SessionSeededShell> which (in a client
//      useLayoutEffect that runs before first paint) calls AuthProvider
//      .seedSession(profile). AuthProvider sees the seed flag and skips
//      its mount-time IIFE entirely.
//
// Result: ZERO client-side Supabase round-trips on first dashboard
// paint. Server-side latency is ~one cookie-aware getUser (~150–300ms)
// + one RLS-scoped profile read (~100–200ms). Sub-2s in normal
// conditions; degrades gracefully — even at 5× Supabase latency the
// total is still well under the old 60s.
//
// RequireAuth stays in place as a safety net for in-session state
// transitions (e.g. cross-tab SIGNED_OUT broadcasts mid-session) that
// flip status to 'anonymous'. With the seed, status starts at
// 'authenticated' so RequireAuth renders children on the first paint.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    console.info("[(app)/layout] no_session_redirecting_to_login", {
      error: userErr?.message ?? null,
    });
    redirect("/login");
  }

  const { data: profileData, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileErr || !profileData) {
    console.warn("[(app)/layout] profile_missing_redirecting", {
      userId: userData.user.id,
      error: profileErr?.message ?? null,
    });
    redirect(
      "/login?error=" +
        encodeURIComponent(
          "We can't find your profile. Please contact your administrator."
        )
    );
  }

  const profile = profileData as DbProfile;

  return (
    <SessionSeededShell profile={profile}>
      <RequireAuth>
        <AppShell>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast:
                  "border border-[var(--border)] bg-card text-brand-charcoal shadow-md font-sans",
              },
            }}
          />
        </AppShell>
      </RequireAuth>
    </SessionSeededShell>
  );
}
