"use server";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";

// REP-1 — the Reports actions. Proves the export foundation end-to-end with the
// WIP portfolio report through all three formats. A report builds its
// ReportDataset once, then exportDataset renders CSV / xlsx / PDF. Gated
// financials:edit (WIP is cost-side, same tier as the existing WIP CSV).

import { getWipPortfolio, type WipPortfolio } from "@/lib/api/wip";
import { exportDataset, type ReportExport, type ReportFormat } from "@/lib/reports/export";
import { wipDataset } from "@/lib/reports/build";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
}

async function requireFinancialsEdit(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "financials", "edit")) {
    return { ok: false, error: "You don't have permission to view this report." };
  }
  return { ok: true };
}

/** On-screen WIP portfolio (the report view renders this table). */
export async function getWipReportAction(): Promise<ActionResult<WipPortfolio>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    return { ok: true, data: await getWipPortfolio() };
  } catch (e) {
    return fail(e);
  }
}

/** Export the WIP report in the requested format (csv | xlsx | pdf). */
export async function exportWipReportAction(input: {
  format: ReportFormat;
}): Promise<ActionResult<ReportExport>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const portfolio = await getWipPortfolio();
    const dataset = wipDataset(portfolio);
    return { ok: true, data: await exportDataset(dataset, input.format) };
  } catch (e) {
    return fail(e);
  }
}
