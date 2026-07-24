import "server-only";

// PROJ2-13 — render the CommissioningCertificate to a PDF Buffer for storage.
// Server-only (renderToBuffer runs react-pdf in Node). Mirrors
// lib/pdf/render-work-order.ts. NEVER import into a client component.

import { renderToBuffer } from "@react-pdf/renderer";
import {
  CommissioningCertificate,
  type CommissioningCertificateProps,
} from "@/components/modules/projects/CommissioningCertificate";

export async function renderCommissioningPdf(
  props: CommissioningCertificateProps
): Promise<Buffer> {
  return await renderToBuffer(CommissioningCertificate(props));
}
