"use client";

// INV-1b — real DB. Shows in_stock units/lots currently assigned to project cost
// centers (listStockAllocations), grouped project → cost center → stock rows.
// Read-only: per-unit actions (deliver/install/return/consume) live on the
// product detail page. Mock pick/stage/deliver buttons removed for v1.

import { useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import type { AllocationsByProject } from "@/lib/api/inventory-allocations";

export function AllocationsTab({
  allocations,
}: {
  allocations: AllocationsByProject[];
}) {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (allocations.length === 0) {
    return (
      <Card className="bg-card p-10 text-center shadow-sm">
        <ClipboardList className="text-muted-foreground/50 mx-auto mb-3 h-8 w-8" />
        <p className="text-muted-foreground text-sm">
          No stock allocated to projects.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        This view shows current allocations (stock currently assigned to project
        cost centers). Actions on individual units happen on the product detail
        page.
      </p>

      <div className="space-y-3">
        {allocations.map((proj) => {
          const isOpen = open[proj.projectId] ?? true;
          return (
            <Card key={proj.projectId} className="overflow-hidden p-0 shadow-sm">
              <button
                type="button"
                onClick={() =>
                  setOpen((s) => ({ ...s, [proj.projectId]: !isOpen }))
                }
                className="hover:bg-muted/40 flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="text-muted-foreground h-4 w-4" />
                  ) : (
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  )}
                  <div>
                    <p className="text-brand-navy font-serif text-base leading-tight">
                      {proj.projectName}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {proj.projectNumber} · {proj.clientName}
                    </p>
                  </div>
                </div>
                {showCost && (
                  <p className="text-brand-charcoal font-serif text-sm tabular-nums">
                    {formatCurrency(proj.projectTotal)}
                  </p>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-[var(--border)]">
                  {proj.costCenters.map((cc) => (
                    <div key={cc.costCenterId} className="px-4 py-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-brand-charcoal text-xs font-medium uppercase tracking-wide">
                          {cc.costCenterName}
                        </p>
                        {showCost && (
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {formatCurrency(cc.subtotal)}
                          </p>
                        )}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px] uppercase">Part #</TableHead>
                            <TableHead className="text-[10px] uppercase">Product</TableHead>
                            <TableHead className="text-right text-[10px] uppercase">Qty</TableHead>
                            {showCost && (
                              <TableHead className="text-right text-[10px] uppercase">Unit Cost</TableHead>
                            )}
                            {showCost && (
                              <TableHead className="text-right text-[10px] uppercase">Subtotal</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cc.stockRows.map((r) => (
                            <TableRow key={r.stockId}>
                              <TableCell className="text-brand-navy font-mono text-[11px]">
                                {r.sku || "—"}
                              </TableCell>
                              <TableCell className="text-brand-charcoal text-[11px]">
                                {r.productName}
                              </TableCell>
                              <TableCell className="text-right text-[11px] tabular-nums">
                                {r.quantity}
                              </TableCell>
                              {showCost && (
                                <TableCell className="text-muted-foreground text-right text-[11px] tabular-nums">
                                  {formatCurrency(r.unitCost)}
                                </TableCell>
                              )}
                              {showCost && (
                                <TableCell className="text-brand-charcoal text-right text-[11px] font-semibold tabular-nums">
                                  {formatCurrency(r.quantity * r.unitCost)}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
