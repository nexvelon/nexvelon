"use client";

// INV-4 — catalog context for the quote builder. QuoteBuilder fetches the real
// inventory catalog once (listProductsAction) and provides it here; the deeply
// nested SkuAutocomplete (Builder → SectionCard → LineItemRow → SkuAutocomplete)
// and the CommandPalette consume it without prop-drilling. Defaults to [] so
// consumers degrade gracefully before the fetch resolves.

import { createContext, useContext } from "react";
import type { Product } from "@/lib/types";

export const CatalogProductsContext = createContext<Product[]>([]);

export function useCatalogProducts(): Product[] {
  return useContext(CatalogProductsContext);
}
