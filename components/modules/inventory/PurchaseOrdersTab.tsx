"use client";

// INV-1a — real DB. Renders getPurchaseOrders() (PurchaseOrderListRow[]): the PO
// header + vendor_name + computed total + line_count. The list row carries no
// line items, so the previous expandable line-item detail is dropped here; a row
// click navigates to the /purchase-orders module (the canonical PO surface).

import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PurchaseOrderListRow } from "@/lib/api/purchase-orders";
import type { DbPurchaseOrderStatus } from "@/lib/types/database";

const STATUS_STYLE: Record<DbPurchaseOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  issued: "bg-brand-navy/10 text-brand-navy",
  partially_received: "bg-amber-50 text-amber-800",
  received: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-400",
  cancelled: "bg-rose-50 text-rose-700 line-through",
};

const STATUS_LABEL: Record<DbPurchaseOrderStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_received: "Partially Received",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function PurchaseOrdersTab({
  purchaseOrders,
}: {
  purchaseOrders: PurchaseOrderListRow[];
}) {
  const router = useRouter();
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        <span className="text-brand-charcoal font-semibold">
          {purchaseOrders.length}
        </span>{" "}
        purchase orders across all vendors. Open one in the{" "}
        <a
          href="/purchase-orders"
          className="text-brand-navy underline underline-offset-2"
        >
          Purchase Orders
        </a>{" "}
        module.
      </p>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">PO #</TableHead>
              <TableHead className="text-[11px] uppercase">Vendor</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Lines</TableHead>
              {showCost && (
                <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
              )}
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Order Date</TableHead>
              <TableHead className="text-[11px] uppercase">Expected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseOrders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showCost ? 7 : 6}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  No purchase orders yet.
                </TableCell>
              </TableRow>
            ) : (
              purchaseOrders.map((po) => (
                <TableRow
                  key={po.id}
                  onClick={() => router.push("/purchase-orders")}
                  className="cursor-pointer"
                >
                  <TableCell className="text-brand-navy font-mono text-xs font-semibold">
                    {po.po_number}
                  </TableCell>
                  <TableCell className="text-brand-charcoal text-sm">
                    {po.vendor_name || "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {po.line_count}
                  </TableCell>
                  {showCost && (
                    <TableCell className="text-brand-charcoal text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(Number(po.total ?? 0))}
                    </TableCell>
                  )}
                  <TableCell>
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_STYLE[po.status]
                      )}
                    >
                      {STATUS_LABEL[po.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {fmtDate(po.order_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {fmtDate(po.expected_date)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
