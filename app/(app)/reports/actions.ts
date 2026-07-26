"use server";

// REP-1 — the Reports actions. Proves the export foundation end-to-end with the
// WIP portfolio report through all three formats. A report builds its
// ReportDataset once, then exportDataset renders CSV / xlsx / PDF. Gated
// financials:edit (WIP is cost-side, same tier as the existing WIP CSV).

import { getWipPortfolio, type WipPortfolio } from "@/lib/api/wip";
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

async function requireFinancialsEdit(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "financials", "edit")) {
    return { ok: false, error: "You don't have permission to view this report." };
  }
  return { ok: true };
}

const POSITION_LABEL: Record<string, string> = {
  overbilled: "Overbilled",
  underbilled: "Underbilled",
  neutral: "On track",
};

// The WIP portfolio as a ReportDataset — one place, three formats. Internal (a
// "use server" module may only export async functions).
function wipDataset(portfolio: WipPortfolio): ReportDataset {
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
