"use server";

// REP-2 — the financial reports, mounted in the Reports hub. One generic
// dispatcher builds any report's ReportDataset from its source (reusing the
// REP-1 foundation) and either returns it for on-screen rendering
// (getFinancialReportAction) or exports it as CSV / xlsx / PDF
// (exportFinancialReportAction). Each report carries its own tier — AR/AP aging
// at financials:view, everything cost/margin/tax at financials:edit — so gating
// is correct whichever entry point is used.

import { getOpcoPnl, getPnlPortfolio } from "@/lib/api/project-pnl";
import { getArAgingByClient } from "@/lib/api/ar-aging";
import { getApAgingByVendor } from "@/lib/api/ap-aging";
import { getHstNetPosition } from "@/lib/api/financials";
import { getT5018Report } from "@/lib/api/t5018";
import {
  opcoPnlDataset,
  marginDataset,
  profitabilityDataset,
  arAgingDataset,
  apAgingDataset,
  hstDataset,
  t5018Dataset,
} from "@/lib/reports/datasets/financial";
import { exportDataset, type ReportExport, type ReportFormat } from "@/lib/reports/export";
import type { ReportDataset } from "@/lib/reports/dataset";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { businessDateISO } from "@/lib/format";
import type { Role } from "@/lib/types";
import type { DbRole } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

export type FinancialReportKey =
  | "opco-pnl"
  | "margin"
  | "profitability"
  | "ar-aging"
  | "ap-aging"
  | "hst"
  | "t5018";

export interface FinancialReportParams {
  /** HST period (inclusive). */
  from?: string;
  to?: string;
  /** T5018 reporting year. */
  year?: number;
}

// The tier each report requires. Kept module-private — a "use server" file may
// only EXPORT async functions, so this can't be an export.
type FinTier = "view" | "edit";
const REPORT_TIER: Record<FinancialReportKey, FinTier> = {
  "opco-pnl": "edit",
  margin: "edit",
  profitability: "edit",
  "ar-aging": "view",
  "ap-aging": "view",
  hst: "edit",
  t5018: "edit",
};

async function requireTier(tier: FinTier): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me) return "You're not signed in.";
  if (!hasPermission(adaptRole(me.role), "financials", tier)) {
    return "You don't have permission to view this report.";
  }
  return null;
}

/** Build a report's dataset from its live source. Pure dispatch — no gating. */
async function buildDataset(
  key: FinancialReportKey,
  params: FinancialReportParams
): Promise<ReportDataset> {
  switch (key) {
    case "opco-pnl":
      return opcoPnlDataset(await getOpcoPnl());
    case "margin":
      return marginDataset(await getPnlPortfolio());
    case "profitability":
      return profitabilityDataset(await getPnlPortfolio());
    case "ar-aging":
      return arAgingDataset(await getArAgingByClient());
    case "ap-aging":
      return apAgingDataset(await getApAgingByVendor());
    case "hst":
      return hstDataset(await getHstNetPosition({ from: params.from, to: params.to }));
    case "t5018": {
      const year = params.year ?? Number(businessDateISO().slice(0, 4));
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new Error("Invalid reporting year.");
      }
      return t5018Dataset(await getT5018Report(year));
    }
  }
}

/** On-screen dataset — the report view renders columns/rows/totals from this. */
export async function getFinancialReportAction(input: {
  reportKey: FinancialReportKey;
  params?: FinancialReportParams;
}): Promise<ActionResult<ReportDataset>> {
  try {
    const denied = await requireTier(REPORT_TIER[input.reportKey]);
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await buildDataset(input.reportKey, input.params ?? {}) };
  } catch (e) {
    return fail(e);
  }
}

/** Export a report in the requested format (csv | xlsx | pdf), same tier. */
export async function exportFinancialReportAction(input: {
  reportKey: FinancialReportKey;
  format: ReportFormat;
  params?: FinancialReportParams;
}): Promise<ActionResult<ReportExport>> {
  try {
    const denied = await requireTier(REPORT_TIER[input.reportKey]);
    if (denied) return { ok: false, error: denied };
    const dataset = await buildDataset(input.reportKey, input.params ?? {});
    return { ok: true, data: await exportDataset(dataset, input.format) };
  } catch (e) {
    return fail(e);
  }
}
