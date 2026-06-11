"use client";

// PO-1 — vendors list with search, an add/edit drawer, and delete confirm.
// Mirrors app/(app)/clients/ClientsView.tsx (local source-of-truth seeded from
// SSR, refreshed via listVendorsAction after each mutation).

import { useMemo, useState } from "react";
import { Edit3, MoreHorizontal, Plus, Search, Trash2, Truck } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { VendorFormDrawer } from "./VendorFormDrawer";
import { deleteVendorAction, listVendorsAction } from "@/app/(app)/vendors/actions";
import type { DbVendor } from "@/lib/types/database";

interface Props {
  vendors: DbVendor[];
}

export function VendorsView({ vendors }: Props) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<DbVendor[]>(vendors);
  const [drawer, setDrawer] = useState<
    { open: false } | { open: true; mode: { kind: "create" } | { kind: "edit"; vendor: DbVendor } }
  >({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<DbVendor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = async () => {
    const r = await listVendorsAction();
    if (r.ok) setRows(r.data);
    else toast.error(r.error);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.contact_name?.toLowerCase().includes(q) ?? false) ||
        (v.email?.toLowerCase().includes(q) ?? false)
    );
  }, [rows, search]);

  const activeCount = rows.filter((v) => v.is_active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${activeCount} active vendor${activeCount === 1 ? "" : "s"}`}
        title="Vendors"
        description="Suppliers you purchase stock from"
        actions={
          <button
            type="button"
            onClick={() => setDrawer({ open: true, mode: { kind: "create" } })}
            className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add vendor
          </button>
        }
      />

      {rows.length === 0 ? (
        <Card className="border-dashed py-16 text-center" style={{ background: "var(--brand-card)" }}>
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ border: "1px solid color-mix(in oklab, var(--brand-accent) 50%, transparent)" }}
          >
            <Truck className="h-6 w-6" style={{ color: "var(--brand-accent)" }} />
          </div>
          <p className="nx-eyebrow mb-2">Vendors module</p>
          <h2 className="font-serif text-3xl tracking-tight" style={{ color: "var(--brand-primary)" }}>
            No vendors yet
          </h2>
          <p className="nx-subtitle mx-auto mt-2 max-w-md text-sm">
            Add the suppliers you buy stock from. Vendors feed purchase orders
            and stock receiving.
          </p>
          <button
            type="button"
            onClick={() => setDrawer({ open: true, mode: { kind: "create" } })}
            className="mt-6 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md"
            style={{
              background: "var(--brand-accent)",
              color: "var(--brand-primary)",
              fontFamily: "var(--font-playfair), serif",
            }}
          >
            <Plus className="h-4 w-4" />
            Add your first vendor
          </button>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search vendors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <p className="nx-eyebrow-soft">
            A–Z · {filtered.length} of {rows.length}
          </p>

          <ul className="space-y-2">
            {filtered.map((v) => (
              <VendorRow
                key={v.id}
                vendor={v}
                onEdit={() => setDrawer({ open: true, mode: { kind: "edit", vendor: v } })}
                onDelete={() => setConfirmDelete(v)}
              />
            ))}
          </ul>
        </div>
      )}

      {drawer.open && (
        <VendorFormDrawer
          open
          mode={drawer.mode}
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
            <DialogTitle className="font-serif">Delete vendor?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.name} will be permanently deleted. This cannot be
              undone. (The activity log entry is preserved for audit purposes.)
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
    const v = confirmDelete;
    setDeleting(true);
    deleteVendorAction(v.id).then((r) => {
      setDeleting(false);
      if (r.ok) {
        setConfirmDelete(null);
        toast.success("Vendor deleted");
        void reload();
      } else {
        toast.error(r.error);
      }
    });
  }
}

function VendorRow({
  vendor,
  onEdit,
  onDelete,
}: {
  vendor: DbVendor;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group">
      <div
        className={cn(
          "relative flex w-full items-center gap-3 rounded-md border bg-card p-3 transition-shadow hover:shadow-sm"
        )}
        style={{ borderColor: "var(--brand-border)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="font-serif text-sm font-medium leading-tight" style={{ color: "var(--brand-primary)" }}>
            {vendor.name}
            {!vendor.is_active && (
              <span className="text-muted-foreground ml-2 text-[10px] uppercase tracking-wide">
                inactive
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
            {vendor.contact_name || "—"}
            {vendor.phone ? ` · ${vendor.phone}` : ""}
            {vendor.payment_terms ? ` · ${vendor.payment_terms}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
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
                Delete vendor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}
