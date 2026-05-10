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
  useEffect(() => {
    let cancelled = false;

    console.info("[AuthProvider] mounting");

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
    // Hardened sign-out. Reasons each piece exists:
    //   * 5-second Promise.race on supabase.auth.signOut: the SDK call
    //     can hang if the cookie state is corrupted (one Session A symptom
    //     reported was an indefinite "Logging out…" spinner).
    //   * /auth/signout fetch (server-side cookie deletion): regardless of
    //     whether the SDK call resolved or timed out, this guarantees the
    //     auth cookies are gone before we reload.
    //   * window.location.replace: forces a full browser reload, which
    //     wipes any stuck React state. Beats router.replace, which can
    //     itself hang on a bad client-side route transition.
    //
    // Tagged logs at every step so the next time something hangs, the
    // stuck spot is obvious in the browser console.
    console.info("[signOut] entry");

    const SIGNOUT_TIMEOUT_MS = 5000;
    const timeoutSentinel = Symbol("timeout");
    const supabaseSignOut = supabase.auth.signOut().then(
      (r) => r,
      (err: unknown) => ({ error: err })
    );
    const timeout = new Promise<typeof timeoutSentinel>((resolve) => {
      setTimeout(() => resolve(timeoutSentinel), SIGNOUT_TIMEOUT_MS);
    });

    const settled = await Promise.race([supabaseSignOut, timeout]);
    if (settled === timeoutSentinel) {
      console.warn(
        "[signOut] supabase_signout_timeout after",
        SIGNOUT_TIMEOUT_MS,
        "ms"
      );
    } else {
      console.info("[signOut] supabase_signout_resolved", {
        hadError: !!(settled as { error?: unknown })?.error,
      });
    }

    // Clear local state regardless. Setting status='anonymous' here means
    // RequireAuth's effects fire on whatever page is currently rendered,
    // even before the hard reload below — minimises the chance of a
    // brief flicker of authenticated UI.
    setProfile(null);
    setStatus("anonymous");

    // Server-side fallback: clear cookies via the dedicated /auth/signout
    // route handler. Best-effort — never throw out of signOut.
    try {
      await fetch("/auth/signout", {
        method: "POST",
        credentials: "include",
        // Keepalive lets the request continue past the hard reload below
        // in browsers that support it (Chrome, Firefox).
        keepalive: true,
      });
      console.info("[signOut] server_signout_done");
    } catch (e) {
      console.error("[signOut] server_signout_failed", e);
    }

    console.info("[signOut] forcing_reload");
    // Hard reload past any stuck React state. Falls back to assigning the
    // location if `replace` is unavailable for some browser oddity.
    if (typeof window !== "undefined") {
      try {
        window.location.replace("/login");
      } catch {
        window.location.href = "/login";
      }
    }
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
