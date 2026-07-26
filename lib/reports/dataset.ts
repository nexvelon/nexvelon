// REP-1 — the shared report abstraction. A report defines its data ONCE as a
// ReportDataset; the three renderers (CSV / xlsx / PDF) all format cells through
// the single `formatCell`, so the same report shows identical values in every
// format (no drift between the CSV and the PDF). Client-safe (no server-only).

import { format, parseISO } from "date-fns";
import { formatCurrency, formatNumber } from "@/lib/format";

export type ReportCellKind = "text" | "number" | "currency" | "percent" | "date";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  kind?: ReportCellKind;
}

export interface ReportDataset {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[]; // "As of", "Period", "Opco"
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>; // optional footer row
  filename: string; // base, no extension
}

/** Numeric kinds render right-aligned by default. */
export function isNumericKind(kind?: ReportCellKind): boolean {
  return kind === "number" || kind === "currency" || kind === "percent";
}

export function defaultAlign(col: ReportColumn): "left" | "right" | "center" {
  return col.align ?? (isNumericKind(col.kind) ? "right" : "left");
}

/**
 * The SINGLE cell formatter — every renderer uses it, so a currency / percent /
 * date value looks identical in CSV, xlsx and PDF. Empty/null → "".
 */
export function formatCell(
  value: string | number | null | undefined,
  kind: ReportCellKind = "text"
): string {
  if (value === null || value === undefined || value === "") return "";
  switch (kind) {
    case "currency":
      return formatCurrency(Number(value));
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "number":
      return formatNumber(Number(value));
    case "date": {
      const s = String(value).slice(0, 10);
      try {
        return format(parseISO(s), "d MMM yyyy");
      } catch {
        return String(value);
      }
    }
    default:
      return String(value);
  }
}
