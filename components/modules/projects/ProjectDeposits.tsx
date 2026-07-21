"use client";

// FIN-4 — Deposits & Retainers card on the project. Shows collected / applied /
// available, lists each deposit with its derived remaining balance, and lets a
// financials:edit holder record a new one. A deposit can only be deleted while
// none of it has been applied — un-apply from the invoice first.

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  listProjectDepositsAction,
  recordDepositAction,
  deleteDepositAction,
} from "@/app/(app)/financials/actions";
import type { DepositWithRemaining, ProjectDepositBalance } from "@/lib/api/deposits";
import type { DbCashPaymentMethod } from "@/lib/types/database";
import {
  INVOICE_PAYMENT_METHODS,
  INVOICE_PAYMENT_METHOD_LABEL,
} from "@/lib/invoice-status";
import { formatCurrency } from "@/lib/format";

// Deposits are always cash. INVOICE_PAYMENT_METHODS is deliberately the
// cash-only list — 'deposit_applied' exists in the DB CHECK + the TS union but
// is never user-selectable, because it's a settlement the system writes, not a
// way money arrives.
const CASH_METHODS: readonly DbCashPaymentMethod[] = INVOICE_PAYMENT_METHODS;

function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function ProjectDeposits({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const [deposits, setDeposits] = useState<DepositWithRemaining[]>([]);
  const [balance, setBalance] = useState<ProjectDepositBalance | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    listProjectDepositsAction(projectId).then((res) => {
      if (!res.ok) return;
      setDeposits(res.data.deposits);
      setBalance(res.data.balance);
    });
  };
  useEffect(load, [projectId]);

  const handleRecord = (input: {
    amount: number;
    method: DbCashPaymentMethod;
    receivedAt: string;
    reference: string;
    notes: string;
  }) =>
    startTransition(async () => {
      const res = await recordDepositAction({
        projectId,
        amount: input.amount,
        method: input.method,
        receivedAt: input.receivedAt,
        reference: input.reference || null,
        notes: input.notes || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      load();
      toast.success("Deposit recorded");
    });

  const handleDelete = (depositId: string) =>
    startTransition(async () => {
      const res = await deleteDepositAction(depositId, projectId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirmDelete(null);
      load();
      toast.success("Deposit removed");
    });

  return (
    <Card className="bg-card space-y-4 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-lg">Deposits &amp; retainers</h3>
        {canEdit && (
          <Button type="button" size="xs" onClick={() => setOpen(true)} disabled={pending}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Record deposit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Figure label="Collected" value={balance?.collected ?? null} />
        <Figure label="Applied" value={balance?.applied ?? null} />
        <Figure label="Available" value={balance?.available ?? null} strong />
      </div>

      {deposits.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">
          No deposits recorded on this project.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {deposits.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2 text-xs">
              <span className="text-muted-foreground w-20 shrink-0 tabular-nums">
                {d.received_at}
              </span>
              <span className="text-brand-charcoal min-w-0 flex-1 truncate">
                {INVOICE_PAYMENT_METHOD_LABEL[d.method] ?? d.method}
                {d.reference && (
                  <span className="text-muted-foreground ml-1 font-mono text-[10px]">
                    {d.reference}
                  </span>
                )}
              </span>
              <span className="text-brand-charcoal shrink-0 font-semibold tabular-nums">
                {formatCurrency(Number(d.amount))}
              </span>
              <span
                className="text-muted-foreground w-24 shrink-0 text-right tabular-nums"
                title="Unapplied remainder"
              >
                {formatCurrency(d.remaining)} left
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(d.id)}
                  disabled={pending || d.applied > 0}
                  title={
                    d.applied > 0
                      ? "Un-apply this deposit from its invoices first"
                      : "Remove deposit"
                  }
                  className="text-muted-foreground shrink-0 hover:text-red-600 disabled:opacity-30"
                  aria-label="Remove deposit"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {balance && balance.available > 0 && (
        <p className="text-muted-foreground text-[11px]">
          {formatCurrency(balance.available)} available to apply against this
          project&rsquo;s invoices.
        </p>
      )}

      <RecordDepositDialog
        open={open}
        onOpenChange={setOpen}
        pending={pending}
        onSubmit={handleRecord}
      />

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove deposit?</DialogTitle>
            <DialogDescription>
              This deletes the deposit record. Only possible while none of it has
              been applied to an invoice.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              disabled={pending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Figure({
  label,
  value,
  strong,
}: {
  label: string;
  value: number | null;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] px-3 py-2">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">
        {label}
      </p>
      <p
        className={
          strong
            ? "text-brand-navy text-sm font-semibold tabular-nums"
            : "text-brand-charcoal text-sm tabular-nums"
        }
      >
        {value == null ? "—" : formatCurrency(value)}
      </p>
    </div>
  );
}

function RecordDepositDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSubmit: (input: {
    amount: number;
    method: DbCashPaymentMethod;
    receivedAt: string;
    reference: string;
    notes: string;
  }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DbCashPaymentMethod>("cheque");
  const [receivedAt, setReceivedAt] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setMethod("cheque");
      setReceivedAt(new Date().toISOString().slice(0, 10));
      setReference("");
      setNotes("");
    }
  }, [open]);

  const parsed = toNum(amount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record deposit</DialogTitle>
          <DialogDescription>
            Cash received up front on this project. It&rsquo;s held as credit
            until you apply it to an invoice.
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
              onValueChange={(v) => setMethod((v ?? "cheque") as DbCashPaymentMethod)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASH_METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {INVOICE_PAYMENT_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">Received</span>
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
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
              onSubmit({ amount: parsed, method, receivedAt, reference, notes })
            }
            disabled={pending || !(parsed > 0) || !receivedAt}
          >
            Record deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
