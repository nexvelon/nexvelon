"use server";

// FIN-1 — Financials server actions. Read-only in this chunk: every action is
// gated on financials:view (Admin, ProjectManager, Accountant, ViewOnly —
// SalesRep/Technician/Subcontractor are excluded by the matrix). Mutations
// stay on the invoices actions (financials:edit); none live here yet.

import {
  getRevenueSummary,
  getMonthlyRevenue,
  listInvoicesReal,
  getProjectFinancialSummaries,
  getTaxCollectedSummary,
  type FinDateRange,
  type FinInvoiceFilters,
  type FinInvoiceListRow,
  type RevenueSummary,
  type MonthlyRevenuePoint,
  type ProjectFinancialSummary,
  type TaxCollectedSummary,
} from "@/lib/api/financials";
import {
  getArAgingSummary,
  getArAgingByClient,
  getClientStatement,
  buildArAgingCsv,
  type ArAgingSummary,
  type ArAgingClientRow,
  type ClientStatement,
} from "@/lib/api/ar-aging";
import {
  listDepositsForProject,
  getProjectDepositBalance,
  getDepositsHeldTotal,
  recordDeposit,
  deleteDeposit,
  applyDepositToInvoice,
  unapplyDeposit,
  type DepositWithRemaining,
  type ProjectDepositBalance,
  type ApplyDepositResult,
} from "@/lib/api/deposits";
import { revalidatePath } from "next/cache";
import { businessDateISO } from "@/lib/format";
import type { DbCashPaymentMethod, DbInvoice, DbProjectDeposit } from "@/lib/types/database";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

// DbRole (11) → app Role (7) for hasPermission; mirrors the projects/invoices
// action helpers.
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

async function requireFinancialsView(): Promise<string | null> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "financials", "view")) {
    return "You don't have permission to view financial data.";
  }
  return null;
}

export async function getRevenueSummaryAction(
  range: FinDateRange = {}
): Promise<ActionResult<RevenueSummary>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getRevenueSummary(range) };
  } catch (e) {
    return fail(e);
  }
}

export async function getMonthlyRevenueAction(
  params: { months?: number } = {}
): Promise<ActionResult<MonthlyRevenuePoint[]>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getMonthlyRevenue(params) };
  } catch (e) {
    return fail(e);
  }
}

export async function listFinancialInvoicesAction(
  filters: FinInvoiceFilters = {}
): Promise<ActionResult<FinInvoiceListRow[]>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await listInvoicesReal(filters) };
  } catch (e) {
    return fail(e);
  }
}

// FIN-2 — the cost/margin legs (spent, margin, po_committed) are redacted to
// null for financials:view-only holders (e.g. PM, ViewOnly), matching the
// project cost-rollup action's gate. Contract / invoiced / billed% stay visible
// at financials:view. `canSeeFinancials` lets the tab lay out accordingly.
export interface ProjectSummariesResult {
  summaries: ProjectFinancialSummary[];
  canSeeFinancials: boolean;
}

export async function getProjectFinancialSummariesAction(): Promise<
  ActionResult<ProjectSummariesResult>
> {
  try {
    const me = await getCurrentProfile();
    if (!me || !hasPermission(adaptRole(me.role), "financials", "view")) {
      return { ok: false, error: "You don't have permission to view financial data." };
    }
    const canSeeFinancials = hasPermission(
      adaptRole(me.role),
      "financials",
      "edit"
    );
    const summaries = await getProjectFinancialSummaries();
    if (!canSeeFinancials) {
      for (const s of summaries) {
        s.spent = null;
        s.margin = null;
        s.po_committed = null;
      }
    }
    return { ok: true, data: { summaries, canSeeFinancials } };
  } catch (e) {
    return fail(e);
  }
}

export async function getTaxCollectedSummaryAction(
  range: FinDateRange = {}
): Promise<ActionResult<TaxCollectedSummary>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getTaxCollectedSummary(range) };
  } catch (e) {
    return fail(e);
  }
}

// ─── AR aging (FIN-3) ────────────────────────────────────────────────────────
// AR balances are revenue-side, so these sit at financials:view like the rest
// of FIN-1's reads — unlike the cost/margin legs, which need financials:edit.

export async function getArAgingSummaryAction(): Promise<
  ActionResult<ArAgingSummary>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getArAgingSummary() };
  } catch (e) {
    return fail(e);
  }
}

export async function getArAgingByClientAction(): Promise<
  ActionResult<ArAgingClientRow[]>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getArAgingByClient() };
  } catch (e) {
    return fail(e);
  }
}

export async function getClientStatementAction(
  clientId: string,
  range: FinDateRange = {}
): Promise<ActionResult<ClientStatement | null>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    if (!clientId) return { ok: false, error: "No client specified." };
    return { ok: true, data: await getClientStatement(clientId, range) };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The accountant CSV. Returned as a string the client turns into a Blob and
 * saves via a synthetic anchor click (the #310/#311 pattern) — no supabase-js
 * in the browser and no server round-trip for the file itself.
 */
export async function exportArAgingCsvAction(): Promise<
  ActionResult<{ csv: string; filename: string }>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    const csv = await buildArAgingCsv();
    return {
      ok: true,
      data: { csv, filename: `nexvelon-ar-aging-${businessDateISO()}.csv` },
    };
  } catch (e) {
    return fail(e);
  }
}

// ─── Deposits & retainers (FIN-4) ────────────────────────────────────────────
// Reads sit at financials:view (deposits are AR-side money). Mutations move
// real money onto invoices, so they require financials:edit — same tier as
// recording a payment in FIN-2.

async function requireFinancialsEdit(): Promise<
  { ok: true; actorId: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "financials", "edit")) {
    return { ok: false, error: "You don't have permission to manage deposits." };
  }
  return { ok: true, actorId: me.id };
}

function revalidateDeposit(projectId?: string | null, invoiceId?: string | null) {
  revalidatePath("/financials");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (invoiceId) {
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
  }
}

export async function listProjectDepositsAction(
  projectId: string
): Promise<ActionResult<{ deposits: DepositWithRemaining[]; balance: ProjectDepositBalance }>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    if (!projectId) return { ok: false, error: "No project specified." };
    const [deposits, balance] = await Promise.all([
      listDepositsForProject(projectId),
      getProjectDepositBalance(projectId),
    ]);
    return { ok: true, data: { deposits, balance } };
  } catch (e) {
    return fail(e);
  }
}

export async function getDepositsHeldTotalAction(): Promise<ActionResult<number>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getDepositsHeldTotal() };
  } catch (e) {
    return fail(e);
  }
}

export async function recordDepositAction(input: {
  projectId: string;
  amount: number;
  method: DbCashPaymentMethod;
  receivedAt: string;
  reference?: string | null;
  notes?: string | null;
}): Promise<ActionResult<DbProjectDeposit>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const deposit = await recordDeposit({ ...input, actorId: gate.actorId });
    revalidateDeposit(input.projectId);
    return { ok: true, data: deposit };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDepositAction(
  depositId: string,
  projectId?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    await deleteDeposit(depositId);
    revalidateDeposit(projectId);
    return { ok: true, data: { id: depositId } };
  } catch (e) {
    return fail(e);
  }
}

export async function applyDepositToInvoiceAction(input: {
  depositId: string;
  invoiceId: string;
  amount: number;
  projectId?: string;
}): Promise<ActionResult<ApplyDepositResult>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const res = await applyDepositToInvoice({
      depositId: input.depositId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      actorId: gate.actorId,
    });
    revalidateDeposit(input.projectId, input.invoiceId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function unapplyDepositAction(
  applicationId: string,
  invoiceId?: string,
  projectId?: string
): Promise<ActionResult<DbInvoice>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const invoice = await unapplyDeposit(applicationId);
    revalidateDeposit(projectId, invoiceId);
    return { ok: true, data: invoice };
  } catch (e) {
    return fail(e);
  }
}
