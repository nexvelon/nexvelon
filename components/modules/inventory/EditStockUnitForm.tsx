"use client";

// Chunk C-3 — edit a single stock unit/lot. Mirrors ReceiveStockForm's dialog
// (location datalist sourced from the managed storage_location vocab). Pre-fills
// the unit's current values and saves via updateStockUnitAction.
//
// Serialized products: quantity is locked at 1 (read-only). Non-serialized /
// bulk: quantity is editable and must be > 0. Editing a unit's cost does NOT
// retroactively change any quote/job it's already on — those snapshot at
// add-time (§2.2); nothing here propagates.

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
import { updateStockUnitAction } from "@/app/(app)/inventory/actions";
import type {
  DbInventoryStock,
  DbInventoryStockUpdate,
  InventoryTrackingMode,
} from "@/lib/types/database";

export function EditStockUnitForm({
  productId,
  trackingMode,
  unit,
  open,
  onOpenChange,
  onSaved,
}: {
  productId: string;
  trackingMode: InventoryTrackingMode;
  unit: DbInventoryStock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isSerialized = trackingMode === "serialized";

  const [serialNumber, setSerialNumber] = useState(unit.serial_number ?? "");
  const [unitCost, setUnitCost] = useState(String(unit.unit_cost));
  const [quantity, setQuantity] = useState(String(unit.quantity));
  const [location, setLocation] = useState(unit.location ?? "");
  const [poNumber, setPoNumber] = useState(unit.po_number ?? "");
  const [supplier, setSupplier] = useState(unit.supplier ?? "");
  const [acquiredAt, setAcquiredAt] = useState(unit.acquired_at ?? "");
  const [notes, setNotes] = useState(unit.notes ?? "");
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cost = Number(unitCost);
    if (unitCost.trim() === "" || !Number.isFinite(cost) || cost < 0) {
      toast.error("Unit cost is required and must be zero or greater.");
      return;
    }

    let qty = 1;
    if (!isSerialized) {
      qty = Number(quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        toast.error("Quantity must be a whole number of 1 or more.");
        return;
      }
    }

    const patch: DbInventoryStockUpdate = {
      serial_number: serialNumber.trim() || null,
      unit_cost: cost,
      quantity: qty,
      location: location.trim() || null,
      po_number: poNumber.trim() || null,
      supplier: supplier.trim() || null,
      acquired_at: acquiredAt || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = await updateStockUnitAction(unit.id, productId, patch);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Stock unit updated");
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit stock unit</DialogTitle>
          <DialogDescription>
            Correct this unit&rsquo;s details. Cost changes do not affect quotes
            or jobs it&rsquo;s already on.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Serial number</Label>
              <Input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder={isSerialized ? "SN-0001" : "—"}
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
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={isSerialized ? "1" : quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={isSerialized}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input
                list="edit-location-options"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Main Warehouse"
              />
              <datalist id="edit-location-options">
                {locationOptions.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">PO #</Label>
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. PO-2026-0042"
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

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
