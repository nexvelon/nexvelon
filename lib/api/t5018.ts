import "server-only";

// SUB-7 — T5018 (Statement of Contract Payments) annual report. Per-sub
// calendar-year payment totals in the shape a bookkeeper needs to file CRA
// T5018 slips. Pure derivation over the FIN-5 payment ledger — never stored.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE BASIS (2b): T5018 reports amounts PAID in the period, not amounts billed.
//   total per sub = Σ bill_payments.amount for bills WHERE subcontractor_id =
//   that sub AND paid_at falls in the calendar year.
// This is CASH basis and legitimately DIFFERS from SUB-4's sub_labour cost leg
// (accrual: billed, pre-tax subtotal). A bill issued in December and paid in
// January belongs to different years on the two views — both are correct.
// Do not "fix" one to match the other.
//
// TAX (2c): T5018 slips report total contract payments INCLUDING GST/HST.
// FIN-5's payment model records payments against the bill's TOTAL (recordBill-
// Payment computes balance = total − Σ payments), so bill_payments.amount is
// already tax-inclusive. No adjustment needed.
//
// SCOPING (2a): vendor_bills.subcontractor_id (SUB-4) is the key — only
// sub-attributed bills count, so supplier/material vendors are never
// over-reported onto T5018 slips.
//
// VOID (defensive): FIN-5's voidBill refuses when payments exist, so payments
// against a void bill shouldn't exist — but a payment could be recorded, the
// bill paid down to zero... no: void requires zero payments. Still handled
// defensively here (void bills' payments excluded) in case that invariant is
// ever relaxed.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { csvField } from "@/lib/aging-buckets";

async function db() {
  return createSupabaseServerClient();
}

/**
 * CRA's T5018 filing threshold: slips are generally required when total
 * payments to a payee reach $500 in the period. Rows below it are FLAGGED, not
 * filtered — the bookkeeper decides what to file.
 */
export const T5018_THRESHOLD = 500;

export interface T5018Row {
  subcontractor_id: string;
  /** legal_name when present, else the operating name — slips need the legal entity. */
  name: string;
  business_number: string | null;
  gst_hst_number: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
  };
  /** Tax-inclusive (see 2c) total paid in the year. */
  total_paid: number;
  payment_count: number;
  first_payment: string;
  last_payment: string;
  /** CRA needs a BN (or SIN) on the slip. */
  missing_business_number: boolean;
  /** Under the $500 CRA threshold — flagged, never silently filtered. */
  below_threshold: boolean;
}

export interface T5018Report {
  year: number;
  period: { from: string; to: string };
  rows: T5018Row[];
  totals: {
    subcontractor_count: number;
    total_paid: number;
    rows_missing_business_number: number;
  };
}

interface SubBillRow {
  id: string;
  subcontractor_id: string;
  status: string;
}

interface PaymentRow {
  bill_id: string;
  amount: number | null;
  paid_at: string;
}

interface SubRow {
  id: string;
  name: string;
  legal_name: string | null;
  business_number: string | null;
  gst_hst_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
}

/** Sub-attributed, non-void bills — the T5018 universe. */
async function listSubBills(
  supabase: Awaited<ReturnType<typeof db>>
): Promise<SubBillRow[]> {
  const { data, error } = await supabase
    .from("vendor_bills")
    .select("id, subcontractor_id, status")
    .not("subcontractor_id", "is", null)
    .neq("status", "void");
  if (error) throw new Error(`t5018/listSubBills: ${error.message}`);
  return (data ?? []) as SubBillRow[];
}

export async function getT5018Report(year: number): Promise<T5018Report> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const supabase = await db();

  const bills = await listSubBills(supabase);
  const empty: T5018Report = {
    year,
    period: { from, to },
    rows: [],
    totals: { subcontractor_count: 0, total_paid: 0, rows_missing_business_number: 0 },
  };
  if (bills.length === 0) return empty;

  const subByBill = new Map(bills.map((b) => [b.id, b.subcontractor_id]));

  const { data: payData, error: payErr } = await supabase
    .from("bill_payments")
    .select("bill_id, amount, paid_at")
    .in("bill_id", bills.map((b) => b.id))
    .gte("paid_at", from)
    .lte("paid_at", to);
  if (payErr) throw new Error(`t5018/payments: ${payErr.message}`);
  const payments = (payData ?? []) as PaymentRow[];
  if (payments.length === 0) return empty;

  // Aggregate per subcontractor.
  const agg = new Map<
    string,
    { total: number; count: number; first: string; last: string }
  >();
  for (const p of payments) {
    const subId = subByBill.get(p.bill_id);
    if (!subId) continue;
    const amt = Number(p.amount ?? 0);
    const cur = agg.get(subId) ?? { total: 0, count: 0, first: p.paid_at, last: p.paid_at };
    cur.total = round2(cur.total + amt);
    cur.count += 1;
    if (p.paid_at < cur.first) cur.first = p.paid_at;
    if (p.paid_at > cur.last) cur.last = p.paid_at;
    agg.set(subId, cur);
  }

  // Only payees with money actually paid in the year appear.
  const payeeIds = [...agg.keys()].filter((id) => (agg.get(id)!.total ?? 0) > 0);
  if (payeeIds.length === 0) return empty;

  const { data: subData, error: subErr } = await supabase
    .from("subcontractors")
    .select(
      "id, name, legal_name, business_number, gst_hst_number, address_line1, address_line2, city, province, postal_code"
    )
    .in("id", payeeIds);
  if (subErr) throw new Error(`t5018/subs: ${subErr.message}`);
  const subById = new Map(((subData ?? []) as SubRow[]).map((s) => [s.id, s]));

  const rows: T5018Row[] = payeeIds.map((id) => {
    const a = agg.get(id)!;
    const s = subById.get(id);
    const bn = s?.business_number?.trim() || null;
    return {
      subcontractor_id: id,
      name: s?.legal_name?.trim() || s?.name || "—",
      business_number: bn,
      gst_hst_number: s?.gst_hst_number?.trim() || null,
      address: {
        line1: s?.address_line1 ?? null,
        line2: s?.address_line2 ?? null,
        city: s?.city ?? null,
        province: s?.province ?? null,
        postal_code: s?.postal_code ?? null,
      },
      total_paid: a.total,
      payment_count: a.count,
      first_payment: a.first,
      last_payment: a.last,
      missing_business_number: bn === null,
      below_threshold: a.total < T5018_THRESHOLD,
    };
  });

  rows.sort((a, b) => b.total_paid - a.total_paid || a.name.localeCompare(b.name));

  return {
    year,
    period: { from, to },
    rows,
    totals: {
      subcontractor_count: rows.length,
      total_paid: round2(rows.reduce((s, r) => s + r.total_paid, 0)),
      rows_missing_business_number: rows.filter((r) => r.missing_business_number).length,
    },
  };
}

/** Years with any sub-attributed payment activity, newest first — the picker. */
export async function getT5018YearsAvailable(): Promise<number[]> {
  const supabase = await db();
  const bills = await listSubBills(supabase);
  if (bills.length === 0) return [];
  const { data, error } = await supabase
    .from("bill_payments")
    .select("bill_id, paid_at")
    .in("bill_id", bills.map((b) => b.id));
  if (error) throw new Error(`t5018/years: ${error.message}`);
  const years = new Set<number>();
  for (const p of (data ?? []) as { paid_at: string }[]) {
    const y = Number(p.paid_at.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * SUB-7 (6b) — one sub's tax-inclusive payment totals for this year and last,
 * for the sub detail page's bills area. Same basis as the T5018 report.
 */
export async function getSubPaymentYearTotals(
  subcontractorId: string,
  thisYear: number
): Promise<{ this_year: number; last_year: number }> {
  const supabase = await db();
  const { data: billData, error: bErr } = await supabase
    .from("vendor_bills")
    .select("id, status")
    .eq("subcontractor_id", subcontractorId)
    .neq("status", "void");
  if (bErr) throw new Error(`t5018/subYearBills: ${bErr.message}`);
  const billIds = ((billData ?? []) as { id: string }[]).map((b) => b.id);
  if (billIds.length === 0) return { this_year: 0, last_year: 0 };

  const lastYear = thisYear - 1;
  const { data: payData, error: pErr } = await supabase
    .from("bill_payments")
    .select("bill_id, amount, paid_at")
    .in("bill_id", billIds)
    .gte("paid_at", `${lastYear}-01-01`)
    .lte("paid_at", `${thisYear}-12-31`);
  if (pErr) throw new Error(`t5018/subYearPayments: ${pErr.message}`);

  let cur = 0;
  let prev = 0;
  for (const p of (payData ?? []) as PaymentRow[]) {
    const y = Number(p.paid_at.slice(0, 4));
    const amt = Number(p.amount ?? 0);
    if (y === thisYear) cur = round2(cur + amt);
    else if (y === lastYear) prev = round2(prev + amt);
  }
  return { this_year: cur, last_year: prev };
}

// ─── CSV (bookkeeper-friendly column order) ──────────────────────────────────

export const T5018_CSV_HEADER = [
  "Legal name",
  "Business number",
  "GST/HST number",
  "Address line 1",
  "Address line 2",
  "City",
  "Province",
  "Postal code",
  "Total paid",
  "Payment count",
  "First payment",
  "Last payment",
  "Below $500 threshold",
  "Missing business number",
];

export function buildT5018Csv(report: T5018Report): string {
  const out = [T5018_CSV_HEADER.map(csvField).join(",")];
  for (const r of report.rows) {
    out.push(
      [
        csvField(r.name),
        csvField(r.business_number),
        csvField(r.gst_hst_number),
        csvField(r.address.line1),
        csvField(r.address.line2),
        csvField(r.address.city),
        csvField(r.address.province),
        csvField(r.address.postal_code),
        csvField(r.total_paid.toFixed(2)),
        csvField(r.payment_count),
        csvField(r.first_payment),
        csvField(r.last_payment),
        csvField(r.below_threshold ? "yes" : "no"),
        csvField(r.missing_business_number ? "yes" : "no"),
      ].join(",")
    );
  }
  return out.join("\r\n");
}
