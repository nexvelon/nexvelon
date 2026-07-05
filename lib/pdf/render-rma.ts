import "server-only";

// INV-4 — render the RmaDocument to a PDF Buffer for storage + email. Server-
// only: renderToBuffer runs the react-pdf renderer in Node. Fonts are registered
// by "@/lib/quote-fonts" (imported transitively by the document). Mirrors
// lib/pdf/render-po.ts. NEVER import this into a client component.

import { renderToBuffer } from "@react-pdf/renderer";
import {
  RmaDocument,
  type RmaDocumentProps,
} from "@/components/modules/inventory/RmaDocument";

export async function renderRmaPdf(props: RmaDocumentProps): Promise<Buffer> {
  // Invoke the component directly (returns the <Document> element) — the same
  // pattern the PO / pickup-slip / invite PDFs use for server-side renderToBuffer.
  return await renderToBuffer(RmaDocument(props));
}
