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
import { ProductForm } from "@/components/modules/inventory/ProductForm";
import { deleteProductAction } from "@/app/(app)/inventory/actions";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency, formatNumber } from "@/lib/format";
import type {
  DbInventoryProduct,
  DbInventoryStock,
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
  const [deleting, startDelete] = useTransition();

  const onHand = stock
    .filter((s) => s.status === "in_stock")
    .reduce((n, s) => n + s.quantity, 0);

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

      {/* Read-only stock units */}
      <div>
        <h2 className="text-brand-navy mb-2 text-sm font-semibold tracking-wide uppercase">
          Stock units{" "}
          <span className="text-muted-foreground font-normal">
            ({stock.length})
          </span>
        </h2>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showCost ? 6 : 5}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    No stock units yet. Receiving lands in a later chunk.
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
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
