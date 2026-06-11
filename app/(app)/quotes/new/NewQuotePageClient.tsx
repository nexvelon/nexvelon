"use client";

// Client wrapper for /quotes/new — exists because the parent page is now a
// server component (Path-1 patch) but QuoteBuilder still depends on the
// `useQuotes()` localStorage hook to compute `nextQuoteNumber`. This file
// receives the server-fetched + adapted clients/sites/owner and builds the
// `initial` Quote shape that QuoteBuilder consumes.

import { useMemo } from "react";

import { QuoteBuilder } from "@/components/modules/quotes/builder/QuoteBuilder";
import { useQuotesLoaded } from "@/lib/quote-store";
import {
  DEFAULT_TAX_RATE,
  DEFAULT_TERMS,
  emptyLineItem,
  newId,
  nextQuoteNumber,
} from "@/lib/quote-helpers";
import { businessDateISO, businessDatePlusDaysISO } from "@/lib/format";
import { createDefaultSchedules } from "@/lib/quote-schedules";
import { DEFAULT_QUOTE_THEME_SLUG } from "@/lib/quote-themes";
import {
  DEFAULT_QUOTE_TEMPLATE_SLUG,
  type QuoteTemplateSlug,
} from "@/lib/company-profile";
import type { LineItemClassification } from "@/lib/classifications";
import type { Client, Quote, Site, User } from "@/lib/types";

interface Props {
  clients: Client[];
  sitesByClient: Record<string, Site[]>;
  owner: User;
  classifications: LineItemClassification[];
  /**
   * G2: per-entity admin-managed default Terms, keyed by template slug. Each
   * entry falls back to the in-code default const when its setting is unset
   * (resolved server-side). A new quote seeds from the default template's entry.
   */
  defaultTermsByTemplate: Record<QuoteTemplateSlug, string>;
}

export function NewQuotePageClient({
  clients,
  sitesByClient,
  owner,
  classifications,
  defaultTermsByTemplate,
}: Props) {
  const quotesLoaded = useQuotesLoaded();

  const initial = useMemo<Quote>(() => {
    // Calendar dates in the business timezone (America/Toronto) — never via
    // toISOString(), which rolls to tomorrow after ~8pm Eastern.
    return {
      id: newId("q"),
      number: nextQuoteNumber(),
      name: "",
      clientId: "",
      siteId: "",
      status: "Draft",
      createdAt: businessDateISO(),
      expiresAt: businessDatePlusDaysISO(30),
      ownerId: owner.id,
      paymentTerms: "Net 30",
      taxRate: DEFAULT_TAX_RATE,
      projectType: "New Install",
      sections: [
        {
          id: newId("sec"),
          name: "Access Control Hardware",
          items: [emptyLineItem()],
        },
      ],
      items: [],
      terms:
        defaultTermsByTemplate[DEFAULT_QUOTE_TEMPLATE_SLUG] ?? DEFAULT_TERMS,
      internalNotes: "",
      discount: 0,
      discountType: "pct",
      subtotal: 0,
      tax: 0,
      total: 0,
      // Chunk C defaults — only applied to freshly-created quotes here. Quotes
      // already in localStorage will have these as undefined and downstream
      // consumers (Chunks D/E) fall back via `??`.
      schedules: createDefaultSchedules(),
      themeSlug: DEFAULT_QUOTE_THEME_SLUG,
      templateSlug: DEFAULT_QUOTE_TEMPLATE_SLUG,
      showUnitPrice: false,
      showVendor: false, // QB-4 default OFF
      showSku: false, // QB-4 default OFF
      showUpc: false, // CAT-2 default OFF
      showMasterPart: false, // CAT-2 default OFF
      showName: true, // QB-4 default ON
      showDescription: true, // QB-4 default ON
    };
    // F-1b: computed once the DB quote list has loaded so nextQuoteNumber sees
    // every existing quote. `quotesLoaded` in the deps re-derives `initial` the
    // moment hydration completes (the render is gated on it below, so this runs
    // effectively once — when loaded flips true).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.id, quotesLoaded]);

  // Defer the builder until quotes have loaded — otherwise nextQuoteNumber would
  // mint Q-…-0001 against an empty list and collide with existing quotes.
  if (!quotesLoaded) {
    return (
      <div className="text-muted-foreground p-8 text-center text-sm">
        Loading…
      </div>
    );
  }

  return (
    <QuoteBuilder
      initial={initial}
      isNew
      clientsOverride={clients}
      sitesByClientOverride={sitesByClient}
      ownerOverride={owner}
      classifications={classifications}
      defaultTermsByTemplate={defaultTermsByTemplate}
    />
  );
}
