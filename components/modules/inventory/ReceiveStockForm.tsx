"use client";

// INV-2d — receive-stock dialog. Adapts to the product's tracking_mode:
//   - SERIALIZED: quantity → N qty-1 units; optional serials (one per line)
//     map 1:1 to the first N units (mismatch warns but proceeds).
//   - BULK: quantity → ONE lot row of qty N (serials hidden).
// Controlled Dialog (open/onOpenChange owned by the detail page), mirroring
// ImportProductsButton's Dialog usage.

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { receiveStockAction } from "@/app/(app)/inventory/actions";
import type { InventoryTrackingMode } from "@/lib/types/database";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReceiveStockForm({
  productId,
  trackingMode,
  open,
  onOpenChange,
  onReceived,
}: {
  productId: string;
  trackingMode: InventoryTrackingMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceived: () => void;
}) {
  const isSerialized = trackingMode === "serialized";

  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [location, setLocation] = useState("");
  const [supplier, setSupplier] = useState("");
  const [acquiredAt, setAcquiredAt] = useState(todayIso());
  const [serials, setSerials] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setQuantity("1");
    setUnitCost("");
    setLocation("");
    setSupplier("");
    setAcquiredAt(todayIso());
    setSerials("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      toast.error("Quantity must be a whole number of 1 or more.");
      return;
    }
    const cost = Number(unitCost);
    if (unitCost.trim() === "" || !Number.isFinite(cost) || cost < 0) {
      toast.error("Unit cost is required and must be zero or greater.");
      return;
    }

    const serialList = isSerialized
      ? serials
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    if (isSerialized && serialList.length > 0 && serialList.length !== qty) {
      toast.warning(
        `${serialList.length} serial${serialList.length === 1 ? "" : "s"} for ${qty} unit${
          qty === 1 ? "" : "s"
        } — the rest will be left blank.`
      );
    }

    startTransition(async () => {
      const result = await receiveStockAction(productId, {
        quantity: qty,
        unit_cost: cost,
        location: location.trim() || null,
        supplier: supplier.trim() || null,
        acquired_at: acquiredAt || null,
        serials: isSerialized ? serialList : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Received ${result.data.created} unit${result.data.created === 1 ? "" : "s"}`
      );
      reset();
      onReceived();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>
            {isSerialized
              ? "Creates one stock unit per quantity. Add serial numbers (one per line) to tag them."
              : "Creates a single bulk lot for the quantity received."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Quantity<span className="text-red-500"> *</span>
              </Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Unit cost<span className="text-red-500"> *</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main Warehouse"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier</Label>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Acquired</Label>
              <Input
                type="date"
                value={acquiredAt}
                onChange={(e) => setAcquiredAt(e.target.value)}
              />
            </div>
          </div>

          {isSerialized && (
            <div className="space-y-1.5">
              <Label className="text-xs">Serial numbers (optional, one per line)</Label>
              <Textarea
                value={serials}
                onChange={(e) => setSerials(e.target.value)}
                rows={3}
                placeholder={"SN-0001\nSN-0002\nSN-0003"}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Receiving…" : "Receive"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
