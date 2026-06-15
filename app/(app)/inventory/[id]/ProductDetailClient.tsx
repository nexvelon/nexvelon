"use client";

// INV-2d / INV-3b — interactive product detail. Read view of the catalog
// fields with Edit (swaps in the shared ProductForm) and Delete (friendly
// RESTRICT error surfaced as a toast). Below: the product's stock units with
// per-unit lifecycle actions —
//   • in_stock  → Allocate to site (site-picker dialog) · Mark consumed ·
//                 Mark retired · Delete
//   • allocated → Return to stock · Delete (no consume/retire — return first)
//   • consumed/retired → Restore to stock · Delete
// Allocated rows show the site name. unit_cost is gated behind inventory:viewCost.

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductForm } from "@/components/modules/inventory/ProductForm";
import { ReceiveStockForm } from "@/components/modules/inventory/ReceiveStockForm";
import { productImagePublicUrl } from "@/lib/product-image-url";
import { AttachmentsSection } from "@/components/modules/attachments/AttachmentsSection";
import { EditStockUnitForm } from "@/components/modules/inventory/EditStockUnitForm";
import {
  allocateUnitAction,
  deleteProductAction,
  deleteStockUnitAction,
  returnUnitAction,
  updateStockUnitAction,
} from "@/app/(app)/inventory/actions";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency, formatNumber } from "@/lib/format";
import type {
  DbInventoryProduct,
  DbInventoryStock,
  DbSiteWithClient,
  InventoryStockStatus,
} from "@/lib/types/database";

export function ProductDetailClient({
  product,
  stock,
  sites,
}: {
  product: DbInventoryProduct;
  stock: DbInventoryStock[];
  sites: DbSiteWithClient[];
}) {
  const router = useRouter();
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");
  // PARTS-1: deleting a part is gated; the server action enforces the same.
  const canDelete = hasPermission(role, "inventory", "delete");

  const [editing, setEditing] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [unitPending, startUnitAction] = useTransition();

  // Site allocation dialog state.
  const [allocTarget, setAllocTarget] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const siteById = new Map(sites.map((s) => [s.id, s]));

  const onHand = stock
    .filter((s) => s.status === "in_stock")
    .reduce((n, s) => n + s.quantity, 0);

  // C-2b: group stock units by unit cost (cheapest first). Each group surfaces
  // unallocated qty (what's available, not on a job) as the headline number,
  // total qty, and the PO #(s) present; expanding reveals the individual units.
  const costGroups = useMemo(() => {
    const map = new Map<number, DbInventoryStock[]>();
    for (const s of stock) {
      const c = Number(s.unit_cost);
      const arr = map.get(c) ?? [];
      arr.push(s);
      map.set(c, arr);
    }
    return Array.from(map.entries())
      .map(([unitCost, units]) => ({
        unitCost,
        unallocatedQty: units
          .filter((u) => u.status === "in_stock")
          .reduce((n, u) => n + u.quantity, 0),
        totalQty: units.reduce((n, u) => n + u.quantity, 0),
        poNumbers: Array.from(
          new Set(
            units
              .map((u) => u.po_number)
              .filter((p): p is string => !!p && p.trim() !== "")
          )
        ),
        units,
      }))
      .sort((a, b) => a.unitCost - b.unitCost);
  }, [stock]);

  const [expandedCosts, setExpandedCosts] = useState<Record<string, boolean>>({});
  const [editingUnit, setEditingUnit] = useState<DbInventoryStock | null>(null);
  const toggleCost = (key: string) =>
    setExpandedCosts((s) => ({ ...s, [key]: !s[key] }));

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

  const returnUnit = (unitId: string) => {
    startUnitAction(async () => {
      const result = await returnUnitAction(unitId, product.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Returned to stock");
      router.refresh();
    });
  };

  const confirmAllocate = () => {
    if (!allocTarget) return;
    if (!selectedSiteId) {
      toast.error("Pick a site to allocate to.");
      return;
    }
    const unitId = allocTarget;
    const siteId = selectedSiteId;
    startUnitAction(async () => {
      const result = await allocateUnitAction(unitId, product.id, siteId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Allocated to ${siteById.get(siteId)?.name ?? "site"}`);
      setAllocTarget(null);
      setSelectedSiteId("");
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
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
            {canDelete && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 hover:text-red-700"
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            )}
          </>
        }
      />

      {/* IMG-1: product image (when set) */}
      {productImagePublicUrl(product.image_path) ? (
        <Card className="bg-card p-5 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={productImagePublicUrl(product.image_path)}
            alt={product.name}
            className="max-h-64 rounded-md border border-[var(--border)] object-contain"
          />
        </Card>
      ) : null}

      {/* Catalog fields */}
      <Card className="bg-card p-5 shadow-sm">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Category" value={product.category} />
          <Detail label="Sub-category" value={product.subcategory} />
          <Detail label="Manufacturer" value={product.manufacturer} />
          <Detail label="Vendor" value={product.vendor} />
          <Detail label="UPC / Barcode" value={product.upc} />
          <Detail label="Master Part #" value={product.master_part_number} />
          <Detail
            label="Replacement Part #"
            value={product.replacement_part_number}
          />
          <Detail
            label="Tracking mode"
            value={
              product.tracking_mode === "bulk"
                ? "Bulk (measured quantity)"
                : product.tracking_mode === "non_serialized"
                  ? "Non-serialized (countable, no serial)"
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
            label="Low-stock at"
            value={product.reorder_point != null ? String(product.reorder_point) : null}
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
                <TableHead className="w-7" />
                {showCost && (
                  <TableHead className="text-right text-[11px] uppercase">
                    Unit cost
                  </TableHead>
                )}
                <TableHead className="text-right text-[11px] uppercase">
                  Unallocated
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase">
                  Total qty
                </TableHead>
                <TableHead className="text-[11px] uppercase">PO #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={showCost ? 5 : 4}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    No stock units yet. Use “Receive stock” to add some.
                  </TableCell>
                </TableRow>
              )}
              {costGroups.map((g) => {
                const key = String(g.unitCost);
                const open = expandedCosts[key];
                const summaryCols = showCost ? 5 : 4;
                return (
                  <Fragment key={key}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => toggleCost(key)}
                    >
                      <TableCell>
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </TableCell>
                      {showCost && (
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {formatCurrency(g.unitCost)}
                        </TableCell>
                      )}
                      <TableCell className="text-brand-navy text-right text-sm font-bold tabular-nums">
                        {formatNumber(g.unallocatedQty)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                        {formatNumber(g.totalQty)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {g.poNumbers.length > 0 ? g.poNumbers.join(", ") : "—"}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={summaryCols} className="p-0">
                          <div className="px-4 py-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10px] uppercase">Serial</TableHead>
                                  <TableHead className="text-right text-[10px] uppercase">Qty</TableHead>
                                  <TableHead className="text-[10px] uppercase">Location</TableHead>
                                  <TableHead className="text-[10px] uppercase">PO #</TableHead>
                                  <TableHead className="text-[10px] uppercase">Status</TableHead>
                                  <TableHead className="text-[10px] uppercase">Site</TableHead>
                                  <TableHead className="text-[10px] uppercase">Acquired</TableHead>
                                  <TableHead className="w-10" />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {g.units.map((s) => (
                                  <TableRow key={s.id}>
                                    <TableCell className="font-mono text-xs">
                                      {s.serial_number ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-right text-xs tabular-nums">
                                      {s.quantity}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {s.location ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">
                                      {s.po_number ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] capitalize"
                                      >
                                        {s.status.replace("_", " ")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {s.site_id
                                        ? siteById.get(s.site_id)?.name ??
                                          "Unknown site"
                                        : "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">
                                      {s.acquired_at
                                        ? format(
                                            parseISO(s.acquired_at),
                                            "MMM d, yyyy"
                                          )
                                        : "—"}
                                    </TableCell>
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
                                          <DropdownMenuItem
                                            onClick={() => setEditingUnit(s)}
                                          >
                                            Edit
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          {s.status === "in_stock" && (
                                            <>
                                              <DropdownMenuItem
                                                onClick={() => {
                                                  setSelectedSiteId("");
                                                  setAllocTarget(s.id);
                                                }}
                                              >
                                                Allocate to site
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  setUnitStatus(s.id, "consumed")
                                                }
                                              >
                                                Mark consumed
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  setUnitStatus(s.id, "retired")
                                                }
                                              >
                                                Mark retired
                                              </DropdownMenuItem>
                                            </>
                                          )}
                                          {s.status === "allocated" && (
                                            <DropdownMenuItem
                                              onClick={() => returnUnit(s.id)}
                                            >
                                              Return to stock
                                            </DropdownMenuItem>
                                          )}
                                          {(s.status === "consumed" ||
                                            s.status === "retired") && (
                                            <DropdownMenuItem
                                              onClick={() =>
                                                setUnitStatus(s.id, "in_stock")
                                              }
                                            >
                                              Restore to stock
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuSeparator />
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
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* ATTACH-1: product documents */}
      <AttachmentsSection
        entityType="product"
        entityId={product.id}
        folders={["Shop Drawings", "Data Sheets"]}
        allowCustomFolders={false}
        title="Documents"
      />

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

      {editingUnit && (
        <EditStockUnitForm
          key={editingUnit.id}
          productId={product.id}
          trackingMode={product.tracking_mode}
          unit={editingUnit}
          open
          onOpenChange={(o) => {
            if (!o) setEditingUnit(null);
          }}
          onSaved={() => {
            setEditingUnit(null);
            router.refresh();
          }}
        />
      )}

      {/* Allocate-to-site picker */}
      <Dialog
        open={allocTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAllocTarget(null);
            setSelectedSiteId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate to site</DialogTitle>
            <DialogDescription>
              The selected unit moves to status “allocated” against the chosen
              site. Return it to stock to free it again.
            </DialogDescription>
          </DialogHeader>

          {sites.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No sites available. Create a site first.
            </p>
          ) : (
            <Select
              value={selectedSiteId}
              onValueChange={(v) => setSelectedSiteId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a site…" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.site_code ? `${s.site_code} · ` : ""}
                    {s.name}
                    {s.client?.name ? ` — ${s.client.name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAllocTarget(null);
                setSelectedSiteId("");
              }}
              disabled={unitPending}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmAllocate}
              disabled={unitPending || sites.length === 0}
            >
              {unitPending ? "Allocating…" : "Allocate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
