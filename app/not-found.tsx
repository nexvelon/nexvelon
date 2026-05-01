import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <div className="bg-brand-navy text-brand-ivory relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <FiligreeBackdrop />
      <div className="relative z-10 max-w-xl text-center">
        <div className="bg-brand-gold/10 ring-brand-gold/40 mx-auto mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full ring-2">
          <Compass className="text-brand-gold h-5 w-5" />
        </div>
        <p className="text-brand-gold font-mono text-xs uppercase tracking-[0.4em]">
          Error 404
        </p>
        <h1 className="text-brand-ivory mt-2 font-serif text-7xl">404</h1>
        <p className="text-brand-ivory/85 mt-4 font-serif text-2xl">
          This page is no longer in service.
        </p>
        <p className="text-brand-ivory/60 mt-2 text-sm leading-relaxed">
          The route you tried to reach has been moved, archived, or never
          existed in the first place. Use the dashboard as your way back.
        </p>
        <Link
          href="/dashboard"
          className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 mt-8 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md"
        >
          Return to Dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="text-brand-ivory/30 mt-12 font-mono text-[10px] uppercase tracking-widest">
          Nexvelon Global Inc. · Field operations, refined.
        </p>
      </div>
    </div>
  );
}

function FiligreeBackdrop() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.06]"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="filigree-404"
          width="56"
          height="56"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="56" stroke="#C9A24B" strokeWidth="1" />
          <line
            x1="28"
            y1="0"
            x2="28"
            y2="56"
            stroke="#C9A24B"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#filigree-404)" />
    </svg>
  );
}
