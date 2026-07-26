"use server";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";

// REP-3 / REP-4 — the operational + business-snapshot reports, mounted in the
// Reports hub. Same generic dispatcher shape as the financial reports, but each
// report gates a DIFFERENT resource: pipeline → quotes:view, utilization →
// scheduling:view, vendor spend → financials:view (money), inventory valuation
// → inventory:view, business snapshot → financials:edit (margin + position).

import { getSalesPipeline } from "@/lib/api/reports/pipeline";
import { getLabourUtilizationReport } from "@/lib/api/reports/labour-utilization";
import { getVendorSpendReport } from "@/lib/api/reports/vendor-spend";
import { getInventoryReportData } from "@/lib/api/products";
import { getBusinessSnapshot } from "@/lib/api/reports/business-snapshot";
import {
  pipelineDataset,
  labourUtilizationDataset,
  vendorSpendDataset,
  inventoryValuationDataset,
  businessSnapshotDataset,
} from "@/lib/reports/datasets/operational";
import { exportDataset, type ReportExport, type ReportFormat } from "@/lib/reports/export";
import type { ReportDataset } from "@/lib/reports/dataset";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import { businessDateISO } from "@/lib/format";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

export type OperationalReportKey =
  | "pipeline"
  | "labour-utilization"
  | "vendor-spend"
  | "inventory-valuation"
  | "business-snapshot";

export interface OperationalReportParams {
  from?: string;
  to?: string;
  limit?: number;
}

// Per-report gate (resource + action). Module-private — a "use server" file may
// only export async functions.
const REPORT_GATE: Record<OperationalReportKey, { resource: Resource; action: Action }> = {
  pipeline: { resource: "quotes", action: "view" },
  "labour-utilization": { resource: "scheduling", action: "view" },
  "vendor-spend": { resource: "financials", action: "view" },
  "inventory-valuation": { resource: "inventory", action: "view" },
  "business-snapshot": { resource: "financials", action: "edit" },
};

async function requireGate(key: OperationalReportKey): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me) return "You're not signed in.";
  const { resource, action } = REPORT_GATE[key];
  if (!hasPermission(adaptRole(me.role), resource, action)) {
    return "You don't have permission to view this report.";
  }
  return null;
}

/** A full-day window ending today when the caller supplies no range. */
function resolveWindow(params: OperationalReportParams): { from: string; to: string } {
  if (params.from && params.to) {
    return { from: `${params.from}T00:00:00.000Z`, to: `${params.to}T23:59:59.999Z` };
  }
  const today = businessDateISO();
  const from = new Date(`${today}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - 6); // trailing 7 days
  return { from: from.toISOString(), to: `${today}T23:59:59.999Z` };
}

async function buildDataset(
  key: OperationalReportKey,
  params: OperationalReportParams
): Promise<ReportDataset> {
  switch (key) {
    case "pipeline":
      return pipelineDataset(await getSalesPipeline({ from: params.from, to: params.to }));
    case "labour-utilization":
      return labourUtilizationDataset(await getLabourUtilizationReport(resolveWindow(params)));
    case "vendor-spend":
      return vendorSpendDataset(
        await getVendorSpendReport({ from: params.from, to: params.to, limit: params.limit })
      );
    case "inventory-valuation":
      return inventoryValuationDataset(await getInventoryReportData());
    case "business-snapshot":
      return businessSnapshotDataset(await getBusinessSnapshot());
  }
}

export async function getOperationalReportAction(input: {
  reportKey: OperationalReportKey;
  params?: OperationalReportParams;
}): Promise<ActionResult<ReportDataset>> {
  try {
    const denied = await requireGate(input.reportKey);
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await buildDataset(input.reportKey, input.params ?? {}) };
  } catch (e) {
    return fail(e);
  }
}

export async function exportOperationalReportAction(input: {
  reportKey: OperationalReportKey;
  format: ReportFormat;
  params?: OperationalReportParams;
}): Promise<ActionResult<ReportExport>> {
  try {
    const denied = await requireGate(input.reportKey);
    if (denied) return { ok: false, error: denied };
    const dataset = await buildDataset(input.reportKey, input.params ?? {});
    return { ok: true, data: await exportDataset(dataset, input.format) };
  } catch (e) {
    return fail(e);
  }
}
