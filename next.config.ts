import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // QUOTE-PORTAL-2 — server-side @react-pdf renders (quote portal, PO/RMA/WO/etc.)
  // read the quote fonts from public/fonts at runtime. Trace those .ttf files into
  // every serverless function bundle so they exist on Vercel, not just locally.
  outputFileTracingIncludes: {
    "/**": ["./public/fonts/**"],
  },
};

export default nextConfig;
