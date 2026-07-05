import "server-only";

// INV-3 — render the PickupSlipDocument to a PDF Buffer for storage. Server-only:
// renderToBuffer runs the react-pdf renderer in Node. Fonts are registered by
// "@/lib/quote-fonts" (imported transitively by the document). Mirrors
// lib/pdf/render-po.ts. NEVER import this into a client component.

import { renderToBuffer } from "@react-pdf/renderer";
import {
  PickupSlipDocument,
  type PickupSlipDocumentProps,
} from "@/components/modules/inventory/PickupSlipDocument";

export async function renderPickupSlipPdf(
  props: PickupSlipDocumentProps
): Promise<Buffer> {
  // Invoke the component directly (returns the <Document> element) — the same
  // pattern the PO / invite / quote PDFs use for server-side renderToBuffer.
  return await renderToBuffer(PickupSlipDocument(props));
}
