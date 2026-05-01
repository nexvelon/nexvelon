"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { products } from "@/lib/mock-data/products";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { ProductCategory } from "@/lib/types";

const CATEGORY_ORDER: ProductCategory[] = [
  "Access Control",
  "CCTV",
  "Video Surveillance",
  "Intrusion",
  "Intercom",
  "Cabling",
  "Power",
  "Network",
  "Networking",
  "Racks",
  "Accessories",
];

export function CategoriesTab() {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");

  const grouped = useMemo(() => {
    const map = new Map<ProductCategory, typeof products>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const p of products) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return CATEGORY_ORDER
      .map((cat) => ({ cat, items: map.get(cat) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {grouped.map(({ cat, items }) => {
        const totalValue = items.reduce((s, p) => s + p.stock * p.cost, 0);
        return (
          <Card key={cat} className="border-t-2 border-t-[#C9A24B] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-brand-navy font-serif text-lg">{cat}</h3>
              <ChevronRight className="text-muted-foreground h-4 w-4" />
            </div>
            <p className="text-muted-foreground text-xs">
              {items.length} {items.length === 1 ? "SKU" : "SKUs"} ·{" "}
              {formatNumber(items.reduce((s, p) => s + p.stock, 0))} units
            </p>
            {showCost && (
              <p className="text-brand-charcoal mt-2 font-serif text-base tabular-nums">
                {formatCurrency(totalValue)}{" "}
                <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  stock value
                </span>
              </p>
            )}
            <ul className="text-brand-charcoal/85 mt-3 space-y-0.5 text-[11px]">
              {items.slice(0, 5).map((p) => (
                <li key={p.id} className="truncate">
                  <span className="text-brand-navy font-mono">{p.sku}</span> · {p.name}
                </li>
              ))}
              {items.length > 5 && (
                <li className="text-muted-foreground/80 italic">
                  +{items.length - 5} more
                </li>
              )}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
