import "server-only";

// QUOTE-PORTAL-2 — server-side quote PDF rendering. Two jobs:
//   1. buildSafeQuoteDocProps: project a live Quote into the QuoteDocument props
//      with a SEC-1-SAFE `sections` payload — unit cost, margin, internal notes,
//      technician names and stock refs are NEVER copied in (absent, not hidden),
//      so no internal figure can reach the sent PDF, the portal, or the
//      countersigned PDF. The test asserts on THIS payload, not the render.
//   2. renderQuotePdf: render the document to a Buffer (mirrors render-po.ts).
//
// The unsigned PDF (as sent) and the countersigned PDF (with an appended
// signature page via the `acceptance` prop) are both produced from this payload.

import { renderToBuffer } from "@react-pdf/renderer";
import {
  QuoteDocument,
  type DocProps,
  type QuoteAcceptanceStamp,
} from "@/components/modules/quotes/builder/QuoteDocument";
import { getQuoteTheme } from "@/lib/quote-themes";
import { getQuoteTemplate } from "@/lib/company-profile";
import type { Quote, BuilderLineItem, QuoteSection, Client, Site, User } from "@/lib/types";

/** Copy ONLY the client-safe fields of a line item. unitCost / margin / notes /
 *  stockUnitId / committedStockId / labour.techName are never copied — they are
 *  absent from the returned object, so a payload assertion finds no internal
 *  figure. Mirrors buildQuoteSnapshot's allowlist. */
function safeLineItem(it: BuilderLineItem): BuilderLineItem {
  const rawVendor = it.vendor as unknown;
  const vendorName =
    typeof rawVendor === "string"
      ? rawVendor
      : rawVendor && typeof rawVendor === "object"
        ? ((rawVendor as { name?: string }).name ?? undefined)
        : undefined;

  const safe: Record<string, unknown> = {
    id: it.id,
    type: it.type,
    description: it.description,
    name: it.name,
    classification: it.classification,
    qty: it.qty,
    unitPrice: it.unitPrice, // selling price — never cost-derived
    sku: it.sku,
    upc: it.upc,
    masterPartNumber: it.masterPartNumber,
    serialNumber: it.serialNumber,
    vendor: vendorName, // display name only
  };
  if (it.labour) {
    // hours/sellRate are client-facing prices (shown only per the `show` flags);
    // techName is an internal note and is deliberately dropped.
    safe.labour = { hours: it.labour.hours, sellRate: it.labour.sellRate, show: it.labour.show };
  }
  return safe as unknown as BuilderLineItem;
}

function safeSections(sections: QuoteSection[] | undefined): QuoteSection[] {
  return (sections ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    items: (s.items ?? []).map(safeLineItem),
  }));
}

export interface QuoteRenderParties {
  client?: Client;
  site?: Site;
  owner?: User;
}

/** Build the QuoteDocument props from a live quote, with a SEC-1-safe sections
 *  payload. Pass `acceptance` to append the countersignature page. */
export function buildSafeQuoteDocProps(
  quote: Quote,
  parties: QuoteRenderParties = {},
  acceptance?: QuoteAcceptanceStamp
): DocProps {
  const theme = getQuoteTheme(quote.themeSlug ?? "solid_white_pista");
  const template = getQuoteTemplate(quote.templateSlug ?? "integrated_solutions");
  return {
    number: quote.number,
    name: quote.name,
    createdAt: quote.quoteDate || quote.createdAt,
    validUntil: quote.expiresAt,
    paymentTerms: String(quote.paymentTerms ?? ""),
    projectType: String(quote.projectType ?? ""),
    client: parties.client,
    site: parties.site,
    owner: parties.owner,
    preparedBy: quote.preparedBy?.trim() || undefined,
    sections: safeSections(quote.sections),
    taxRatePct: quote.taxRate ?? 13,
    discount: quote.discount ?? 0,
    discountType: quote.discountType ?? "pct",
    terms: quote.terms ?? "",
    theme,
    template,
    schedules: quote.schedules ?? [],
    showUnitPrice: quote.showUnitPrice ?? true,
    showVendor: quote.showVendor ?? false,
    showSku: quote.showSku ?? false,
    showUpc: quote.showUpc ?? false,
    showMasterPart: quote.showMasterPart ?? false,
    showName: quote.showName ?? true,
    showDescription: quote.showDescription ?? true,
    drawingsImagesByPath: {}, // ephemeral client-rendered drawings are not available server-side
    acceptance,
  };
}

/** Render the document to a PDF Buffer (Node runtime; @react-pdf needs Node). */
export async function renderQuotePdf(props: DocProps): Promise<Buffer> {
  return await renderToBuffer(QuoteDocument(props));
}

export type { QuoteAcceptanceStamp };
