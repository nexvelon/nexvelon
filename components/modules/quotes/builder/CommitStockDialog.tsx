"use client";

// F-3b — pick which pinned lines to commit (consume) to inventory. Lists the
// quote's pinned product lines: not-yet-committed ones are checkable (default
// all checked); already-committed ones are shown disabled. "Commit selected"
// hands the chosen line ids back to the builder's commitLines helper.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { BuilderLineItem, QuoteSection } from "@/lib/types";
import { describeDraws, lineCostSource, remainingDraws } from "@/lib/inventory/stock-draws";

export function CommitStockDialog({
  sections,
  open,
  onOpenChange,
  onCommit,
}: {
  sections: QuoteSection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: (lineIds: string[]) => void;
}) {
  // Stock-backed product lines across the whole quote: legacy single-lot pins
  // and INV-FIX-1 multi-lot draws.
  const all = sections.flatMap((s) => s.items).filter((it) => it.type === "product" && it.productId);
  const hasDraws = (it: BuilderLineItem) => (it.stockDraws?.length ?? 0) > 0;
  const pinned: BuilderLineItem[] = all.filter((it) => it.stockUnitId || hasDraws(it));
  const isDone = (it: BuilderLineItem) =>
    hasDraws(it) ? remainingDraws(it.stockDraws, it.committedDraws).length === 0 : !!it.committedStockId;
  const uncommitted = pinned.filter((it) => !isDone(it));
  // §2.8 — lines whose cost is a catalog estimate don't draw stock; say so here.
  const estimates = all.filter((it) => !it.stockUnitId && !hasDraws(it) && lineCostSource(it) === "catalog_estimate");

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const isChecked = (id: string) => checked[id] ?? true; // default checked
  const toggle = (id: string) =>
    setChecked((c) => ({ ...c, [id]: !isChecked(id) }));

  const selectedIds = uncommitted.filter((it) => isChecked(it.id)).map((it) => it.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit stock</DialogTitle>
          <DialogDescription>
            Consume the pinned stock for the selected lines. This decrements
            inventory and can&rsquo;t be auto-undone.
          </DialogDescription>
        </DialogHeader>

        {pinned.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No pinned lines to commit. Pin a line to a stock unit first.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pinned.map((it) => {
              const done = isDone(it);
              return (
                <li key={it.id} className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={done ? false : isChecked(it.id)}
                    disabled={done}
                    onChange={() => toggle(it.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-brand-navy font-mono text-xs font-semibold">
                        {it.sku ?? "—"}
                      </span>
                      <span className="text-brand-charcoal truncate text-xs">
                        {it.name}
                      </span>
                      {done && (
                        <span className="bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                          Committed
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      {hasDraws(it)
                        ? describeDraws(done ? it.stockDraws! : remainingDraws(it.stockDraws, it.committedDraws), formatCurrency)
                        : `qty ${it.qty} · ${it.unitCost != null ? formatCurrency(it.unitCost) : "—"} each`}
                      {hasDraws(it) && (it.committedDraws?.length ?? 0) > 0 && !done ? " (rest already committed)" : ""}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {estimates.length > 0 && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            <p className="font-medium">Not from stock — won&rsquo;t reduce inventory</p>
            <ul className="mt-0.5 list-disc pl-4">
              {estimates.map((it) => (
                <li key={it.id}>
                  {it.sku ?? it.name} × {it.qty} — catalog cost estimate (no free stock was drawn for it)
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onCommit(selectedIds);
              onOpenChange(false);
            }}
            disabled={selectedIds.length === 0}
          >
            Commit {selectedIds.length > 0 ? selectedIds.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
