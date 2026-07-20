"use server";

// FIN-1 — Financials server actions. Read-only in this chunk: every action is
// gated on financials:view (Admin, ProjectManager, Accountant, ViewOnly —
// SalesRep/Technician/Subcontractor are excluded by the matrix). Mutations
// stay on the invoices actions (financials:edit); none live here yet.

import {
  getRevenueSummary,
  getMonthlyRevenue,
  listInvoicesReal,
  getReceivablesByClient,
  getProjectFinancialSummaries,
  getTaxCollectedSummary,
  type FinDateRange,
  type FinInvoiceFilters,
  type RevenueSummary,
  type MonthlyRevenuePoint,
  type ReceivableClientRow,
  type ProjectFinancialSummary,
  type TaxCollectedSummary,
} from "@/lib/api/financials";
import type { InvoiceListRow } from "@/lib/api/invoices";
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
): Promise<ActionResult<InvoiceListRow[]>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await listInvoicesReal(filters) };
  } catch (e) {
    return fail(e);
  }
}

export async function getReceivablesByClientAction(): Promise<
  ActionResult<ReceivableClientRow[]>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getReceivablesByClient() };
  } catch (e) {
    return fail(e);
  }
}

export async function getProjectFinancialSummariesAction(): Promise<
  ActionResult<ProjectFinancialSummary[]>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getProjectFinancialSummaries() };
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
