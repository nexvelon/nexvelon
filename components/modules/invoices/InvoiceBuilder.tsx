"use client";

// INVOICE-1 — interactive invoice builder. Header (number-or-Draft, entity,
// client + site, project link, status) + a flexible line editor (manual lines
// and cost-center draws at a full/partial %), each editable + unlinkable, +
// a totals panel (subtotal, tax rate/exempt, holdback rate, total, amount due)
// + issue / status controls. All mutations go through the server actions, which
// recompute totals and return the fresh header + lines.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { FileText, Plus, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import {
  addManualLineAction,
  addCostCenterLineAction,
  addMaterialLineAction,
  setLineIdentifierFieldsAction,
  listBillableMaterialsForProjectAction,
  updateLineAction,
  unlinkLineAction,
  deleteLineAction,
  setTaxRateAction,
  setTaxExemptAction,
  setHoldbackRateAction,
  setDueDateAction,
  issueInvoiceAction,
  setInvoiceStatusAction,
  recordInvoicePaymentAction,
  deleteInvoicePaymentAction,
} from "@/app/(app)/invoices/actions";
import type {
  InvoiceDetail,
  BillableMaterialGroup,
} from "@/lib/api/invoices";
import type {
  DbInvoice,
  DbInvoiceLine,
  DbInvoicePayment,
  DbInvoicePaymentMethod,
} from "@/lib/types/database";
import {
  INVOICE_PAYMENT_METHODS,
  INVOICE_PAYMENT_METHOD_LABEL,
  isOpenStatus,
  isOverdue,
} from "@/lib/invoice-status";
import {
  INVOICE_IDENTIFIER_FIELDS,
  composeIdentifier,
} from "@/lib/invoice-identifiers";
import { cn } from "@/lib/utils";
import { OPCO_LABEL, STATUS_LABEL, STATUS_TONE } from "./shared";
import { InvoicePdfPane } from "./InvoicePdfPane";

function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function InvoiceBuilder({ detail }: { detail: InvoiceDetail }) {
  const { role } = useRole();
  const canEdit = hasPermission(role, "financials", "edit");

  const [invoice, setInvoice] = useState<DbInvoice>(detail.invoice);
  const [lines, setLines] = useState<DbInvoiceLine[]>(detail.lines);
  // FIN-2 — the payment ledger; the balance below is derived from it.
  const [payments, setPayments] = useState<DbInvoicePayment[]>(detail.payments);
  const [showPdf, setShowPdf] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmDeletePayment, setConfirmDeletePayment] = useState<string | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  const isDraft = invoice.status === "draft";
  const editable = canEdit && isDraft;

  // FIN-2 — derived money: nothing about payments is stored on the invoice.
  const amountDue = Number(invoice.amount_due);
  const paidTotal =
    Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
  const balance = Math.round((amountDue - paidTotal) * 100) / 100;
  const canTakePayment = canEdit && isOpenStatus(invoice.status);
  const overdue = isOverdue(invoice);

  // Apply a mutation result (fresh header + lines) to local state.
  const apply = (res: { invoice: DbInvoice; lines: DbInvoiceLine[] }) => {
    setInvoice(res.invoice);
    setLines(res.lines);
  };

  // FIN-2 — apply a payment mutation result (fresh header + ledger).
  const applyPayment = (res: {
    invoice: DbInvoice;
    payments: DbInvoicePayment[];
  }) => {
    setInvoice(res.invoice);
    setPayments(res.payments);
  };

  // MATERIALS-1: a project's billable parts (grouped by part × cost-center),
  // reloaded after each bill so already-billed groups grey out.
  const [materials, setMaterials] = useState<BillableMaterialGroup[]>([]);
  const reloadMaterials = () => {
    if (!invoice.project_id) return;
    listBillableMaterialsForProjectAction(invoice.project_id)
      .then(setMaterials)
      .catch(() => setMaterials([]));
  };
  useEffect(() => {
    if (!invoice.project_id) return;
    listBillableMaterialsForProjectAction(invoice.project_id)
      .then(setMaterials)
      .catch(() => setMaterials([]));
  }, [invoice.project_id]);

  const identifierFields = invoice.line_identifier_fields ?? ["name"];

  const handleSetIdentifierFields = (fields: string[]) =>
    startTransition(async () => {
      const res = await setLineIdentifierFieldsAction(invoice.id, fields);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  // Bill a material group. Serialized → one line per unbilled unit (serial +
  // source_stock_id); non-serialized → one line for the chosen qty.
  const billMaterial = (g: BillableMaterialGroup, qty: number, unitPrice: number) =>
    startTransition(async () => {
      let last: { invoice: DbInvoice; lines: DbInvoiceLine[] } | null = null;
      if (g.is_serialized) {
        const unbilled = g.units.slice(g.billed_qty);
        const toBill = unbilled.slice(0, Math.max(1, qty));
        for (const u of toBill) {
          const res = await addMaterialLineAction(invoice.id, {
            product_id: g.product_id,
            cost_center_id: g.cost_center_id,
            qty: 1,
            unit_price: unitPrice,
            source_stock_ids: [u.stock_id],
          });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          last = res.data;
        }
      } else {
        const res = await addMaterialLineAction(invoice.id, {
          product_id: g.product_id,
          cost_center_id: g.cost_center_id,
          qty,
          unit_price: unitPrice,
          source_stock_ids: g.units.map((u) => u.stock_id),
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        last = res.data;
      }
      if (last) apply(last);
      reloadMaterials();
      toast.success("Billed to invoice");
    });

  // ── Line ops ───────────────────────────────────────────────────────────
  const handleAddManual = () =>
    startTransition(async () => {
      const res = await addManualLineAction(invoice.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  const handleUpdateLine = (
    lineId: string,
    patch: Parameters<typeof updateLineAction>[2]
  ) =>
    startTransition(async () => {
      const res = await updateLineAction(invoice.id, lineId, patch);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  const handleUnlink = (lineId: string) =>
    startTransition(async () => {
      const res = await unlinkLineAction(invoice.id, lineId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  const handleDelete = (lineId: string) =>
    startTransition(async () => {
      const res = await deleteLineAction(invoice.id, lineId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  // ── Totals settings ────────────────────────────────────────────────────
  const handleTaxRate = (rate: number) =>
    startTransition(async () => {
      const res = await setTaxRateAction(invoice.id, rate);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  const handleTaxExempt = (exempt: boolean) =>
    startTransition(async () => {
      const res = await setTaxExemptAction(invoice.id, exempt);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  const handleHoldback = (rate: number) =>
    startTransition(async () => {
      const res = await setHoldbackRateAction(invoice.id, rate);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  // ── Issue + status ─────────────────────────────────────────────────────
  const handleIssue = () =>
    startTransition(async () => {
      const res = await issueInvoiceAction(invoice.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setInvoice(res.data);
      toast.success(`Issued ${res.data.invoice_number}`);
    });

  // FIN-2 — only void / re-open remain a bare flip; paid + partially_paid are
  // derived from the payment ledger.
  const handleStatus = (status: "sent" | "void") =>
    startTransition(async () => {
      const res = await setInvoiceStatusAction(invoice.id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setInvoice(res.data);
      toast.success(status === "void" ? "Invoice voided" : "Re-opened as sent");
    });

  const handleDueDate = (value: string) =>
    startTransition(async () => {
      const res = await setDueDateAction(invoice.id, value || null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      apply(res.data);
    });

  // ── Payments (FIN-2) ───────────────────────────────────────────────────
  const handleRecordPayment = (input: {
    amount: number;
    method: DbInvoicePaymentMethod;
    paidAt: string;
    reference: string;
    notes: string;
  }) =>
    startTransition(async () => {
      const res = await recordInvoicePaymentAction({
        invoiceId: invoice.id,
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt,
        reference: input.reference || null,
        notes: input.notes || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      applyPayment(res.data);
      setPayOpen(false);
      toast.success(
        res.data.invoice.status === "paid"
          ? "Payment recorded — invoice paid in full"
          : "Payment recorded"
      );
    });

  const handleDeletePayment = (paymentId: string) =>
    startTransition(async () => {
      const res = await deleteInvoicePaymentAction(paymentId, invoice.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      applyPayment(res.data);
      setConfirmDeletePayment(null);
      toast.success("Payment removed");
    });

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card
        className="p-5 shadow-sm"
        style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-brand-navy font-mono text-xs font-semibold tracking-wider">
              {invoice.invoice_number ?? "DRAFT"}
            </p>
            <h1 className="font-serif text-2xl font-semibold text-brand-primary">
              {detail.client_name ?? "—"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {detail.site_name ? `${detail.site_name} · ` : ""}
              {detail.project_number ? (
                <Link
                  href={`/projects/${invoice.project_id}`}
                  className="text-brand-navy font-mono hover:underline"
                >
                  {detail.project_number}
                </Link>
              ) : (
                "No project"
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={showPdf ? "secondary" : "outline"}
              onClick={() => setShowPdf((v) => !v)}
            >
              <FileText className="mr-1 h-3.5 w-3.5" />
              {showPdf ? "Hide PDF" : "Preview PDF"}
            </Button>
            <span className="bg-muted rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
              {OPCO_LABEL[invoice.opco] ?? invoice.opco}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_TONE[invoice.status] ?? STATUS_TONE.draft}`}
            >
              {STATUS_LABEL[invoice.status] ?? invoice.status}
            </span>
            {overdue && (
              <span className="rounded-full bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                Overdue
              </span>
            )}
          </div>
        </div>

        {/* FIN-2 — issue + due dates. Due date is editable for any
            financials:edit holder (not just drafts) since terms are often set
            or adjusted after issuing. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--border)] pt-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[11px]">Issued</span>
            <span className="text-brand-charcoal text-xs tabular-nums">
              {invoice.issue_date ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label
              className="text-muted-foreground text-[11px]"
              htmlFor="invoice-due-date"
            >
              Due
            </label>
            {canEdit ? (
              <Input
                id="invoice-due-date"
                type="date"
                defaultValue={invoice.due_date ?? ""}
                disabled={pending}
                onChange={(e) => handleDueDate(e.target.value)}
                className="h-7 w-40 text-xs tabular-nums"
              />
            ) : (
              <span className="text-brand-charcoal text-xs tabular-nums">
                {invoice.due_date ?? "—"}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* PDF preview + download — render-on-open; reflects current edits. */}
      {showPdf && (
        <InvoicePdfPane detail={{ ...detail, invoice, lines }} />
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Line editor */}
        <div className="space-y-3">
          <p className="nx-eyebrow-soft">
            Lines{" "}
            <span className="text-muted-foreground font-normal normal-case">
              · {lines.length}
            </span>
          </p>

          {/* MATERIALS-1: per-invoice identifier display toggle. */}
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-[11px]">
                Identifier display:
              </span>
              {INVOICE_IDENTIFIER_FIELDS.map((f) => {
                const on = identifierFields.includes(f.key);
                return (
                  <Button
                    key={f.key}
                    type="button"
                    size="xs"
                    variant={on ? "secondary" : "outline"}
                    disabled={pending}
                    onClick={() => {
                      const next = on
                        ? identifierFields.filter((k) => k !== f.key)
                        : [...identifierFields, f.key];
                      // Keep at least one field — empty would blank descriptions.
                      handleSetIdentifierFields(next.length > 0 ? next : ["name"]);
                    }}
                  >
                    {f.label}
                  </Button>
                );
              })}
            </div>
          )}

          <Card className="bg-card p-0 shadow-sm">
            {lines.length === 0 ? (
              <p className="text-muted-foreground p-4 text-xs">No lines yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {lines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    editable={editable}
                    pending={pending}
                    onUpdate={handleUpdateLine}
                    onUnlink={handleUnlink}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}

            {editable && (
              <div className="space-y-2 border-t border-[var(--border)] p-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddManual}
                  disabled={pending}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add manual line
                </Button>
                <CostCenterPicker
                  options={detail.costCenters}
                  pending={pending}
                  onAdd={(ccId, pct) =>
                    startTransition(async () => {
                      const res = await addCostCenterLineAction(
                        invoice.id,
                        ccId,
                        pct
                      );
                      if (!res.ok) {
        toast.error(res.error);
        return;
      }
                      apply(res.data);
                    })
                  }
                />
                {invoice.project_id && (
                  <MaterialsPicker
                    materials={materials}
                    identifierFields={identifierFields}
                    pending={pending}
                    onBill={billMaterial}
                  />
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Totals panel */}
        <div className="space-y-3">
          <p className="nx-eyebrow-soft">Totals</p>
          <Card className="bg-card space-y-3 p-4 shadow-sm">
            <Row label="Subtotal" value={formatCurrency(Number(invoice.subtotal))} strong />

            {/* Tax */}
            <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">Tax rate</span>
                <div className="flex items-center gap-1">
                  <NumberField
                    value={Number(invoice.tax_rate)}
                    disabled={!editable || invoice.tax_exempt}
                    onCommit={(v) => handleTaxRate(v)}
                    suffix="%"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">Tax exempt</span>
                <Button
                  type="button"
                  size="xs"
                  variant={invoice.tax_exempt ? "secondary" : "outline"}
                  disabled={!editable}
                  onClick={() => handleTaxExempt(!invoice.tax_exempt)}
                >
                  {invoice.tax_exempt ? "Exempt" : "Taxed"}
                </Button>
              </div>
              <Row
                label="Tax"
                value={formatCurrency(Number(invoice.tax_amount))}
              />
            </div>

            {/* Holdback */}
            <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  Holdback rate
                </span>
                <div className="flex items-center gap-1">
                  {editable && Number(invoice.holdback_rate) !== 10 && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => handleHoldback(10)}
                    >
                      10%
                    </Button>
                  )}
                  <NumberField
                    value={Number(invoice.holdback_rate)}
                    disabled={!editable}
                    onCommit={(v) => handleHoldback(v)}
                    suffix="%"
                  />
                </div>
              </div>
              <Row
                label="Holdback retained"
                value={`− ${formatCurrency(Number(invoice.holdback_amount))}`}
              />
            </div>

            {/* Totals */}
            <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
              <Row label="Total" value={formatCurrency(Number(invoice.total))} />
              <Row
                label="Amount due now"
                value={formatCurrency(amountDue)}
                strong
              />
              {/* FIN-2 — derived from the ledger, shown once anything is paid. */}
              {paidTotal > 0 && (
                <>
                  <Row label="Paid" value={`− ${formatCurrency(paidTotal)}`} />
                  <Row
                    label="Balance due"
                    value={`${formatCurrency(balance)} of ${formatCurrency(amountDue)}`}
                    strong
                  />
                </>
              )}
            </div>
          </Card>

          {/* FIN-2 — payments ledger */}
          {!isDraft && (
            <Card className="bg-card space-y-3 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="nx-eyebrow-soft">Payments</p>
                {canTakePayment && (
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => setPayOpen(true)}
                    disabled={pending}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Record payment
                  </Button>
                )}
              </div>

              {payments.length === 0 ? (
                <p className="text-muted-foreground text-[11px]">
                  No payments recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {payments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 py-2 text-xs"
                    >
                      <span className="text-muted-foreground w-20 shrink-0 tabular-nums">
                        {p.paid_at}
                      </span>
                      <span className="text-brand-charcoal min-w-0 flex-1 truncate">
                        {INVOICE_PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                        {p.reference && (
                          <span className="text-muted-foreground ml-1 font-mono text-[10px]">
                            {p.reference}
                          </span>
                        )}
                      </span>
                      <span className="text-brand-charcoal shrink-0 font-semibold tabular-nums">
                        {formatCurrency(Number(p.amount))}
                      </span>
                      {canEdit && invoice.status !== "void" && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePayment(p.id)}
                          disabled={pending}
                          className="text-muted-foreground shrink-0 hover:text-red-600"
                          aria-label="Remove payment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* Issue + status controls */}
          {canEdit && (
            <Card className="bg-card space-y-2 p-4 shadow-sm">
              {isDraft ? (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleIssue}
                  disabled={pending || lines.length === 0}
                >
                  Issue invoice
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* FIN-2 — "Mark paid" is now a payment: it opens the dialog
                      pre-filled with the full remaining balance. Paying in full
                      is just recording one payment. */}
                  {canTakePayment && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPayOpen(true)}
                      disabled={pending}
                    >
                      Mark paid
                    </Button>
                  )}
                  {invoice.status !== "void" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => handleStatus("void")}
                      disabled={pending}
                    >
                      Void
                    </Button>
                  )}
                  {/* Re-open applies to VOID only — a paid invoice is re-opened
                      by removing a payment, which re-derives its status. */}
                  {invoice.status === "void" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatus("sent")}
                      disabled={pending}
                    >
                      Re-open as sent
                    </Button>
                  )}
                </div>
              )}
              {isDraft && lines.length === 0 && (
                <p className="text-muted-foreground text-[11px]">
                  Add at least one line before issuing.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* FIN-2 — record-payment dialog */}
      <RecordPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        balance={balance}
        amountDue={amountDue}
        pending={pending}
        onSubmit={handleRecordPayment}
      />

      {/* FIN-2 — remove-payment confirm */}
      <Dialog
        open={confirmDeletePayment !== null}
        onOpenChange={(o) => !o && setConfirmDeletePayment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove payment?</DialogTitle>
            <DialogDescription>
              The payment is deleted from the ledger and the invoice status is
              re-derived from what remains.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeletePayment(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                confirmDeletePayment && handleDeletePayment(confirmDeletePayment)
              }
              disabled={pending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// FIN-2 — the record-payment form. Amount pre-fills with the full remaining
// balance (so "Mark paid" is one click through), date defaults to today, and
// the amount is capped client-side at the balance to match the server guard
// (no overpayment in v1).
function RecordPaymentDialog({
  open,
  onOpenChange,
  balance,
  amountDue,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balance: number;
  amountDue: number;
  pending: boolean;
  onSubmit: (input: {
    amount: number;
    method: DbInvoicePaymentMethod;
    paidAt: string;
    reference: string;
    notes: string;
  }) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<DbInvoicePaymentMethod>("cheque");
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // Re-prime the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setAmount(String(balance));
      setPaidAt(new Date().toISOString().slice(0, 10));
      setReference("");
      setNotes("");
    }
  }, [open, balance]);

  const parsed = toNum(amount);
  const invalid = !(parsed > 0) || parsed > balance + 0.005;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Balance due {formatCurrency(balance)} of {formatCurrency(amountDue)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">Amount</span>
            <Input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 text-sm tabular-nums"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">Method</span>
            <Select
              value={method}
              onValueChange={(v) =>
                setMethod((v ?? "cheque") as DbInvoicePaymentMethod)
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {INVOICE_PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">Date</span>
            <Input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="h-8 text-sm tabular-nums"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">
              Reference (cheque #, EFT ref)
            </span>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="h-8 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">Notes</span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 text-sm"
            />
          </label>
          {parsed > balance + 0.005 && (
            <p className="text-destructive text-[11px]">
              Payment can&rsquo;t exceed the remaining balance of{" "}
              {formatCurrency(balance)}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() =>
              onSubmit({ amount: parsed, method, paidAt, reference, notes })
            }
            disabled={pending || invalid || !paidAt}
          >
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? "text-brand-charcoal font-semibold tabular-nums"
            : "text-brand-charcoal tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

/** A compact numeric input that commits on blur / Enter only when changed. */
function NumberField({
  value,
  disabled,
  onCommit,
  suffix,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = toNum(text);
    if (n !== value) onCommit(n);
    else setText(String(value));
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={text}
        disabled={disabled}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-7 w-16 text-right text-xs tabular-nums"
      />
      {suffix && (
        <span className="text-muted-foreground w-3 text-xs">{suffix}</span>
      )}
    </div>
  );
}

function LineRow({
  line,
  editable,
  pending,
  onUpdate,
  onUnlink,
  onDelete,
}: {
  line: DbInvoiceLine;
  editable: boolean;
  pending: boolean;
  onUpdate: (
    lineId: string,
    patch: Parameters<typeof updateLineAction>[2]
  ) => void;
  onUnlink: (lineId: string) => void;
  onDelete: (lineId: string) => void;
}) {
  const [desc, setDesc] = useState(line.description);
  const [qty, setQty] = useState(String(line.quantity));
  const [price, setPrice] = useState(String(line.unit_price));
  const [amount, setAmount] = useState(String(line.amount));

  // Re-sync when the persisted values change (e.g. amount after a qty edit, or
  // a recompute coming back from the server).
  useEffect(() => setDesc(line.description), [line.description]);
  useEffect(() => setQty(String(line.quantity)), [line.quantity]);
  useEffect(() => setPrice(String(line.unit_price)), [line.unit_price]);
  useEffect(() => setAmount(String(line.amount)), [line.amount]);

  const sourced = line.source_type === "cost_center";
  const isMaterial = line.source_type === "material";

  if (!editable) {
    return (
      <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <span className="text-brand-charcoal flex-1 truncate">
          {line.description || "—"}
          {sourced && line.source_pct != null && (
            <span className="text-muted-foreground ml-2 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              {Number(line.source_pct)}% draw
            </span>
          )}
          {isMaterial && (
            <span className="text-brand-navy ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
              material
            </span>
          )}
        </span>
        <span className="text-muted-foreground w-28 text-right text-xs tabular-nums">
          {Number(line.quantity)} × {formatCurrency(Number(line.unit_price))}
        </span>
        <span className="text-brand-charcoal w-24 text-right text-xs font-semibold tabular-nums">
          {formatCurrency(Number(line.amount))}
        </span>
      </li>
    );
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== line.description && onUpdate(line.id, { description: desc })}
          placeholder="Description"
          className="h-7 flex-1 text-xs"
        />
        {sourced && (
          <span className="text-muted-foreground shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            {line.source_pct != null ? `${Number(line.source_pct)}% draw` : "draw"}
          </span>
        )}
        {isMaterial && (
          <span className="text-brand-navy shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
            material
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-muted-foreground flex items-center gap-1 text-[11px]">
          Qty
          <Input
            value={qty}
            inputMode="decimal"
            onChange={(e) => setQty(e.target.value)}
            onBlur={() =>
              toNum(qty) !== Number(line.quantity) &&
              onUpdate(line.id, { quantity: toNum(qty) })
            }
            className="h-7 w-16 text-right text-xs tabular-nums"
          />
        </label>
        <label className="text-muted-foreground flex items-center gap-1 text-[11px]">
          Price
          <Input
            value={price}
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() =>
              toNum(price) !== Number(line.unit_price) &&
              onUpdate(line.id, { unit_price: toNum(price) })
            }
            className="h-7 w-20 text-right text-xs tabular-nums"
          />
        </label>
        <label className="text-muted-foreground ml-auto flex items-center gap-1 text-[11px]">
          Amount
          <Input
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() =>
              toNum(amount) !== Number(line.amount) &&
              onUpdate(line.id, { amount: toNum(amount) })
            }
            className="h-7 w-24 text-right text-xs font-semibold tabular-nums"
          />
        </label>
        {(sourced || isMaterial) && (
          <button
            type="button"
            onClick={() => onUnlink(line.id)}
            disabled={pending}
            className="text-muted-foreground hover:text-brand-charcoal"
            aria-label="Unlink line"
            title={isMaterial ? "Unlink material (make manual)" : "Unlink from cost center"}
          >
            <Unlink className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(line.id)}
          disabled={pending}
          className="text-muted-foreground hover:text-red-600"
          aria-label="Delete line"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function CostCenterPicker({
  options,
  pending,
  onAdd,
}: {
  options: InvoiceDetail["costCenters"];
  pending: boolean;
  onAdd: (costCenterId: string, pct: number) => void;
}) {
  const [ccId, setCcId] = useState<string>("");
  const [pct, setPct] = useState("100");

  if (options.length === 0) {
    return (
      <p className="text-muted-foreground text-[11px]">
        This project has no cost centers to pull from.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={ccId} onValueChange={(v) => setCcId(v ?? "")}>
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue placeholder="Pull cost center…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((cc) => (
            <SelectItem key={cc.id} value={cc.id} className="text-xs">
              {cc.name} · {formatCurrency(Number(cc.contract_value))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="text-muted-foreground flex items-center gap-1 text-[11px]">
        <Input
          value={pct}
          inputMode="decimal"
          onChange={(e) => setPct(e.target.value)}
          className="h-8 w-16 text-right text-xs tabular-nums"
        />
        %
      </label>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          if (!ccId) return;
          const p = toNum(pct);
          onAdd(ccId, p > 0 ? p : 100);
          setCcId("");
          setPct("100");
        }}
        disabled={pending || !ccId}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Pull
      </Button>
    </div>
  );
}

// MATERIALS-1 — "Pull materials" picker: a project's billable parts grouped by
// cost-center, each with editable qty + price and a Bill button. Fully-billed
// groups grey out (no silent double-billing).
function MaterialsPicker({
  materials,
  identifierFields,
  pending,
  onBill,
}: {
  materials: BillableMaterialGroup[];
  identifierFields: string[];
  pending: boolean;
  onBill: (g: BillableMaterialGroup, qty: number, unitPrice: number) => void;
}) {
  if (materials.length === 0) {
    return (
      <p className="text-muted-foreground border-t border-[var(--border)] pt-2 text-[11px]">
        No project materials to bill yet (parts assigned/installed on this
        project&rsquo;s cost-centers appear here).
      </p>
    );
  }

  // Group by cost-center for display.
  const byCc = new Map<string, BillableMaterialGroup[]>();
  for (const g of materials) {
    const arr = byCc.get(g.cost_center_label) ?? [];
    arr.push(g);
    byCc.set(g.cost_center_label, arr);
  }

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-2">
      <p className="text-muted-foreground text-[11px] font-medium">Pull materials</p>
      {[...byCc.entries()].map(([cc, groups]) => (
        <div key={cc} className="space-y-1">
          <p className="text-brand-navy text-[10px] font-semibold uppercase tracking-wide">
            {cc}
          </p>
          {groups.map((g) => (
            <MaterialRow
              key={`${g.product_id}-${g.cost_center_id}`}
              group={g}
              identifierFields={identifierFields}
              pending={pending}
              onBill={onBill}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function MaterialRow({
  group,
  identifierFields,
  pending,
  onBill,
}: {
  group: BillableMaterialGroup;
  identifierFields: string[];
  pending: boolean;
  onBill: (g: BillableMaterialGroup, qty: number, unitPrice: number) => void;
}) {
  const [qty, setQty] = useState(String(group.remaining_qty));
  const [price, setPrice] = useState(String(group.suggested_unit_price));
  useEffect(
    () => setQty(String(group.remaining_qty)),
    [group.remaining_qty]
  );

  const preview = composeIdentifier(
    {
      master_part_number: group.master_part_number,
      sku: group.part_number,
      name: group.name,
      description: group.description,
    },
    identifierFields
  );
  const fullyBilled = group.remaining_qty <= 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1.5",
        fullyBilled && "opacity-60"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-brand-charcoal truncate text-xs">{preview}</p>
        <p className="text-muted-foreground text-[10px] tabular-nums">
          {group.qty} on job · {group.billed_qty} billed
          {group.is_serialized ? " · serialized" : ""}
        </p>
      </div>
      {fullyBilled ? (
        <span className="text-muted-foreground rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
          Billed
        </span>
      ) : (
        <>
          <label className="text-muted-foreground flex items-center gap-1 text-[10px]">
            Qty
            <Input
              value={qty}
              inputMode="decimal"
              disabled={group.is_serialized}
              onChange={(e) => setQty(e.target.value)}
              className="h-7 w-14 text-right text-xs tabular-nums"
            />
          </label>
          <label className="text-muted-foreground flex items-center gap-1 text-[10px]">
            Price
            <Input
              value={price}
              inputMode="decimal"
              onChange={(e) => setPrice(e.target.value)}
              className="h-7 w-20 text-right text-xs tabular-nums"
            />
          </label>
          <Button
            type="button"
            size="xs"
            onClick={() => {
              const q = group.is_serialized
                ? group.remaining_qty
                : Math.min(toNum(qty) || group.remaining_qty, group.remaining_qty);
              if (q < 1) return;
              onBill(group, q, toNum(price));
            }}
            disabled={pending}
          >
            Bill
          </Button>
        </>
      )}
    </div>
  );
}
