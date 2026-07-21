import "server-only";

// FIN-1 — the real Financials data layer. Read-only query helpers over the
// EXISTING tables (invoices + projects + the PROJ2-6b cost rollup); no new
// schema. Every number here is a real transaction figure — no fabricated
// ratios, no estimated legs (the honest-data principle: what can't be derived
// from real data isn't returned at all).
//
// Range semantics: { from, to } are ISO dates compared against
// invoices.issue_date. Helpers that accept a range treat BOTH bounds as
// optional — omit them for a point-in-time (all-history) read. Draft invoices
// have no issue_date and never carry revenue, so revenue reads filter to
// issued statuses ('sent' | 'paid') per the same rule the cost rollup uses.
//
// Permission note: these helpers do no gating themselves — the actions layer
// (app/(app)/financials/actions.ts) gates every call on financials:view.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { isOpenStatus, isOverdue } from "@/lib/invoice-status";
import type { DbInvoice } from "@/lib/types/database";
import type { InvoiceListRow } from "@/lib/api/invoices";

async function db() {
  return createSupabaseServerClient();
}

// FIN-2 — "issued" revenue = anything past draft that isn't void: sent,
// partially_paid, and paid. "Open" (still owed) = sent + partially_paid. These
// replace the old ['sent','paid'] pairs now that partially_paid exists, so
// partly-paid invoices don't vanish from revenue / tax / receivables.
// Exported for FIN-3's aging engine, which must scope to exactly the same
// "open" set rather than re-deriving one.
export const ISSUED_STATUSES = ["sent", "partially_paid", "paid"] as const;
export const OPEN_STATUSES = ["sent", "partially_paid"] as const;

export interface FinDateRange {
  from?: string | null;
  to?: string | null;
}

// FIN-2 — Σ recorded payments per invoice, for the given invoice ids. The
// balance of an open invoice is amount_due − this sum (no stored amount_paid).
// Exported so FIN-3's aging engine computes balances the same single way.
export async function sumPaymentsByInvoice(
  supabase: Awaited<ReturnType<typeof db>>,
  invoiceIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (invoiceIds.length === 0) return out;
  const { data, error } = await supabase
    .from("invoice_payments")
    .select("invoice_id, amount")
    .in("invoice_id", invoiceIds);
  if (error) throw new Error(`sumPaymentsByInvoice: ${error.message}`);
  for (const p of (data ?? []) as { invoice_id: string; amount: number | null }[]) {
    out.set(
      p.invoice_id,
      round2((out.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0))
    );
  }
  return out;
}

// ─── Cash collected (FIN-4) ──────────────────────────────────────────────────

export interface CashCollected {
  /** Cash settlements on invoices — excludes non-cash deposit applications. */
  invoicePayments: number;
  /** Deposits received in the range (cash in the door, pre-invoice). */
  deposits: number;
  total: number;
}

/**
 * FIN-4 — real cash received in a range, on a CASH-DATE basis (payment
 * paid_at / deposit received_at), not the invoice's issue date.
 *
 * The double-count trap this avoids: a deposit is cash when it arrives, and
 * applying it later writes a `deposit_applied` settlement onto an invoice.
 * Counting both would book the same dollar twice — so deposit applications are
 * excluded here and the deposit receipt is counted instead.
 */
export async function getCashCollected(
  range: FinDateRange = {}
): Promise<CashCollected> {
  const supabase = await db();

  let pq = supabase
    .from("invoice_payments")
    .select("amount, method, paid_at")
    .neq("method", "deposit_applied");
  if (range.from) pq = pq.gte("paid_at", range.from);
  if (range.to) pq = pq.lte("paid_at", range.to);

  let dq = supabase
    .from("project_deposits")
    .select("amount, received_at");
  if (range.from) dq = dq.gte("received_at", range.from);
  if (range.to) dq = dq.lte("received_at", range.to);

  const [{ data: pays, error: pErr }, { data: deps, error: dErr }] =
    await Promise.all([pq, dq]);
  if (pErr) throw new Error(`getCashCollected/payments: ${pErr.message}`);
  if (dErr) throw new Error(`getCashCollected/deposits: ${dErr.message}`);

  let invoicePayments = 0;
  for (const p of (pays ?? []) as { amount: number | null }[]) {
    invoicePayments = round2(invoicePayments + Number(p.amount ?? 0));
  }
  let deposits = 0;
  for (const d of (deps ?? []) as { amount: number | null }[]) {
    deposits = round2(deposits + Number(d.amount ?? 0));
  }
  return {
    invoicePayments,
    deposits,
    total: round2(invoicePayments + deposits),
  };
}

// ─── Revenue summary ─────────────────────────────────────────────────────────

export interface RevenueSummary {
  /** Σ invoices.total over issued statuses, issue_date within range. */
  total: number;
  byOpco: { opco: string; total: number; count: number }[];
  /**
   * FIN-4 — real cash received in the range (invoice payments excluding
   * deposit applications, plus deposits received). Ranged by cash date, not
   * issue date. Replaces the pre-FIN-4 "Σ total of invoices whose status is
   * paid", which both mis-dated the cash and would have double-counted every
   * applied deposit.
   */
  cashCollected: number;
  /** The split behind `cashCollected`, so the UI can explain the number. */
  cashBreakdown: CashCollected;
  /** Σ (amount_due − payments) over open invoices. */
  outstandingTotal: number;
  /** Σ invoices.holdback_amount over issued statuses. */
  holdbackRetained: number;
  invoiceCount: number;
}

export async function getRevenueSummary(
  range: FinDateRange = {}
): Promise<RevenueSummary> {
  const supabase = await db();
  let q = supabase
    .from("invoices")
    .select("id, opco, status, total, amount_due, holdback_amount, issue_date")
    .in("status", ISSUED_STATUSES);
  if (range.from) q = q.gte("issue_date", range.from);
  if (range.to) q = q.lte("issue_date", range.to);
  const { data, error } = await q;
  if (error) throw new Error(`getRevenueSummary: ${error.message}`);

  const rows = (data ?? []) as Pick<
    DbInvoice,
    "id" | "opco" | "status" | "total" | "amount_due" | "holdback_amount"
  >[];

  // Outstanding is amount_due net of payments, over open invoices only.
  const openIds = rows.filter((r) => isOpenStatus(r.status)).map((r) => r.id);
  const paidByInvoice = await sumPaymentsByInvoice(supabase, openIds);
  // FIN-4 — cash is its own question, on its own date basis.
  const cashBreakdown = await getCashCollected(range);

  let total = 0;
  let outstandingTotal = 0;
  let holdbackRetained = 0;
  const opcoAgg = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const amt = Number(r.total ?? 0);
    total = round2(total + amt);
    if (isOpenStatus(r.status)) {
      const balance = round2(
        Number(r.amount_due ?? 0) - (paidByInvoice.get(r.id) ?? 0)
      );
      outstandingTotal = round2(outstandingTotal + Math.max(0, balance));
    }
    holdbackRetained = round2(holdbackRetained + Number(r.holdback_amount ?? 0));
    const agg = opcoAgg.get(r.opco) ?? { total: 0, count: 0 };
    agg.total = round2(agg.total + amt);
    agg.count += 1;
    opcoAgg.set(r.opco, agg);
  }

  return {
    total,
    byOpco: [...opcoAgg.entries()]
      .map(([opco, v]) => ({ opco, ...v }))
      .sort((a, b) => b.total - a.total),
    cashCollected: cashBreakdown.total,
    cashBreakdown,
    outstandingTotal,
    holdbackRetained,
    invoiceCount: rows.length,
  };
}

// ─── Monthly revenue (trailing N months) ─────────────────────────────────────

export interface MonthlyRevenuePoint {
  /** "YYYY-MM". */
  month: string;
  /** Σ total of invoices ISSUED that month (issue_date basis). */
  invoiced: number;
  /**
   * FIN-4 — cash RECEIVED that month (payment paid_at / deposit received_at),
   * excluding non-cash deposit applications. Moved onto the same cash basis as
   * the Collected KPI; leaving it on the old "paid invoices by issue month"
   * basis would have printed two different Collected numbers on one screen.
   */
  collected: number;
}

export async function getMonthlyRevenue(
  { months = 12 }: { months?: number } = {}
): Promise<MonthlyRevenuePoint[]> {
  const now = new Date();
  // First day of the oldest month in the window, as a plain ISO date string.
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

  const supabase = await db();
  const [
    { data, error },
    { data: pays, error: pErr },
    { data: deps, error: dErr },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("issue_date, total, status")
      .in("status", ISSUED_STATUSES)
      .gte("issue_date", startIso),
    supabase
      .from("invoice_payments")
      .select("amount, method, paid_at")
      .neq("method", "deposit_applied")
      .gte("paid_at", startIso),
    supabase
      .from("project_deposits")
      .select("amount, received_at")
      .gte("received_at", startIso),
  ]);
  if (error) throw new Error(`getMonthlyRevenue: ${error.message}`);
  if (pErr) throw new Error(`getMonthlyRevenue/payments: ${pErr.message}`);
  if (dErr) throw new Error(`getMonthlyRevenue/deposits: ${dErr.message}`);

  const byMonth = new Map<string, { invoiced: number; collected: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    byMonth.set(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      { invoiced: 0, collected: 0 }
    );
  }
  for (const r of (data ?? []) as Pick<DbInvoice, "issue_date" | "total" | "status">[]) {
    if (!r.issue_date) continue;
    const bucket = byMonth.get(r.issue_date.slice(0, 7));
    if (!bucket) continue;
    bucket.invoiced = round2(bucket.invoiced + Number(r.total ?? 0));
  }
  // Cash, on its own date basis.
  for (const p of (pays ?? []) as { amount: number | null; paid_at: string | null }[]) {
    if (!p.paid_at) continue;
    const bucket = byMonth.get(p.paid_at.slice(0, 7));
    if (!bucket) continue;
    bucket.collected = round2(bucket.collected + Number(p.amount ?? 0));
  }
  for (const d of (deps ?? []) as {
    amount: number | null;
    received_at: string | null;
  }[]) {
    if (!d.received_at) continue;
    const bucket = byMonth.get(d.received_at.slice(0, 7));
    if (!bucket) continue;
    bucket.collected = round2(bucket.collected + Number(d.amount ?? 0));
  }

  return [...byMonth.entries()].map(([month, v]) => ({ month, ...v }));
}

// ─── Invoice list (real, filterable) ─────────────────────────────────────────

export interface FinInvoiceFilters extends FinDateRange {
  status?: string;
  opco?: string;
  clientId?: string;
}

// FIN-2 — a list row enriched with the derived balance (amount_due − payments)
// and the derived overdue flag, so the UI never needs to fetch payments itself.
export interface FinInvoiceListRow extends InvoiceListRow {
  balance: number;
  is_overdue: boolean;
}

/**
 * The /financials Invoices tab list. Same join shape as lib/api/invoices'
 * listInvoices, plus a derived balance + is_overdue per row (FIN-2). Drafts
 * have no issue_date, so the date-range filter is applied in JS to ISSUED rows
 * only — drafts stay visible under every range (work-in-progress, not history).
 */
export async function listInvoicesReal(
  filters: FinInvoiceFilters = {}
): Promise<FinInvoiceListRow[]> {
  const supabase = await db();
  let q = supabase
    .from("invoices")
    .select("*, client:clients(name,deleted_at), project:projects(project_number)");
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.opco) q = q.eq("opco", filters.opco);
  if (filters.clientId) q = q.eq("client_id", filters.clientId);
  const { data, error } = await q
    .order("issue_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listInvoicesReal: ${error.message}`);

  type JoinRow = DbInvoice & {
    client: { name: string; deleted_at: string | null } | null;
    project: { project_number: string } | null;
  };
  const base = ((data ?? []) as JoinRow[])
    .map((r) => {
      const { client, project, ...inv } = r;
      return {
        ...(inv as DbInvoice),
        client_name: client?.name ?? null,
        client_deleted: !!client?.deleted_at,
        project_number: project?.project_number ?? null,
      };
    })
    .filter((r) => {
      if (!r.issue_date) return true; // draft — always visible
      if (filters.from && r.issue_date < filters.from) return false;
      if (filters.to && r.issue_date > filters.to) return false;
      return true;
    });

  const paidByInvoice = await sumPaymentsByInvoice(
    supabase,
    base.map((r) => r.id)
  );

  return base.map((r) => ({
    ...r,
    balance: round2(Number(r.amount_due ?? 0) - (paidByInvoice.get(r.id) ?? 0)),
    is_overdue: isOverdue(r),
  }));
}

// ─── Per-project financial summaries (the 6b rollup surface) ────────────────

export interface ProjectFinancialSummary {
  project_id: string;
  project_number: string | null;
  title: string | null;
  status: string;
  contract: number;
  invoiced: number;
  billed_pct: number | null;
  spent: number | null;
  margin: number | null;
  po_committed: number | null;
}

/**
 * One row per open project (closed/cancelled excluded), reusing the PROJ2-6b
 * cost rollup — contract / invoiced / billed% / spent / margin / PO committed.
 */
export async function getProjectFinancialSummaries(): Promise<
  ProjectFinancialSummary[]
> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_number, title, status")
    .in("status", ["active", "on_hold", "substantially_complete"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getProjectFinancialSummaries: ${error.message}`);

  const projects = (data ?? []) as {
    id: string;
    project_number: string | null;
    title: string | null;
    status: string;
  }[];

  const out: ProjectFinancialSummary[] = [];
  for (const p of projects) {
    const rollup = await getProjectCostRollup(p.id);
    const r = rollup.perProject;
    out.push({
      project_id: p.id,
      project_number: p.project_number,
      title: p.title,
      status: p.status,
      contract: r.contract,
      invoiced: r.invoiced,
      billed_pct: r.billed_pct,
      spent: r.spent,
      margin: r.margin,
      po_committed: r.po_committed,
    });
  }
  return out;
}

// ─── HST collected ───────────────────────────────────────────────────────────

export interface TaxCollectedSummary {
  byOpco: { opco: string; taxCollected: number }[];
  total: number;
}

/**
 * Σ invoices.tax_amount (issued: sent + partially_paid + paid) by opco for the
 * range. Collected side only — input tax credits (ITCs) need vendor bills
 * (FIN-7); the mock's "ITC estimate" ratio is deliberately gone.
 */
export async function getTaxCollectedSummary(
  range: FinDateRange = {}
): Promise<TaxCollectedSummary> {
  const supabase = await db();
  let q = supabase
    .from("invoices")
    .select("opco, tax_amount, issue_date")
    .in("status", ISSUED_STATUSES);
  if (range.from) q = q.gte("issue_date", range.from);
  if (range.to) q = q.lte("issue_date", range.to);
  const { data, error } = await q;
  if (error) throw new Error(`getTaxCollectedSummary: ${error.message}`);

  let total = 0;
  const byOpco = new Map<string, number>();
  for (const r of (data ?? []) as { opco: string; tax_amount: number | null }[]) {
    const amt = Number(r.tax_amount ?? 0);
    total = round2(total + amt);
    byOpco.set(r.opco, round2((byOpco.get(r.opco) ?? 0) + amt));
  }
  return {
    byOpco: [...byOpco.entries()]
      .map(([opco, taxCollected]) => ({ opco, taxCollected }))
      .sort((a, b) => b.taxCollected - a.taxCollected),
    total,
  };
}
