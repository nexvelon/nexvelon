// REP-3 / REP-4 — the operational report datasets + the business snapshot. Pure
// builders (source data → ReportDataset), mirroring the REP-2 financial.ts
// pattern. Client-safe: type-imports only from the server-only api modules, plus
// formatCell for the few pre-formatted mixed-kind cells.

import { formatCell, type ReportDataset } from "@/lib/reports/dataset";
import { businessDateISO } from "@/lib/format";
import { round2 } from "@/lib/quote-helpers";
import type { SalesPipeline } from "@/lib/api/reports/pipeline";
import type { LabourUtilizationReport } from "@/lib/api/reports/labour-utilization";
import type { VendorSpendReport } from "@/lib/api/reports/vendor-spend";
import type { InventoryReportData } from "@/lib/api/products";
import type { BusinessSnapshot } from "@/lib/api/reports/business-snapshot";

const asOfMeta = () => ({ label: "As of", value: formatCell(businessDateISO(), "date") });

// ─── Sales pipeline (REP-3) ──────────────────────────────────────────────────
// One row per real QuoteStatus (no fabricated "Lead"); conversion rate in meta.

export function pipelineDataset(pipeline: SalesPipeline): ReportDataset {
  const cr = pipeline.totals.conversion_rate;
  return {
    title: "Sales pipeline",
    subtitle: "Quotes by stage — count and value. Conversion = converted ÷ quotes that left Draft.",
    meta: [
      asOfMeta(),
      { label: "Conversion rate", value: cr == null ? "—" : `${cr.toFixed(1)}%` },
    ],
    columns: [
      { key: "status", label: "Stage", kind: "text" },
      { key: "count", label: "Quotes", kind: "number" },
      { key: "value", label: "Value", kind: "currency" },
    ],
    rows: pipeline.byStatus.map((s) => ({ status: s.status, count: s.count, value: s.value })),
    totals: { status: "Total", count: pipeline.totals.total_count, value: pipeline.totals.total_value },
    filename: `nexvelon-sales-pipeline-${businessDateISO()}`,
  };
}

// ─── Labour utilization (REP-3) ──────────────────────────────────────────────
// Booked vs available hours + utilization. NO billable split (no source).
// Unknown-hours techs → "—" (not 0), excluded from the overall denominator.

function hoursOrDash(h: number | null): string {
  return h == null ? "—" : formatCell(h, "number");
}
function pctOrDash(p: number | null): string {
  return p == null ? "—" : `${p}%`;
}

export function labourUtilizationDataset(report: LabourUtilizationReport): ReportDataset {
  return {
    title: "Technician utilization",
    subtitle: "Booked vs available hours over the window. No billable/non-billable split is tracked.",
    meta: [
      { label: "Window", value: `${formatCell(report.from, "date")} – ${formatCell(report.to, "date")}` },
    ],
    columns: [
      { key: "tech", label: "Technician", kind: "text" },
      { key: "booked", label: "Booked (h)", kind: "text", align: "right" },
      { key: "available", label: "Available (h)", kind: "text", align: "right" },
      { key: "util", label: "Utilization", kind: "text", align: "right" },
    ],
    rows: report.techs.map((t) => ({
      tech: t.tech,
      booked: formatCell(t.booked_hours, "number"),
      available: hoursOrDash(t.available_hours),
      util: pctOrDash(t.utilization_pct),
    })),
    totals: {
      tech: "Overall (known-hours techs)",
      booked: formatCell(report.overall.booked, "number"),
      available: formatCell(report.overall.available, "number"),
      util: pctOrDash(report.overall.utilization_pct),
    },
    filename: `nexvelon-utilization-${report.from}_${report.to}`,
  };
}

// ─── Vendor spend top-N (REP-3) ──────────────────────────────────────────────

export function vendorSpendDataset(report: VendorSpendReport): ReportDataset {
  const period =
    report.from && report.to
      ? `${formatCell(report.from, "date")} – ${formatCell(report.to, "date")}`
      : "All time to date";

  const rows: Record<string, string | number | null>[] = report.rows.map((r) => ({
    vendor: r.vendor,
    bills: r.bill_count,
    spend: r.spend,
  }));
  if (report.others.vendor_count > 0) {
    rows.push({
      vendor: `Others (${report.others.vendor_count} vendor${report.others.vendor_count === 1 ? "" : "s"})`,
      bills: null,
      spend: report.others.spend,
    });
  }

  return {
    title: "Vendor spend",
    subtitle: "Top vendors by pre-tax billed spend.",
    meta: [{ label: "Period", value: period }],
    columns: [
      { key: "vendor", label: "Vendor", kind: "text" },
      { key: "bills", label: "Bills", kind: "number" },
      { key: "spend", label: "Spend", kind: "currency" },
    ],
    rows,
    totals: { vendor: "Total (all vendors)", spend: report.total_spend },
    filename: `nexvelon-vendor-spend-${report.from && report.to ? `${report.from}_${report.to}` : businessDateISO()}`,
  };
}

// ─── Inventory valuation (REP-3) ─────────────────────────────────────────────

export function inventoryValuationDataset(data: InventoryReportData): ReportDataset {
  const units = round2(data.valuationByCategory.reduce((s, c) => s + c.units, 0));
  return {
    title: "Inventory valuation",
    subtitle: "In-stock value by category (display-only weighted cost).",
    meta: [asOfMeta()],
    columns: [
      { key: "category", label: "Category", kind: "text" },
      { key: "units", label: "Units", kind: "number" },
      { key: "value", label: "Value", kind: "currency" },
    ],
    rows: data.valuationByCategory.map((c) => ({ category: c.category, units: c.units, value: c.value })),
    totals: { category: "Total", units, value: round2(data.totalValuation) },
    filename: `nexvelon-inventory-valuation-${businessDateISO()}`,
  };
}

// ─── Business snapshot (REP-4) ───────────────────────────────────────────────
// A metric/value list of REAL operating figures. Explicitly NOT a valuation:
// no multiple, no MRR, no bank-cash balance. Mixed kinds → pre-formatted values
// in a single text column.

export function businessSnapshotDataset(s: BusinessSnapshot): ReportDataset {
  const rows: { metric: string; value: string }[] = [
    { metric: "Revenue run-rate (annualized)", value: formatCell(s.revenue_run_rate, "currency") },
    { metric: "Blended gross margin", value: s.blended_margin_pct == null ? "—" : `${s.blended_margin_pct.toFixed(1)}%` },
    { metric: "Contract backlog (unbilled)", value: formatCell(s.contract_backlog, "currency") },
    { metric: "AR outstanding", value: formatCell(s.ar_outstanding, "currency") },
    { metric: "AP outstanding", value: formatCell(s.ap_outstanding, "currency") },
    { metric: "Net position (AR − AP)", value: formatCell(s.net_position, "currency") },
  ];
  return {
    title: "Business snapshot",
    subtitle: "Operating snapshot — real figures, not a business valuation.",
    meta: [
      { label: "As of", value: formatCell(s.as_of, "date") },
      { label: "Run-rate basis", value: `${s.run_rate_basis_months} complete month${s.run_rate_basis_months === 1 ? "" : "s"} × 12` },
    ],
    columns: [
      { key: "metric", label: "Metric", kind: "text" },
      { key: "value", label: "Value", kind: "text", align: "right" },
    ],
    rows,
    filename: `nexvelon-business-snapshot-${businessDateISO()}`,
  };
}
