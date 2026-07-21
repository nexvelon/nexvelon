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

// ─── Revenue summary ─────────────────────────────────────────────────────────

export interface RevenueSummary {
  /** Σ invoices.total, status IN ('sent','paid'), issue_date within range. */
  total: number;
  byOpco: { opco: string; total: number; count: number }[];
  /** Σ invoices.total, status = 'paid' only. */
  paidTotal: number;
  /** Σ invoices.amount_due, status = 'sent' (issued, not yet paid). */
  outstandingTotal: number;
  /** Σ invoices.holdback_amount, status IN ('sent','paid'). */
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

  let total = 0;
  let paidTotal = 0;
  let outstandingTotal = 0;
  let holdbackRetained = 0;
  const opcoAgg = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const amt = Number(r.total ?? 0);
    total = round2(total + amt);
    if (r.status === "paid") paidTotal = round2(paidTotal + amt);
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
    paidTotal,
    outstandingTotal,
    holdbackRetained,
    invoiceCount: rows.length,
  };
}

// ─── Monthly revenue (trailing N months) ─────────────────────────────────────

export interface MonthlyRevenuePoint {
  /** "YYYY-MM" — the issue_date month. */
  month: string;
  /** Σ total of invoices issued that month (sent + paid). */
  invoiced: number;
  /** The paid subset of the same. */
  paid: number;
}

export async function getMonthlyRevenue(
  { months = 12 }: { months?: number } = {}
): Promise<MonthlyRevenuePoint[]> {
  const now = new Date();
  // First day of the oldest month in the window, as a plain ISO date string.
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .select("issue_date, total, status")
    .in("status", ISSUED_STATUSES)
    .gte("issue_date", startIso);
  if (error) throw new Error(`getMonthlyRevenue: ${error.message}`);

  const byMonth = new Map<string, { invoiced: number; paid: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    byMonth.set(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      { invoiced: 0, paid: 0 }
    );
  }
  for (const r of (data ?? []) as Pick<DbInvoice, "issue_date" | "total" | "status">[]) {
    if (!r.issue_date) continue;
    const key = r.issue_date.slice(0, 7);
    const bucket = byMonth.get(key);
    if (!bucket) continue;
    const amt = Number(r.total ?? 0);
    bucket.invoiced = round2(bucket.invoiced + amt);
    if (r.status === "paid") bucket.paid = round2(bucket.paid + amt);
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
