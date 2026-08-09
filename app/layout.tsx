import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME, STORAGE_KEY, THEME_ORDER } from "@/lib/theme";
import { resolveServerThemeKey } from "@/lib/api/ui-theme";
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

// UIDG-3 — the DB-resolved theme (`serverThemeKey`) is injected below. The server
// already stamps <html data-theme>, so this runs pre-hydration only to keep the
// localStorage cache in sync (DB wins). It NEVER lets the cache override the
// server value — it only fills in from cache if the server somehow left an
// invalid key. The allow-list is serialised from THEME_ORDER (single source).
function buildThemeBootstrap(serverThemeKey: string): string {
  return `
(function () {
  try {
    var el = document.documentElement;
    var keys = ${JSON.stringify(THEME_ORDER)};
    var server = ${JSON.stringify(serverThemeKey)};
    var KEY = ${JSON.stringify(STORAGE_KEY)};
    if (keys.indexOf(server) !== -1) {
      el.dataset.theme = server;
      try { localStorage.setItem(KEY, server); } catch (_) {}
    } else {
      var cached = localStorage.getItem(KEY);
      el.dataset.theme = keys.indexOf(cached) !== -1 ? cached : ${JSON.stringify(DEFAULT_THEME)};
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
  const themeKey = await resolveServerThemeKey();

  return (
    <html lang="en" data-theme={themeKey}>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: buildThemeBootstrap(themeKey) }}
          suppressHydrationWarning
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider serverThemeKey={themeKey}>
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
