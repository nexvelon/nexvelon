import "server-only";

// REP-1 — the shared export convention. Given a ReportDataset and a format,
// produce a downloadable payload. CSV travels as text; xlsx/pdf travel as base64
// (in the action payload, same as CSV — no signed URL for v1). Every report
// action builds its dataset then calls this, so all reports get all three
// formats without per-report export code.

import { datasetToCsv } from "@/lib/reports/to-csv";
import { datasetToXlsxBase64 } from "@/lib/reports/to-xlsx";
import { datasetToPdfBase64 } from "@/lib/reports/to-pdf";
import type { ReportDataset } from "@/lib/reports/dataset";

export type ReportFormat = "csv" | "xlsx" | "pdf";

export interface ReportExport {
  data: string; // csv text, or base64 for xlsx/pdf
  filename: string; // with extension
  mime: string;
  encoding: "text" | "base64";
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportDataset(ds: ReportDataset, format: ReportFormat): Promise<ReportExport> {
  switch (format) {
    case "csv":
      return { data: datasetToCsv(ds), filename: `${ds.filename}.csv`, mime: "text/csv;charset=utf-8;", encoding: "text" };
    case "xlsx":
      return { data: await datasetToXlsxBase64(ds), filename: `${ds.filename}.xlsx`, mime: XLSX_MIME, encoding: "base64" };
    case "pdf":
      return { data: await datasetToPdfBase64(ds), filename: `${ds.filename}.pdf`, mime: "application/pdf", encoding: "base64" };
  }
}
