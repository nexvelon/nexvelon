// REP-1 — CSV renderer. Reuses the RFC-4180 quoter (csvField) and the shared
// formatCell. Header + rows + optional totals; \r\n line terminators (matching
// the existing financial CSV exports). Pure, client-safe.

import { csvField } from "@/lib/aging-buckets";
import { formatCell, type ReportDataset } from "@/lib/reports/dataset";

export function datasetToCsv(ds: ReportDataset): string {
  const lines: string[] = [];
  lines.push(ds.columns.map((c) => csvField(c.label)).join(","));
  for (const row of ds.rows) {
    lines.push(ds.columns.map((c) => csvField(formatCell(row[c.key], c.kind))).join(","));
  }
  if (ds.totals) {
    lines.push(ds.columns.map((c) => csvField(formatCell(ds.totals![c.key] ?? "", c.kind))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
