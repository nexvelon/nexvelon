"use client";

// FIN-5 — the AP surface. Deliberately shaped like the AR Invoices tab: a
// filterable list, a detail drawer with a payments ledger, and the same
// derive-status-from-payments behaviour. Bills are header-level in v1
// (subtotal / tax / total entered directly) — line-level match is FIN-5b.

import { useEffect, useMemo, useState, useTransition } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { Download } from "lucide-react";
import {
  listBillsAction,
  getBillByIdAction,
  createBillAction,
  voidBillAction,
  recordBillPaymentAction,
  deleteBillPaymentAction,
  getApAgingSummaryAction,
  getApAgingByVendorAction,
  exportApAgingCsvAction,
} from "@/app/(app)/financials/actions";
import type { ApAgingSummary, ApAgingVendorRow } from "@/lib/api/ap-aging";
import type { BillDetail, BillListRow } from "@/lib/api/vendor-bills";
import type { DbCashPaymentMethod } from "@/lib/types/database";
import {
  INVOICE_PAYMENT_METHODS,
  INVOICE_PAYMENT_METHOD_LABEL,
} from "@/lib/invoice-status";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BillsTabProps {
  from: string | null;
  to: string | null;
  canEdit: boolean;
  /** Vendors for the record-bill picker. */
  vendors: { id: string; name: string }[];
  /** Billable POs (issued or later) for the optional PO link. */
  purchaseOrders: { id: string; po_number: string; vendor_id: string }[];
}

const BILL_STATUSES = ["received", "partially_paid", "paid", "void"] as const;

const BILL_STATUS_LABEL: Record<string, string> = {
  received: "Received",
  partially_paid: "Partially paid",
  paid: "Paid",
  void: "Void",
};

const BILL_STATUS_TONE: Record<string, string> = {
  received: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy",
  partially_paid: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]",
  paid: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  void: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

function toNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BillsTab({
  from,
  to,
  canEdit,
  vendors,
  purchaseOrders,
}: BillsTabProps) {
  const [rows, setRows] = useState<BillListRow[]>([]);
  const [status, setStatus] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openBillId, setOpenBillId] = useState<string | null>(null);
  // FIN-6 — AP aging strip + by-vendor breakdown over the same open bills.
  const [aging, setAging] = useState<ApAgingSummary | null>(null);
  const [byVendor, setByVendor] = useState<ApAgingVendorRow[]>([]);
  const [showByVendor, setShowByVendor] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = () => {
    listBillsAction({
      status: status === "all" ? undefined : status,
      vendorId: vendorId === "all" ? undefined : vendorId,
      from,
      to,
    }).then((res) => {
      if (!res.ok) return setError(res.error);
      setError(null);
      setRows(res.data);
    });
  };
  useEffect(load, [status, vendorId, from, to]);

  // Aging is point-in-time over ALL open bills — it deliberately ignores the
  // list filters, which are a browsing tool, not an AP position.
  const loadAging = () => {
    Promise.all([getApAgingSummaryAction(), getApAgingByVendorAction()]).then(
      ([sum, vend]) => {
        if (sum.ok) setAging(sum.data);
        if (vend.ok) setByVendor(vend.data);
      }
    );
  };
  useEffect(loadAging, []);

  const handleExportAging = async () => {
    setExporting(true);
    try {
      const res = await exportApAgingCsvAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("AP aging exported");
    } finally {
      setExporting(false);
    }
  };

  const handleCreate = (input: {
    vendorId: string;
    purchaseOrderId: string | null;
    billNumber: string;
    billDate: string;
    dueDate: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    notes: string;
  }) =>
    startTransition(async () => {
      const res = await createBillAction({
        vendorId: input.vendorId,
        purchaseOrderId: input.purchaseOrderId,
        billNumber: input.billNumber,
        billDate: input.billDate,
        dueDate: input.dueDate || null,
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        total: input.total,
        notes: input.notes || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCreateOpen(false);
      load();
      loadAging();
      toast.success("Bill recorded");
    });

  if (error) {
    return (
      <Card className="p-6 text-center shadow-sm">
        <p className="text-muted-foreground text-sm">{error}</p>
      </Card>
    );
  }

  const outstanding = rows
    .filter((r) => r.status === "received" || r.status === "partially_paid")
    .reduce((sum, r) => sum + r.balance, 0);

  const AP_BUCKET_CARDS = [
    { key: "current" as const, label: "Current", tone: "text-[var(--brand-status-green)]" },
    { key: "d1_30" as const, label: "1–30 days", tone: "text-brand-navy" },
    { key: "d31_60" as const, label: "31–60 days", tone: "text-[#8a6d1f]" },
    { key: "d61_90" as const, label: "61–90 days", tone: "text-orange-600" },
    { key: "d90_plus" as const, label: "90+ days", tone: "text-red-600" },
  ];

  return (
    <div className="space-y-4">
      {/* FIN-6 — AP aging strip: what we owe, by how late it is. */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {AP_BUCKET_CARDS.map((b) => (
          <Card
            key={b.key}
            className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-muted-foreground font-serif text-[11px] tracking-wide">
              {b.label}
            </p>
            <p className={cn("text-xl font-semibold tabular-nums", b.tone)}>
              {aging ? formatCurrency(aging.buckets[b.key]) : "—"}
            </p>
          </Card>
        ))}
        <Card className="border-t-2 border-t-brand-navy p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px] tracking-wide">
            Total AP
          </p>
          <p className="text-brand-navy text-xl font-semibold tabular-nums">
            {aging ? formatCurrency(aging.total) : "—"}
          </p>
          <p className="text-muted-foreground text-[11px]">
            As of {aging?.asOf ?? "—"}
          </p>
        </Card>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant={showByVendor ? "secondary" : "outline"}
          onClick={() => setShowByVendor((v) => !v)}
        >
          {showByVendor ? "Hide by-vendor aging" : "Show by-vendor aging"}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={handleExportAging}
          disabled={exporting}
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Export AP aging (CSV)
        </Button>
        <p className="text-muted-foreground ml-auto text-[11px]">
          Aged by days past due (falling back to the bill date when no due date
          is set).
        </p>
      </div>

      {showByVendor && (
        <Card className="p-4 shadow-sm">
          <h3 className="text-brand-navy mb-3 font-serif text-lg">
            Aged payables by vendor
          </h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Vendor</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Current</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">1–30</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">31–60</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">61–90</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">90+</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Oldest</TableHead>
                  <TableHead className="text-[11px] uppercase" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {byVendor.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-muted-foreground py-6 text-center text-xs"
                    >
                      No open bills — nothing owed right now.
                    </TableCell>
                  </TableRow>
                )}
                {byVendor.map((v) => {
                  const seriouslyLate = v.d31_60 + v.d61_90 + v.d90_plus > 0;
                  return (
                    <TableRow
                      key={v.vendor_id}
                      className={cn(seriouslyLate && "border-l-2 border-l-red-500/70")}
                    >
                      <TableCell className="text-brand-charcoal text-xs">
                        {v.vendor_name}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {v.current ? formatCurrency(v.current) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {v.d1_30 ? formatCurrency(v.d1_30) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-[#8a6d1f]">
                        {v.d31_60 ? formatCurrency(v.d31_60) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-orange-600">
                        {v.d61_90 ? formatCurrency(v.d61_90) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums text-red-600">
                        {v.d90_plus ? formatCurrency(v.d90_plus) : "—"}
                      </TableCell>
                      <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                        {formatCurrency(v.total)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right text-xs tabular-nums",
                          v.oldest_days > 60 && "font-semibold text-red-600"
                        )}
                      >
                        {v.oldest_days > 0 ? `${v.oldest_days}d` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/financials/vendor-statement/${v.vendor_id}`}
                          className="text-brand-navy text-[11px] hover:underline"
                        >
                          Statement
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {BILL_STATUSES.map((st) => (
                <SelectItem key={st} value={st}>
                  {BILL_STATUS_LABEL[st]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vendorId} onValueChange={(v) => setVendorId(v ?? "all")}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground ml-auto text-[11px]">
            Outstanding in view:{" "}
            <span className="text-brand-charcoal font-semibold">
              {formatCurrency(outstanding)}
            </span>
          </p>
          {canEdit && (
            <Button
              type="button"
              size="xs"
              onClick={() => setCreateOpen(true)}
              disabled={pending}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Record bill
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Bill #</TableHead>
                <TableHead className="text-[11px] uppercase">Vendor</TableHead>
                <TableHead className="text-[11px] uppercase">PO</TableHead>
                <TableHead className="text-[11px] uppercase">Project</TableHead>
                <TableHead className="text-[11px] uppercase">Bill date</TableHead>
                <TableHead className="text-[11px] uppercase">Due</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground py-6 text-center text-xs"
                  >
                    No vendor bills match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const overdue =
                  (r.status === "received" || r.status === "partially_paid") &&
                  !!r.due_date &&
                  r.due_date < todayIso() &&
                  r.balance > 0;
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setOpenBillId(r.id)}
                  >
                    <TableCell className="font-mono text-xs">{r.bill_number}</TableCell>
                    <TableCell className="text-brand-charcoal text-xs">
                      {r.vendor_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.po_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.project_number ?? "—"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{r.bill_date}</TableCell>
                    <TableCell
                      className={cn(
                        "text-xs tabular-nums",
                        overdue && "font-semibold text-red-600"
                      )}
                    >
                      {r.due_date ?? "—"}
                      {overdue && " • overdue"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                          BILL_STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {BILL_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums">
                      {formatCurrency(Number(r.total))}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCurrency(r.balance)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CreateBillDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
        pending={pending}
        onSubmit={handleCreate}
      />

      <BillDetailDialog
        billId={openBillId}
        onClose={() => setOpenBillId(null)}
        canEdit={canEdit}
        onChanged={() => {
          load();
          loadAging();
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function CreateBillDialog({
  open,
  onOpenChange,
  vendors,
  purchaseOrders,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendors: { id: string; name: string }[];
  purchaseOrders: { id: string; po_number: string; vendor_id: string }[];
  pending: boolean;
  onSubmit: (input: {
    vendorId: string;
    purchaseOrderId: string | null;
    billNumber: string;
    billDate: string;
    dueDate: string;
    subtotal: number;
    taxAmount: number;
    total: number;
    notes: string;
  }) => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [poId, setPoId] = useState("none");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("");
  // Total auto-sums subtotal + tax until the operator overrides it — vendor
  // bills occasionally carry rounding the components don't reproduce.
  const [totalOverride, setTotalOverride] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setVendorId(vendors[0]?.id ?? "");
      setPoId("none");
      setBillNumber("");
      setBillDate(todayIso());
      setDueDate("");
      setSubtotal("");
      setTax("");
      setTotalOverride(null);
      setNotes("");
    }
  }, [open, vendors]);

  // Only that vendor's billable POs.
  const vendorPos = useMemo(
    () => purchaseOrders.filter((p) => p.vendor_id === vendorId),
    [purchaseOrders, vendorId]
  );

  const autoTotal = Math.round((toNum(subtotal) + toNum(tax)) * 100) / 100;
  const total = totalOverride === null ? autoTotal : toNum(totalOverride);
  const mismatch = Math.abs(toNum(subtotal) + toNum(tax) - total) > 0.005;
  const invalid = !vendorId || !billNumber.trim() || !billDate || mismatch;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record vendor bill</DialogTitle>
          <DialogDescription>
            The vendor&rsquo;s invoice to you. Linking a PO inherits its project
            and job attribution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">Vendor</span>
            <Select
              value={vendorId}
              onValueChange={(v) => {
                setVendorId(v ?? "");
                setPoId("none");
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">
              Purchase order (optional)
            </span>
            <Select value={poId} onValueChange={(v) => setPoId(v ?? "none")}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  No PO (standalone bill)
                </SelectItem>
                {vendorPos.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.po_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-muted-foreground text-[11px]">
                Vendor bill #
              </span>
              <Input
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                className="h-8 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-[11px]">Bill date</span>
              <Input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="h-8 text-sm tabular-nums"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-muted-foreground text-[11px]">Due date</span>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 text-sm tabular-nums"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-muted-foreground text-[11px]">Subtotal</span>
              <Input
                value={subtotal}
                inputMode="decimal"
                onChange={(e) => setSubtotal(e.target.value)}
                className="h-8 text-sm tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-[11px]">Tax</span>
              <Input
                value={tax}
                inputMode="decimal"
                onChange={(e) => setTax(e.target.value)}
                className="h-8 text-sm tabular-nums"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-muted-foreground text-[11px]">Total</span>
              <Input
                value={totalOverride === null ? String(autoTotal) : totalOverride}
                inputMode="decimal"
                onChange={(e) => setTotalOverride(e.target.value)}
                className="h-8 text-sm tabular-nums"
              />
            </label>
          </div>
          {mismatch && (
            <p className="text-destructive text-[11px]">
              Subtotal + tax must equal the total.
            </p>
          )}
          <p className="text-muted-foreground text-[11px]">
            Cost reporting uses the subtotal — tax is a pass-through.
          </p>

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
              onSubmit({
                vendorId,
                purchaseOrderId: poId === "none" ? null : poId,
                billNumber,
                billDate,
                dueDate,
                subtotal: toNum(subtotal),
                taxAmount: toNum(tax),
                total,
                notes,
              })
            }
            disabled={pending || invalid}
          >
            Record bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function BillDetailDialog({
  billId,
  onClose,
  canEdit,
  onChanged,
}: {
  billId: string | null;
  onClose: () => void;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const reload = (id: string) => {
    getBillByIdAction(id).then((res) => {
      if (res.ok) setDetail(res.data);
    });
  };

  useEffect(() => {
    if (!billId) {
      setDetail(null);
      return;
    }
    reload(billId);
  }, [billId]);

  const handlePay = (input: {
    amount: number;
    method: DbCashPaymentMethod;
    paidAt: string;
    reference: string;
    notes: string;
  }) =>
    startTransition(async () => {
      if (!billId) return;
      const res = await recordBillPaymentAction({
        billId,
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
      setPayOpen(false);
      reload(billId);
      onChanged();
      toast.success("Payment recorded");
    });

  const handleDeletePayment = (paymentId: string) =>
    startTransition(async () => {
      const res = await deleteBillPaymentAction(paymentId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (billId) reload(billId);
      onChanged();
      toast.success("Payment removed");
    });

  const handleVoid = () =>
    startTransition(async () => {
      if (!billId) return;
      const res = await voidBillAction(billId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      reload(billId);
      onChanged();
      toast.success("Bill voided");
    });

  const open = billId !== null;
  const bill = detail?.bill;
  const canPay =
    canEdit &&
    !!bill &&
    (bill.status === "received" || bill.status === "partially_paid") &&
    (detail?.balance ?? 0) > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bill ? `Bill ${bill.bill_number}` : "Bill"}
            </DialogTitle>
            <DialogDescription>
              {detail?.vendor_name ?? "—"}
              {detail?.po_number ? ` · PO ${detail.po_number}` : ""}
            </DialogDescription>
          </DialogHeader>

          {!detail ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5 text-xs">
                <Row label="Subtotal" value={formatCurrency(Number(detail.bill.subtotal))} />
                <Row label="Tax" value={formatCurrency(Number(detail.bill.tax_amount))} />
                <Row label="Total" value={formatCurrency(Number(detail.bill.total))} strong />
                {detail.paid > 0 && (
                  <Row label="Paid" value={`− ${formatCurrency(detail.paid)}`} />
                )}
                <Row label="Balance" value={formatCurrency(detail.balance)} strong />
              </div>

              <div className="space-y-2 border-t border-[var(--border)] pt-3">
                <div className="flex items-center justify-between">
                  <p className="nx-eyebrow-soft">Payments</p>
                  {canPay && (
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
                {detail.payments.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">
                    No payments recorded yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {detail.payments.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 py-2 text-xs">
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
                        {canEdit && detail.bill.status !== "void" && (
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(p.id)}
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
              </div>
            </div>
          )}

          <DialogFooter>
            {canEdit && bill && bill.status !== "void" && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleVoid}
                disabled={pending || (detail?.payments.length ?? 0) > 0}
                title={
                  (detail?.payments.length ?? 0) > 0
                    ? "Remove this bill's payments before voiding it"
                    : undefined
                }
              >
                Void bill
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecordBillPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        balance={detail?.balance ?? 0}
        pending={pending}
        onSubmit={handlePay}
      />
    </>
  );
}

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
    <div className="flex items-center justify-between gap-2">
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

function RecordBillPaymentDialog({
  open,
  onOpenChange,
  balance,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  balance: number;
  pending: boolean;
  onSubmit: (input: {
    amount: number;
    method: DbCashPaymentMethod;
    paidAt: string;
    reference: string;
    notes: string;
  }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DbCashPaymentMethod>("eft");
  const [paidAt, setPaidAt] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(String(balance));
      setMethod("eft");
      setPaidAt(todayIso());
      setReference("");
      setNotes("");
    }
  }, [open, balance]);

  const parsed = toNum(amount);
  const invalid = !(parsed > 0) || parsed > balance + 0.005 || !paidAt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay vendor bill</DialogTitle>
          <DialogDescription>
            Balance due {formatCurrency(balance)}.
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
              onValueChange={(v) => setMethod((v ?? "eft") as DbCashPaymentMethod)}
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
            <span className="text-muted-foreground text-[11px]">Reference</span>
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
              That&rsquo;s more than the {formatCurrency(balance)} outstanding.
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
            disabled={pending || invalid}
          >
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
