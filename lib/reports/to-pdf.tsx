import "server-only";

// REP-1 — PDF renderer. Reuses the @react-pdf renderToBuffer pattern (the same
// one the PO/invoice/WO PDFs use — invoke the Document component as a function)
// against the GENERIC tabular ReportDocument. Returns base64 for the action
// payload.

import { renderToBuffer } from "@react-pdf/renderer";
import { ReportDocument } from "@/components/reports/ReportDocument";
import type { ReportDataset } from "@/lib/reports/dataset";

export async function datasetToPdfBase64(ds: ReportDataset): Promise<string> {
  const buffer = await renderToBuffer(ReportDocument({ dataset: ds }));
  return Buffer.from(buffer).toString("base64");
}
