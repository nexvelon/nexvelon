import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME, STORAGE_KEY, THEME_ORDER } from "@/lib/theme";
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

// Suppresses the FOUC of the default theme by setting [data-theme] before
// React hydrates. Reads from localStorage; falls back to the default theme.
// The allow-list is serialised from THEME_ORDER (single source of truth) rather
// than a hand-maintained regex, so a new preset needs no edit here.
const themeBootstrap = `
(function () {
  try {
    var keys = ${JSON.stringify(THEME_ORDER)};
    var saved = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var t = keys.indexOf(saved) !== -1 ? saved : ${JSON.stringify(DEFAULT_THEME)};
    document.documentElement.dataset.theme = t;
  } catch (_) {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME)};
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME}>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
          suppressHydrationWarning
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
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
