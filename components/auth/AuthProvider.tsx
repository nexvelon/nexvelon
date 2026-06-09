"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase/client";
import { normalizeDbRole } from "@/lib/auth/normalize-role";
import type {
  DbProfile,
  DbProfileStatus,
  DbRole,
} from "@/lib/types/database";
import type { Role } from "@/lib/types";

// ============================================================================
// Real Supabase Auth provider.
//
// Replaces the localStorage demo from before Session A. The exposed API is
// a strict subset of the old shape — `user`, `status`, `isAuthenticated`,
// `signOut`, plus the new `profile` payload — so existing consumers
// (AvatarMenu, app/page.tsx, RequireAuth, every <Can> via useRole) keep
// compiling and rendering without changes elsewhere.
// ============================================================================

export interface AuthUser {
  /** Supabase user id (uuid). */
  id: string;
  email: string;
  /** Computed display name — first+last → display_name → email local-part. */
  name: string;
  /** App Role (7-value enum used by lib/permissions.ts). */
  role: Role;
  /** Raw DB role (11-value enum) — for places that need the precise value. */
  dbRole: DbRole;
  status: DbProfileStatus;
}

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  user: AuthUser | null;
  /** Full profile row when authenticated; null otherwise. */
  profile: DbProfile | null;
  /** Chunk 3c: the current user's per-user grant keys (allow-only overlay). */
  grants: Set<string>;
  status: AuthStatus;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  /** Forces a refetch of the profile row — used after self-edits. */
  refreshProfile: () => Promise<void>;
  /**
   * Seed the provider with a server-fetched profile, before the
   * client-side getUser+fetchProfile chain would run. Used by
   * SessionSeededShell wrapping the (app) route group — eliminates the
   * "Verifying session…" placeholder by handing the auth state down
   * from the cookie-aware server layout that already validated it.
   *
   * Also flips an internal `seededRef` flag so the mount-time IIFE
   * (which would otherwise duplicate the same network calls) skips
   * itself.
   */
  seedSession: (profile: DbProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ----------------------------------------------------------------------------

function profileToUser(profile: DbProfile): AuthUser {
  const first = profile.first_name?.trim() ?? "";
  const last = profile.last_name?.trim() ?? "";
  const display = profile.display_name?.trim() ?? "";
  const composed = [first, last].filter(Boolean).join(" ");
  const localPart = profile.email.split("@")[0] ?? profile.email;
  const name = display || composed || localPart;

  return {
    id: profile.id,
    email: profile.email,
    name,
    role: normalizeDbRole(profile.role),
    dbRole: profile.role,
    status: profile.status,
  };
}

// ----------------------------------------------------------------------------
// "Signing out" flag (sessionStorage). Set when AuthProvider.signOut starts,
// cleared when /login mounts with ?signout=ok. Both RequireAuth's
// anonymous-redirect effect AND AuthProvider's onAuthStateChange handler
// check this flag and SKIP their reactive redirects when it's set.
//
// Why: signOut() sets status='anonymous' synchronously so any rendered tree
// sees the change. That state update used to make RequireAuth's
// useEffect fire `window.location.replace('/login')` BEFORE the browser
// actually executed our `window.location.replace('/auth/signout')` —
// last `replace` in a task wins, so we'd land on plain `/login` (no
// ?signout=ok hint, middleware sees still-valid cookies, bounces to
// /dashboard, 5–10s of "Verifying session…" hang). The flag short-
// circuits that race so the navigation we queued goes through.
// ----------------------------------------------------------------------------

const SIGNING_OUT_KEY = "nx_signing_out";

export function isSigningOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SIGNING_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function markSigningOut(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SIGNING_OUT_KEY, "1");
  } catch {
    // sessionStorage unavailable — race window without the flag, but the
    // primary fix (navigation to /auth/signout) still works often enough.
  }
}

function clearSigningOut(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SIGNING_OUT_KEY);
  } catch {
    // ignore
  }
}

async function fetchProfile(userId: string): Promise<DbProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[auth] fetchProfile failed:", error.message);
    return null;
  }
  return (data as DbProfile | null) ?? null;
}

// ----------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<DbProfile | null>(null);
  // Chunk 3c: the current user's grant keys. Loaded by a separate effect keyed
  // on profile.id (decoupled from the auth-flow paths above), so it re-fetches
  // whenever ANY path sets the profile. Best-effort — empty on failure; never
  // blocks auth.
  const [grants, setGrants] = useState<Set<string>>(new Set());

  // We use a ref to avoid stale-closure issues inside the auth subscription.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Tracks whether a parent (SessionSeededShell from (app)/layout.tsx) has
  // already provided the profile via seedSession. When true, the mount-time
  // useEffect below skips its getUser+fetchProfile chain entirely — the
  // server already did that work and we don't need a duplicate round-trip.
  // Critical for sub-2s dashboard loads when Supabase Auth latency spikes.
  const seededRef = useRef(false);

  const seedSession = useCallback((nextProfile: DbProfile) => {
    seededRef.current = true;
    setProfile(nextProfile);
    setStatus("authenticated");
    console.info("[AuthProvider] seed_session", {
      user_id: nextProfile.id,
    });
  }, []);

  // Initial hydration + auth state subscription.
  //
  // Hardened in this commit:
  //   * Whole getUser → fetchProfile chain wrapped in try/catch/finally so
  //     the finally block ALWAYS resolves status to 'authenticated' or
  //     'anonymous'. Previously a thrown getUser (network blip, expired
  //     refresh token edge case) could leave status pinned at 'loading'
  //     forever, which RequireAuth then rendered as a permanent
  //     "Verifying session…" spinner.
  //   * Structured tagged logs at every state transition so a hang is
  //     diagnosable from the browser console.
  //   * onAuthStateChange handler also wraps profile fetch in try/catch
  //     and explicitly forces 'anonymous' on SIGNED_OUT (in case the
  //     listener races the initial getUser and would otherwise leave
  //     state inconsistent).
  //
  // Post-OTP fast-path (since 2026-05-10):
  //   * verifyOtpAction redirects to /dashboard?just_signed_in=ok after
  //     successful OTP. The server-side redirect already proved the
  //     session is valid (middleware re-checks per request too), so the
  //     duplicate getUser+fetchProfile round-trip Auth Provider does on
  //     mount was just adding 1–6s of perceived hang behind a "Verifying
  //     session…" placeholder.
  //   * When that hint is present we flip status='authenticated'
  //     synchronously, then hydrate profile in the background. If the
  //     background fetch comes back with no user (rare race), we flip
  //     to 'anonymous' and RequireAuth's existing redirect handles it.
  //   * The query param is stripped via history.replaceState once
  //     hydration finishes — that swaps the URL without triggering a
  //     re-render or a Next router round-trip.
  useEffect(() => {
    let cancelled = false;

    // Detect URL hints. Read straight from window so we don't pull
    // useSearchParams() in here and accidentally bail every static route
    // out of static rendering.
    let fastPathSignin = false;
    let fastPathSignout = false;
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        fastPathSignin = params.get("just_signed_in") === "ok";
        fastPathSignout = params.get("signout") === "ok";
      } catch {
        // ignore URL parse failures — fall through to regular flow.
      }
    }

    console.info("[AuthProvider] mounting", {
      fastPathSignin,
      fastPathSignout,
      preSeeded: seededRef.current,
    });

    // Server-seed fast path: SessionSeededShell (rendered by
    // (app)/layout.tsx as an async server component) already called
    // seedSession with a server-fetched profile. The DB round-trip to
    // /auth/v1/user + /rest/v1/profiles already happened server-side
    // — duplicating it client-side would just give us a "Verifying
    // session…" placeholder for whatever Supabase Auth's current
    // latency is (1–60s on free tier). Skip the IIFE entirely; still
    // set up the auth-state-change subscription so cross-tab
    // SIGNED_OUT events propagate.
    if (seededRef.current) {
      console.info("[AuthProvider] mount_skipped_pre_seeded");
      const { data: subscription } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mountedRef.current) return;
          console.info("[AuthProvider] auth_state_changed", {
            event,
            hasSession: !!session?.user,
            seeded: true,
          });

          // Ignore INITIAL_SESSION entirely when seeded. Supabase fires
          // it synchronously on subscription with whatever's in the
          // client SDK's storage at that moment — which can be null for
          // a brief window after a hard navigation while
          // @supabase/ssr's browser cookie reader catches up. Trusting
          // that null would un-seed us back to "anonymous" and trigger
          // RequireAuth's redirect-to-/login, exactly the loop this
          // server-side seed is designed to eliminate.
          if (event === "INITIAL_SESSION") {
            return;
          }

          if (
            (event === "SIGNED_OUT" || !session?.user) &&
            isSigningOut()
          ) {
            console.info(
              "[AuthProvider] auth_state_changed_skipped_signing_out"
            );
            return;
          }
          if (event === "SIGNED_OUT" || !session?.user) {
            // Explicit sign-out (this tab or cross-tab broadcast) →
            // flip to anonymous. RequireAuth's effect will then
            // hardReload to /login.
            setProfile(null);
            setStatus("anonymous");
            return;
          }
          // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — refetch profile
          // so role/status changes propagate within the same tab.
          try {
            const p = await fetchProfile(session.user.id);
            if (!mountedRef.current) return;
            setProfile(p);
            setStatus(p ? "authenticated" : "anonymous");
          } catch (e) {
            console.error(
              "[AuthProvider] fetchProfile during auth_state_changed failed",
              e
            );
            if (!mountedRef.current) return;
            setProfile(null);
            setStatus("anonymous");
          }
        }
      );
      return () => {
        cancelled = true;
        subscription.subscription.unsubscribe();
      };
    }

    // Sign-out fast path: we arrived here via /auth/signout's redirect,
    // which already cleared the auth cookies server-side. Running
    // getUser() now would just confirm anonymous after a 1-6s Supabase
    // round-trip — pure waste. Set anonymous immediately, skip the
    // network fetch, strip the query param after a beat.
    if (fastPathSignout) {
      console.info("[AuthProvider] skip_initial_check_signout");
      setProfile(null);
      setStatus("anonymous");
      console.info("[AuthProvider] status set", {
        status: "anonymous",
        reason: "fast_path_signout",
      });

      // Sign-out flow has landed on /login — clear the "signing out"
      // flag so RequireAuth's anonymous-redirect effect can resume normal
      // behaviour on any subsequent unauthenticated navigation.
      clearSigningOut();

      // Strip ?signout=ok so a refresh doesn't keep showing the fast-path
      // (which would re-skip the check and miss any future state change).
      // 1s gives any other code reading the param a beat to do so.
      const stripTimer = window.setTimeout(() => {
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has("signout")) {
            url.searchParams.delete("signout");
            const newPath =
              url.pathname + (url.search || "") + (url.hash || "");
            console.info("[AuthProvider] stripping_signout_query_param");
            window.history.replaceState(null, "", newPath);
          }
        } catch {
          // History API unavailable — leave the URL alone.
        }
      }, 1000);

      const { data: subscription } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (!mountedRef.current) return;
          console.info("[AuthProvider] auth_state_changed", {
            event,
            hasSession: !!session?.user,
          });
          // After the cookie clear, any future SIGNED_IN event means a
          // fresh login on the same tab — re-hydrate the profile.
          if (event === "SIGNED_OUT" || !session?.user) {
            setProfile(null);
            setStatus("anonymous");
            return;
          }
          try {
            const p = await fetchProfile(session.user.id);
            if (!mountedRef.current) return;
            setProfile(p);
            setStatus(p ? "authenticated" : "anonymous");
          } catch {
            if (!mountedRef.current) return;
            setProfile(null);
            setStatus("anonymous");
          }
        }
      );

      return () => {
        cancelled = true;
        window.clearTimeout(stripTimer);
        subscription.subscription.unsubscribe();
      };
    }

    if (fastPathSignin) {
      console.info("[AuthProvider] fast_path_post_signin");
      console.info("[AuthProvider] background_hydration_starting");
      // Optimistic flip — children render immediately while the network
      // fetch below catches up.
      setStatus("authenticated");
    }

    (async () => {
      let nextStatus: AuthStatus = "anonymous";
      let nextProfile: DbProfile | null = null;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled || !mountedRef.current) return;
        const u = data?.user ?? null;
        console.info("[AuthProvider] getUser resolved", {
          hasUser: !!u,
          error: error?.message ?? null,
        });

        if (!u) {
          nextStatus = "anonymous";
          return;
        }

        const p = await fetchProfile(u.id);
        if (cancelled || !mountedRef.current) return;
        console.info("[AuthProvider] fetchProfile resolved", {
          hasProfile: !!p,
        });

        nextProfile = p;
        nextStatus = p ? "authenticated" : "anonymous";
      } catch (e) {
        console.error("[AuthProvider] init failed; defaulting to anonymous", e);
        nextStatus = "anonymous";
        nextProfile = null;
      } finally {
        if (cancelled || !mountedRef.current) return;
        setProfile(nextProfile);
        setStatus(nextStatus);
        console.info("[AuthProvider] status set", { status: nextStatus });

        if (fastPathSignin) {
          if (nextStatus === "authenticated") {
            console.info("[AuthProvider] background_hydration_complete", {
              user_id: nextProfile?.id ?? null,
            });
          } else {
            console.warn("[AuthProvider] background_hydration_failed", {
              reason: nextStatus,
            });
            // RequireAuth's existing 'anonymous' effect will hardReload to
            // /login from here — no extra redirect logic needed.
          }
          // Strip ?just_signed_in=ok so a refresh doesn't keep showing the
          // optimistic state. history.replaceState is cheaper than
          // router.replace — no Next re-render, no middleware re-run.
          if (typeof window !== "undefined") {
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.has("just_signed_in")) {
                url.searchParams.delete("just_signed_in");
                const newPath =
                  url.pathname + (url.search || "") + (url.hash || "");
                console.info("[AuthProvider] stripping_signin_query_param");
                window.history.replaceState(null, "", newPath);
              }
            } catch {
              // History API not available — leave the URL alone.
            }
          }
        }
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;
        console.info("[AuthProvider] auth_state_changed", {
          event,
          hasSession: !!session?.user,
        });

        // Skip SIGNED_OUT during sign-out flow — the explicit signOut()
        // path is already navigating to /auth/signout, and a redundant
        // setStatus("anonymous") here would make RequireAuth fire its
        // own hardReload("/login") and clobber our navigation target.
        if (
          (event === "SIGNED_OUT" || !session?.user) &&
          isSigningOut()
        ) {
          console.info("[AuthProvider] auth_state_changed_skipped_signing_out");
          return;
        }

        // Belt-and-braces: any "you're signed out" signal forces a clean
        // anonymous state, even if the initial getUser was racing this.
        if (event === "SIGNED_OUT" || !session?.user) {
          setProfile(null);
          setStatus("anonymous");
          return;
        }

        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — refetch profile so
        // role / status changes propagate immediately.
        try {
          const p = await fetchProfile(session.user.id);
          if (!mountedRef.current) return;
          setProfile(p);
          setStatus(p ? "authenticated" : "anonymous");
        } catch (e) {
          console.error(
            "[AuthProvider] fetchProfile during auth_state_changed failed",
            e
          );
          if (!mountedRef.current) return;
          setProfile(null);
          setStatus("anonymous");
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Chunk 3c: load the signed-in user's grants whenever the profile id changes
  // (covers every auth path: seed, fast-path, getUser, auth-state-change). RLS
  // lets an authenticated user read user_grants; best-effort, empty on failure.
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (!profileId) {
      setGrants(new Set());
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("user_grants")
          .select("grant_key")
          .eq("user_id", profileId);
        if (!active) return;
        if (error) {
          setGrants(new Set());
          return;
        }
        setGrants(new Set((data ?? []).map((r) => r.grant_key as string)));
      } catch {
        if (active) setGrants(new Set());
      }
    })();
    return () => {
      active = false;
    };
  }, [profileId]);

  const signOut = useCallback(async () => {
    // Fire-and-forget sign-out via /auth/signout (GET) — fixed 2026-05-10.
    //
    // Previous (broken) flow tried to navigate straight to
    // /login?signout=ok. Two failures of that approach:
    //   * The browser's auth cookies were still present on the navigation
    //     (the fire-and-forget /auth/signout POST and the SDK's signOut
    //     hadn't completed yet), so middleware on /login saw a valid
    //     session, redirected to /dashboard, and **stripped all query
    //     params along the way** — the ?signout=ok hint never reached
    //     RedirectIfAuthed.
    //   * The duplicate session-check round-trip on /dashboard then ran
    //     "Verifying session…" for 5-10s before eventually noticing the
    //     background cookie-clear had completed and hardReload-ing to
    //     plain /login.
    //
    // New flow:
    //   1. Clear local AuthProvider state synchronously.
    //   2. Navigate to /auth/signout (GET). That route handler
    //      synchronously deletes every sb-* cookie via Set-Cookie headers
    //      on its redirect response, then 307s to /login?signout=ok. The
    //      browser deletes the cookies before sending the follow-up
    //      /login request, so middleware sees us as anonymous and lets
    //      /login through with the ?signout=ok hint intact.
    //   3. Fire the keepalive POST + SDK signOut as background tasks so
    //      Supabase Auth's /logout endpoint still gets called to revoke
    //      the refresh token (defence-in-depth; not gating navigation).
    //
    // Perceived sign-out time: one network hop to /auth/signout
    // (~50-200ms — no Supabase round-trip on the critical path) + a
    // /login render. Cookies are atomically gone; middleware can't
    // bounce us anywhere.
    console.info("[signOut] entry");

    // Mark "signing out" BEFORE state changes so the reactive effects in
    // RequireAuth + onAuthStateChange see the flag and skip their own
    // redirects. Without this, setStatus("anonymous") below would race
    // our window.location.replace("/auth/signout") and overwrite it
    // with a window.location.replace("/login") (no ?signout=ok hint).
    markSigningOut();

    setProfile(null);
    setStatus("anonymous");
    console.info("[signOut] state_cleared");

    console.info("[signOut] redirecting", { dest: "/auth/signout" });
    if (typeof window !== "undefined") {
      try {
        window.location.replace("/auth/signout");
      } catch {
        window.location.href = "/auth/signout";
      }
    }

    console.info("[signOut] background_signout_fired");
    void fetch("/auth/signout", {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).then(
      () =>
        console.info("[signOut] background_signout_complete server_route"),
      (err: unknown) =>
        console.warn("[signOut] background_signout_failed server_route", err)
    );
    // scope: 'local' — clears in-memory + storage tokens only. Skips the
    // POST to https://<project>.supabase.co/auth/v1/logout that the
    // default scope: 'global' attempts and that was failing CORS in the
    // browser (no Access-Control-Allow-Origin from Supabase Auth for
    // that endpoint when called from app.nexvelonglobal.com). The
    // server-side POST above + /auth/signout GET handle the real cookie
    // teardown; refresh-token revocation happens server-to-server via
    // the POST handler's await supabase.auth.signOut().
    void supabase.auth.signOut({ scope: "local" }).then(
      () => console.info("[signOut] background_signout_complete client_sdk"),
      (err: unknown) =>
        console.warn("[signOut] background_signout_failed client_sdk", err)
    );
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setStatus("anonymous");
      return;
    }
    const p = await fetchProfile(user.id);
    setProfile(p);
    setStatus(p ? "authenticated" : "anonymous");
  }, []);

  const user = useMemo(
    () => (profile ? profileToUser(profile) : null),
    [profile]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      grants,
      status,
      isAuthenticated: status === "authenticated",
      signOut,
      refreshProfile,
      seedSession,
    }),
    [user, profile, grants, status, signOut, refreshProfile, seedSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
