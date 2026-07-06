"use client";

import { useEffect, useMemo, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { QuoteBuilder } from "@/components/modules/quotes/builder/QuoteBuilder";
import { useQuote, useQuotesLoaded } from "@/lib/quote-store";
import {
  ensureSections,
  DEFAULT_TERMS,
  DEFAULT_TERMS_GUARDIAN,
} from "@/lib/quote-helpers";
import type { QuoteTemplateSlug } from "@/lib/company-profile";
import type { Client, Site } from "@/lib/types";
import {
  getDefaultTermsAction,
  getDefaultTermsGuardianAction,
} from "@/app/(app)/settings/company-settings-actions";
import { getQuotePickerDataAction } from "@/app/(app)/quotes/actions";

export default function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const quote = useQuote(id);
  const quotesLoaded = useQuotesLoaded();

  // G2: per-entity default Terms map for the entity-switch reseed in the
  // builder. Starts from the in-code defaults and is enriched with the
  // admin-managed settings values (best-effort; reads are open). This map is
  // ONLY used by the builder's template-change handler — it never overwrites a
  // saved quote's terms on load.
  const [defaultTermsByTemplate, setDefaultTermsByTemplate] = useState<
    Record<QuoteTemplateSlug, string>
  >({
    integrated_solutions: DEFAULT_TERMS,
    guardian: DEFAULT_TERMS_GUARDIAN,
  });

  // BUGFIX (quotes) — the edit route must feed the builder's client/site
  // pickers from real data, exactly like /quotes/new. Without these overrides
  // QuoteBuilder falls back to empty mock arrays, so the dropdowns are dead and
  // the Bill-To / Service-Site boxes render blank on open. Fetched client-side
  // because this is a client component; undefined until loaded (the builder
  // keeps its mock fallback for that brief window).
  const [pickerClients, setPickerClients] = useState<Client[] | undefined>();
  const [pickerSitesByClient, setPickerSitesByClient] = useState<
    Record<string, Site[]> | undefined
  >();

  useEffect(() => {
    let active = true;
    getQuotePickerDataAction()
      .then((res) => {
        if (!active || !res.ok) return;
        setPickerClients(res.data.clients);
        setPickerSitesByClient(res.data.sitesByClient);
      })
      .catch(() => {
        // leave undefined — builder falls back to its mock arrays
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getDefaultTermsAction(), getDefaultTermsGuardianAction()])
      .then(([integrated, guardian]) => {
        if (!active) return;
        setDefaultTermsByTemplate({
          integrated_solutions:
            integrated.ok && integrated.data != null
              ? integrated.data
              : DEFAULT_TERMS,
          guardian:
            guardian.ok && guardian.data != null
              ? guardian.data
              : DEFAULT_TERMS_GUARDIAN,
        });
      })
      .catch(() => {
        // keep the in-code defaults already in state
      });
    return () => {
      active = false;
    };
  }, []);

  const initial = useMemo(
    () => (quote ? { ...quote, sections: ensureSections(quote) } : undefined),
    [quote]
  );

  // F-1b: while the DB load is in flight, don't flash "not found".
  if (!initial && !quotesLoaded) {
    return (
      <div className="text-muted-foreground p-8 text-center text-sm">
        Loading…
      </div>
    );
  }

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

  return (
    <QuoteBuilder
      initial={initial}
      isNew={false}
      defaultTermsByTemplate={defaultTermsByTemplate}
      clientsOverride={pickerClients}
      sitesByClientOverride={pickerSitesByClient}
    />
  );
}
