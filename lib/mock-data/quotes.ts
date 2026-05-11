import type { Quote } from "../types";

// Pre-Quotes cleanup (2026-05-11): mock data emptied. The Quote type is
// preserved. Quotes is the FIRST module to be wired in Session B
// Priority 4 (0005_quotes_schema.sql + lib/api/quotes.ts). Until then
// the page renders an empty state.
export const quotes: Quote[] = [];
