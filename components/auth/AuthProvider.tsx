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
  status: AuthStatus;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  /** Forces a refetch of the profile row — used after self-edits. */
  refreshProfile: () => Promise<void>;
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

  // We use a ref to avoid stale-closure issues inside the auth subscription.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
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

    // Detect post-signin fast-path. Read straight from window so we don't
    // pull useSearchParams() in here and accidentally bail every static
    // route out of static rendering.
    let fastPath = false;
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        fastPath = params.get("just_signed_in") === "ok";
      } catch {
        fastPath = false;
      }
    }

    console.info("[AuthProvider] mounting", { fastPath });

    if (fastPath) {
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

        if (fastPath) {
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

  const signOut = useCallback(async () => {
    // Fire-and-forget sign-out (since 2026-05-10).
    //
    // The previous flow awaited supabase.auth.signOut() (up to a 5s
    // Promise.race) AND the /auth/signout POST before navigating. That
    // pinned the user on the dashboard for 5-10 seconds behind a
    // "Signing out…" button, then the /login page started in its
    // "Verifying session…" placeholder for another few seconds while
    // AuthProvider's initial getUser() ran. Total perceived time:
    // 6-12 seconds.
    //
    // New flow:
    //   1. Clear local AuthProvider state synchronously — anyone watching
    //      `status` flips to 'anonymous' immediately.
    //   2. Queue window.location.replace('/login?signout=ok'). The
    //      ?signout=ok hint tells RedirectIfAuthed on /login to skip the
    //      loading placeholder and render the form straight away (we know
    //      the user just signed out; no point making them wait for
    //      getUser() to confirm).
    //   3. THEN fire both supabase.auth.signOut() and the /auth/signout
    //      POST as background tasks. Neither is awaited. The server POST
    //      sets keepalive:true so the browser completes the request even
    //      after the document navigates away — cookies still get cleared
    //      server-side within seconds.
    //
    // Perceived sign-out time: <200ms. Server-side cleanup completes
    // asynchronously while the user is already on /login.
    console.info("[signOut] entry");

    setProfile(null);
    setStatus("anonymous");

    console.info("[signOut] redirecting");
    if (typeof window !== "undefined") {
      try {
        window.location.replace("/login?signout=ok");
      } catch {
        window.location.href = "/login?signout=ok";
      }
    }

    console.info("[signOut] background_signout_started");
    void supabase.auth.signOut().then(
      () => console.info("[signOut] background_signout_complete client_sdk"),
      (err: unknown) =>
        console.warn("[signOut] background_signout_failed client_sdk", err)
    );
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
      status,
      isAuthenticated: status === "authenticated",
      signOut,
      refreshProfile,
    }),
    [user, profile, status, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
