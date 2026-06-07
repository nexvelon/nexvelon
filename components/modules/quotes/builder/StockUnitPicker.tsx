"use client";

// F-2 — pin a quote line to a specific stock unit's cost. Lists the product's
// UNALLOCATED (status='in_stock') units grouped by unit_cost cheapest-first
// (mirrors the C-2b detail grouping). Pinning a group snapshots that cost onto
// the line; an Unpin option reverts to the product default cost.

import { useEffect, useMemo, useState } from "react";
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
import { listStockForProductAction } from "@/app/(app)/inventory/actions";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { DbInventoryStock } from "@/lib/types/database";

interface CostGroup {
  unitCost: number;
  availableQty: number;
  unitIds: string[];
  locations: string[];
  poNumbers: string[];
  serials: string[];
}

export function StockUnitPicker({
  productId,
  pinnedStockUnitId,
  open,
  onOpenChange,
  onPin,
  onUnpin,
}: {
  productId: string;
  pinnedStockUnitId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPin: (stockUnitId: string, unitCost: number) => void;
  onUnpin: () => void;
}) {
  const [units, setUnits] = useState<DbInventoryStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(false);
    listStockForProductAction(productId)
      .then((res) => {
        if (!active) return;
        if (res.ok) setUnits(res.data);
        else setError(true);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, productId]);

  // Group unallocated units by cost, cheapest first.
  const groups = useMemo<CostGroup[]>(() => {
    const map = new Map<number, CostGroup>();
    for (const u of units) {
      if (u.status !== "in_stock") continue;
      const cost = Number(u.unit_cost);
      const g =
        map.get(cost) ??
        ({
          unitCost: cost,
          availableQty: 0,
          unitIds: [],
          locations: [],
          poNumbers: [],
          serials: [],
        } as CostGroup);
      g.availableQty += u.quantity;
      g.unitIds.push(u.id);
      if (u.location && !g.locations.includes(u.location)) g.locations.push(u.location);
      if (u.po_number && !g.poNumbers.includes(u.po_number)) g.poNumbers.push(u.po_number);
      if (u.serial_number) g.serials.push(u.serial_number);
      map.set(cost, g);
    }
    return Array.from(map.values()).sort((a, b) => a.unitCost - b.unitCost);
  }, [units]);

  const pinnedCost = useMemo(() => {
    const u = units.find((x) => x.id === pinnedStockUnitId);
    return u ? Number(u.unit_cost) : null;
  }, [units, pinnedStockUnitId]);

  const handlePin = (g: CostGroup) => {
    // Pin the first unit of the cheapest-matching group; the cost is what
    // matters for the line snapshot.
    onPin(g.unitIds[0], g.unitCost);
    toast.success(`Pinned ${formatCurrency(g.unitCost)} cost`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pin to a stock unit&rsquo;s cost</DialogTitle>
          <DialogDescription>
            Lock this line to a specific in-stock cost. The pinned cost is a
            snapshot — later inventory edits won&rsquo;t change it.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
        ) : error ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Couldn&rsquo;t load stock. Try again.
          </p>
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No unallocated stock — this line uses the product default cost.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {groups.map((g) => {
              const isPinned = pinnedCost === g.unitCost;
              return (
                <li
                  key={g.unitCost}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-brand-navy text-sm font-semibold tabular-nums">
                        {formatCurrency(g.unitCost)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatNumber(g.availableQty)} available
                      </span>
                      {isPinned && (
                        <span className="bg-brand-gold/15 text-amber-800 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                          Pinned
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground truncate text-[11px]">
                      {[
                        g.locations.join(", "),
                        g.poNumbers.length ? `PO ${g.poNumbers.join(", ")}` : "",
                        g.serials.length
                          ? `SN ${g.serials.slice(0, 3).join(", ")}${
                              g.serials.length > 3 ? "…" : ""
                            }`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isPinned ? "outline" : "default"}
                    onClick={() => handlePin(g)}
                    disabled={isPinned}
                  >
                    {isPinned ? "Pinned" : "Pin"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          {pinnedStockUnitId && (
            <Button
              variant="outline"
              onClick={() => {
                onUnpin();
                onOpenChange(false);
              }}
            >
              Unpin / use default cost
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
