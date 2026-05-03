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
import { useRouter } from "next/navigation";
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
  const router = useRouter();

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
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !mountedRef.current) return;

      if (!user) {
        setProfile(null);
        setStatus("anonymous");
        return;
      }

      const p = await fetchProfile(user.id);
      if (cancelled || !mountedRef.current) return;

      setProfile(p);
      setStatus(p ? "authenticated" : "anonymous");
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;

        if (event === "SIGNED_OUT" || !session?.user) {
          setProfile(null);
          setStatus("anonymous");
          return;
        }

        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — refetch profile so
        // role / status changes propagate immediately.
        const p = await fetchProfile(session.user.id);
        if (!mountedRef.current) return;
        setProfile(p);
        setStatus(p ? "authenticated" : "anonymous");
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setStatus("anonymous");
    router.replace("/login");
  }, [router]);

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
