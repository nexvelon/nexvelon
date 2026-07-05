"use client";

// INV-4 — create an RMA: pick a vendor + reason, then add returnable stock
// units (search by serial / SKU / name). Submits to createRmaAction, which
// snapshots the lines and stamps the units rma_pending.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { RMA_REASON_OPTIONS } from "@/lib/rma-labels";
import {
  createRmaAction,
  searchReturnableStockAction,
} from "@/app/(app)/rmas/actions";
import type { ReturnableStockRow } from "@/lib/api/rmas";
import type { DbVendor, DbRmaReason } from "@/lib/types/database";

interface PickedLine {
  row: ReturnableStockRow;
  quantity: number;
}

export function CreateRmaDialog({
  open,
  onOpenChange,
  vendors,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: DbVendor[];
  onCreated: (rmaId: string) => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [reason, setReason] = useState<DbRmaReason>("defective");
  const [reasonDetail, setReasonDetail] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ReturnableStockRow[]>([]);
  const [picked, setPicked] = useState<Record<string, PickedLine>>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setVendorId("");
      setReason("defective");
      setReasonDetail("");
      setNotes("");
      setSearch("");
      setResults([]);
      setPicked({});
    }
  }, [open]);

  // Debounced returnable-stock search.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const q = search.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await searchReturnableStockAction(q);
      setResults(res.ok ? res.data : []);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const pickedList = useMemo(() => Object.values(picked), [picked]);
  const total = useMemo(
    () => pickedList.reduce((s, p) => s + p.quantity * p.row.unitCost, 0),
    [pickedList]
  );

  function addLine(row: ReturnableStockRow) {
    setPicked((p) =>
      p[row.stockId] ? p : { ...p, [row.stockId]: { row, quantity: 1 } }
    );
  }
  function removeLine(stockId: string) {
    setPicked((p) => {
      const next = { ...p };
      delete next[stockId];
      return next;
    });
  }
  function setQty(stockId: string, qty: number) {
    setPicked((p) => {
      const line = p[stockId];
      if (!line) return p;
      const clamped = Math.max(1, Math.min(qty, line.row.quantity));
      return { ...p, [stockId]: { ...line, quantity: clamped } };
    });
  }

  const canSubmit = vendorId !== "" && pickedList.length > 0 && !pending;

  function handleSubmit() {
    if (!canSubmit) {
      if (!vendorId) toast.error("Pick a vendor.");
      else if (pickedList.length === 0) toast.error("Add at least one stock unit.");
      return;
    }
    startTransition(async () => {
      const res = await createRmaAction({
        vendorId,
        reason,
        reasonDetail: reasonDetail.trim() || null,
        notes: notes.trim() || null,
        stockLines: pickedList.map((p) => ({
          stockId: p.row.stockId,
          quantity: p.quantity,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Created ${res.data.rmaNumber}`);
      onCreated(res.data.rmaId);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create RMA</DialogTitle>
          <DialogDescription>
            Authorize a return to a vendor. Added units are stamped as
            return-pending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Vendor</Label>
              <Select value={vendorId} onValueChange={(v) => setVendorId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vendor…" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as DbRmaReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RMA_REASON_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reason detail (optional)</Label>
            <Textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              rows={2}
              placeholder="What's wrong / context for the vendor…"
            />
          </div>

          {/* Stock picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Add stock units</Label>
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by serial, SKU, or product name…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            {results.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)]">
                <ul className="divide-y divide-[var(--border)]">
                  {results.map((r) => (
                    <li key={r.stockId}>
                      <button
                        type="button"
                        onClick={() => addLine(r)}
                        disabled={!!picked[r.stockId]}
                        className="hover:bg-muted flex w-full items-center justify-between px-3 py-1.5 text-left text-xs disabled:opacity-40"
                      >
                        <span className="flex flex-col">
                          <span className="text-brand-charcoal">
                            <span className="text-brand-navy font-mono">{r.sku}</span>{" "}
                            · {r.productName}
                          </span>
                          <span className="text-muted-foreground">
                            {r.serial ? `SN ${r.serial} · ` : ""}
                            {r.quantity} avail · {formatCurrency(r.unitCost)}
                          </span>
                        </span>
                        <span className="text-brand-gold text-[11px] font-medium">
                          {picked[r.stockId] ? "Added" : "Add"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Picked lines */}
          {pickedList.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Return lines ({pickedList.length})
              </Label>
              <div className="rounded-md border border-[var(--border)]">
                {pickedList.map((p) => (
                  <div
                    key={p.row.stockId}
                    className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-charcoal truncate text-xs">
                        <span className="text-brand-navy font-mono">{p.row.sku}</span>{" "}
                        · {p.row.productName}
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        {p.row.serial ? `SN ${p.row.serial} · ` : ""}
                        {formatCurrency(p.row.unitCost)} ea
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={p.row.quantity}
                      value={p.quantity}
                      onChange={(e) =>
                        setQty(p.row.stockId, parseInt(e.target.value, 10) || 1)
                      }
                      className="h-7 w-16 text-right text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(p.row.stockId)}
                      className="text-muted-foreground hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground text-xs">Total return value</span>
                  <span className="text-brand-charcoal text-xs font-semibold tabular-nums">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>
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
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {pending ? "Creating…" : "Create RMA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
