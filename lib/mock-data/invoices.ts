import type { Invoice } from "../types";

// Pre-Quotes cleanup (2026-05-11): mock data emptied. The Invoice type
// is preserved. Financials/invoices is unwired; the page renders an
// empty state until the Financials module ships its schema + API.
export const invoices: Invoice[] = [];
