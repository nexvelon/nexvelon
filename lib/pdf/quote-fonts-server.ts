import "server-only";

// QUOTE-PORTAL-2 fix — register the quote fonts for SERVER-SIDE @react-pdf renders.
// lib/quote-fonts.ts only auto-registers in a browser (`typeof window`); on the
// server (route handlers, server actions, cron) nothing registers them, so a
// server render throws "Font family not registered: Inter". Every server render
// path must call ensureQuoteFontsRegistered() before renderToBuffer. Idempotent.
//
// Fonts are read from the filesystem at `<cwd>/public/fonts` (same files the smoke
// script uses). next.config.ts traces these .ttf files into the serverless bundle
// via outputFileTracingIncludes so they exist at runtime on Vercel too.

import path from "path";
import { registerQuoteFonts } from "@/lib/quote-fonts";

let registered = false;

export function ensureQuoteFontsRegistered(): void {
  if (registered) return;
  try {
    registerQuoteFonts(path.join(process.cwd(), "public", "fonts"));
    registered = true;
  } catch (e) {
    // In a real server runtime this succeeds. In a test env where @react-pdf is
    // mocked with a partial Font API it may throw — swallow so it never breaks a
    // caller whose render is mocked anyway (the real render path is covered by
    // __tests__/quotes/render-quote.test.ts against the real @react-pdf).
    console.error("[pdf] quote font registration failed:", e);
  }
}
