"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { products } from "@/lib/mock-data/products";
import {
  buildMaterials,
  buildPOs,
  type MaterialAllocation,
  type PurchaseOrder,
} from "@/lib/project-data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  readOnly?: boolean;
}

const MATERIAL_STATUS_STYLE: Record<MaterialAllocation["status"], string> = {
  Pending: "bg-slate-100 text-slate-600",
  Reserved: "bg-sky-50 text-sky-700",
  Picked: "bg-amber-50 text-amber-800",
  Delivered: "bg-brand-gold/15 text-amber-800",
  Installed: "bg-emerald-50 text-emerald-700",
};

const PO_STATUS_STYLE: Record<PurchaseOrder["status"], string> = {
  Draft: "bg-slate-100 text-slate-600",
  Sent: "bg-brand-navy/10 text-brand-navy",
  Confirmed: "bg-sky-50 text-sky-700",
  "Partially Received": "bg-amber-50 text-amber-800",
  Received: "bg-emerald-50 text-emerald-700",
};

export function MaterialsTab({ project, readOnly }: Props) {
  const materials = useMemo(() => buildMaterials(project), [project]);
  const pos = useMemo(() => buildPOs(project), [project]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const committed = pos.reduce(
    (s, po) => s + po.items.reduce((c, it) => c + it.cost * it.qty, 0),
    0
  );
  const actual = materials.reduce((s, m) => {
    const prod = productById.get(m.productId);
    return s + (prod ? prod.cost * m.qtyUsed : 0);
  }, 0);
  const budget = Math.round(project.budget * 0.4); // materials carry ~ 40% of budget
  const variance = budget - committed;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="font-serif text-lg">
            Allocated from Inventory
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={readOnly}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Allocate from Stock
            </Button>
            <Button size="sm" disabled={readOnly}>
              <ShoppingCart className="mr-1 h-3.5 w-3.5" />
              Create PO
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">SKU</TableHead>
                <TableHead className="text-[11px] uppercase">Description</TableHead>
                <TableHead className="text-[11px] uppercase">Vendor</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Req</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Allocated</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Used</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Remain</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((m) => {
                const prod = productById.get(m.productId);
                if (!prod) return null;
                const remain = m.qtyAllocated - m.qtyUsed;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-brand-navy font-mono text-xs font-semibold">
                      {prod.sku}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-xs">
                      {prod.name}
                    </TableCell>
                    <TableCell className="text-xs">{prod.vendor}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(m.qtyRequired)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(m.qtyAllocated)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(m.qtyUsed)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(remain)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          MATERIAL_STATUS_STYLE[m.status]
                        )}
                      >
                        {m.status}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-[var(--border)]">
            {pos.length === 0 && (
              <li className="text-muted-foreground py-6 text-center text-xs">
                No purchase orders raised yet against this project.
              </li>
            )}
            {pos.map((po) => {
              const total = po.items.reduce(
                (s, it) => s + it.qty * it.cost,
                0
              );
              const isOpen = expanded[po.id];
              return (
                <li key={po.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((p) => ({ ...p, [po.id]: !p[po.id] }))
                    }
                    className="flex w-full items-center gap-3 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
                    )}
                    <span className="text-brand-navy font-mono text-xs font-semibold">
                      {po.number}
                    </span>
                    <span className="text-brand-charcoal text-xs">{po.vendor}</span>
                    <span className="text-muted-foreground text-[11px]">
                      {format(parseISO(po.date), "MMM d, yyyy")}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      {po.items.length} items
                    </span>
                    <span
                      className={cn(
                        "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium",
                        PO_STATUS_STYLE[po.status]
                      )}
                    >
                      {po.status}
                    </span>
                    <span className="text-brand-charcoal w-24 text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(total)}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="bg-muted/40 mt-3 ml-7 rounded-md border border-[var(--border)]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">SKU</TableHead>
                            <TableHead className="text-[10px] uppercase">Description</TableHead>
                            <TableHead className="text-right text-[10px] uppercase">Qty</TableHead>
                            <TableHead className="text-right text-[10px] uppercase">Unit Cost</TableHead>
                            <TableHead className="text-right text-[10px] uppercase">Line</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {po.items.map((it, idx) => {
                            const prod = productById.get(it.productId);
                            return (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-[11px]">
                                  {prod?.sku ?? "—"}
                                </TableCell>
                                <TableCell className="max-w-[260px] text-[11px]">
                                  {prod?.name ?? "Item"}
                                </TableCell>
                                <TableCell className="text-right text-[11px] tabular-nums">
                                  {it.qty}
                                </TableCell>
                                <TableCell className="text-right text-[11px] tabular-nums">
                                  {formatCurrency(it.cost)}
                                </TableCell>
                                <TableCell className="text-brand-charcoal text-right text-[11px] font-semibold tabular-nums">
                                  {formatCurrency(it.qty * it.cost)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Materials Budget</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Budget" value={formatCurrency(budget)} />
          <Stat label="Committed (POs)" value={formatCurrency(committed)} />
          <Stat label="Actual installed" value={formatCurrency(actual)} />
          <Stat
            label="Variance"
            value={formatCurrency(Math.abs(variance))}
            tone={variance >= 0 ? "good" : "bad"}
            sub={variance >= 0 ? "Under budget" : "Over budget"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  sub?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </p>
      <p
        className={cn(
          "font-serif text-lg tabular-nums",
          tone === "good" && "text-brand-gold",
          tone === "bad" && "text-red-600",
          !tone && "text-brand-navy"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-muted-foreground text-[10px]">{sub}</p>}
    </div>
  );
}
