import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME, STORAGE_KEY, THEME_ORDER } from "@/lib/theme";
import { resolveServerTheme } from "@/lib/api/ui-theme";
import { renderThemeBlock } from "@/lib/theme-css";
import { AuthProvider } from "@/components/auth/AuthProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Nexvelon",
    template: "%s · Nexvelon",
  },
  description:
    "Field operations, refined. Quote-to-cash for security systems integrators — quotes, projects, commissioning, scheduling, and finance in one polished workspace.",
  applicationName: "Nexvelon",
  authors: [{ name: "Nexvelon Global Inc." }],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0A1226",
  colorScheme: "light",
};

// UIDG-3/4 — the server resolves the theme (built-in OR a custom theme) and
// stamps <html data-theme> + injects the custom CSS block below, so first paint
// is correct with no flash and no JS. This bootstrap runs pre-hydration only to
// keep the localStorage cache in sync (DB wins). It trusts the server value for
// ANY key (built-in or custom uuid); it only falls back to the cache — and then
// only to a KNOWN built-in — if the server somehow left the value empty (a
// cached custom key has no injected block, so it must not be restored blind).
function buildThemeBootstrap(serverThemeKey: string): string {
  return `
(function () {
  try {
    var el = document.documentElement;
    var builtins = ${JSON.stringify(THEME_ORDER)};
    var server = ${JSON.stringify(serverThemeKey)};
    var KEY = ${JSON.stringify(STORAGE_KEY)};
    if (server) {
      el.dataset.theme = server;
      try { localStorage.setItem(KEY, server); } catch (_) {}
    } else {
      var cached = localStorage.getItem(KEY);
      el.dataset.theme = builtins.indexOf(cached) !== -1 ? cached : ${JSON.stringify(DEFAULT_THEME)};
    }
  } catch (_) {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
  }
})();
`;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the theme server-side (user override → org default → DEFAULT), so
  // the correct theme paints on first byte with no flash and no JS required.
  const theme = await resolveServerTheme();

  return (
    <html lang="en" data-theme={theme.key}>
      <head>
        {/* A custom theme's tokens can't be pre-generated (per-user DB row), so
            inject its [data-theme] block inline for a correct first paint. */}
        {theme.isCustom && (
          <style
            id="nx-server-theme"
            dangerouslySetInnerHTML={{ __html: renderThemeBlock(theme.key, theme.colors) }}
          />
        )}
        <script
          dangerouslySetInnerHTML={{ __html: buildThemeBootstrap(theme.key) }}
          suppressHydrationWarning
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider serverThemeKey={theme.key} serverThemeColors={theme.colors}>
          {/* AuthProvider wraps RoleProvider since Session A — RoleProvider
              now sources the live role from useAuth() rather than from
              localStorage. */}
          <AuthProvider>
            <RoleProvider>{children}</RoleProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
