"use client";

// INV-4 — RMA detail + lifecycle actions. Buttons are gated by BOTH the user's
// inventory:edit permission AND the current status (the server actions re-check
// the transition, so the UI is a convenience, not the guard).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  RMA_REASON_LABEL,
  RMA_STATUS_LABEL,
  RMA_STATUS_TONE,
  RMA_CARRIER_OPTIONS,
} from "@/lib/rma-labels";
import {
  previewRmaPdfAction,
  sendRmaToVendorAction,
  markRmaShippedAction,
  markRmaCreditedAction,
  cancelRmaAction,
  closeRmaAction,
} from "@/app/(app)/rmas/actions";
import type {
  DbRma,
  DbRmaLine,
  DbRmaStatus,
  DbRmaReason,
} from "@/lib/types/database";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return iso;
  }
}

export function RmaDetailClient({
  header,
  lines,
}: {
  header: DbRma;
  lines: DbRmaLine[];
}) {
  const router = useRouter();
  const { role } = useRole();
  const canManage = hasPermission(role, "inventory", "edit");
  const canView = hasPermission(role, "inventory", "view");
  const [pending, startTransition] = useTransition();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const [shipOpen, setShipOpen] = useState(false);
  const [carrier, setCarrier] = useState("ups");
  const [trackingNumber, setTrackingNumber] = useState("");

  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(
    String(header.credit_expected_amount ?? "")
  );

  const status = header.status as DbRmaStatus;
  const total = lines.reduce(
    (s, l) => s + Number(l.quantity) * Number(l.unit_cost),
    0
  );

  function refresh() {
    router.refresh();
  }

  function preview() {
    startTransition(async () => {
      const res = await previewRmaPdfAction(header.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPdfUrl(res.data.signedUrl);
      if (res.data.signedUrl) window.open(res.data.signedUrl, "_blank");
    });
  }

  function send() {
    startTransition(async () => {
      const res = await sendRmaToVendorAction(header.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data.warning) toast.warning("Sent with warnings", { description: res.data.warning });
      else toast.success("RMA sent to vendor");
      if (res.data.signedUrl) setPdfUrl(res.data.signedUrl);
      refresh();
    });
  }

  function confirmShip() {
    startTransition(async () => {
      const res = await markRmaShippedAction(
        header.id,
        carrier || null,
        trackingNumber.trim() || null
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Marked shipped");
      setShipOpen(false);
      refresh();
    });
  }

  function confirmCredit() {
    const amount = parseFloat(creditAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid credit amount.");
      return;
    }
    startTransition(async () => {
      const res = await markRmaCreditedAction(header.id, amount);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Credit recorded — units retired");
      setCreditOpen(false);
      refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelRmaAction(header.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("RMA cancelled");
      refresh();
    });
  }

  function close() {
    startTransition(async () => {
      const res = await closeRmaAction(header.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("RMA closed");
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/rmas" className="text-muted-foreground text-xs hover:underline">
        ← Back to RMAs
      </Link>

      <PageHeader
        eyebrow={header.vendor_name}
        title={header.rma_number}
        description={`${RMA_REASON_LABEL[header.reason as DbRmaReason] ?? header.reason}${
          header.reason_detail ? ` — ${header.reason_detail}` : ""
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded px-2 py-1 text-[11px] font-medium uppercase tracking-wide",
                RMA_STATUS_TONE[status]
              )}
            >
              {RMA_STATUS_LABEL[status] ?? status}
            </span>
            {canView && (
              <Button type="button" variant="outline" onClick={preview} disabled={pending}>
                Preview PDF
              </Button>
            )}
            {canManage && status === "draft" && (
              <Button type="button" onClick={send} disabled={pending}>
                Send to Vendor
              </Button>
            )}
            {canManage && (status === "sent" || status === "approved") && (
              <Button type="button" onClick={() => setShipOpen(true)} disabled={pending}>
                Mark Shipped
              </Button>
            )}
            {canManage && status === "shipped" && (
              <Button type="button" onClick={() => setCreditOpen(true)} disabled={pending}>
                Mark Credited
              </Button>
            )}
            {canManage && status === "received_credit" && (
              <Button type="button" onClick={close} disabled={pending}>
                Close
              </Button>
            )}
            {canManage && (status === "draft" || status === "sent") && (
              <Button
                type="button"
                variant="outline"
                onClick={cancel}
                disabled={pending}
                className="text-red-600"
              >
                Cancel RMA
              </Button>
            )}
          </div>
        }
      />

      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-navy inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open RMA PDF
        </a>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Field label="Vendor" value={header.vendor_name} />
        <Field label="Created by" value={header.created_by_name ?? "—"} />
        <Field label="Created" value={fmt(header.created_at)} />
        <Field
          label="Expected credit"
          value={
            header.credit_expected_amount != null
              ? formatCurrency(Number(header.credit_expected_amount))
              : "—"
          }
        />
        {header.sent_at && <Field label="Sent" value={fmt(header.sent_at)} />}
        {header.sent_to_email && <Field label="Sent to" value={header.sent_to_email} />}
        {header.shipped_at && <Field label="Shipped" value={fmt(header.shipped_at)} />}
        {(header.tracking_carrier || header.tracking_number) && (
          <Field
            label="Tracking"
            value={[header.tracking_carrier?.toUpperCase(), header.tracking_number]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
        {header.credit_received_amount != null && (
          <Field
            label="Credit received"
            value={formatCurrency(Number(header.credit_received_amount))}
          />
        )}
        {header.closed_at && <Field label="Closed" value={fmt(header.closed_at)} />}
      </div>

      {/* Lines */}
      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">#</TableHead>
              <TableHead className="text-[11px] uppercase">SKU</TableHead>
              <TableHead className="text-[11px] uppercase">Product</TableHead>
              <TableHead className="text-[11px] uppercase">Serial</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Qty</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Unit cost</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-muted-foreground text-xs">{l.line_no}</TableCell>
                <TableCell className="text-brand-navy font-mono text-xs">{l.product_sku}</TableCell>
                <TableCell className="text-brand-charcoal text-xs">{l.product_name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {l.serial_number || "—"}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{l.quantity}</TableCell>
                <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                  {formatCurrency(Number(l.unit_cost))}
                </TableCell>
                <TableCell className="text-brand-charcoal text-right text-xs font-semibold tabular-nums">
                  {formatCurrency(Number(l.quantity) * Number(l.unit_cost))}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={6} className="text-right text-xs font-medium">
                Total return value
              </TableCell>
              <TableCell className="text-brand-navy text-right text-sm font-bold tabular-nums">
                {formatCurrency(total)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {header.notes && (
        <Card className="bg-card p-4 shadow-sm">
          <p className="text-muted-foreground mb-1 text-[11px] uppercase tracking-wide">Notes</p>
          <p className="text-brand-charcoal text-sm">{header.notes}</p>
        </Card>
      )}

      {/* Ship dialog */}
      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark shipped</DialogTitle>
            <DialogDescription>Record the return shipment tracking.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Carrier</Label>
              <Select value={carrier} onValueChange={(v) => setCarrier(v ?? "ups")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RMA_CARRIER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tracking number (optional)</Label>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="1Z…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShipOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmShip} disabled={pending}>
              {pending ? "Saving…" : "Mark Shipped"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit dialog */}
      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark credited</DialogTitle>
            <DialogDescription>
              Record the credit received. The returned units will be retired from inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Credit amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreditOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmCredit} disabled={pending}>
              {pending ? "Saving…" : "Record Credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</p>
      <p className="text-brand-charcoal text-sm">{value}</p>
    </div>
  );
}
