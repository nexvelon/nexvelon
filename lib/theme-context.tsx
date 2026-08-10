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
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_STORAGE_KEY,
  STORAGE_KEY,
  deriveDarkTokens,
  isUuid,
  resolveTheme,
  type ResolvedThemeColors,
  type ThemeKey,
  type ThemeMode,
  type ThemeTokens,
} from "./theme";
import { renderThemeBlocks } from "./theme-css";

// UIDG-4/4B — a single client-managed <style> holds the light+dark CSS blocks for
// the active custom theme (or a live preview). Built-in themes need no block
// (they're in the generated partial). Mode is the `.dark` class on <html>.
const RUNTIME_STYLE_ID = "nx-runtime-theme";
const PREVIEW_KEY = "nx-preview";

/** The light + derived-dark token sets for a custom theme. */
export interface CustomTokenPair {
  light: ThemeTokens;
  dark: ThemeTokens;
}

interface ThemeContextValue {
  theme: string;
  mode: ThemeMode;
  colors: ResolvedThemeColors;
  /** Apply a committed theme. Pass `custom` (light+dark tokens) for a custom
   *  theme; omit for a built-in. */
  setTheme: (key: string, custom?: CustomTokenPair) => void;
  /** Switch light/dark, keeping the palette. */
  setMode: (mode: ThemeMode) => void;
  /** Live-apply arbitrary LIGHT tokens (dark derived) without committing. */
  preview: (light: ThemeTokens) => void;
  /** Discard any preview and restore the last committed theme, no residue. */
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

function colorsFor(key: string, mode: ThemeMode, custom?: CustomTokenPair): ResolvedThemeColors {
  if (custom) {
    const tokens = mode === "dark" ? custom.dark : custom.light;
    return { key, name: "", description: "", ...tokens };
  }
  return resolveTheme(key as ThemeKey, mode);
}

export function ThemeProvider({
  serverThemeKey = DEFAULT_THEME,
  serverMode = DEFAULT_MODE,
  serverColors,
  serverCustom,
  children,
}: {
  serverThemeKey?: string;
  serverMode?: ThemeMode;
  serverColors?: ResolvedThemeColors;
  serverCustom?: CustomTokenPair;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<string>(serverThemeKey);
  const [mode, setModeState] = useState<ThemeMode>(serverMode);
  const [colors, setColors] = useState<ResolvedThemeColors>(
    serverColors ?? colorsFor(serverThemeKey, serverMode, serverCustom)
  );
  // The last COMMITTED theme (not a preview), so endPreview can restore it.
  const committed = useRef<{ key: string; custom?: CustomTokenPair }>({
    key: serverThemeKey,
    custom: serverCustom,
  });

  // Reconcile the caches to the server values (DB wins). Never cache → state.
  useEffect(() => {
    committed.current = { key: serverThemeKey, custom: serverCustom };
    setThemeState(serverThemeKey);
    setModeState(serverMode);
    setColors(serverColors ?? colorsFor(serverThemeKey, serverMode, serverCustom));
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, serverThemeKey);
        window.localStorage.setItem(MODE_STORAGE_KEY, serverMode);
      } catch {
        /* private mode — server value still rules */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverThemeKey, serverMode]);

  function applyDom(key: string, m: ThemeMode, custom: CustomTokenPair | undefined, cacheKey: boolean) {
    if (typeof document === "undefined") return;
    const el = runtimeStyleEl();
    if (el) el.textContent = custom ? renderThemeBlocks(key, custom.light, custom.dark) : "";
    document.documentElement.dataset.theme = key;
    document.documentElement.classList.toggle("dark", m === "dark");
    if (cacheKey && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, key);
        window.localStorage.setItem(MODE_STORAGE_KEY, m);
      } catch {
        /* ignore */
      }
    }
  }

  const setTheme = useCallback(
    (key: string, custom?: CustomTokenPair) => {
      committed.current = { key, custom };
      setThemeState(key);
      setModeState((m) => {
        applyDom(key, m, custom, true);
        setColors(colorsFor(key, m, custom));
        return m;
      });
    },
    []
  );

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    const { key, custom } = committed.current;
    applyDom(key, next, custom, true);
    setColors(colorsFor(key, next, custom));
  }, []);

  const preview = useCallback((light: ThemeTokens) => {
    const pair: CustomTokenPair = { light, dark: deriveDarkTokens(light) };
    setModeState((m) => {
      applyDom(PREVIEW_KEY, m, pair, false);
      setColors(colorsFor(PREVIEW_KEY, m, pair));
      return m;
    });
    setThemeState(PREVIEW_KEY);
  }, []);

  const endPreview = useCallback(() => {
    const { key, custom } = committed.current;
    setThemeState(key);
    setModeState((m) => {
      applyDom(key, m, custom, false);
      setColors(colorsFor(key, m, custom));
      return m;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mode, colors, setTheme, setMode, preview, endPreview }}>
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

// isUuid re-exported for consumers that branch on custom vs built-in keys.
export { isUuid };
