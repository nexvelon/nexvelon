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
import type { DbInvoice } from "@/lib/types/database";
import type { InvoiceListRow } from "@/lib/api/invoices";

async function db() {
  return createSupabaseServerClient();
}

export interface FinDateRange {
  from?: string | null;
  to?: string | null;
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
    .select("opco, status, total, amount_due, holdback_amount, issue_date")
    .in("status", ["sent", "paid"]);
  if (range.from) q = q.gte("issue_date", range.from);
  if (range.to) q = q.lte("issue_date", range.to);
  const { data, error } = await q;
  if (error) throw new Error(`getRevenueSummary: ${error.message}`);

  const rows = (data ?? []) as Pick<
    DbInvoice,
    "opco" | "status" | "total" | "amount_due" | "holdback_amount"
  >[];

  let total = 0;
  let paidTotal = 0;
  let outstandingTotal = 0;
  let holdbackRetained = 0;
  const opcoAgg = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const amt = Number(r.total ?? 0);
    total = round2(total + amt);
    if (r.status === "paid") paidTotal = round2(paidTotal + amt);
    if (r.status === "sent")
      outstandingTotal = round2(outstandingTotal + Number(r.amount_due ?? 0));
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
    .in("status", ["sent", "paid"])
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

/**
 * The /financials Invoices tab list. Same join shape as lib/api/invoices'
 * listInvoices. Drafts have no issue_date, so the date-range filter is applied
 * in JS to ISSUED rows only — drafts stay visible under every range (they are
 * work-in-progress, not history).
 */
export async function listInvoicesReal(
  filters: FinInvoiceFilters = {}
): Promise<InvoiceListRow[]> {
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
  const rows = ((data ?? []) as JoinRow[]).map((r) => {
    const { client, project, ...inv } = r;
    return {
      ...(inv as DbInvoice),
      client_name: client?.name ?? null,
      client_deleted: !!client?.deleted_at,
      project_number: project?.project_number ?? null,
    };
  });

  return rows.filter((r) => {
    if (!r.issue_date) return true; // draft — always visible
    if (filters.from && r.issue_date < filters.from) return false;
    if (filters.to && r.issue_date > filters.to) return false;
    return true;
  });
}

// ─── Receivables by client ───────────────────────────────────────────────────

export interface ReceivableClientRow {
  client_id: string;
  client_name: string;
  /** Σ amount_due over the client's 'sent' invoices. */
  open_total: number;
  invoice_count: number;
  /** issue_date of the client's oldest open invoice (null if none dated). */
  oldest_issue_date: string | null;
}

/**
 * Open balance per client. True aging buckets (current/30/60/90+) need
 * due-date discipline + payment records — that's FIN-3, after FIN-2 ships
 * payments. Until then this is the honest version: open balance + the age of
 * the oldest open invoice since ISSUE.
 */
export async function getReceivablesByClient(): Promise<ReceivableClientRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .select("client_id, amount_due, issue_date, client:clients(name)")
    .eq("status", "sent");
  if (error) throw new Error(`getReceivablesByClient: ${error.message}`);

  const byClient = new Map<string, ReceivableClientRow>();
  for (const r of (data ?? []) as unknown as {
    client_id: string;
    amount_due: number | null;
    issue_date: string | null;
    client: { name: string } | null;
  }[]) {
    const row = byClient.get(r.client_id) ?? {
      client_id: r.client_id,
      client_name: r.client?.name ?? "—",
      open_total: 0,
      invoice_count: 0,
      oldest_issue_date: null as string | null,
    };
    row.open_total = round2(row.open_total + Number(r.amount_due ?? 0));
    row.invoice_count += 1;
    if (r.issue_date && (!row.oldest_issue_date || r.issue_date < row.oldest_issue_date)) {
      row.oldest_issue_date = r.issue_date;
    }
    byClient.set(r.client_id, row);
  }

  return [...byClient.values()].sort((a, b) => b.open_total - a.open_total);
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
 * Σ invoices.tax_amount (sent + paid) by opco for the range. Collected side
 * only — input tax credits (ITCs) need vendor bills (FIN-7); the mock's
 * "ITC estimate" ratio is deliberately gone.
 */
export async function getTaxCollectedSummary(
  range: FinDateRange = {}
): Promise<TaxCollectedSummary> {
  const supabase = await db();
  let q = supabase
    .from("invoices")
    .select("opco, tax_amount, issue_date")
    .in("status", ["sent", "paid"]);
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
