"use client";

// INV-FIX-1 — choose which stock a quote line draws from (replaces F-2's
// StockUnitPicker, which grouped lots by cost CHEAPEST-first and could only pin a
// single lot). Specific identification is unchanged: each lot keeps its own cost.
//
//   • Lots are listed OLDEST RECEIPT FIRST, one row per lot (date, PO, location,
//     serial), with how many are free after this quote's other lines.
//   • "Use oldest first" applies the default rule across as many lots as needed.
//   • Typing amounts per lot is a deliberate, manual choice (e.g. the exact
//     serialized camera installed) and is recorded as such.
//   • "Don't use stock" leaves the line on the catalog figure, labelled an estimate.
//
// SEC-1: this picker is only rendered for roles that can see cost (the cost
// column is gated); the stock list is also redacted server-side.

import { useEffect, useMemo, useState } from "react";
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
import { listStockForProductAction, type RedactedStock } from "@/app/(app)/inventory/actions";
import { formatCurrency } from "@/lib/format";
import {
  compareOldestFirst,
  drawsCost,
  drawnQty,
  isAutoEligible,
  type StockDraw,
} from "@/lib/inventory/stock-draws";
import { useStockPlan } from "./stock-plan-context";
import type { BuilderLineItem } from "@/lib/types";

export function StockDrawPicker({
  line,
  open,
  onOpenChange,
}: {
  line: BuilderLineItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const plan = useStockPlan();
  const [lots, setLots] = useState<RedactedStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !line.productId) return;
    let active = true;
    setLoading(true);
    setError(false);
    listStockForProductAction(line.productId)
      .then((res) => {
        if (!active) return;
        if (res.ok) setLots(res.data);
        else setError(true);
      })
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    // Start from the line's current plan.
    const start: Record<string, number> = {};
    for (const d of line.stockDraws ?? []) start[d.stockId] = d.qty;
    if (!line.stockDraws?.length && line.stockUnitId) start[line.stockUnitId] = line.qty;
    setAmounts(start);
    return () => {
      active = false;
    };
  }, [open, line.productId, line.stockDraws, line.stockUnitId, line.qty]);

  const reserved = useMemo(() => (open ? plan.reservedExcept(line.id) : new Map<string, number>()), [open, plan, line.id]);
  // Lots this line may draw from: free warehouse stock, oldest first.
  const rows = useMemo(
    () =>
      lots
        .filter((l) => isAutoEligible(l))
        .sort(compareOldestFirst)
        .map((l) => ({ lot: l, free: Math.max(0, Number(l.quantity) - (reserved.get(l.id) ?? 0)) })),
    [lots, reserved]
  );

  const chosen: StockDraw[] = rows
    .filter((r) => (amounts[r.lot.id] ?? 0) > 0)
    .map((r) => ({
      stockId: r.lot.id,
      qty: Math.min(amounts[r.lot.id], r.free),
      unitCost: r.lot.unit_cost == null ? null : Number(r.lot.unit_cost),
      acquiredAt: r.lot.acquired_at,
      poNumber: r.lot.po_number,
      serialNumber: r.lot.serial_number,
      location: r.lot.location,
    }));
  const chosenQty = drawnQty(chosen);
  const chosenCost = drawsCost(chosen);
  const over = chosenQty > line.qty;

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Stock for this line</DialogTitle>
          <DialogDescription>
            Each lot keeps the cost it was bought at. By default the line draws the oldest stock first; choose lots
            yourself to use particular ones (for example the exact serialized unit installed).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
        ) : error ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Couldn&rsquo;t load stock. Try again.</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No free warehouse stock for this part — the line uses the catalog cost, marked as an estimate.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-[10px] uppercase">
                  <th className="py-1">Received</th>
                  <th className="py-1">Lot</th>
                  <th className="py-1 text-right">Cost</th>
                  <th className="py-1 text-right">Free</th>
                  <th className="py-1 text-right">Use</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ lot, free }) => (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="py-1.5 tabular-nums">{lot.acquired_at ? lot.acquired_at.slice(0, 10) : "No date"}</td>
                    <td className="text-muted-foreground py-1.5">
                      {[lot.po_number ? `PO ${lot.po_number}` : null, lot.location, lot.serial_number ? `SN ${lot.serial_number}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {lot.unit_cost == null ? "—" : formatCurrency(Number(lot.unit_cost))}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{free}</td>
                    <td className="py-1.5 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={free}
                        className="ml-auto h-7 w-16 text-right text-xs"
                        value={amounts[lot.id] ?? 0}
                        onChange={(e) =>
                          setAmounts((a) => ({ ...a, [lot.id]: Math.max(0, Math.min(free, Math.trunc(Number(e.target.value) || 0))) }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 && (
          <p className={`text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}>
            Chosen: {chosenQty} of {line.qty}
            {chosenCost != null && chosenQty > 0 ? ` · ${formatCurrency(chosenCost)} from stock` : ""}
            {over
              ? " — more than the line needs."
              : chosenQty < line.qty && chosenQty > 0
                ? ` — the other ${line.qty - chosenQty} will be an estimate.`
                : ""}
          </p>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              plan.applyManual(line.id, [], null);
              close();
            }}
          >
            Don&rsquo;t use stock (estimate)
          </Button>
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => {
              plan.replan(line, "hold");
              close();
            }}
          >
            Use oldest first
          </Button>
          <Button
            disabled={chosen.length === 0 || over}
            onClick={() => {
              plan.applyManual(line.id, chosen, "manual");
              close();
            }}
          >
            Use these lots
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
