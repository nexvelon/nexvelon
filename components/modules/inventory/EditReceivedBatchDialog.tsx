"use client";

// FIX-BATCH-O — edit the received quantity of a single receive batch on the part
// detail. Three shapes, one dialog:
//   • serialized           → a checklist of each unit's serial; checked units
//                            are destroyed.
//   • single bulk row      → a qty input; reduces that row's quantity.
//   • non-serialized multi → a qty input; destroys (current − new) rows.
// Reduced units are DESTROYED (not returned to the PO) and the PO's received qty
// drops by the delta. Units already allocated/consumed/retired block the action.

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  deleteReceivedBatchRowsAction,
  setBatchRowQuantityAction,
} from "@/app/(app)/inventory/movement-actions";

export interface ReceivedBatchUnit {
  id: string;
  serial: string | null;
  quantity: number;
  inUse: boolean; // status !== in_stock OR custody !== in_stock
  statusLabel: string;
}

export interface ReceivedBatch {
  batchId: string;
  serialized: boolean;
  poNumber: string | null;
  totalQty: number;
  units: ReceivedBatchUnit[];
  // A single non-serialized bulk row (one row, qty > 1) → quantity is edited in
  // place; otherwise reduction destroys whole rows.
  isSingleBulk: boolean;
}

export function EditReceivedBatchDialog({
  productId,
  batch,
  open,
  onOpenChange,
  onDone,
}: {
  productId: string;
  batch: ReceivedBatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [newQty, setNewQty] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open && batch) {
      setNewQty(String(batch.totalQty));
      setChecked(new Set());
    }
  }, [open, batch]);

  const checkableUnits = useMemo(
    () => batch?.units.filter((u) => !u.inUse) ?? [],
    [batch]
  );

  if (!batch) return null;

  const current = batch.totalQty;

  function submitSerialized() {
    if (!batch) return;
    const ids = [...checked];
    if (ids.length === 0) {
      toast.error("Select at least one unit to remove.");
      return;
    }
    startTransition(async () => {
      const res = await deleteReceivedBatchRowsAction(productId, ids);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Removed ${res.data.destroyedRows} unit(s)`);
      onDone();
    });
  }

  function submitQty() {
    if (!batch) return;
    const n = Number(newQty);
    if (!Number.isInteger(n) || n < 0 || n >= current) {
      toast.error(`New quantity must be a whole number from 0 to ${current - 1}.`);
      return;
    }
    // Block-and-name when any unit in the batch is allocated/consumed/retired —
    // a non-serialized qty reduce can't choose which rows survive.
    const inUse = batch.units.filter((u) => u.inUse);
    if (inUse.length > 0) {
      toast.error(
        `${inUse.length} unit(s) in this batch are already in use — return or adjust them first.`
      );
      return;
    }
    startTransition(async () => {
      if (batch.isSingleBulk) {
        const res = await setBatchRowQuantityAction(
          productId,
          batch.units[0].id,
          n
        );
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(`Reduced by ${res.data.delta}`);
        onDone();
        return;
      }
      // Multi-row non-serialized: destroy (current − new) rows.
      const toRemove = current - n;
      const ids = batch.units.slice(0, toRemove).map((u) => u.id);
      const res = await deleteReceivedBatchRowsAction(productId, ids);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Removed ${res.data.destroyedRows} unit(s)`);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit received qty</DialogTitle>
          <DialogDescription>
            {batch.poNumber ? `PO ${batch.poNumber} · ` : ""}
            {current} unit{current === 1 ? "" : "s"} received in this batch.
            Reducing destroys units (not returned to the PO) and lowers the PO&rsquo;s
            received quantity. Units already in use can&rsquo;t be removed.
          </DialogDescription>
        </DialogHeader>

        {batch.serialized ? (
          <div className="space-y-2">
            <Label className="text-xs">Select units to remove</Label>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2">
              {batch.units.map((u) => (
                <li key={u.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    disabled={u.inUse}
                    checked={checked.has(u.id)}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(u.id);
                        else next.delete(u.id);
                        return next;
                      })
                    }
                  />
                  <span className="font-mono">{u.serial ?? "(no serial)"}</span>
                  {u.inUse && (
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-[9px] capitalize text-amber-700"
                    >
                      {u.statusLabel}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-[11px]">
              {checkableUnits.length} of {batch.units.length} removable ·{" "}
              {checked.size} selected
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs">New received quantity</Label>
            <Input
              type="number"
              min="0"
              max={current - 1}
              step="1"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="tabular-nums"
            />
            <p className="text-muted-foreground text-[11px]">
              From {current} → the difference is destroyed. 0 removes the whole
              batch.
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
          <Button
            type="button"
            onClick={batch.serialized ? submitSerialized : submitQty}
            disabled={pending}
          >
            {pending ? "Working…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
