import "server-only";

// FIN-5 — vendor bills (AP). Deliberately the mirror image of the AR stack
// FIN-2 built: a bill is an invoice pointed the other way, and bill_payments
// behave exactly like invoice_payments.
//
//   balance = total − Σ bill_payments        (derived, §2.2 — no stored column)
//   status  = Σ >= total → paid ; Σ > 0 → partially_paid ; else received
//
// Bills are HEADER-level in v1: subtotal / tax / total are entered directly and
// reconciled against the PO in total. Line-level 3-way match is FIN-5b.
//
// Attribution: a PO carries project_id + job_id on its HEADER (migration 0084),
// not per line, so a PO-linked bill inherits that attribution — which is what
// makes billed_cost land on the right Job in the cost rollup.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/quote-helpers";
import { logActivity } from "@/lib/api/activity-log";
import { daysBetween } from "@/lib/aging-buckets";
import type {
  DbBillPayment,
  DbCashPaymentMethod,
  DbClientOpco,
  DbVendorBill,
  DbVendorBillStatus,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type BillErrorCode =
  | "not_found"
  | "invalid_amount"
  | "invalid_status"
  | "exceeds_balance"
  | "has_payments"
  | "po_not_issued"
  | "total_mismatch";

export class BillError extends Error {
  code: BillErrorCode;
  constructor(code: BillErrorCode, message: string) {
    super(message);
    this.name = "BillError";
    this.code = code;
  }
}

/** A bill can only be billed against a PO that has actually been issued. */
const BILLABLE_PO_STATUSES = new Set([
  "issued",
  "partially_received",
  "received",
  "closed",
]);

/** Statuses that still owe money. */
const OPEN_BILL_STATUSES = ["received", "partially_paid"] as const;

export interface BillListRow extends DbVendorBill {
  vendor_name: string | null;
  po_number: string | null;
  project_number: string | null;
  /** total − Σ payments. */
  balance: number;
  paid: number;
}

export interface BillDetail {
  bill: DbVendorBill;
  vendor_name: string | null;
  po_number: string | null;
  project_number: string | null;
  payments: DbBillPayment[];
  paid: number;
  balance: number;
}

export interface BillFilters {
  vendorId?: string;
  status?: string;
  projectId?: string;
  from?: string | null;
  to?: string | null;
}

// ─── Payment sums ────────────────────────────────────────────────────────────

/** Σ payments per bill id — the AP twin of sumPaymentsByInvoice. */
export async function sumPaymentsByBill(
  supabase: Awaited<ReturnType<typeof db>>,
  billIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (billIds.length === 0) return out;
  const { data, error } = await supabase
    .from("bill_payments")
    .select("bill_id, amount")
    .in("bill_id", billIds);
  if (error) throw new Error(`sumPaymentsByBill: ${error.message}`);
  for (const p of (data ?? []) as { bill_id: string; amount: number | null }[]) {
    out.set(p.bill_id, round2((out.get(p.bill_id) ?? 0) + Number(p.amount ?? 0)));
  }
  return out;
}

/**
 * Derive the status a bill SHOULD carry from its ledger. Mirrors
 * deriveStatusFromPayments for invoices, half-cent tolerance included.
 * 'void' is a lifecycle state the ledger doesn't own and is never derived.
 */
export function deriveBillStatus(
  total: number,
  paidTotal: number
): "received" | "partially_paid" | "paid" {
  if (paidTotal >= total - 0.005) return "paid";
  if (paidTotal > 0) return "partially_paid";
  return "received";
}

/**
 * FIN-7 — the claimable ITC for a bill: defaults to the full tax when not
 * specified, never negative, never more than the tax actually charged.
 */
function clampClaimable(
  requested: number | null | undefined,
  taxAmount: number
): number {
  if (requested === null || requested === undefined) return taxAmount;
  const v = round2(requested);
  if (v < 0) return 0;
  if (v > taxAmount) return taxAmount;
  return v;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

type BillJoinRow = DbVendorBill & {
  vendor: { name: string } | null;
  purchase_order: { po_number: string } | null;
  project: { project_number: string } | null;
};

const BILL_SELECT =
  "*, vendor:vendors(name), purchase_order:purchase_orders(po_number), project:projects(project_number)";

export async function listBills(
  filters: BillFilters = {}
): Promise<BillListRow[]> {
  const supabase = await db();
  let q = supabase.from("vendor_bills").select(BILL_SELECT);
  if (filters.vendorId) q = q.eq("vendor_id", filters.vendorId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.projectId) q = q.eq("project_id", filters.projectId);
  if (filters.from) q = q.gte("bill_date", filters.from);
  if (filters.to) q = q.lte("bill_date", filters.to);
  const { data, error } = await q.order("bill_date", { ascending: false });
  if (error) throw new Error(`listBills: ${error.message}`);

  const rows = (data ?? []) as unknown as BillJoinRow[];
  const paidByBill = await sumPaymentsByBill(
    supabase,
    rows.map((r) => r.id)
  );

  return rows.map((r) => {
    const { vendor, purchase_order, project, ...bill } = r;
    const paid = paidByBill.get(r.id) ?? 0;
    return {
      ...(bill as DbVendorBill),
      vendor_name: vendor?.name ?? null,
      po_number: purchase_order?.po_number ?? null,
      project_number: project?.project_number ?? null,
      paid: round2(paid),
      balance: round2(Number(r.total ?? 0) - paid),
    };
  });
}

export async function getBillById(id: string): Promise<BillDetail | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendor_bills")
    .select(BILL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getBillById: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as BillJoinRow;
  const { vendor, purchase_order, project, ...bill } = row;
  const payments = await listBillPayments(id);
  const paid = round2(payments.reduce((s, p) => s + Number(p.amount), 0));

  return {
    bill: bill as DbVendorBill,
    vendor_name: vendor?.name ?? null,
    po_number: purchase_order?.po_number ?? null,
    project_number: project?.project_number ?? null,
    payments,
    paid,
    balance: round2(Number(row.total ?? 0) - paid),
  };
}

export async function listBillPayments(
  billId: string
): Promise<DbBillPayment[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("bill_payments")
    .select("*")
    .eq("bill_id", billId)
    .order("paid_at", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listBillPayments: ${error.message}`);
  return (data ?? []) as DbBillPayment[];
}

/** Bills raised against one PO — powers "ordered $X, billed $Y" on the PO. */
export async function listBillsForPurchaseOrder(
  purchaseOrderId: string
): Promise<BillListRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendor_bills")
    .select(BILL_SELECT)
    .eq("purchase_order_id", purchaseOrderId)
    .order("bill_date", { ascending: true });
  if (error) throw new Error(`listBillsForPurchaseOrder: ${error.message}`);

  const rows = (data ?? []) as unknown as BillJoinRow[];
  const paidByBill = await sumPaymentsByBill(supabase, rows.map((r) => r.id));
  return rows.map((r) => {
    const { vendor, purchase_order, project, ...bill } = r;
    const paid = paidByBill.get(r.id) ?? 0;
    return {
      ...(bill as DbVendorBill),
      vendor_name: vendor?.name ?? null,
      po_number: purchase_order?.po_number ?? null,
      project_number: project?.project_number ?? null,
      paid: round2(paid),
      balance: round2(Number(r.total ?? 0) - paid),
    };
  });
}

export interface ApSummary {
  /** Σ balance over open bills. */
  outstanding: number;
  /** Σ balance over open bills whose due_date is past. */
  overdue: number;
  billCount: number;
}

/** Overview KPIs: what we owe, and how much of it is late. */
export async function getApSummary(today: string): Promise<ApSummary> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("vendor_bills")
    .select("id, total, bill_date, due_date, status")
    .in("status", OPEN_BILL_STATUSES);
  if (error) throw new Error(`getApSummary: ${error.message}`);

  const rows = (data ?? []) as {
    id: string;
    total: number | null;
    bill_date: string | null;
    due_date: string | null;
  }[];
  const paidByBill = await sumPaymentsByBill(supabase, rows.map((r) => r.id));

  let outstanding = 0;
  let overdue = 0;
  let billCount = 0;
  for (const r of rows) {
    const balance = round2(Number(r.total ?? 0) - (paidByBill.get(r.id) ?? 0));
    if (balance <= 0) continue;
    outstanding = round2(outstanding + balance);
    billCount += 1;
    // FIN-6 — same reference the AP aging engine uses: due_date when set, else
    // bill_date. Before this the KPI treated a bill with no due date as never
    // overdue, while the aging buckets aged it from bill_date — two different
    // overdue totals on one screen.
    const ref = r.due_date ?? r.bill_date;
    if (ref && daysBetween(ref, today) > 0) overdue = round2(overdue + balance);
  }
  return { outstanding, overdue, billCount };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateBillInput {
  vendorId: string;
  purchaseOrderId?: string | null;
  projectId?: string | null;
  jobId?: string | null;
  billNumber: string;
  billDate: string;
  dueDate?: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  /** FIN-7 — defaults to the full tax when omitted (fully claimable). */
  claimableTaxAmount?: number | null;
  /** FIN-7 — only meaningful for a standalone bill (no project). */
  opco?: DbClientOpco | null;
  notes?: string | null;
  actorId?: string | null;
}

export async function createBill(
  input: CreateBillInput
): Promise<DbVendorBill> {
  const supabase = await db();

  const subtotal = round2(input.subtotal);
  const taxAmount = round2(input.taxAmount);
  const total = round2(input.total);
  if (total < 0 || subtotal < 0 || taxAmount < 0) {
    throw new BillError("invalid_amount", "Bill amounts can't be negative.");
  }
  // The header is hand-entered, so the one arithmetic guard that matters is
  // that it adds up — otherwise billed_cost (subtotal-based) and AP balance
  // (total-based) would silently describe different bills.
  if (Math.abs(subtotal + taxAmount - total) > 0.005) {
    throw new BillError(
      "total_mismatch",
      `Subtotal + tax (${round2(subtotal + taxAmount).toFixed(2)}) doesn't equal the total (${total.toFixed(2)}).`
    );
  }

  let projectId = input.projectId ?? null;
  let jobId = input.jobId ?? null;

  if (input.purchaseOrderId) {
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, status, project_id, job_id")
      .eq("id", input.purchaseOrderId)
      .maybeSingle();
    if (poErr) throw new Error(`createBill/po: ${poErr.message}`);
    if (!po) throw new BillError("not_found", "Purchase order not found.");
    const order = po as {
      status: string;
      project_id: string | null;
      job_id: string | null;
    };
    if (!BILLABLE_PO_STATUSES.has(order.status)) {
      throw new BillError(
        "po_not_issued",
        "That purchase order hasn't been issued yet, so it can't be billed."
      );
    }
    // Inherit attribution unless the caller set it explicitly.
    if (projectId === null && jobId === null) {
      projectId = order.project_id;
      jobId = order.job_id;
    }
  }

  // Mirror the DB shape guard so the failure is a friendly error, not a 23514.
  if (jobId && !projectId) {
    throw new BillError(
      "invalid_amount",
      "A job-attributed bill needs a project too."
    );
  }

  // FIN-7 — claimable ITC defaults to the full tax (the normal business
  // purchase) and can only be adjusted DOWN. Clamping here mirrors the DB
  // CHECK so an over-claim surfaces as a friendly error, not a 23514.
  const claimable = clampClaimable(input.claimableTaxAmount, taxAmount);

  const { data, error } = await supabase
    .from("vendor_bills")
    .insert({
      vendor_id: input.vendorId,
      purchase_order_id: input.purchaseOrderId ?? null,
      project_id: projectId,
      job_id: jobId,
      bill_number: input.billNumber,
      bill_date: input.billDate,
      due_date: input.dueDate ?? null,
      subtotal,
      tax_amount: taxAmount,
      total,
      claimable_tax_amount: claimable,
      // Only a standalone bill carries its own opco; a project-linked bill
      // resolves through the project (see resolveBillOpco).
      opco: projectId ? null : (input.opco ?? null),
      status: "received",
      notes: input.notes ?? null,
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createBill: ${error.message}`);

  if (projectId) {
    await logActivity("project", projectId, "update", {
      vendor_bill_received: { from: null, to: total },
    });
  }

  return data as DbVendorBill;
}

export interface UpdateBillPatch {
  billNumber?: string;
  billDate?: string;
  dueDate?: string | null;
  subtotal?: number;
  taxAmount?: number;
  total?: number;
  claimableTaxAmount?: number | null;
  opco?: DbClientOpco | null;
  projectId?: string | null;
  jobId?: string | null;
  notes?: string | null;
}

export async function updateBill(
  id: string,
  patch: UpdateBillPatch,
  actorId?: string | null
): Promise<DbVendorBill> {
  const supabase = await db();

  const { data: cur, error: cErr } = await supabase
    .from("vendor_bills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`updateBill/load: ${cErr.message}`);
  if (!cur) throw new BillError("not_found", "Bill not found.");
  const bill = cur as DbVendorBill;

  const subtotal = patch.subtotal !== undefined ? round2(patch.subtotal) : Number(bill.subtotal);
  const taxAmount = patch.taxAmount !== undefined ? round2(patch.taxAmount) : Number(bill.tax_amount);
  const total = patch.total !== undefined ? round2(patch.total) : Number(bill.total);
  if (Math.abs(subtotal + taxAmount - total) > 0.005) {
    throw new BillError(
      "total_mismatch",
      `Subtotal + tax (${round2(subtotal + taxAmount).toFixed(2)}) doesn't equal the total (${total.toFixed(2)}).`
    );
  }

  const update: Record<string, unknown> = { updated_by: actorId ?? null };
  if (patch.billNumber !== undefined) update.bill_number = patch.billNumber;
  if (patch.billDate !== undefined) update.bill_date = patch.billDate;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.subtotal !== undefined) update.subtotal = subtotal;
  if (patch.taxAmount !== undefined) update.tax_amount = taxAmount;
  if (patch.total !== undefined) update.total = total;
  // FIN-7 — keep claimable within the (possibly new) tax amount. Lowering tax
  // without touching claimable must not leave an over-claim behind.
  if (patch.claimableTaxAmount !== undefined || patch.taxAmount !== undefined) {
    update.claimable_tax_amount = clampClaimable(
      patch.claimableTaxAmount !== undefined
        ? patch.claimableTaxAmount
        : Number(bill.claimable_tax_amount ?? taxAmount),
      taxAmount
    );
  }
  if (patch.opco !== undefined) update.opco = patch.opco;
  if (patch.projectId !== undefined) update.project_id = patch.projectId;
  if (patch.jobId !== undefined) update.job_id = patch.jobId;
  if (patch.notes !== undefined) update.notes = patch.notes;

  const { data, error } = await supabase
    .from("vendor_bills")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateBill: ${error.message}`);
  return data as DbVendorBill;
}

/** Void a bill. Blocked once anything has been paid against it. */
export async function voidBill(id: string): Promise<DbVendorBill> {
  const supabase = await db();

  const { data: cur, error: cErr } = await supabase
    .from("vendor_bills")
    .select("id, status, project_id, total")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`voidBill/load: ${cErr.message}`);
  if (!cur) throw new BillError("not_found", "Bill not found.");
  const bill = cur as {
    status: string;
    project_id: string | null;
    total: number;
  };

  const payments = await listBillPayments(id);
  if (payments.length > 0) {
    throw new BillError(
      "has_payments",
      "Remove this bill's payments before voiding it."
    );
  }

  const { data, error } = await supabase
    .from("vendor_bills")
    .update({ status: "void" as DbVendorBillStatus })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`voidBill: ${error.message}`);

  if (bill.project_id) {
    await logActivity("project", bill.project_id, "update", {
      vendor_bill_voided: { from: Number(bill.total), to: null },
    });
  }
  return data as DbVendorBill;
}

export interface RecordBillPaymentInput {
  billId: string;
  amount: number;
  method: DbCashPaymentMethod;
  paidAt: string;
  reference?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

export interface BillPaymentResult {
  bill: DbVendorBill;
  payments: DbBillPayment[];
}

export async function recordBillPayment(
  input: RecordBillPaymentInput
): Promise<BillPaymentResult> {
  const supabase = await db();

  const { data: cur, error: cErr } = await supabase
    .from("vendor_bills")
    .select("id, status, total")
    .eq("id", input.billId)
    .maybeSingle();
  if (cErr) throw new Error(`recordBillPayment/load: ${cErr.message}`);
  if (!cur) throw new BillError("not_found", "Bill not found.");
  const bill = cur as { status: string; total: number };

  if (bill.status !== "received" && bill.status !== "partially_paid") {
    throw new BillError(
      "invalid_status",
      "Only a received or partially-paid bill can take a payment."
    );
  }

  const amount = round2(input.amount);
  if (!(amount > 0)) {
    throw new BillError(
      "invalid_amount",
      "Payment amount must be greater than zero."
    );
  }

  const existing = await listBillPayments(input.billId);
  const paidSoFar = round2(existing.reduce((s, p) => s + Number(p.amount), 0));
  const total = round2(Number(bill.total));
  const balance = round2(total - paidSoFar);
  if (amount > balance + 0.005) {
    throw new BillError(
      "exceeds_balance",
      `Payment exceeds the remaining balance of ${balance.toFixed(2)}.`
    );
  }

  const { error: insErr } = await supabase.from("bill_payments").insert({
    bill_id: input.billId,
    amount,
    method: input.method,
    paid_at: input.paidAt,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
  });
  if (insErr) throw new Error(`recordBillPayment/insert: ${insErr.message}`);

  const status = deriveBillStatus(total, round2(paidSoFar + amount));
  const { data: updated, error: upErr } = await supabase
    .from("vendor_bills")
    .update({ status })
    .eq("id", input.billId)
    .select("*")
    .single();
  if (upErr) throw new Error(`recordBillPayment/status: ${upErr.message}`);

  return {
    bill: updated as DbVendorBill,
    payments: await listBillPayments(input.billId),
  };
}

export async function deleteBillPayment(
  paymentId: string
): Promise<BillPaymentResult> {
  const supabase = await db();

  const { data: pay, error: pErr } = await supabase
    .from("bill_payments")
    .select("id, bill_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (pErr) throw new Error(`deleteBillPayment/load: ${pErr.message}`);
  if (!pay) throw new BillError("not_found", "Payment not found.");
  const billId = (pay as { bill_id: string }).bill_id;

  const { data: cur, error: cErr } = await supabase
    .from("vendor_bills")
    .select("id, status, total")
    .eq("id", billId)
    .maybeSingle();
  if (cErr) throw new Error(`deleteBillPayment/bill: ${cErr.message}`);
  if (!cur) throw new BillError("not_found", "Bill not found.");
  const bill = cur as { status: string; total: number };
  if (bill.status === "void") {
    throw new BillError("invalid_status", "Can't change payments on a void bill.");
  }

  const { error: delErr } = await supabase
    .from("bill_payments")
    .delete()
    .eq("id", paymentId);
  if (delErr) throw new Error(`deleteBillPayment/delete: ${delErr.message}`);

  const remaining = await listBillPayments(billId);
  const total = round2(Number(bill.total));
  const paid = round2(remaining.reduce((s, p) => s + Number(p.amount), 0));
  const status = deriveBillStatus(total, paid);

  const { data: updated, error: upErr } = await supabase
    .from("vendor_bills")
    .update({ status })
    .eq("id", billId)
    .select("*")
    .single();
  if (upErr) throw new Error(`deleteBillPayment/status: ${upErr.message}`);

  return { bill: updated as DbVendorBill, payments: remaining };
}

// ─── Form options ────────────────────────────────────────────────────────────

export interface BillFormOptions {
  vendors: { id: string; name: string }[];
  /** Only POs that can actually be billed (issued or later). */
  purchaseOrders: { id: string; po_number: string; vendor_id: string }[];
}

export async function getBillFormOptions(): Promise<BillFormOptions> {
  const supabase = await db();
  const [{ data: vend, error: vErr }, { data: pos, error: pErr }] =
    await Promise.all([
      supabase.from("vendors").select("id, name").order("name"),
      supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_id, status")
        .in("status", [...BILLABLE_PO_STATUSES])
        .order("po_number", { ascending: false }),
    ]);
  if (vErr) throw new Error(`getBillFormOptions/vendors: ${vErr.message}`);
  if (pErr) throw new Error(`getBillFormOptions/pos: ${pErr.message}`);

  return {
    vendors: (vend ?? []) as { id: string; name: string }[],
    purchaseOrders: (pos ?? []) as {
      id: string;
      po_number: string;
      vendor_id: string;
    }[],
  };
}
