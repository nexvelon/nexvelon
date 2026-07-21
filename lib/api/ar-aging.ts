import "server-only";

// FIN-3 — AR aging over the real ledger. FIN-2 gave invoices due dates and a
// payment ledger, so aging is now derivable rather than guessed:
//
//   aging days = today − due_date  (when a due date is set)
//              = today − issue_date (fallback — an invoice with no agreed
//                terms ages from the day it went out, which is the
//                conservative read and matches what FIN-1 showed)
//
// Balances come from the FIN-2 helper (amount_due − Σ payments) — never
// recomputed here — and the open set is FIN-2's OPEN_STATUSES, so a
// partially-paid invoice ages by its REMAINING balance, not its face value.
// Nothing is stored: no aging column, no snapshot table. Aging is a function
// of (invoice, payments, today).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { businessDateISO } from "@/lib/format";
import {
  ISSUED_STATUSES,
  OPEN_STATUSES,
  sumPaymentsByInvoice,
  type FinDateRange,
} from "@/lib/api/financials";

async function db() {
  return createSupabaseServerClient();
}

export type AgingBucket = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

/** Parse a yyyy-mm-dd date column into a UTC epoch (DST-proof day math). */
function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Days past due. Positive = overdue by that many days; zero or negative = not
 * yet due. Uses due_date when present, else issue_date. Returns 0 when the
 * invoice carries neither (can't age what was never dated).
 */
export function agingDays(
  inv: { due_date: string | null; issue_date: string | null },
  today: string
): number {
  const ref = inv.due_date ?? inv.issue_date;
  if (!ref) return 0;
  return Math.floor((isoToUtc(today) - isoToUtc(ref)) / 86_400_000);
}

/**
 * Bucket by days past due. `current` covers everything not yet due (days <= 0);
 * the rest are inclusive day ranges: 1–30, 31–60, 61–90, then 90+.
 */
export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

export interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
}

function emptyBuckets(): AgingBuckets {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

const BUCKET_FIELD: Record<AgingBucket, keyof AgingBuckets> = {
  current: "current",
  "1_30": "d1_30",
  "31_60": "d31_60",
  "61_90": "d61_90",
  "90_plus": "d90_plus",
};

function addToBucket(b: AgingBuckets, bucket: AgingBucket, amount: number): void {
  const field = BUCKET_FIELD[bucket];
  b[field] = round2(b[field] + amount);
}

/** An open invoice with its derived balance + aging, the unit everything sums. */
interface OpenInvoiceRow {
  id: string;
  client_id: string;
  client_name: string;
  balance: number;
  days: number;
  bucket: AgingBucket;
}

/**
 * Load every open invoice with a positive remaining balance, already aged.
 * Shared by the summary + by-client reads so they can never disagree.
 */
async function loadOpenAged(today: string): Promise<OpenInvoiceRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, client_id, amount_due, issue_date, due_date, client:clients(name)")
    .in("status", OPEN_STATUSES);
  if (error) throw new Error(`loadOpenAged: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: string;
    client_id: string;
    amount_due: number | null;
    issue_date: string | null;
    due_date: string | null;
    client: { name: string } | null;
  }[];

  const paidByInvoice = await sumPaymentsByInvoice(
    supabase,
    rows.map((r) => r.id)
  );

  const out: OpenInvoiceRow[] = [];
  for (const r of rows) {
    const balance = round2(
      Number(r.amount_due ?? 0) - (paidByInvoice.get(r.id) ?? 0)
    );
    if (balance <= 0) continue; // fully covered — carries no AR
    const days = agingDays(r, today);
    out.push({
      id: r.id,
      client_id: r.client_id,
      client_name: r.client?.name ?? "—",
      balance,
      days,
      bucket: agingBucket(days),
    });
  }
  return out;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface ArAgingSummary {
  buckets: AgingBuckets;
  total: number;
  /** Σ of everything past due (all buckets except `current`). */
  overdueTotal: number;
  asOf: string;
}

export async function getArAgingSummary(): Promise<ArAgingSummary> {
  const asOf = businessDateISO();
  const rows = await loadOpenAged(asOf);

  const buckets = emptyBuckets();
  let total = 0;
  for (const r of rows) {
    addToBucket(buckets, r.bucket, r.balance);
    total = round2(total + r.balance);
  }
  const overdueTotal = round2(
    buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90_plus
  );
  return { buckets, total, overdueTotal, asOf };
}

// ─── By client ───────────────────────────────────────────────────────────────

export interface ArAgingClientRow extends AgingBuckets {
  client_id: string;
  client_name: string;
  total: number;
  /** Days past due of this client's oldest open invoice. */
  oldest_days: number;
}

export async function getArAgingByClient(): Promise<ArAgingClientRow[]> {
  const asOf = businessDateISO();
  const rows = await loadOpenAged(asOf);

  const byClient = new Map<string, ArAgingClientRow>();
  for (const r of rows) {
    const row =
      byClient.get(r.client_id) ??
      ({
        client_id: r.client_id,
        client_name: r.client_name,
        ...emptyBuckets(),
        total: 0,
        oldest_days: r.days,
      } as ArAgingClientRow);
    addToBucket(row, r.bucket, r.balance);
    row.total = round2(row.total + r.balance);
    row.oldest_days = Math.max(row.oldest_days, r.days);
    byClient.set(r.client_id, row);
  }

  return [...byClient.values()].sort((a, b) => b.total - a.total);
}

// ─── Client statement ────────────────────────────────────────────────────────

export interface StatementLine {
  invoice_id: string;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  /** Holdback retained on this invoice — not yet owed by the client. */
  holdback: number;
  paid: number;
  balance: number;
  status: string;
  aging_days: number;
  bucket: AgingBucket;
}

export interface ClientStatement {
  client_id: string;
  client_name: string;
  asOf: string;
  lines: StatementLine[];
  totals: {
    invoiced: number;
    holdback: number;
    paid: number;
    balance: number;
  };
}

/**
 * A printable statement of account for one client. Scoped to ISSUED invoices —
 * drafts have never been sent to the client and voids are cancelled, so neither
 * belongs on a document the client reads.
 *
 * Reconciliation: invoiced − holdback − paid = balance. Holdback is broken out
 * because `total` is the full invoice value while payments settle `amount_due`
 * (= total − holdback); without the holdback column the totals would not add up.
 */
export async function getClientStatement(
  clientId: string,
  range: FinDateRange = {}
): Promise<ClientStatement | null> {
  const asOf = businessDateISO();
  const supabase = await db();

  const { data: clientRow, error: cErr } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (cErr) throw new Error(`getClientStatement/client: ${cErr.message}`);
  if (!clientRow) return null;
  const client = clientRow as { id: string; name: string };

  let q = supabase
    .from("invoices")
    .select(
      "id, invoice_number, issue_date, due_date, status, total, amount_due, holdback_amount"
    )
    .eq("client_id", clientId)
    .in("status", ISSUED_STATUSES);
  if (range.from) q = q.gte("issue_date", range.from);
  if (range.to) q = q.lte("issue_date", range.to);
  const { data, error } = await q.order("issue_date", { ascending: true });
  if (error) throw new Error(`getClientStatement/invoices: ${error.message}`);

  const invoices = (data ?? []) as {
    id: string;
    invoice_number: string | null;
    issue_date: string | null;
    due_date: string | null;
    status: string;
    total: number | null;
    amount_due: number | null;
    holdback_amount: number | null;
  }[];

  const paidByInvoice = await sumPaymentsByInvoice(
    supabase,
    invoices.map((r) => r.id)
  );

  const lines: StatementLine[] = [];
  let invoiced = 0;
  let holdbackTotal = 0;
  let paidTotal = 0;
  let balanceTotal = 0;

  for (const r of invoices) {
    const paid = paidByInvoice.get(r.id) ?? 0;
    const balance = round2(Number(r.amount_due ?? 0) - paid);
    const days = agingDays(r, asOf);
    lines.push({
      invoice_id: r.id,
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      due_date: r.due_date,
      total: round2(Number(r.total ?? 0)),
      holdback: round2(Number(r.holdback_amount ?? 0)),
      paid: round2(paid),
      balance,
      status: r.status,
      aging_days: days,
      bucket: agingBucket(days),
    });
    invoiced = round2(invoiced + Number(r.total ?? 0));
    holdbackTotal = round2(holdbackTotal + Number(r.holdback_amount ?? 0));
    paidTotal = round2(paidTotal + paid);
    balanceTotal = round2(balanceTotal + balance);
  }

  return {
    client_id: client.id,
    client_name: client.name,
    asOf,
    lines,
    totals: {
      invoiced,
      holdback: holdbackTotal,
      paid: paidTotal,
      balance: balanceTotal,
    },
  };
}

// ─── CSV export ──────────────────────────────────────────────────────────────

/** RFC-4180 field: quote when it contains a comma, quote, CR or LF. */
function csvField(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const AR_AGING_CSV_HEADER = [
  "Client",
  "Invoice",
  "Issue date",
  "Due date",
  "Total",
  "Paid",
  "Balance",
  "Days past due",
  "Bucket",
];

/**
 * The accountant hand-off: one row per open invoice with a balance, aged.
 * Header + rows, CRLF-terminated (what Excel expects).
 */
export async function buildArAgingCsv(): Promise<string> {
  const asOf = businessDateISO();
  const supabase = await db();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, issue_date, due_date, total, amount_due, client:clients(name)"
    )
    .in("status", OPEN_STATUSES);
  if (error) throw new Error(`buildArAgingCsv: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: string;
    invoice_number: string | null;
    issue_date: string | null;
    due_date: string | null;
    total: number | null;
    amount_due: number | null;
    client: { name: string } | null;
  }[];

  const paidByInvoice = await sumPaymentsByInvoice(
    supabase,
    rows.map((r) => r.id)
  );

  const lines: string[] = [AR_AGING_CSV_HEADER.map(csvField).join(",")];
  const aged = rows
    .map((r) => {
      const paid = paidByInvoice.get(r.id) ?? 0;
      const balance = round2(Number(r.amount_due ?? 0) - paid);
      const days = agingDays(r, asOf);
      return { r, paid, balance, days };
    })
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.days - a.days);

  for (const { r, paid, balance, days } of aged) {
    lines.push(
      [
        csvField(r.client?.name ?? "—"),
        csvField(r.invoice_number ?? "Draft"),
        csvField(r.issue_date),
        csvField(r.due_date),
        csvField(round2(Number(r.total ?? 0)).toFixed(2)),
        csvField(round2(paid).toFixed(2)),
        csvField(balance.toFixed(2)),
        csvField(days),
        csvField(AGING_BUCKET_LABEL[agingBucket(days)]),
      ].join(",")
    );
  }

  return lines.join("\r\n");
}
