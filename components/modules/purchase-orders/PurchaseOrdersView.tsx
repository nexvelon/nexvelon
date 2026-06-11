"use client";

// PO-2 — purchase-orders list with search, a create/edit drawer, and delete
// confirm. Mirrors the vendors/clients list posture (SSR-seeded local state,
// refreshed via listPurchaseOrdersAction). Editing loads the full detail
// (header + lines) on demand before opening the drawer.

import { useMemo, useState } from "react";
import {
  Edit3,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/format";
import {
  PurchaseOrderFormDrawer,
  type ProductOption,
  type VendorOption,
} from "./PurchaseOrderFormDrawer";
import {
  deletePurchaseOrderAction,
  getPurchaseOrderAction,
  listPurchaseOrdersAction,
} from "@/app/(app)/purchase-orders/actions";
import { StatusBadge } from "./po-status";
import type { PurchaseOrderDetail, PurchaseOrderListRow } from "@/lib/api/purchase-orders";

interface Props {
  orders: PurchaseOrderListRow[];
  vendorOptions: VendorOption[];
  productOptions: ProductOption[];
  locationOptions: string[];
}

export function PurchaseOrdersView({
  orders,
  vendorOptions,
  productOptions,
  locationOptions,
}: Props) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<PurchaseOrderListRow[]>(orders);
  const [drawer, setDrawer] = useState<
    | { open: false }
    | { open: true; mode: { kind: "create" } | { kind: "edit"; detail: PurchaseOrderDetail } }
  >({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<PurchaseOrderListRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [opening, setOpening] = useState(false);

  const reload = async () => {
    const r = await listPurchaseOrdersAction();
    if (r.ok) setRows(r.data);
    else toast.error(r.error);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (p) =>
        p.po_number.toLowerCase().includes(q) ||
        p.vendor_name.toLowerCase().includes(q) ||
        (p.reference?.toLowerCase().includes(q) ?? false)
    );
  }, [rows, search]);

  const openEdit = async (id: string) => {
    setOpening(true);
    const r = await getPurchaseOrderAction(id);
    setOpening(false);
    if (r.ok) setDrawer({ open: true, mode: { kind: "edit", detail: r.data } });
    else toast.error(r.error);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${rows.length} purchase order${rows.length === 1 ? "" : "s"}`}
        title="Purchase Orders"
        description="Draft and track orders to your vendors"
        actions={
          <button
            type="button"
            disabled={vendorOptions.length === 0}
            onClick={() => setDrawer({ open: true, mode: { kind: "create" } })}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white disabled:opacity-50"
            style={{ background: "var(--brand-primary)" }}
            title={vendorOptions.length === 0 ? "Add a vendor first" : undefined}
          >
            <Plus className="h-3.5 w-3.5" />
            New PO
          </button>
        }
      />

      {rows.length === 0 ? (
        <Card className="border-dashed py-16 text-center" style={{ background: "var(--brand-card)" }}>
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ border: "1px solid color-mix(in oklab, var(--brand-accent) 50%, transparent)" }}
          >
            <ShoppingCart className="h-6 w-6" style={{ color: "var(--brand-accent)" }} />
          </div>
          <p className="nx-eyebrow mb-2">Purchase orders</p>
          <h2 className="font-serif text-3xl tracking-tight" style={{ color: "var(--brand-primary)" }}>
            No purchase orders yet
          </h2>
          <p className="nx-subtitle mx-auto mt-2 max-w-md text-sm">
            {vendorOptions.length === 0
              ? "Add a vendor first, then raise a draft purchase order."
              : "Raise a draft order against a vendor to start tracking it."}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by PO #, vendor, reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <p className="nx-eyebrow-soft">
            {filtered.length} of {rows.length}
          </p>

          <ul className="space-y-2">
            {filtered.map((po) => (
              <PORow
                key={po.id}
                po={po}
                disabled={opening}
                onEdit={() => openEdit(po.id)}
                onDelete={() => setConfirmDelete(po)}
              />
            ))}
          </ul>
        </div>
      )}

      {drawer.open && (
        <PurchaseOrderFormDrawer
          open
          mode={drawer.mode}
          vendorOptions={vendorOptions}
          productOptions={productOptions}
          locationOptions={locationOptions}
          onClose={() => setDrawer({ open: false })}
          onSaved={() => void reload()}
        />
      )}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o && !deleting) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Delete purchase order?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.po_number} and its lines will be permanently
              deleted. This cannot be undone. (The activity log entry is
              preserved for audit purposes.)
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
              className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={performDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function performDelete() {
    if (!confirmDelete) return;
    const po = confirmDelete;
    setDeleting(true);
    deletePurchaseOrderAction(po.id).then((r) => {
      setDeleting(false);
      if (r.ok) {
        setConfirmDelete(null);
        toast.success("Purchase order deleted");
        void reload();
      } else {
        toast.error(r.error);
      }
    });
  }
}

function PORow({
  po,
  disabled,
  onEdit,
  onDelete,
}: {
  po: PurchaseOrderListRow;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group">
      <div
        className="relative flex w-full items-center gap-3 rounded-md border bg-card p-3 transition-shadow hover:shadow-sm"
        style={{ borderColor: "var(--brand-border)" }}
      >
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="flex flex-1 items-center gap-3 text-left disabled:opacity-60"
        >
          <div className="min-w-0 flex-1">
            <p className="font-serif text-sm font-medium leading-tight" style={{ color: "var(--brand-primary)" }}>
              {po.po_number}
              <span className="text-muted-foreground"> · {po.vendor_name}</span>
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
              {po.line_count} line{po.line_count === 1 ? "" : "s"} ·{" "}
              <span className="text-brand-charcoal font-medium">
                {formatCurrency(po.total)}
              </span>
              {po.order_date ? ` · ordered ${po.order_date}` : ""}
              {po.expected_date ? ` · expected ${po.expected_date}` : ""}
            </p>
          </div>
        </button>
        <StatusBadge status={po.status} />
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal rounded p-1"
            aria-label="Edit"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Row actions"
              className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex items-center justify-center rounded p-1"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 data-highlighted:text-red-600"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete PO
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
