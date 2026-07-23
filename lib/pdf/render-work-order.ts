import "server-only";

// SUB-5 — render the WorkOrderDocument to a PDF Buffer for storage + email.
// Server-only: renderToBuffer runs the react-pdf renderer in Node. Fonts are
// registered by "@/lib/quote-fonts" (imported transitively by the document).
// Mirrors lib/pdf/render-po.ts. NEVER import into a client component.

import { renderToBuffer } from "@react-pdf/renderer";
import {
  WorkOrderDocument,
  type WorkOrderDocumentProps,
} from "@/components/modules/subcontractors/WorkOrderDocument";

export async function renderWorkOrderPdf(
  props: WorkOrderDocumentProps
): Promise<Buffer> {
  return await renderToBuffer(WorkOrderDocument(props));
}
