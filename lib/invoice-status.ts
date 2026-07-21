// FIN-2 — shared, client-safe invoice status helpers. No server imports so the
// builder, the /invoices list, the FIN-1 Financials tabs, and FIN-3 aging can
// all reuse one definition of "overdue", the status vocabulary, and the
// derive-status-from-payments rule. There is NO stored overdue flag or
// amount_paid column — both are derived here from the invoice + its payments.

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "void",
] as const;

export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

export const INVOICE_PAYMENT_METHODS = [
  "cheque",
  "eft",
  "e_transfer",
  "credit_card",
  "cash",
  "other",
] as const;

export const INVOICE_PAYMENT_METHOD_LABEL: Record<string, string> = {
  cheque: "Cheque",
  eft: "EFT",
  e_transfer: "e-Transfer",
  credit_card: "Credit card",
  cash: "Cash",
  other: "Other",
};

/** An invoice carries a live balance only while sent or partially paid. */
export function isOpenStatus(status: string): boolean {
  return status === "sent" || status === "partially_paid";
}

/** Today as a local yyyy-mm-dd — comparable directly against a date column. */
function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Overdue is derived, never stored: an open invoice (sent / partially_paid)
 * with a due_date strictly before today. Paid/void/draft are never overdue.
 */
export function isOverdue(
  inv: { status: string; due_date: string | null },
  now: Date = new Date()
): boolean {
  if (!isOpenStatus(inv.status)) return false;
  if (!inv.due_date) return false;
  return inv.due_date < todayIso(now);
}

/**
 * Derive the status an invoice SHOULD carry given its amount_due and the sum of
 * its recorded payments. Shared by recordPayment / deletePayment so the ledger
 * is the single source of truth. Draft/void are never re-derived here (they are
 * lifecycle states the ledger doesn't own).
 *   Σ payments >= amount_due (½-cent tolerance) → paid
 *   Σ payments > 0                              → partially_paid
 *   otherwise                                   → sent
 */
export function deriveStatusFromPayments(
  amountDue: number,
  paymentsTotal: number
): "sent" | "partially_paid" | "paid" {
  if (paymentsTotal >= amountDue - 0.005) return "paid";
  if (paymentsTotal > 0) return "partially_paid";
  return "sent";
}
