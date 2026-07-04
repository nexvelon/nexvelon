"use client";

// INV-1a — real DB. Groups the real products by their hierarchical category
// (product.categoryId → an inventory_categories node) and rolls up parts / units
// / stock value per category. Labels are the root→leaf path built from the
// category tree. Products with no category_id (legacy free-text only) bucket
// under "Uncategorized".

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Product } from "@/lib/types";
import type { DbInventoryCategory } from "@/lib/types/database";

const UNCAT = "__uncat__";

export function CategoriesTab({
  categories,
  products,
}: {
  categories: DbInventoryCategory[];
  products: Product[];
}) {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");

  const groups = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));

    // Root→leaf label for a category id, walking parent_id (cycle-guarded).
    const pathLabel = (id: string): string => {
      const parts: string[] = [];
      let cur = byId.get(id);
      let guard = 0;
      while (cur && guard++ < 32) {
        parts.unshift(cur.name);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      }
      return parts.join(" / ");
    };

    const acc = new Map<
      string,
      { label: string; items: Product[]; units: number; value: number }
    >();

    for (const p of products) {
      const key = p.categoryId && byId.has(p.categoryId) ? p.categoryId : UNCAT;
      const label =
        key === UNCAT ? "Uncategorized" : pathLabel(p.categoryId as string);
      const g =
        acc.get(key) ?? { label, items: [], units: 0, value: 0 };
      g.items.push(p);
      g.units += p.stock;
      g.value += p.stock * (p.avgCost ?? p.cost);
      acc.set(key, g);
    }

    // Named categories first (alpha by label), Uncategorized last.
    return [...acc.entries()]
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => {
        if (a.key === UNCAT) return 1;
        if (b.key === UNCAT) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [categories, products]);

  if (groups.length === 0) {
    return (
      <Card className="bg-card p-10 text-center shadow-sm">
        <p className="text-muted-foreground text-sm">
          No categories defined. Add one from Settings.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.key} className="border-t-2 border-t-[#C9A24B] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-brand-navy font-serif text-lg">{g.label}</h3>
            <ChevronRight className="text-muted-foreground h-4 w-4" />
          </div>
          <p className="text-muted-foreground text-xs">
            {g.items.length} {g.items.length === 1 ? "Part" : "Parts"} ·{" "}
            {formatNumber(g.units)} units
          </p>
          {showCost && (
            <p className="text-brand-charcoal mt-2 font-serif text-base tabular-nums">
              {formatCurrency(g.value)}{" "}
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                stock value
              </span>
            </p>
          )}
          <ul className="text-brand-charcoal/85 mt-3 space-y-0.5 text-[11px]">
            {g.items.slice(0, 5).map((p) => (
              <li key={p.id} className="truncate">
                <span className="text-brand-navy font-mono">{p.sku}</span> ·{" "}
                {p.name}
              </li>
            ))}
            {g.items.length > 5 && (
              <li className="text-muted-foreground/80 italic">
                +{g.items.length - 5} more
              </li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}
