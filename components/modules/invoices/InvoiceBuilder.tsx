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
  updateLineAction,
  unlinkLineAction,
  deleteLineAction,
  setTaxRateAction,
  setTaxExemptAction,
  setHoldbackRateAction,
  issueInvoiceAction,
  setInvoiceStatusAction,
} from "@/app/(app)/invoices/actions";
import type { InvoiceDetail } from "@/lib/api/invoices";
import type { DbInvoice, DbInvoiceLine } from "@/lib/types/database";
import { OPCO_LABEL, STATUS_TONE } from "./shared";
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
  const [showPdf, setShowPdf] = useState(false);
  const [pending, startTransition] = useTransition();

  const isDraft = invoice.status === "draft";
  const editable = canEdit && isDraft;

  // Apply a mutation result (fresh header + lines) to local state.
  const apply = (res: { invoice: DbInvoice; lines: DbInvoiceLine[] }) => {
    setInvoice(res.invoice);
    setLines(res.lines);
  };

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

  const handleStatus = (status: "sent" | "paid" | "void") =>
    startTransition(async () => {
      const res = await setInvoiceStatusAction(invoice.id, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setInvoice(res.data);
      toast.success(`Marked ${status}`);
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
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide capitalize ${STATUS_TONE[invoice.status] ?? STATUS_TONE.draft}`}
            >
              {invoice.status}
            </span>
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
                value={formatCurrency(Number(invoice.amount_due))}
                strong
              />
            </div>
          </Card>

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
                  {invoice.status !== "paid" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatus("paid")}
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
                  {invoice.status !== "sent" && invoice.status !== "draft" && (
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
    </div>
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
        {sourced && (
          <button
            type="button"
            onClick={() => onUnlink(line.id)}
            disabled={pending}
            className="text-muted-foreground hover:text-brand-charcoal"
            aria-label="Unlink from cost center"
            title="Unlink from cost center"
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
