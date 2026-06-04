"use client";

// INV-2b — interactive product detail. Read view of the catalog fields with
// Edit (swaps in the shared ProductForm) and Delete (friendly RESTRICT error
// surfaced as a toast). Below: a READ-ONLY table of the product's stock units
// — unit_cost gated behind the inventory:viewCost permission. Managing /
// receiving units is out of scope here (INV-2d).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductForm } from "@/components/modules/inventory/ProductForm";
import { ReceiveStockForm } from "@/components/modules/inventory/ReceiveStockForm";
import {
  deleteProductAction,
  deleteStockUnitAction,
  updateStockUnitAction,
} from "@/app/(app)/inventory/actions";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency, formatNumber } from "@/lib/format";
import type {
  DbInventoryProduct,
  DbInventoryStock,
  InventoryStockStatus,
} from "@/lib/types/database";

export function ProductDetailClient({
  product,
  stock,
}: {
  product: DbInventoryProduct;
  stock: DbInventoryStock[];
}) {
  const router = useRouter();
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");

  const [editing, setEditing] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [unitPending, startUnitAction] = useTransition();

  const onHand = stock
    .filter((s) => s.status === "in_stock")
    .reduce((n, s) => n + s.quantity, 0);

  const setUnitStatus = (unitId: string, status: InventoryStockStatus) => {
    startUnitAction(async () => {
      const result = await updateStockUnitAction(unitId, product.id, { status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Unit marked ${status.replace("_", " ")}`);
      router.refresh();
    });
  };

  const removeUnit = (unitId: string) => {
    if (!window.confirm("Delete this stock unit? This cannot be undone.")) return;
    startUnitAction(async () => {
      const result = await deleteStockUnitAction(unitId, product.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Stock unit deleted");
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (
      !window.confirm(
        `Delete "${product.name}"? This cannot be undone.`
      )
    ) {
      return;
    }
    startDelete(async () => {
      const result = await deleteProductAction(product.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${product.name}`);
      router.push("/inventory");
    });
  };

  if (editing) {
    return (
      <div className="space-y-5">
        <Link
          href="/inventory"
          className="text-muted-foreground hover:text-foreground inline-block text-sm"
        >
          ← Back to Inventory
        </Link>
        <PageHeader
          eyebrow={product.sku}
          title={`Edit ${product.name}`}
          description="Update the catalog record. Stock units are managed separately."
        />
        <div className="max-w-4xl">
          <ProductForm
            mode={{ kind: "edit", product }}
            onSubmitSuccess={() => {
              setEditing(false);
              router.refresh();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/inventory"
        className="text-muted-foreground hover:text-foreground inline-block text-sm"
      >
        ← Back to Inventory
      </Link>
      <PageHeader
        eyebrow={product.sku}
        title={product.name}
        description={product.description ?? undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:text-red-700"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      />

      {/* Catalog fields */}
      <Card className="bg-card p-5 shadow-sm">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Category" value={product.category} />
          <Detail label="Manufacturer" value={product.manufacturer} />
          <Detail label="Vendor" value={product.vendor} />
          <Detail
            label="Tracking mode"
            value={
              product.tracking_mode === "bulk"
                ? "Bulk (lot quantity)"
                : "Serialized (one row per unit)"
            }
          />
          <Detail label="Unit of measure" value={product.unit_of_measure} />
          <Detail label="On hand" value={formatNumber(onHand)} />
          {showCost && (
            <Detail
              label="Default unit cost"
              value={
                product.default_unit_cost != null
                  ? formatCurrency(Number(product.default_unit_cost))
                  : null
              }
            />
          )}
          <Detail
            label="List price"
            value={
              product.list_price != null
                ? formatCurrency(Number(product.list_price))
                : null
            }
          />
          <Detail
            label="Reorder point"
            value={product.reorder_point != null ? String(product.reorder_point) : null}
          />
          <Detail
            label="Reorder quantity"
            value={product.reorder_qty != null ? String(product.reorder_qty) : null}
          />
        </dl>
      </Card>

      {/* Stock units */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-brand-navy text-sm font-semibold tracking-wide uppercase">
            Stock units{" "}
            <span className="text-muted-foreground font-normal">
              ({stock.length})
            </span>
          </h2>
          <Button size="sm" onClick={() => setReceiveOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Receive stock
          </Button>
        </div>
        <Card className="bg-card overflow-hidden p-0 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Serial</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Qty</TableHead>
                <TableHead className="text-[11px] uppercase">Location</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
                <TableHead className="text-[11px] uppercase">Acquired</TableHead>
                {showCost && (
                  <TableHead className="text-right text-[11px] uppercase">
                    Unit cost
                  </TableHead>
                )}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showCost ? 7 : 6}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    No stock units yet. Use “Receive stock” to add some.
                  </TableCell>
                </TableRow>
              )}
              {stock.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">
                    {s.serial_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {s.quantity}
                  </TableCell>
                  <TableCell className="text-xs">{s.location ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {s.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {s.acquired_at
                      ? format(parseISO(s.acquired_at), "MMM d, yyyy")
                      : "—"}
                  </TableCell>
                  {showCost && (
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCurrency(Number(s.unit_cost))}
                    </TableCell>
                  )}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={unitPending}
                        aria-label="Unit actions"
                        className="text-muted-foreground hover:text-brand-charcoal inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-50"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {s.status === "in_stock" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => setUnitStatus(s.id, "consumed")}
                            >
                              Mark consumed
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setUnitStatus(s.id, "retired")}
                            >
                              Mark retired
                            </DropdownMenuItem>
                          </>
                        )}
                        {(s.status === "consumed" || s.status === "retired") && (
                          <DropdownMenuItem
                            onClick={() => setUnitStatus(s.id, "in_stock")}
                          >
                            Restore to stock
                          </DropdownMenuItem>
                        )}
                        {s.status !== "allocated" && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-700"
                          onClick={() => removeUnit(s.id)}
                        >
                          Delete unit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <ReceiveStockForm
        productId={product.id}
        trackingMode={product.tracking_mode}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        onReceived={() => {
          setReceiveOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </dt>
      <dd className="text-brand-charcoal mt-0.5 text-sm">{value || "—"}</dd>
    </div>
  );
}
