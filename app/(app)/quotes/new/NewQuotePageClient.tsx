"use client";

// Client wrapper for /quotes/new — exists because the parent page is now a
// server component (Path-1 patch) but QuoteBuilder still depends on the
// `useQuotes()` localStorage hook to compute `nextQuoteNumber`. This file
// receives the server-fetched + adapted clients/sites/owner and builds the
// `initial` Quote shape that QuoteBuilder consumes.

import { useMemo } from "react";

import { QuoteBuilder } from "@/components/modules/quotes/builder/QuoteBuilder";
import { useQuotes } from "@/lib/quote-store";
import {
  DEFAULT_TAX_RATE,
  DEFAULT_TERMS,
  emptyLineItem,
  newId,
  nextQuoteNumber,
} from "@/lib/quote-helpers";
import type { Client, Quote, Site, User } from "@/lib/types";

interface Props {
  clients: Client[];
  sitesByClient: Record<string, Site[]>;
  owner: User;
}

export function NewQuotePageClient({ clients, sitesByClient, owner }: Props) {
  const allQuotes = useQuotes();

  const initial = useMemo<Quote>(() => {
    const today = new Date();
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + 30);

    return {
      id: newId("q"),
      number: nextQuoteNumber(allQuotes),
      name: "",
      clientId: "",
      siteId: "",
      status: "Draft",
      createdAt: today.toISOString().slice(0, 10),
      expiresAt: expiry.toISOString().slice(0, 10),
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
      terms: DEFAULT_TERMS,
      internalNotes: "",
      discount: 0,
      discountType: "pct",
      subtotal: 0,
      tax: 0,
      total: 0,
    };
    // initial values are computed once per page mount; allQuotes is read for
    // next-number calculation but the resulting `initial` shouldn't reactively
    // change as quotes are added in this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.id]);

  return (
    <QuoteBuilder
      initial={initial}
      isNew
      clientsOverride={clients}
      sitesByClientOverride={sitesByClient}
      ownerOverride={owner}
    />
  );
}
