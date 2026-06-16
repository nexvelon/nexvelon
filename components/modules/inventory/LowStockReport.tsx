"use client";

// PARTS-3 — visual low-stock report. Self-contained (own fetch + states) so it
// renders regardless of the aggregate Reports data. Reuses the SAME rule as the
// email report + the low-stock count: stock <= reorderPoint. Read-only.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { listProductsAction } from "@/app/(app)/inventory/actions";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { ReorderDialog, type ReorderPart } from "./ReorderDialog";
import type { Product } from "@/lib/types";

interface LowStockRow {
  product: Product;
  shortfall: number; // reorderPoint - stock (>= 0 for low items)
  suggestedQty: number;
  estCost: number;
}

export function LowStockReport({ showCost }: { showCost: boolean }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const { role } = useRole();
  // REORDER-1: the Reorder action uses the existing PO-create gate.
  const canReorder = hasPermission(role, "inventory", "create");
  const [reorderPart, setReorderPart] = useState<ReorderPart | null>(null);

  useEffect(() => {
    let active = true;
    listProductsAction()
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch(() => {
        if (active) setProducts([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo<LowStockRow[]>(() => {
    if (!products) return [];
    return (
      products
        // Same rule as emailLowStockReportAction + the low-stock count.
        .filter((p) => p.stock <= p.reorderPoint)
        .map((p) => {
          const shortfall = Math.max(p.reorderPoint - p.stock, 0);
          const suggestedQty = p.reorderQty ?? shortfall;
          return {
            product: p,
            shortfall,
            suggestedQty,
            estCost: suggestedQty * p.cost,
          };
        })
        // Most urgent first: largest shortfall, then lowest on-hand.
        .sort(
          (a, b) =>
            b.shortfall - a.shortfall || a.product.stock - b.product.stock
        )
    );
  }, [products]);

  return (
    <div>
      <h2 className="text-brand-navy mb-2 text-sm font-semibold tracking-wide uppercase">
        Low Stock{" "}
        <span className="text-muted-foreground font-normal normal-case">
          (at or below reorder point{products ? ` · ${rows.length}` : ""})
        </span>
      </h2>
      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        {products === null ? (
          <p className="text-muted-foreground p-5 text-xs">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground p-5 text-xs">
            Everything is above its reorder point. Nothing to order.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reorder point</TableHead>
                <TableHead className="text-right">Suggested qty</TableHead>
                {showCost && (
                  <TableHead className="text-right">Est. cost</TableHead>
                )}
                {canReorder && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ product: p, suggestedQty, estCost }) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-[260px] text-xs">
                    <div className="text-brand-charcoal truncate font-medium">
                      {p.name}
                    </div>
                    <div className="text-brand-navy font-mono text-[11px]">
                      {p.sku}
                      {p.masterPartNumber ? ` · ${p.masterPartNumber}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {p.vendor || "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatNumber(p.stock)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                    {formatNumber(p.reorderPoint)}
                  </TableCell>
                  <TableCell className="text-brand-navy text-right text-xs font-semibold tabular-nums">
                    {formatNumber(suggestedQty)}
                  </TableCell>
                  {showCost && (
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCurrency(estCost)}
                    </TableCell>
                  )}
                  {canReorder && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setReorderPart({
                            id: p.id,
                            sku: p.sku,
                            name: p.name,
                            masterPartNumber: p.masterPartNumber,
                            onHand: p.stock,
                            reorderPoint: p.reorderPoint,
                            suggestedQty,
                            defaultCost: p.cost,
                          })
                        }
                      >
                        Reorder
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ReorderDialog
        part={reorderPart}
        open={reorderPart !== null}
        onOpenChange={(o) => {
          if (!o) setReorderPart(null);
        }}
      />
    </div>
  );
}
