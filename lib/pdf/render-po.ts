import "server-only";

// PO-4 — render the PurchaseOrderDocument to a PDF Buffer for storage + email.
// Server-only: renderToBuffer runs the react-pdf renderer in Node. Fonts are
// registered by "@/lib/quote-fonts" (imported transitively by the document).
// NEVER import this into a client component.

import { ensureQuoteFontsRegistered } from "@/lib/pdf/quote-fonts-server";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  PurchaseOrderDocument,
  type PurchaseOrderDocumentProps,
} from "@/components/modules/purchase-orders/PurchaseOrderDocument";

export async function renderPurchaseOrderPdf(
  props: PurchaseOrderDocumentProps
): Promise<Buffer> {
  // Invoke the component directly (returns the <Document> element) — the same
  // pattern the invite/quote PDFs use for server-side renderToBuffer.
  ensureQuoteFontsRegistered();
  return await renderToBuffer(PurchaseOrderDocument(props));
}
