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
  // Pinned product lines across the whole quote.
  const pinned: BuilderLineItem[] = sections
    .flatMap((s) => s.items)
    .filter((it) => it.type === "product" && it.stockUnitId);

  const uncommitted = pinned.filter((it) => !it.committedStockId);

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
              const done = !!it.committedStockId;
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
                      qty {it.qty} · {formatCurrency(it.unitCost)} each
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
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
