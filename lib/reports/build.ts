import "server-only";

// REP-5 — the ONE report dataset builder. Consolidates the three per-module
// dispatchers (REP-1 WIP, REP-2 financial, REP-3/4 operational) so an on-screen
// report, an export, and a scheduled email are produced by exactly the same code.
//
// It performs NO permission check and reads NO session: the caller decides who is
// allowed (the interactive actions gate the signed-in user; the scheduled runner
// gates owner + recipient per lib/reports/access.ts) and passes the SEC-1 field
// gates EXPLICITLY. That is what makes "redaction at generation time" hold for an
// unattended run — the builder can't silently fall back to "whoever is logged in".

import { getWipPortfolio, type WipPortfolio } from "@/lib/api/wip";
import { getOpcoPnl, getPnlPortfolio } from "@/lib/api/project-pnl";
import { getArAgingByClient } from "@/lib/api/ar-aging";
import { getApAgingByVendor } from "@/lib/api/ap-aging";
import { getHstNetPosition } from "@/lib/api/financials";
import { getT5018Report } from "@/lib/api/t5018";
import { getSalesPipeline } from "@/lib/api/reports/pipeline";
import { getLabourUtilizationReport } from "@/lib/api/reports/labour-utilization";
import { getVendorSpendReport } from "@/lib/api/reports/vendor-spend";
import { getInventoryReportData, type InventoryReportData } from "@/lib/api/products";
import { getBusinessSnapshot } from "@/lib/api/reports/business-snapshot";
import {
  opcoPnlDataset,
  marginDataset,
  profitabilityDataset,
  arAgingDataset,
  apAgingDataset,
  hstDataset,
  t5018Dataset,
} from "@/lib/reports/datasets/financial";
import {
  pipelineDataset,
  labourUtilizationDataset,
  vendorSpendDataset,
  inventoryValuationDataset,
  businessSnapshotDataset,
} from "@/lib/reports/datasets/operational";
import { OPCO_FILTER_OPTIONS, type SavedReportKey } from "@/lib/reports/catalog";
import type { ReportDataset } from "@/lib/reports/dataset";
import type { ResolvedReportParams } from "@/lib/reports/saved-params";
import type { ReportFieldGates } from "@/lib/reports/access";
import { businessDateISO } from "@/lib/format";

const POSITION_LABEL: Record<string, string> = {
  overbilled: "Overbilled",
  underbilled: "Underbilled",
  neutral: "On track",
};

/** The WIP portfolio as a ReportDataset (moved here from reports/actions.ts). */
export function wipDataset(portfolio: WipPortfolio): ReportDataset {
  return {
    title: "Work-in-progress (WIP)",
    subtitle: "Over- and under-billing across active projects",
    meta: [{ label: "As of", value: businessDateISO() }],
    columns: [
      { key: "number", label: "Project", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "contract", label: "Contract", kind: "currency" },
      { key: "estimated_cost", label: "Est. cost", kind: "currency" },
      { key: "actual_cost", label: "Actual cost", kind: "currency" },
      { key: "pct_complete", label: "% complete", kind: "percent" },
      { key: "earned", label: "Earned", kind: "currency" },
      { key: "billed", label: "Billed", kind: "currency" },
      { key: "over_under", label: "Over/(under)", kind: "currency" },
      { key: "position", label: "Position", kind: "text" },
    ],
    rows: portfolio.rows.map((r) => ({
      number: r.number,
      title: r.title,
      status: r.status,
      contract: r.contract,
      estimated_cost: r.estimated_cost,
      actual_cost: r.actual_cost,
      pct_complete: r.pct_complete == null ? null : Math.round(r.pct_complete * 1000) / 10,
      earned: r.earned,
      billed: r.billed,
      over_under: r.over_under,
      position: POSITION_LABEL[r.position] ?? r.position,
    })),
    totals: {
      number: "Portfolio",
      over_under: portfolio.totals.net,
      position: `${portfolio.totals.overbilled >= 0 ? "+" : ""}over / under net`,
    },
    filename: `nexvelon-wip-${businessDateISO()}`,
  };
}

/** A full-day window ending today when no range is given (utilization default). */
function resolveWindow(params: ResolvedReportParams): { from: string; to: string } {
  if (params.from && params.to) {
    return { from: `${params.from}T00:00:00.000Z`, to: `${params.to}T23:59:59.999Z` };
  }
  const today = businessDateISO();
  const from = new Date(`${today}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 6); // trailing 7 days
  return { from: from.toISOString(), to: `${today}T23:59:59.999Z` };
}

/** SEC-1 — inventory value columns require inventory:viewCost; null (never 0) otherwise. */
export function redactInventory(report: InventoryReportData, gates: ReportFieldGates): InventoryReportData {
  if (gates.inventoryCost) return report;
  return {
    ...report,
    totalValuation: null,
    valuationByCategory: report.valuationByCategory.map((c) => ({ ...c, value: null })),
    aging: report.aging.map((a) => ({ ...a, value: null })),
    consumption90d: { ...report.consumption90d, value: null },
  };
}

function opcoLabel(opco: string): string {
  return OPCO_FILTER_OPTIONS.find((o) => o.value === opco)?.label ?? opco;
}

/** §2.6 — narrow a per-opco report to one company, and say so on the report. */
function scopeToOpco(ds: ReportDataset, opco: string | null | undefined): ReportDataset {
  if (!opco) return ds;
  return {
    ...ds,
    meta: [...(ds.meta ?? []), { label: "Company", value: `${opcoLabel(opco)} only` }],
    filename: `${ds.filename}-${opco.replace(/_/g, "-")}`,
  };
}

function byOpco<T extends { opco: string }>(rows: T[], opco: string | null | undefined): T[] {
  return opco ? rows.filter((r) => r.opco === opco) : rows;
}

/**
 * Build one report's dataset. `gates` is REQUIRED — there is no default, so no
 * caller can forget redaction.
 */
export async function buildReportDataset(
  key: SavedReportKey,
  params: ResolvedReportParams,
  gates: ReportFieldGates
): Promise<ReportDataset> {
  switch (key) {
    case "wip":
      return wipDataset(await getWipPortfolio());
    case "opco-pnl":
      return scopeToOpco(opcoPnlDataset(byOpco(await getOpcoPnl(), params.opco)), params.opco);
    case "margin":
      return scopeToOpco(marginDataset(byOpco(await getPnlPortfolio(), params.opco)), params.opco);
    case "profitability":
      return scopeToOpco(profitabilityDataset(byOpco(await getPnlPortfolio(), params.opco)), params.opco);
    case "ar-aging":
      return arAgingDataset(await getArAgingByClient());
    case "ap-aging":
      return apAgingDataset(await getApAgingByVendor());
    case "hst": {
      const pos = await getHstNetPosition({ from: params.from, to: params.to });
      const scoped = params.opco ? { ...pos, byOpco: byOpco(pos.byOpco, params.opco) } : pos;
      return scopeToOpco(hstDataset(scoped), params.opco);
    }
    case "t5018": {
      const year = params.year ?? Number(businessDateISO().slice(0, 4));
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid reporting year.");
      return t5018Dataset(await getT5018Report(year));
    }
    case "pipeline":
      return pipelineDataset(await getSalesPipeline({ from: params.from, to: params.to }));
    case "labour-utilization":
      return labourUtilizationDataset(await getLabourUtilizationReport(resolveWindow(params)));
    case "vendor-spend":
      return vendorSpendDataset(
        await getVendorSpendReport({ from: params.from, to: params.to, limit: params.limit })
      );
    case "inventory-valuation":
      return inventoryValuationDataset(redactInventory(await getInventoryReportData(), gates));
    case "business-snapshot":
      return businessSnapshotDataset(await getBusinessSnapshot());
  }
}

/** The SIGNED-IN user's field gates, for the interactive report actions. */
export async function sessionReportGates(): Promise<ReportFieldGates> {
  const { resolveFieldGates } = await import("@/lib/permissions/field-redaction");
  const g = await resolveFieldGates(); // fail-closed
  return { inventoryCost: g.inventoryCost, quoteMargin: g.quoteMargin, quoteInternal: g.quoteInternal };
}
