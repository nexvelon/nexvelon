"use client";

// D-2 — add-ons offer context for the quote builder. QuoteBuilder provides
// `offerAddons(sectionId, product)`; the deeply nested LineItemRow (Builder →
// SectionCard → LineItemRow) calls it after a user picks a part, without
// prop-drilling — mirroring CatalogProductsContext. Default is a no-op so the
// row works outside a provider. The palette path calls the helper directly in
// QuoteBuilder. Companion adds do NOT route through this (no recursion).

import { createContext, useContext } from "react";
import type { Product } from "@/lib/types";

export type OfferAddons = (sectionId: string, product: Product) => void;

export const OfferAddonsContext = createContext<OfferAddons>(() => {});

export function useOfferAddons(): OfferAddons {
  return useContext(OfferAddonsContext);
}
