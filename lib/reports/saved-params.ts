// REP-5 — a saved report's parameters (2b) and their run-time resolution. Pure.
//
// Stored as jsonb on saved_reports.params, exactly this shape. Only the parameters
// a report actually accepts (per the catalog) are kept; anything else is dropped
// on save, so a saved definition can never carry a filter its report ignores.

import {
  resolveRange,
  resolveYear,
  validateRangeSpec,
  describeRange,
  type RangeSpec,
  type YearSpec,
} from "@/lib/reports/date-ranges";
import { REPORT_CATALOG, OPCO_FILTER_OPTIONS, type SavedReportKey } from "@/lib/reports/catalog";

export interface SavedReportParams {
  range?: RangeSpec;
  year?: YearSpec;
  /** vendor-spend top-N. */
  limit?: number;
  /** Opco-scoped reports only: limit rows to one operating company. */
  opco?: string | null;
}

/** The concrete inputs the existing report builders take. */
export interface ResolvedReportParams {
  from?: string;
  to?: string;
  year?: number;
  limit?: number;
  opco?: string | null;
}

/** Keep only what this report accepts; normalise. */
export function normalizeParams(key: SavedReportKey, p: SavedReportParams | null | undefined): SavedReportParams {
  const entry = REPORT_CATALOG[key];
  const out: SavedReportParams = {};
  if (entry.params === "range") out.range = p?.range ?? { kind: "none" };
  if (entry.params === "year") out.year = p?.year ?? { kind: "relative", preset: "this_year" };
  if (entry.limit && p?.limit) out.limit = Math.trunc(p.limit);
  if (entry.opcoScoped && p?.opco) out.opco = p.opco;
  return out;
}

export function validateParams(key: SavedReportKey, p: SavedReportParams): string | null {
  const entry = REPORT_CATALOG[key];
  if (entry.params === "range") {
    const e = validateRangeSpec(p.range);
    if (e) return e;
  }
  if (entry.params === "year" && p.year?.kind === "fixed") {
    if (!Number.isInteger(p.year.year) || p.year.year < 2000 || p.year.year > 2100) return "Choose a valid reporting year.";
  }
  if (p.limit !== undefined && (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 500)) {
    return "The top-N limit must be between 1 and 500.";
  }
  if (p.opco && !OPCO_FILTER_OPTIONS.some((o) => o.value === p.opco)) return "Unknown operating company.";
  return null;
}

/** Resolve saved params into concrete builder inputs AS OF the run date. */
export function resolveParams(key: SavedReportKey, p: SavedReportParams, runDate: string): ResolvedReportParams {
  const entry = REPORT_CATALOG[key];
  const out: ResolvedReportParams = {};
  if (entry.params === "range") {
    const r = resolveRange(p.range, runDate);
    if (r) {
      out.from = r.from;
      out.to = r.to;
    }
  }
  if (entry.params === "year") out.year = resolveYear(p.year, runDate);
  if (entry.limit && p.limit) out.limit = p.limit;
  if (entry.opcoScoped && p.opco) out.opco = p.opco;
  return out;
}

/** Plain-language summary of the saved filters ("Last month · Guardian only"). */
export function describeParams(key: SavedReportKey, p: SavedReportParams): string {
  const entry = REPORT_CATALOG[key];
  const bits: string[] = [];
  if (entry.params === "range") bits.push(describeRange(p.range));
  if (entry.params === "year") {
    bits.push(
      p.year?.kind === "fixed"
        ? `Year ${p.year.year}`
        : p.year?.preset === "last_year"
          ? "Last year"
          : "This year"
    );
  }
  if (entry.limit && p.limit) bits.push(`Top ${p.limit}`);
  if (entry.opcoScoped) {
    const o = OPCO_FILTER_OPTIONS.find((x) => x.value === p.opco);
    bits.push(o ? `${o.label} only` : "Both companies");
  }
  if (entry.pointInTime) bits.push("Balances as of the run date");
  return bits.join(" · ") || "No filters";
}
