"use client";

import { useMemo } from "react";
import { QuoteBuilder } from "@/components/modules/quotes/builder/QuoteBuilder";
import { useQuotes } from "@/lib/quote-store";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  DEFAULT_TAX_RATE,
  DEFAULT_TERMS,
  emptyLineItem,
  newId,
  nextQuoteNumber,
} from "@/lib/quote-helpers";
import { users } from "@/lib/mock-data/users";
import type { Quote } from "@/lib/types";
import Link from "next/link";

export default function NewQuotePage() {
  const allQuotes = useQuotes();
  const { role } = useRole();
  const canCreate = hasPermission(role, "quotes", "create");

  const initial = useMemo<Quote>(() => {
    const today = new Date();
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + 30);
    const defaultOwner =
      users.find((u) => u.role === "SalesRep") ??
      users.find((u) => u.role === "Admin")!;

    return {
      id: newId("q"),
      number: nextQuoteNumber(allQuotes),
      name: "",
      clientId: "",
      siteId: "",
      status: "Draft",
      createdAt: today.toISOString().slice(0, 10),
      expiresAt: expiry.toISOString().slice(0, 10),
      ownerId: defaultOwner.id,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canCreate) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">
          Not authorized
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Your current role does not have permission to create quotes.
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

  return <QuoteBuilder initial={initial} isNew />;
}
