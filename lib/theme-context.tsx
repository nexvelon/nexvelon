"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  STORAGE_KEY,
  isUuid,
  resolveTheme,
  type ResolvedThemeColors,
  type ThemeKey,
} from "./theme";
import { renderThemeBlock } from "./theme-css";

// UIDG-4 — one client-managed <style> holds the CSS block for the active custom
// theme (or a live preview). Built-in themes need no block (they're in the
// generated partial); the server also injects #nx-server-theme for the initially
// resolved custom theme, which this element supersedes once the client applies.
const RUNTIME_STYLE_ID = "nx-runtime-theme";
const PREVIEW_KEY = "nx-preview";

interface ThemeContextValue {
  theme: string;
  colors: ResolvedThemeColors;
  /** Apply a committed theme (built-in key, or a saved custom key + its colours). */
  setTheme: (key: string, colors?: ResolvedThemeColors) => void;
  /** Live-apply arbitrary tokens without committing (editor preview). */
  preview: (colors: ResolvedThemeColors) => void;
  /** Discard any preview and restore the last committed theme with no residue. */
  endPreview: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function runtimeStyleEl(): HTMLStyleElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(RUNTIME_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = RUNTIME_STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}

/**
 * UIDG-3/4 — the theme is resolved from the DB on the server and passed in as
 * `serverThemeKey` + `serverThemeColors` (already stamped + injected for first
 * paint). localStorage is a CACHE ONLY; it never overrides the server value.
 */
export function ThemeProvider({
  serverThemeKey = DEFAULT_THEME,
  serverThemeColors,
  children,
}: {
  serverThemeKey?: string;
  serverThemeColors?: ResolvedThemeColors;
  children: ReactNode;
}) {
  const initialColors = serverThemeColors ?? resolveTheme(DEFAULT_THEME);
  const [theme, setThemeState] = useState<string>(serverThemeKey);
  const [colors, setColors] = useState<ResolvedThemeColors>(initialColors);
  // The last COMMITTED theme (not a preview), so endPreview can restore it.
  const committed = useRef<{ key: string; colors: ResolvedThemeColors }>({
    key: serverThemeKey,
    colors: initialColors,
  });

  // Reconcile the cache to the server value (DB wins). Never read cache → state.
  useEffect(() => {
    committed.current = { key: serverThemeKey, colors: initialColors };
    setThemeState(serverThemeKey);
    setColors(initialColors);
    if (typeof window !== "undefined") {
      document.documentElement.dataset.theme = serverThemeKey;
      try {
        window.localStorage.setItem(STORAGE_KEY, serverThemeKey);
      } catch {
        /* private mode — server value still rules */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverThemeKey]);

  /** Paint a theme: for a custom theme, write its block into the runtime <style>;
   *  for a built-in, clear it. `writeCache` distinguishes commit from preview. */
  const paint = useCallback(
    (key: string, next: ResolvedThemeColors, isCustom: boolean, writeCache: boolean) => {
      if (typeof document !== "undefined") {
        const el = runtimeStyleEl();
        if (el) el.textContent = isCustom ? renderThemeBlock(key, next) : "";
        document.documentElement.dataset.theme = key;
      }
      setThemeState(key);
      setColors(next);
      if (writeCache && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, key);
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  const setTheme = useCallback(
    (key: string, nextColors?: ResolvedThemeColors) => {
      const custom = isUuid(key);
      const resolved = nextColors ?? resolveTheme(key as ThemeKey);
      committed.current = { key, colors: resolved };
      paint(key, resolved, custom, true);
    },
    [paint]
  );

  const preview = useCallback(
    (previewColors: ResolvedThemeColors) => {
      paint(PREVIEW_KEY, { ...previewColors, key: PREVIEW_KEY }, true, false);
    },
    [paint]
  );

  const endPreview = useCallback(() => {
    const { key, colors: c } = committed.current;
    paint(key, c, isUuid(key), false);
  }, [paint]);

  return (
    <ThemeContext.Provider value={{ theme, colors, setTheme, preview, endPreview }}>
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
