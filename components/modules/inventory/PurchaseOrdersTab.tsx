"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { products } from "@/lib/mock-data/products";
import { projects } from "@/lib/mock-data/projects";
import { buildPOs, type PurchaseOrder } from "@/lib/project-data";
import { standalonePOs, type StandalonePO } from "@/lib/inventory-data";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type AggregatedPO = {
  id: string;
  number: string;
  vendor: string;
  projectCode?: string;
  projectName?: string;
  date: string;
  expected?: string;
  status: string;
  items: { productId: string; qty: number; cost: number }[];
};

const STATUS_STYLE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Sent: "bg-brand-navy/10 text-brand-navy",
  Confirmed: "bg-sky-50 text-sky-700",
  "Partially Received": "bg-amber-50 text-amber-800",
  Received: "bg-emerald-50 text-emerald-700",
  Closed: "bg-slate-100 text-slate-400 line-through",
};

export function PurchaseOrdersTab() {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const allPOs: AggregatedPO[] = useMemo(() => {
    const out: AggregatedPO[] = [];
    for (const project of projects) {
      const pos: PurchaseOrder[] = buildPOs(project);
      for (const po of pos) {
        out.push({
          id: po.id,
          number: po.number,
          vendor: po.vendor,
          projectCode: project.code,
          projectName: project.name,
          date: po.date,
          status: po.status,
          items: po.items,
        });
      }
    }
    for (const po of standalonePOs as StandalonePO[]) {
      out.push({
        id: po.id,
        number: po.number,
        vendor: po.vendor,
        date: po.date,
        expected: po.expected,
        status: po.status,
        items: po.items,
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, []);

  const productById = new Map(products.map((p) => [p.id, p]));

  const totalFor = (po: AggregatedPO) =>
    po.items.reduce((s, it) => s + it.qty * it.cost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          <span className="text-brand-charcoal font-semibold">{allPOs.length}</span> purchase orders across all vendors.
        </p>
        <Button onClick={() => toast.success("New PO drafted", { description: "Demo: would open the PO builder." })}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New PO
        </Button>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-7"></TableHead>
              <TableHead className="text-[11px] uppercase">PO #</TableHead>
              <TableHead className="text-[11px] uppercase">Vendor</TableHead>
              <TableHead className="text-[11px] uppercase">Project</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Items</TableHead>
              {showCost && <TableHead className="text-right text-[11px] uppercase">Subtotal</TableHead>}
              {showCost && <TableHead className="text-right text-[11px] uppercase">Tax</TableHead>}
              {showCost && <TableHead className="text-right text-[11px] uppercase">Total</TableHead>}
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Created</TableHead>
              <TableHead className="text-[11px] uppercase">Expected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allPOs.map((po) => {
              const subtotal = totalFor(po);
              const tax = subtotal * 0.13;
              const total = subtotal + tax;
              const isOpen = expanded[po.id];
              return (
                <FragmentRow
                  key={po.id}
                  po={po}
                  isOpen={isOpen}
                  showCost={showCost}
                  subtotal={subtotal}
                  tax={tax}
                  total={total}
                  productById={productById}
                  onToggle={() => setExpanded((s) => ({ ...s, [po.id]: !s[po.id] }))}
                />
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FragmentRow({
  po,
  isOpen,
  showCost,
  subtotal,
  tax,
  total,
  productById,
  onToggle,
}: {
  po: AggregatedPO;
  isOpen: boolean;
  showCost: boolean;
  subtotal: number;
  tax: number;
  total: number;
  productById: Map<string, ReturnType<typeof Array.prototype.find>>;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell>
          <button
            type="button"
            onClick={onToggle}
            className="text-muted-foreground hover:text-brand-charcoal"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </TableCell>
        <TableCell className="text-brand-navy font-mono text-xs font-semibold">{po.number}</TableCell>
        <TableCell className="text-xs">{po.vendor}</TableCell>
        <TableCell className="text-muted-foreground text-xs">
          {po.projectCode ? `${po.projectCode}` : "Stock replenishment"}
        </TableCell>
        <TableCell className="text-right text-xs tabular-nums">{po.items.length}</TableCell>
        {showCost && (
          <TableCell className="text-right text-xs tabular-nums">{formatCurrency(subtotal)}</TableCell>
        )}
        {showCost && (
          <TableCell className="text-muted-foreground text-right text-xs tabular-nums">{formatCurrency(tax)}</TableCell>
        )}
        {showCost && (
          <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
            {formatCurrency(total)}
          </TableCell>
        )}
        <TableCell>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium",
              STATUS_STYLE[po.status] ?? "bg-slate-100 text-slate-600"
            )}
          >
            {po.status}
          </span>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs tabular-nums">
          {format(parseISO(po.date), "MMM d, yyyy")}
        </TableCell>
        <TableCell className="text-muted-foreground text-xs tabular-nums">
          {po.expected ? format(parseISO(po.expected), "MMM d, yyyy") : "—"}
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/40">
          <TableCell></TableCell>
          <TableCell colSpan={showCost ? 10 : 7} className="px-4 py-3">
            <div className="rounded-md border border-[var(--border)] bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] uppercase">SKU</TableHead>
                    <TableHead className="text-[10px] uppercase">Description</TableHead>
                    <TableHead className="text-right text-[10px] uppercase">Qty</TableHead>
                    {showCost && <TableHead className="text-right text-[10px] uppercase">Unit Cost</TableHead>}
                    {showCost && <TableHead className="text-right text-[10px] uppercase">Line</TableHead>}
                    <TableHead className="text-right text-[10px] uppercase">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.items.map((it, idx) => {
                    const prod = productById.get(it.productId) as
                      | { sku: string; name: string }
                      | undefined;
                    const receivedRatio =
                      po.status === "Received"
                        ? 1
                        : po.status === "Partially Received"
                          ? 0.5
                          : 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-[11px]">{prod?.sku ?? it.productId}</TableCell>
                        <TableCell className="max-w-[260px] text-[11px]">{prod?.name ?? "—"}</TableCell>
                        <TableCell className="text-right text-[11px] tabular-nums">{it.qty}</TableCell>
                        {showCost && (
                          <TableCell className="text-right text-[11px] tabular-nums">
                            {formatCurrency(it.cost)}
                          </TableCell>
                        )}
                        {showCost && (
                          <TableCell className="text-brand-charcoal text-right text-[11px] font-semibold tabular-nums">
                            {formatCurrency(it.qty * it.cost)}
                          </TableCell>
                        )}
                        <TableCell className="text-right text-[11px] tabular-nums">
                          {Math.round(it.qty * receivedRatio)} / {it.qty}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
