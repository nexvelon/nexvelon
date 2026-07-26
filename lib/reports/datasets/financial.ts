// REP-2 — the financial report datasets. Each builder is a PURE function
// (already-fetched source data → ReportDataset), reusing the column choices the
// FIN-3/6/7/8 + SUB-7 CSV exports already validated. The three renderers then
// give every one CSV / xlsx / PDF for free. Client-safe: only type-imports from
// the server-only api modules (erased at compile), plus formatCell + format
// helpers.

import { formatCell, type ReportDataset } from "@/lib/reports/dataset";
import { businessDateISO } from "@/lib/format";
import { round2 } from "@/lib/quote-helpers";
import { AGING_BUCKET_LABEL } from "@/lib/aging-buckets";
import type { OpcoPnl, PnlPortfolioRow } from "@/lib/api/project-pnl";
import type { ArAgingClientRow } from "@/lib/api/ar-aging";
import type { ApAgingVendorRow } from "@/lib/api/ap-aging";
import type { HstNetPosition } from "@/lib/api/financials";
import type { T5018Report } from "@/lib/api/t5018";

// The full legal entity names the FIN-8 / FIN-7 CSVs print (OPCO_CSV_LABEL),
// not the short badge labels — a downloadable report names the corporation in
// full.
const OPCO_FULL_LABEL: Record<string, string> = {
  integrated_solutions: "Nexvelon Integrated Solutions",
  guardian: "Nexvelon Guardian",
};
function opcoLabel(opco: string): string {
  return OPCO_FULL_LABEL[opco] ?? opco;
}

const asOfMeta = () => [{ label: "As of", value: formatCell(businessDateISO(), "date") }];

// ─── P&L by company (FIN-8, getOpcoPnl) ──────────────────────────────────────
// Per-opco — NO totals row. Blending the two corporations is forbidden (they
// are separate legal entities), and with no totals row there is nothing to
// blend. Columns are OPCO_PNL_CSV_HEADER verbatim.

export function opcoPnlDataset(rows: OpcoPnl[]): ReportDataset {
  return {
    title: "Profit & loss by company",
    subtitle: "Each company is a separate P&L — never blended (project-to-date).",
    meta: asOfMeta(),
    columns: [
      { key: "entity", label: "Entity", kind: "text" },
      { key: "projects", label: "Projects", kind: "number" },
      { key: "revenue", label: "Revenue", kind: "currency" },
      { key: "materials", label: "Materials (supplier bills)", kind: "currency" },
      { key: "labour", label: "Labour", kind: "currency" },
      { key: "sub_labour", label: "Subcontractors", kind: "currency" },
      { key: "direct_cost", label: "Direct cost", kind: "currency" },
      { key: "gross_profit", label: "Gross profit", kind: "currency" },
      { key: "margin_pct", label: "Gross margin %", kind: "percent" },
    ],
    rows: rows.map((r) => ({
      entity: opcoLabel(r.opco),
      projects: r.project_count,
      revenue: r.revenue,
      materials: r.materials_billed,
      labour: r.labour,
      sub_labour: r.sub_labour,
      direct_cost: r.canonical_direct,
      gross_profit: r.gross_profit,
      margin_pct: r.gross_margin_pct, // already 0..100 scale
    })),
    // No totals — never blend opcos.
    filename: `nexvelon-pnl-by-company-${businessDateISO()}`,
  };
}

// ─── Margin analysis (FIN-8, getPnlPortfolio) ────────────────────────────────
// Per-project margin table with a totals row. Reuses the validated PnlTab
// portfolio columns; billed_pct is a 0..1 ratio, so ×100 for the percent kind.

export function marginDataset(rows: PnlPortfolioRow[]): ReportDataset {
  const revenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
  const cost = round2(rows.reduce((s, r) => s + Number(r.canonical_direct ?? 0), 0));
  const gp = round2(rows.reduce((s, r) => s + Number(r.gross_profit ?? 0), 0));
  const marginPct = revenue > 0 ? round2((gp / revenue) * 100) : null;
  return {
    title: "Margin analysis",
    subtitle: "Quoted vs actual margin across active projects (project-to-date).",
    meta: asOfMeta(),
    columns: [
      { key: "number", label: "Project", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "entity", label: "Entity", kind: "text" },
      { key: "revenue", label: "Revenue", kind: "currency" },
      { key: "direct_cost", label: "Direct cost", kind: "currency" },
      { key: "gross_profit", label: "Gross profit", kind: "currency" },
      { key: "margin_pct", label: "Margin %", kind: "percent" },
      { key: "billed_pct", label: "Billed %", kind: "percent" },
    ],
    rows: rows.map((r) => ({
      number: r.number,
      title: r.title,
      entity: opcoLabel(r.opco),
      revenue: r.revenue,
      direct_cost: r.canonical_direct,
      gross_profit: r.gross_profit,
      margin_pct: r.gross_margin_pct,
      billed_pct: r.billed_pct == null ? null : round2(r.billed_pct * 100),
    })),
    totals: {
      number: "Portfolio",
      revenue,
      direct_cost: cost,
      gross_profit: gp,
      margin_pct: marginPct,
    },
    filename: `nexvelon-margin-analysis-${businessDateISO()}`,
  };
}

// ─── Project profitability ranking (FIN-8, getPnlPortfolio) ──────────────────
// Ranked by gross-profit DOLLARS descending (the biggest profit contributors
// first — distinct from margin analysis, which reads margin %). Projects with
// no computable profit sort last.

export function profitabilityDataset(rows: PnlPortfolioRow[]): ReportDataset {
  const ranked = [...rows].sort(
    (a, b) => (b.gross_profit ?? -Infinity) - (a.gross_profit ?? -Infinity)
  );
  return {
    title: "Project profitability ranking",
    subtitle: "Active projects ranked by gross profit (project-to-date).",
    meta: asOfMeta(),
    columns: [
      { key: "rank", label: "Rank", kind: "number" },
      { key: "number", label: "Project", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "entity", label: "Entity", kind: "text" },
      { key: "revenue", label: "Revenue", kind: "currency" },
      { key: "gross_profit", label: "Gross profit", kind: "currency" },
      { key: "margin_pct", label: "Margin %", kind: "percent" },
    ],
    rows: ranked.map((r, i) => ({
      rank: i + 1,
      number: r.number,
      title: r.title,
      entity: opcoLabel(r.opco),
      revenue: r.revenue,
      gross_profit: r.gross_profit,
      margin_pct: r.gross_margin_pct,
    })),
    filename: `nexvelon-profitability-${businessDateISO()}`,
  };
}

// ─── AR aging (FIN-3, getArAgingByClient) ────────────────────────────────────
// Client × aging buckets with a totals row. Bucket labels are the shared
// AGING_BUCKET_LABEL vocabulary.

const BUCKET_COLS = [
  { key: "current", label: AGING_BUCKET_LABEL.current },
  { key: "d1_30", label: AGING_BUCKET_LABEL["1_30"] },
  { key: "d31_60", label: AGING_BUCKET_LABEL["31_60"] },
  { key: "d61_90", label: AGING_BUCKET_LABEL["61_90"] },
  { key: "d90_plus", label: AGING_BUCKET_LABEL["90_plus"] },
] as const;

function bucketTotals(
  rows: { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number; total: number }[]
): Record<string, number> {
  const t: Record<string, number> = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
  for (const r of rows) {
    for (const k of ["current", "d1_30", "d31_60", "d61_90", "d90_plus", "total"] as const) {
      t[k] = round2(t[k] + r[k]);
    }
  }
  return t;
}

export function arAgingDataset(rows: ArAgingClientRow[]): ReportDataset {
  const t = bucketTotals(rows);
  return {
    title: "Accounts receivable aging",
    subtitle: "Open receivables by client and age bucket.",
    meta: asOfMeta(),
    columns: [
      { key: "client", label: "Client", kind: "text" },
      ...BUCKET_COLS.map((c) => ({ key: c.key, label: c.label, kind: "currency" as const })),
      { key: "total", label: "Total", kind: "currency" as const },
    ],
    rows: rows.map((r) => ({
      client: r.client_name,
      current: r.current,
      d1_30: r.d1_30,
      d31_60: r.d31_60,
      d61_90: r.d61_90,
      d90_plus: r.d90_plus,
      total: r.total,
    })),
    totals: { client: "Total", ...t },
    filename: `nexvelon-ar-aging-${businessDateISO()}`,
  };
}

// ─── AP aging (FIN-6, getApAgingByVendor) ────────────────────────────────────

export function apAgingDataset(rows: ApAgingVendorRow[]): ReportDataset {
  const t = bucketTotals(rows);
  return {
    title: "Accounts payable aging",
    subtitle: "Open payables by vendor and age bucket.",
    meta: asOfMeta(),
    columns: [
      { key: "vendor", label: "Vendor", kind: "text" },
      ...BUCKET_COLS.map((c) => ({ key: c.key, label: c.label, kind: "currency" as const })),
      { key: "total", label: "Total", kind: "currency" as const },
    ],
    rows: rows.map((r) => ({
      vendor: r.vendor_name,
      current: r.current,
      d1_30: r.d1_30,
      d31_60: r.d31_60,
      d61_90: r.d61_90,
      d90_plus: r.d90_plus,
      total: r.total,
    })),
    totals: { vendor: "Total", ...t },
    filename: `nexvelon-ap-aging-${businessDateISO()}`,
  };
}

// ─── HST net position (FIN-7, getHstNetPosition) ─────────────────────────────
// Per-opco, period-aware. NO blended totals row — the two corporations file
// separately (position.totals is deliberately dropped, mirroring
// buildHstReturnCsv). The unassigned-ITC line is surfaced as its own row.

export function hstDataset(position: HstNetPosition): ReportDataset {
  const period =
    position.from && position.to
      ? `${formatCell(position.from, "date")} – ${formatCell(position.to, "date")}`
      : "All periods to date";

  const rows: Record<string, string | number | null>[] = position.byOpco.map((r) => ({
    entity: opcoLabel(r.opco),
    collected: r.collected,
    itc: r.itc,
    net: r.net,
  }));
  if (position.unassignedItc > 0) {
    rows.push({
      entity: "UNASSIGNED (attribute before filing)",
      collected: 0,
      itc: position.unassignedItc,
      net: 0,
    });
  }

  return {
    title: "HST net position",
    subtitle: "Per company — each files separately, so there is no combined total.",
    meta: [{ label: "Period", value: period }],
    columns: [
      { key: "entity", label: "Entity", kind: "text" },
      { key: "collected", label: "HST collected", kind: "currency" },
      { key: "itc", label: "Input tax credits", kind: "currency" },
      { key: "net", label: "Net owing", kind: "currency" },
    ],
    rows,
    // No totals — never blend opcos.
    filename: `nexvelon-hst-${position.from && position.to ? `${position.from}_${position.to}` : businessDateISO()}`,
  };
}

// ─── T5018 (SUB-7, getT5018Report) ───────────────────────────────────────────
// Year-aware. Columns are T5018_CSV_HEADER verbatim. Totals row carries the
// contractor count + total paid.

export function t5018Dataset(report: T5018Report): ReportDataset {
  return {
    title: "T5018 — contractor payments",
    subtitle: "Annual subcontractor payment report (tax-inclusive). Rows below $500 are flagged, not filtered.",
    meta: [
      { label: "Year", value: String(report.year) },
      { label: "Period", value: `${formatCell(report.period.from, "date")} – ${formatCell(report.period.to, "date")}` },
    ],
    columns: [
      { key: "name", label: "Legal name", kind: "text" },
      { key: "bn", label: "Business number", kind: "text" },
      { key: "gst_hst", label: "GST/HST number", kind: "text" },
      { key: "line1", label: "Address line 1", kind: "text" },
      { key: "line2", label: "Address line 2", kind: "text" },
      { key: "city", label: "City", kind: "text" },
      { key: "province", label: "Province", kind: "text" },
      { key: "postal", label: "Postal code", kind: "text" },
      { key: "total_paid", label: "Total paid", kind: "currency" },
      { key: "count", label: "Payment count", kind: "number" },
      { key: "first", label: "First payment", kind: "date" },
      { key: "last", label: "Last payment", kind: "date" },
      { key: "below", label: "Below $500 threshold", kind: "text" },
      { key: "missing_bn", label: "Missing business number", kind: "text" },
    ],
    rows: report.rows.map((r) => ({
      name: r.name,
      bn: r.business_number,
      gst_hst: r.gst_hst_number,
      line1: r.address.line1,
      line2: r.address.line2,
      city: r.address.city,
      province: r.address.province,
      postal: r.address.postal_code,
      total_paid: r.total_paid,
      count: r.payment_count,
      first: r.first_payment,
      last: r.last_payment,
      below: r.below_threshold ? "Yes" : "No",
      missing_bn: r.missing_business_number ? "Yes" : "No",
    })),
    totals: {
      name: `Total (${report.totals.subcontractor_count} contractor${report.totals.subcontractor_count === 1 ? "" : "s"})`,
      total_paid: report.totals.total_paid,
    },
    filename: `nexvelon-t5018-${report.year}`,
  };
}
