import "server-only";

// FIN-6 — AP aging: the payables mirror of FIN-3's AR aging, deliberately
// one-to-one with lib/api/ar-aging.ts so the two read the same way.
//
//   aging days = today − due_date  (when the bill carries one)
//              = today − bill_date (fallback — a bill with no agreed terms
//                ages from the day it arrived, the conservative read and the
//                exact mirror of AR's issue-date fallback)
//
// Balances come from the FIN-5 helper (total − Σ bill_payments) — never
// recomputed here — and the open set is FIN-5's received/partially_paid, so a
// partially-paid bill ages by its REMAINING balance and a fully-paid one drops
// out. Bucket boundaries are the shared lib/aging-buckets.ts vocabulary, so AR
// and AP can never disagree about what "31–60" means.
//
// Nothing is stored: aging is a function of (bill, payments, today).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { businessDateISO } from "@/lib/format";
import { sumPaymentsByBill, type BillFilters } from "@/lib/api/vendor-bills";
import {
  AGING_BUCKET_LABEL,
  addToBucket,
  agingBucket,
  csvField,
  daysBetween,
  emptyBuckets,
  overdueOf,
  type AgingBucket,
  type AgingBuckets,
} from "@/lib/aging-buckets";

async function db() {
  return createSupabaseServerClient();
}

/** Bills that still owe money — the only ones that can carry AP age. */
const OPEN_BILL_STATUSES = ["received", "partially_paid"] as const;

/**
 * Days past due on a bill. Positive = overdue by that many days; zero or
 * negative = not yet due. Uses due_date when present, else bill_date. Returns 0
 * when the bill carries neither (can't age what was never dated).
 */
export function apBillAgingDays(
  bill: { due_date: string | null; bill_date: string | null },
  today: string
): number {
  const ref = bill.due_date ?? bill.bill_date;
  if (!ref) return 0;
  return daysBetween(ref, today);
}

/** Re-exported so the AP surfaces bucket identically to the AR ones. */
export { agingBucket as apAgingBucket, AGING_BUCKET_LABEL };
export type { AgingBucket, AgingBuckets };

/** An open bill with its derived balance + aging — the unit everything sums. */
interface OpenBillRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  balance: number;
  days: number;
  bucket: AgingBucket;
}

/**
 * Load every open bill with a positive remaining balance, already aged. Shared
 * by the summary + by-vendor reads so they can never disagree.
 */
async function loadOpenAgedBills(today: string): Promise<OpenBillRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendor_bills")
    .select("id, vendor_id, total, bill_date, due_date, vendor:vendors(name)")
    .in("status", OPEN_BILL_STATUSES);
  if (error) throw new Error(`loadOpenAgedBills: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: string;
    vendor_id: string;
    total: number | null;
    bill_date: string | null;
    due_date: string | null;
    vendor: { name: string } | null;
  }[];

  const paidByBill = await sumPaymentsByBill(
    supabase,
    rows.map((r) => r.id)
  );

  const out: OpenBillRow[] = [];
  for (const r of rows) {
    const balance = round2(Number(r.total ?? 0) - (paidByBill.get(r.id) ?? 0));
    if (balance <= 0) continue; // fully covered — owes nothing
    const days = apBillAgingDays(r, today);
    out.push({
      id: r.id,
      vendor_id: r.vendor_id,
      vendor_name: r.vendor?.name ?? "—",
      balance,
      days,
      bucket: agingBucket(days),
    });
  }
  return out;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export interface ApAgingSummary {
  buckets: AgingBuckets;
  total: number;
  /** Σ of everything past due (all buckets except `current`). */
  overdueTotal: number;
  asOf: string;
}

export async function getApAgingSummary(): Promise<ApAgingSummary> {
  const asOf = businessDateISO();
  const rows = await loadOpenAgedBills(asOf);

  const buckets = emptyBuckets();
  let total = 0;
  for (const r of rows) {
    addToBucket(buckets, r.bucket, r.balance);
    total = round2(total + r.balance);
  }
  return { buckets, total, overdueTotal: overdueOf(buckets), asOf };
}

// ─── By vendor ───────────────────────────────────────────────────────────────

export interface ApAgingVendorRow extends AgingBuckets {
  vendor_id: string;
  vendor_name: string;
  total: number;
  /** Days past due of this vendor's oldest open bill. */
  oldest_days: number;
}

export async function getApAgingByVendor(): Promise<ApAgingVendorRow[]> {
  const asOf = businessDateISO();
  const rows = await loadOpenAgedBills(asOf);

  const byVendor = new Map<string, ApAgingVendorRow>();
  for (const r of rows) {
    const row =
      byVendor.get(r.vendor_id) ??
      ({
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_name,
        ...emptyBuckets(),
        total: 0,
        oldest_days: r.days,
      } as ApAgingVendorRow);
    addToBucket(row, r.bucket, r.balance);
    row.total = round2(row.total + r.balance);
    row.oldest_days = Math.max(row.oldest_days, r.days);
    byVendor.set(r.vendor_id, row);
  }

  return [...byVendor.values()].sort((a, b) => b.total - a.total);
}

// ─── Vendor statement ────────────────────────────────────────────────────────

export interface VendorStatementLine {
  bill_id: string;
  bill_number: string;
  po_number: string | null;
  bill_date: string;
  due_date: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  aging_days: number;
  bucket: AgingBucket;
}

export interface VendorStatement {
  vendor_id: string;
  vendor_name: string;
  asOf: string;
  lines: VendorStatementLine[];
  totals: { billed: number; paid: number; balance: number };
}

/**
 * A statement of what we owe one vendor. Void bills are excluded — they're
 * cancelled, so they belong on no statement of account. Unlike the AR client
 * statement there is no holdback column to break out, so the totals reconcile
 * directly: billed − paid = balance.
 */
export async function getVendorStatement(
  vendorId: string,
  range: BillFilters = {}
): Promise<VendorStatement | null> {
  const asOf = businessDateISO();
  const supabase = await db();

  const { data: vendorRow, error: vErr } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("id", vendorId)
    .maybeSingle();
  if (vErr) throw new Error(`getVendorStatement/vendor: ${vErr.message}`);
  if (!vendorRow) return null;
  const vendor = vendorRow as { id: string; name: string };

  let q = supabase
    .from("vendor_bills")
    .select(
      "id, bill_number, bill_date, due_date, status, total, purchase_order:purchase_orders(po_number)"
    )
    .eq("vendor_id", vendorId)
    .neq("status", "void");
  if (range.from) q = q.gte("bill_date", range.from);
  if (range.to) q = q.lte("bill_date", range.to);
  const { data, error } = await q.order("bill_date", { ascending: true });
  if (error) throw new Error(`getVendorStatement/bills: ${error.message}`);

  const bills = (data ?? []) as unknown as {
    id: string;
    bill_number: string;
    bill_date: string;
    due_date: string | null;
    status: string;
    total: number | null;
    purchase_order: { po_number: string } | null;
  }[];

  const paidByBill = await sumPaymentsByBill(
    supabase,
    bills.map((b) => b.id)
  );

  const lines: VendorStatementLine[] = [];
  let billed = 0;
  let paidTotal = 0;
  let balanceTotal = 0;

  for (const b of bills) {
    const paid = round2(paidByBill.get(b.id) ?? 0);
    const balance = round2(Number(b.total ?? 0) - paid);
    const days = apBillAgingDays(b, asOf);
    lines.push({
      bill_id: b.id,
      bill_number: b.bill_number,
      po_number: b.purchase_order?.po_number ?? null,
      bill_date: b.bill_date,
      due_date: b.due_date,
      total: round2(Number(b.total ?? 0)),
      paid,
      balance,
      status: b.status,
      aging_days: days,
      bucket: agingBucket(days),
    });
    billed = round2(billed + Number(b.total ?? 0));
    paidTotal = round2(paidTotal + paid);
    balanceTotal = round2(balanceTotal + balance);
  }

  return {
    vendor_id: vendor.id,
    vendor_name: vendor.name,
    asOf,
    lines,
    totals: { billed, paid: paidTotal, balance: balanceTotal },
  };
}

// ─── CSV export ──────────────────────────────────────────────────────────────

export const AP_AGING_CSV_HEADER = [
  "Vendor",
  "Bill",
  "PO",
  "Bill date",
  "Due date",
  "Total",
  "Paid",
  "Balance",
  "Days past due",
  "Bucket",
];

/**
 * The AP twin of buildArAgingCsv: one row per open bill with a balance, aged,
 * oldest-first. CRLF-terminated for Excel.
 */
export async function buildApAgingCsv(): Promise<string> {
  const asOf = businessDateISO();
  const supabase = await db();

  const { data, error } = await supabase
    .from("vendor_bills")
    .select(
      "id, bill_number, bill_date, due_date, total, vendor:vendors(name), purchase_order:purchase_orders(po_number)"
    )
    .in("status", OPEN_BILL_STATUSES);
  if (error) throw new Error(`buildApAgingCsv: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    id: string;
    bill_number: string;
    bill_date: string | null;
    due_date: string | null;
    total: number | null;
    vendor: { name: string } | null;
    purchase_order: { po_number: string } | null;
  }[];

  const paidByBill = await sumPaymentsByBill(
    supabase,
    rows.map((r) => r.id)
  );

  const lines: string[] = [AP_AGING_CSV_HEADER.map(csvField).join(",")];
  const aged = rows
    .map((r) => {
      const paid = paidByBill.get(r.id) ?? 0;
      const balance = round2(Number(r.total ?? 0) - paid);
      const days = apBillAgingDays(r, asOf);
      return { r, paid, balance, days };
    })
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.days - a.days);

  for (const { r, paid, balance, days } of aged) {
    lines.push(
      [
        csvField(r.vendor?.name ?? "—"),
        csvField(r.bill_number),
        csvField(r.purchase_order?.po_number ?? ""),
        csvField(r.bill_date),
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
