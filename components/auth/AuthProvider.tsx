"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/role-context";
import {
  DEMO_ACCOUNTS,
  authenticate,
  findDemoAccountByEmail,
} from "@/lib/demo-accounts";
import type { Role } from "@/lib/types";

const STORAGE_KEY = "nexvelon_session";

export interface AuthUser {
  email: string;
  name: string;
  role: Role;
}

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  signInAs: (email: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed.email || !parsed.name || !parsed.role) return null;
    return parsed as AuthUser;
  } catch {
    return null;
  }
}

function writeSession(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { setRole } = useRole();

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const saved = readSession();
    if (saved) {
      setUser(saved);
      setRole(saved.role);
      setStatus("authenticated");
    } else {
      setStatus("anonymous");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(
    (email: string, password: string) => {
      const acct = authenticate(email, password);
      if (!acct) {
        return { ok: false as const, error: "Invalid email or password. Please try again." };
      }
      const next: AuthUser = { email: acct.email, name: acct.name, role: acct.role };
      setUser(next);
      setRole(acct.role);
      setStatus("authenticated");
      writeSession(next);
      return { ok: true as const };
    },
    [setRole]
  );

  // Used by the demo chips — looks up by email and signs in without
  // the password check (we still verify the email is one of our demo chips).
  const signInAs = useCallback(
    (email: string) => {
      const acct = findDemoAccountByEmail(email);
      if (!acct) return;
      const next: AuthUser = { email: acct.email, name: acct.name, role: acct.role };
      setUser(next);
      setRole(acct.role);
      setStatus("authenticated");
      writeSession(next);
    },
    [setRole]
  );

  const signOut = useCallback(() => {
    writeSession(null);
    setUser(null);
    setStatus("anonymous");
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        isAuthenticated: status === "authenticated",
        signIn,
        signInAs,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// Convenience for tests / sidebar / etc.
export function getDemoEmails(): string[] {
  return DEMO_ACCOUNTS.map((a) => a.email);
}
