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
  getItcSummary,
  getHstNetPosition,
  buildHstReturnCsv,
  type ItcSummary,
  type HstNetPosition,
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
import {
  listBills,
  getBillById,
  listBillsForPurchaseOrder,
  getApSummary,
  getBillFormOptions,
  createBill,
  updateBill,
  voidBill,
  recordBillPayment,
  deleteBillPayment,
  type BillListRow,
  type BillDetail,
  type BillFilters,
  type ApSummary,
  type BillFormOptions,
  type CreateBillInput,
  type UpdateBillPatch,
  type BillPaymentResult,
} from "@/lib/api/vendor-bills";
import {
  getApAgingSummary,
  getApAgingByVendor,
  getVendorStatement,
  buildApAgingCsv,
  type ApAgingSummary,
  type ApAgingVendorRow,
  type VendorStatement,
} from "@/lib/api/ap-aging";
import { revalidatePath } from "next/cache";
import { businessDateISO } from "@/lib/format";
import type {
  DbCashPaymentMethod,
  DbInvoice,
  DbProjectDeposit,
  DbVendorBill,
} from "@/lib/types/database";
import {
  getProjectPnl,
  getOpcoPnl,
  getPnlPortfolio,
  buildProjectPnlCsv,
  buildOpcoPnlCsv,
  type ProjectPnl,
  type OpcoPnl,
  type PnlPortfolioRow,
} from "@/lib/api/project-pnl";
import {
  getProjectHoldbackStatus,
  createHoldbackRelease,
  releaseHoldback,
  voidHoldbackRelease,
  getHoldbackWorklist,
  type ProjectHoldbackStatus,
  type ReleaseHoldbackResult,
  type HoldbackWorklistRow,
} from "@/lib/api/holdback";
import type { DbHoldbackRelease } from "@/lib/types/database";
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

// ─── Vendor bills / AP (FIN-5) ───────────────────────────────────────────────
// Reads at financials:view (AP balances are money-owed reporting); every
// mutation moves real money, so financials:edit — the same split FIN-2/FIN-4
// use for invoice payments and deposits.

function revalidateBill(projectId?: string | null, purchaseOrderId?: string | null) {
  revalidatePath("/financials");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (purchaseOrderId) revalidatePath("/purchase-orders");
}

export async function listBillsAction(
  filters: BillFilters = {}
): Promise<ActionResult<BillListRow[]>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await listBills(filters) };
  } catch (e) {
    return fail(e);
  }
}

export async function getBillByIdAction(
  id: string
): Promise<ActionResult<BillDetail | null>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    if (!id) return { ok: false, error: "No bill specified." };
    return { ok: true, data: await getBillById(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function listBillsForPurchaseOrderAction(
  purchaseOrderId: string
): Promise<ActionResult<BillListRow[]>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    if (!purchaseOrderId) return { ok: true, data: [] };
    return { ok: true, data: await listBillsForPurchaseOrder(purchaseOrderId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getApSummaryAction(): Promise<ActionResult<ApSummary>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getApSummary(businessDateISO()) };
  } catch (e) {
    return fail(e);
  }
}

export async function getBillFormOptionsAction(): Promise<
  ActionResult<BillFormOptions>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getBillFormOptions() };
  } catch (e) {
    return fail(e);
  }
}

export async function createBillAction(
  input: Omit<CreateBillInput, "actorId">
): Promise<ActionResult<DbVendorBill>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const bill = await createBill({ ...input, actorId: gate.actorId });
    revalidateBill(bill.project_id, bill.purchase_order_id);
    return { ok: true, data: bill };
  } catch (e) {
    return fail(e);
  }
}

export async function updateBillAction(
  id: string,
  patch: UpdateBillPatch
): Promise<ActionResult<DbVendorBill>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const bill = await updateBill(id, patch, gate.actorId);
    revalidateBill(bill.project_id, bill.purchase_order_id);
    return { ok: true, data: bill };
  } catch (e) {
    return fail(e);
  }
}

export async function voidBillAction(
  id: string
): Promise<ActionResult<DbVendorBill>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const bill = await voidBill(id);
    revalidateBill(bill.project_id, bill.purchase_order_id);
    return { ok: true, data: bill };
  } catch (e) {
    return fail(e);
  }
}

export async function recordBillPaymentAction(input: {
  billId: string;
  amount: number;
  method: DbCashPaymentMethod;
  paidAt: string;
  reference?: string | null;
  notes?: string | null;
}): Promise<ActionResult<BillPaymentResult>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const res = await recordBillPayment({ ...input, actorId: gate.actorId });
    revalidateBill(res.bill.project_id, res.bill.purchase_order_id);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBillPaymentAction(
  paymentId: string
): Promise<ActionResult<BillPaymentResult>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const res = await deleteBillPayment(paymentId);
    revalidateBill(res.bill.project_id, res.bill.purchase_order_id);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

// ─── AP aging (FIN-6) ────────────────────────────────────────────────────────
// GATING NOTE — these sit at financials:view, NOT financials:edit.
//
// The FIN-6 spec proposed edit-tier on the grounds that AP is cost-side. But
// FIN-5 already shipped every AP read at view: listBillsAction returns every
// bill with its vendor, total and balance, and getApSummaryAction feeds the
// Overview AP KPIs — both view-gated, with a test asserting ProjectManager
// access. Gating the aging SUMMARY tighter than the rows it summarises would
// protect nothing: the same caller can already read every underlying bill
// one-by-one in the Bills tab. So AP aging matches its own source data (and
// mirrors FIN-3's AR aging). The genuinely sensitive AP number — billed_cost as
// a per-job cost leg feeding margin — stays redacted at financials:edit in the
// cost rollup, which is where the FIN-2 rule actually applies.

export async function getApAgingSummaryAction(): Promise<
  ActionResult<ApAgingSummary>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getApAgingSummary() };
  } catch (e) {
    return fail(e);
  }
}

export async function getApAgingByVendorAction(): Promise<
  ActionResult<ApAgingVendorRow[]>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getApAgingByVendor() };
  } catch (e) {
    return fail(e);
  }
}

export async function getVendorStatementAction(
  vendorId: string,
  range: BillFilters = {}
): Promise<ActionResult<VendorStatement | null>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    if (!vendorId) return { ok: false, error: "No vendor specified." };
    return { ok: true, data: await getVendorStatement(vendorId, range) };
  } catch (e) {
    return fail(e);
  }
}

/** AP twin of exportArAgingCsvAction — same signed-anchor download pattern. */
export async function exportApAgingCsvAction(): Promise<
  ActionResult<{ csv: string; filename: string }>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    const csv = await buildApAgingCsv();
    return {
      ok: true,
      data: { csv, filename: `nexvelon-ap-aging-${businessDateISO()}.csv` },
    };
  } catch (e) {
    return fail(e);
  }
}

// ─── HST net position (FIN-7) ────────────────────────────────────────────────
// GATING: financials:edit, unlike FIN-1's collected-only getTaxCollectedSummary
// which stays at view. The net position combines revenue with cost-side ITCs
// into the company's CRA liability — the FIN-2 cost-leg rule applies.
//
// HONEST LIMIT, so the gate isn't over-trusted: the INPUTS remain readable at
// view tier. FIN-5's listBillsAction returns every bill row (including
// tax_amount and now claimable_tax_amount), and FIN-1's collected summary is at
// view, so a determined view-tier caller could still add the two sides up. This
// gate controls the surface, not the underlying information. Making it a hard
// barrier means restricting the tax fields on the bill list too — flagged
// rather than half-done.

export async function getItcSummaryAction(
  range: FinDateRange = {}
): Promise<ActionResult<ItcSummary>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    return { ok: true, data: await getItcSummary(range) };
  } catch (e) {
    return fail(e);
  }
}

export async function getHstNetPositionAction(
  range: FinDateRange = {}
): Promise<ActionResult<HstNetPosition>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    return { ok: true, data: await getHstNetPosition(range) };
  } catch (e) {
    return fail(e);
  }
}

/** The per-opco lines a bookkeeper transcribes onto each HST return. */
export async function exportHstReturnCsvAction(
  range: FinDateRange = {}
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const csv = await buildHstReturnCsv(range);
    const period = range.from && range.to ? `${range.from}_${range.to}` : businessDateISO();
    return { ok: true, data: { csv, filename: `nexvelon-hst-return-${period}.csv` } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Project & opco P&L (FIN-8) ──────────────────────────────────────────────
// The per-project statement is reachable at financials:view, but the cost /
// gross-profit / margin legs are redacted unless the caller has financials:edit
// — the same rule the project cost rollup uses (revenue + AR + billed% stay
// visible; cost-side numbers dash). The opco P&L and the portfolio ARE cost/
// margin aggregates, so they require financials:edit outright.

export interface ProjectPnlResult {
  pnl: ProjectPnl;
  canSeeCost: boolean;
}

/** Null the cost + margin legs for a view-tier caller (revenue/AR/memo kept). */
function redactPnl(pnl: ProjectPnl): ProjectPnl {
  return {
    ...pnl,
    cost: { materials_billed: null, labour: null, canonical_direct: null },
    gross_profit: null,
    gross_margin_pct: null,
    memo: {
      ...pnl.memo,
      variance_vs_quoted: null,
      po_committed_open: null,
      inventory_drawn_memo: null,
      ap_balance: null,
    },
  };
}

export async function getProjectPnlAction(
  projectId: string
): Promise<ActionResult<ProjectPnlResult | null>> {
  try {
    const me = await getCurrentProfile();
    if (!me || !hasPermission(adaptRole(me.role), "financials", "view")) {
      return { ok: false, error: "You don't have permission to view financial data." };
    }
    if (!projectId) return { ok: false, error: "No project specified." };
    const pnl = await getProjectPnl(projectId);
    if (!pnl) return { ok: true, data: null };
    const canSeeCost = hasPermission(adaptRole(me.role), "financials", "edit");
    return {
      ok: true,
      data: { pnl: canSeeCost ? pnl : redactPnl(pnl), canSeeCost },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getOpcoPnlAction(
  opts: { opco?: string } = {}
): Promise<ActionResult<OpcoPnl[]>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    return { ok: true, data: await getOpcoPnl(opts) };
  } catch (e) {
    return fail(e);
  }
}

export async function getPnlPortfolioAction(): Promise<
  ActionResult<PnlPortfolioRow[]>
> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    return { ok: true, data: await getPnlPortfolio() };
  } catch (e) {
    return fail(e);
  }
}

export async function exportProjectPnlCsvAction(
  projectId: string
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const pnl = await getProjectPnl(projectId);
    if (!pnl) return { ok: false, error: "Project not found." };
    const num = pnl.project.number ?? projectId;
    return {
      ok: true,
      data: { csv: buildProjectPnlCsv(pnl), filename: `nexvelon-pnl-${num}.csv` },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function exportOpcoPnlCsvAction(
  opts: { opco?: string } = {}
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const rows = await getOpcoPnl(opts);
    return {
      ok: true,
      data: {
        csv: buildOpcoPnlCsv(rows),
        filename: `nexvelon-opco-pnl-${businessDateISO()}.csv`,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// ─── Holdback release (FIN-9) ────────────────────────────────────────────────
// Status is revenue-side info (retained is money owed to us), so the READ sits
// at financials:view. Creating the release record and generating its invoice
// are billable mutations → financials:edit.

function revalidateHoldback(projectId?: string | null) {
  revalidatePath("/financials");
  revalidatePath("/invoices");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

export async function getProjectHoldbackStatusAction(
  projectId: string
): Promise<ActionResult<ProjectHoldbackStatus>> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    if (!projectId) return { ok: false, error: "No project specified." };
    return { ok: true, data: await getProjectHoldbackStatus(projectId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getHoldbackWorklistAction(): Promise<
  ActionResult<HoldbackWorklistRow[]>
> {
  try {
    const denied = await requireFinancialsView();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await getHoldbackWorklist() };
  } catch (e) {
    return fail(e);
  }
}

export async function createHoldbackReleaseAction(
  projectId: string
): Promise<ActionResult<DbHoldbackRelease>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const rel = await createHoldbackRelease({ projectId, actorId: gate.actorId });
    revalidateHoldback(projectId);
    return { ok: true, data: rel };
  } catch (e) {
    return fail(e);
  }
}

export async function releaseHoldbackAction(
  releaseId: string,
  projectId?: string
): Promise<ActionResult<ReleaseHoldbackResult>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const res = await releaseHoldback({ releaseId, actorId: gate.actorId });
    revalidateHoldback(projectId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function voidHoldbackReleaseAction(
  releaseId: string,
  projectId?: string
): Promise<ActionResult<DbHoldbackRelease>> {
  try {
    const gate = await requireFinancialsEdit();
    if (!gate.ok) return gate;
    const rel = await voidHoldbackRelease({ releaseId, actorId: gate.actorId });
    revalidateHoldback(projectId);
    return { ok: true, data: rel };
  } catch (e) {
    return fail(e);
  }
}
