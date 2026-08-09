"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  STORAGE_KEY,
  resolveTheme,
  type ResolvedThemeColors,
  type ThemeKey,
} from "./theme";

interface ThemeContextValue {
  theme: ThemeKey;
  colors: ResolvedThemeColors;
  setTheme: (next: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * UIDG-3 — the theme is resolved from the DB on the server and passed in as
 * `serverThemeKey` (already stamped on <html data-theme> for first paint).
 * localStorage is now a CACHE ONLY: it is written to keep the pre-hydration
 * bootstrap fast, but it never overrides the server/DB value.
 */
export function ThemeProvider({
  serverThemeKey = DEFAULT_THEME,
  children,
}: {
  serverThemeKey?: ThemeKey;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeKey>(serverThemeKey);

  // Reconcile: the server already resolved + stamped the theme; sync the cache
  // to it (DB wins on any mismatch). Never read the cache to override state.
  useEffect(() => {
    setThemeState(serverThemeKey);
    if (typeof window !== "undefined") {
      document.documentElement.dataset.theme = serverThemeKey;
      try {
        window.localStorage.setItem(STORAGE_KEY, serverThemeKey);
      } catch {
        // Private-mode / disabled storage — the server value still rules.
      }
    }
  }, [serverThemeKey]);

  // Local apply for an in-session switch (the settings pane persists via the
  // setMyTheme action and reverts on failure).
  const setTheme = useCallback((next: ThemeKey) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, colors: resolveTheme(theme), setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export function useThemeColors(): ResolvedThemeColors {
  return useTheme().colors;
}
