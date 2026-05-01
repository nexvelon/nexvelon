"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="bg-brand-navy text-brand-ivory relative flex min-h-screen items-center justify-center px-6">
      <div className="relative z-10 max-w-xl text-center">
        <div className="bg-brand-gold/10 ring-brand-gold/40 mx-auto mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full ring-2">
          <AlertTriangle className="text-brand-gold h-5 w-5" />
        </div>
        <p className="text-brand-gold font-mono text-xs uppercase tracking-[0.4em]">
          Something went sideways
        </p>
        <h1 className="text-brand-ivory mt-2 font-serif text-5xl">
          We hit an unexpected error.
        </h1>
        <p className="text-brand-ivory/60 mt-4 text-sm leading-relaxed">
          The error has been logged and the on-call engineer has been notified.
          You can retry the action — most issues resolve on the next attempt.
        </p>
        {error.digest && (
          <p className="text-brand-ivory/30 mt-6 font-mono text-[10px] uppercase tracking-widest">
            ref · {error.digest}
          </p>
        )}
        <div className="mt-8 inline-flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="bg-brand-gold text-brand-navy hover:bg-brand-gold/90 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md"
          >
            <RefreshCcw className="h-4 w-4" />
            Retry
          </button>
          <Link
            href="/dashboard"
            className="text-brand-ivory/80 hover:text-brand-ivory underline-offset-4 hover:underline"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
