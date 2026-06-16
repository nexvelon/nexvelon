"use client";

// PART-DETAIL B2 (item 14) — manual stock-add dialog. Creates an in-stock row
// WITHOUT a PO. Fields: location, quantity, unit (purchase) cost, and an
// OPTIONAL acquired date (blank allowed — NOT force-stamped to today, unlike
// ReceiveStockForm). Mirrors ReceiveStockForm's layout + location datalist.

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { listInventoryVocabAction } from "@/app/(app)/settings/inventory-vocab-actions";
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
import { addManualStockAction } from "@/app/(app)/inventory/actions";

export function AddStockForm({
  productId,
  isSerialized = false,
  packSize = null,
  trackIndividual = false,
  unitOfMeasure = "Each",
  open,
  onOpenChange,
  onAdded,
}: {
  productId: string;
  // SERIAL-1: serialized parts intake one row per unit, each requiring a serial.
  isSerialized?: boolean;
  // PART-FIX-1: pack info — one pack expands into pack_size rows when tracking
  // individual units.
  packSize?: number | null;
  trackIndividual?: boolean;
  unitOfMeasure?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const packExpands =
    trackIndividual && unitOfMeasure.toLowerCase() !== "each" && (packSize ?? 0) > 0;
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [location, setLocation] = useState("");
  // Optional — blank by default; not force-stamped to today.
  const [acquiredAt, setAcquiredAt] = useState("");
  const [serials, setSerials] = useState("");
  const [pending, startTransition] = useTransition();

  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    listInventoryVocabAction("storage_location")
      .then((res) => {
        if (active && res.ok && res.data.length) {
          setLocationOptions(res.data.map((r) => r.name));
        }
      })
      .catch(() => {
        // input still works as free-text
      });
    return () => {
      active = false;
    };
  }, []);

  function reset() {
    setQuantity("1");
    setUnitCost("");
    setLocation("");
    setAcquiredAt("");
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
      toast.error("Purchase cost is required and must be zero or greater.");
      return;
    }

    // SERIAL-1 / PART-FIX-1: serialized parts require one serial per individual
    // unit. When a pack tracks individuals, that's qty × pack_size.
    const requiredSerials = packExpands ? qty * (packSize ?? 1) : qty;
    const serialList = isSerialized
      ? serials
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (isSerialized && serialList.length !== requiredSerials) {
      toast.error(
        `Enter exactly ${requiredSerials} serial number${requiredSerials === 1 ? "" : "s"}, one per line.`
      );
      return;
    }

    startTransition(async () => {
      const result = await addManualStockAction(productId, {
        quantity: qty,
        unit_cost: cost,
        location: location.trim() || null,
        acquired_at: acquiredAt || null,
        serials: isSerialized ? serialList : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added ${qty} unit${qty === 1 ? "" : "s"} to stock`);
      reset();
      onAdded();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add stock</DialogTitle>
          <DialogDescription>
            Add stock directly, with no purchase order. The acquired date is
            optional — leave it blank if unknown.
            {packExpands
              ? ` This part tracks individual units — each ${unitOfMeasure.toLowerCase()} expands into ${packSize} stock units.`
              : isSerialized
                ? " This is a serialized part — add one serial per unit."
                : ""}
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
                Purchase cost<span className="text-red-500"> *</span>
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
                list="add-stock-location-options"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main Warehouse"
              />
              <datalist id="add-stock-location-options">
                {locationOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Acquired (optional)</Label>
              <Input
                type="date"
                value={acquiredAt}
                onChange={(e) => setAcquiredAt(e.target.value)}
              />
            </div>
          </div>

          {isSerialized && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                Serial numbers (one per line)<span className="text-red-500"> *</span>
              </Label>
              <Textarea
                value={serials}
                onChange={(e) => setSerials(e.target.value)}
                rows={3}
                placeholder={"SN-0001\nSN-0002\nSN-0003"}
              />
              <p className="text-muted-foreground text-[11px] leading-snug">
                One serial per unit — must match the quantity above. Each becomes
                its own tracked unit.
              </p>
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
              {pending ? "Adding…" : "Add stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
