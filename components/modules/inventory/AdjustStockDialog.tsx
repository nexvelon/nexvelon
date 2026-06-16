"use client";

// PART-FIX-1 — manually correct a stock row's on-hand with a required reason.
// The change is logged to the Movement History as an 'adjustment' (+/− delta).
// Serialized rows are qty 1 — only setting 0 (to retire) is allowed.

import { useEffect, useState, useTransition } from "react";
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
import { adjustStockQuantityAction } from "@/app/(app)/inventory/movement-actions";
import type { DbInventoryStock } from "@/lib/types/database";

export function AdjustStockDialog({
  productId,
  unit,
  serialized,
  open,
  onOpenChange,
  onDone,
}: {
  productId: string;
  unit: DbInventoryStock | null;
  serialized: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open && unit) {
      setNewQty(String(unit.quantity));
      setReason("");
    }
  }, [open, unit]);

  if (!unit) return null;

  const current = Number(unit.quantity);
  const next = Number(newQty);
  const validQty = Number.isInteger(next) && next >= 0;
  const delta = validQty ? next - current : 0;

  function handleConfirm() {
    if (!unit) return;
    if (!validQty) {
      toast.error("Enter a whole number of 0 or more.");
      return;
    }
    if (next === current) {
      toast.error("New quantity matches the current quantity.");
      return;
    }
    if (serialized && next !== 0) {
      toast.error("A serialized unit can only be adjusted to 0 (retire it).");
      return;
    }
    if (reason.trim() === "") {
      toast.error("A reason is required.");
      return;
    }
    startTransition(async () => {
      const res = await adjustStockQuantityAction(
        productId,
        unit.id,
        next,
        reason.trim()
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Adjusted ${res.data.delta > 0 ? "+" : ""}${res.data.delta}`
      );
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust quantity</DialogTitle>
          <DialogDescription>
            Correct this row&rsquo;s on-hand. The change is logged with your name
            and reason on the Movement History.
            {serialized
              ? " This is a serialized unit — it can only be set to 0 (retired)."
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Current qty</Label>
            <Input value={current} disabled className="tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              New qty<span className="text-red-500"> *</span>
            </Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="tabular-nums"
            />
          </div>
        </div>
        {validQty && delta !== 0 && (
          <p className="text-muted-foreground text-xs">
            Change:{" "}
            <span className="text-brand-charcoal font-semibold tabular-nums">
              {delta > 0 ? `+${delta}` : delta}
            </span>
          </p>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">
            Reason<span className="text-red-500"> *</span>
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. physical count correction"
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
          <Button type="button" onClick={handleConfirm} disabled={pending}>
            {pending ? "Adjusting…" : "Adjust"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
