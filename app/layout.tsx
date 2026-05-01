import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RoleProvider } from "@/lib/role-context";
import { ThemeProvider } from "@/lib/theme-context";

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
  themeColor: "#0B1B3B",
  colorScheme: "light",
};

// Suppresses the FOUC of the default theme by setting [data-theme] before
// React hydrates. Reads from localStorage; falls back to royal-navy.
const themeBootstrap = `
(function () {
  try {
    var saved = localStorage.getItem("nexvelon:theme");
    var t = saved && /^(royal-navy|onyx-brass|oxford-green|burgundy-reserve)$/.test(saved)
      ? saved
      : "royal-navy";
    document.documentElement.dataset.theme = t;
  } catch (_) {
    document.documentElement.dataset.theme = "royal-navy";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="royal-navy">
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
          <RoleProvider>{children}</RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
