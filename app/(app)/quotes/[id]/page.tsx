"use client";

import { useMemo } from "react";
import { use } from "react";
import Link from "next/link";
import { QuoteBuilder } from "@/components/modules/quotes/builder/QuoteBuilder";
import { useQuote } from "@/lib/quote-store";
import { ensureSections } from "@/lib/quote-helpers";

export default function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const quote = useQuote(id);

  const initial = useMemo(
    () => (quote ? { ...quote, sections: ensureSections(quote) } : undefined),
    [quote]
  );

  if (!initial) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">
          Quote not found
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The quote &quot;{id}&quot; couldn&apos;t be located. It may have been archived
          or never existed.
        </p>
        <Link
          href="/quotes"
          className="text-brand-gold mt-4 inline-block text-sm hover:underline"
        >
          ← Back to Quotes
        </Link>
      </div>
    );
  }

  return <QuoteBuilder initial={initial} isNew={false} />;
}
