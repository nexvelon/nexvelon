"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  createMarginTierAction,
  hardDeleteMarginTierAction,
  listMarginTiersAction,
  restoreMarginTierAction,
  softDeleteMarginTierAction,
  updateMarginTierAction,
} from "@/app/(app)/settings/margin-tiers-actions";
// Type-only import — erased at compile time, so the server-only guard in
// lib/api/margin-tiers.ts never executes in the client bundle.
import type { DbMarginTier } from "@/lib/api/margin-tiers";

type DrawerMode = "create" | "edit";

export function MarginTiersTable() {
  const [rows, setRows] = useState<DbMarginTier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editing, setEditing] = useState<DbMarginTier | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DbMarginTier | null>(
    null
  );

  const [category, setCategory] = useState("");
  const [tier1, setTier1] = useState(0);
  const [tier2, setTier2] = useState(0);
  const [tier3, setTier3] = useState(0);
  const [displayOrder, setDisplayOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  const [isMutating, startTransition] = useTransition();

  const load = useCallback(() => {
    setIsLoading(true);
    listMarginTiersAction({ includeInactive }).then((res) => {
      if (res.ok) {
        const sorted = [...res.data].sort(
          (a, b) =>
            a.display_order - b.display_order ||
            a.category.localeCompare(b.category)
        );
        setRows(sorted);
      } else {
        toast.error(res.error);
      }
      setIsLoading(false);
    });
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const nextOrder =
    rows.reduce((max, r) => Math.max(max, r.display_order), 0) + 1;

  const openCreate = () => {
    setDrawerMode("create");
    setEditing(null);
    setCategory("");
    setTier1(0);
    setTier2(0);
    setTier3(0);
    setDisplayOrder(nextOrder);
    setIsActive(true);
    setDrawerOpen(true);
  };

  const openEdit = (row: DbMarginTier) => {
    setDrawerMode("edit");
    setEditing(row);
    setCategory(row.category);
    setTier1(row.tier_1);
    setTier2(row.tier_2);
    setTier3(row.tier_3);
    setDisplayOrder(row.display_order);
    setIsActive(row.is_active);
    setDrawerOpen(true);
  };

  const clampPct = (n: number) => Math.min(100, Math.max(0, n));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = category.trim();
    if (!trimmed) {
      toast.error("Category is required.");
      return;
    }
    if (trimmed.length > 100) {
      toast.error("Category must be 100 characters or fewer.");
      return;
    }

    startTransition(async () => {
      const payload = {
        category: trimmed,
        tier_1: clampPct(tier1),
        tier_2: clampPct(tier2),
        tier_3: clampPct(tier3),
        display_order: displayOrder,
        is_active: isActive,
      };
      const result =
        drawerMode === "edit" && editing
          ? await updateMarginTierAction(editing.id, payload)
          : await createMarginTierAction(payload);

      if (result.ok) {
        toast.success(
          drawerMode === "edit" ? "Tier saved" : "Tier created"
        );
        setDrawerOpen(false);
        load();
      } else {
        toast.error(result.error);
      }
    });
  };

  const toggleActive = (row: DbMarginTier) => {
    startTransition(async () => {
      const result = row.is_active
        ? await softDeleteMarginTierAction(row.id)
        : await restoreMarginTierAction(row.id);
      if (result.ok) {
        toast.success(
          row.is_active ? "Tier deactivated" : "Tier reactivated"
        );
        load();
      } else {
        toast.error(result.error);
      }
    });
  };

  const performHardDelete = () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    startTransition(async () => {
      const result = await hardDeleteMarginTierAction(target.id);
      if (result.ok) {
        toast.success("Tier deleted");
        setConfirmDelete(null);
        load();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={includeInactive ? "default" : "outline"}
            aria-pressed={includeInactive}
            onClick={() => setIncludeInactive((v) => !v)}
            className="min-w-[3.5rem]"
          >
            {includeInactive ? "On" : "Off"}
          </Button>
          <span className="text-muted-foreground text-xs">Show inactive</span>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add tier
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10px] uppercase">Category</TableHead>
            <TableHead className="text-right text-[10px] uppercase">
              Tier 1
            </TableHead>
            <TableHead className="text-right text-[10px] uppercase">
              Tier 2
            </TableHead>
            <TableHead className="text-right text-[10px] uppercase">
              Tier 3
            </TableHead>
            <TableHead className="text-right text-[10px] uppercase">
              Order
            </TableHead>
            <TableHead className="text-[10px] uppercase">Status</TableHead>
            <TableHead className="text-right text-[10px] uppercase">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-muted-foreground py-8 text-center text-xs"
              >
                Loading margin tiers…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-muted-foreground py-8 text-center text-xs"
              >
                No margin tiers yet. Click &ldquo;Add tier&rdquo; to create
                the first one.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-xs font-medium">
                  {row.category}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {row.tier_1}%
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {row.tier_2}%
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {row.tier_3}%
                </TableCell>
                <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                  {row.display_order}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        row.is_active ? "bg-green-500" : "bg-gray-400"
                      )}
                      aria-hidden
                    />
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      disabled={isMutating}
                      aria-label={`Edit ${row.category}`}
                      className="text-muted-foreground hover:text-brand-navy hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded disabled:opacity-30"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      disabled={isMutating}
                      aria-label={
                        row.is_active
                          ? `Deactivate ${row.category}`
                          : `Activate ${row.category}`
                      }
                      className="text-muted-foreground hover:text-brand-navy hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded disabled:opacity-30"
                    >
                      {row.is_active ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(row)}
                      disabled={isMutating}
                      aria-label={`Delete ${row.category} permanently`}
                      className="text-muted-foreground hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Sheet open={drawerOpen} onOpenChange={(o) => !o && setDrawerOpen(false)}>
        <SheetContent
          side="right"
          className="w-[440px] overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl">
              {drawerMode === "edit"
                ? `Edit tier — ${editing?.category ?? ""}`
                : "Add tier"}
            </SheetTitle>
            <SheetDescription>
              {drawerMode === "edit"
                ? "Update this category's margin tiers."
                : "Create a new category with its three margin tiers."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="mt-category" className="text-xs">
                Category
              </Label>
              <Input
                id="mt-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                maxLength={100}
                required
                autoFocus
                placeholder="e.g. Networking"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mt-t1" className="text-xs">
                  Tier 1 %
                </Label>
                <Input
                  id="mt-t1"
                  type="number"
                  min={0}
                  max={100}
                  value={tier1}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setTier1(isNaN(n) ? 0 : n);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt-t2" className="text-xs">
                  Tier 2 %
                </Label>
                <Input
                  id="mt-t2"
                  type="number"
                  min={0}
                  max={100}
                  value={tier2}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setTier2(isNaN(n) ? 0 : n);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mt-t3" className="text-xs">
                  Tier 3 %
                </Label>
                <Input
                  id="mt-t3"
                  type="number"
                  min={0}
                  max={100}
                  value={tier3}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setTier3(isNaN(n) ? 0 : n);
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mt-order" className="text-xs">
                Display order
              </Label>
              <Input
                id="mt-order"
                type="number"
                value={displayOrder}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setDisplayOrder(isNaN(n) ? 0 : n);
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="mt-active" className="text-xs">
                  Active
                </Label>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Inactive tiers are hidden from the default table view.
                </p>
              </div>
              <Button
                id="mt-active"
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                aria-pressed={isActive}
                onClick={() => setIsActive((v) => !v)}
                className="min-w-[3.5rem]"
              >
                {isActive ? "On" : "Off"}
              </Button>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isMutating}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
                style={{
                  background: "var(--brand-accent)",
                  color: "var(--brand-primary)",
                }}
              >
                {isMutating ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o && !isMutating) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Delete tier permanently?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the &ldquo;{confirmDelete?.category}
              &rdquo; tier from the catalog. Once deleted, the tier cannot be
              restored. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              disabled={isMutating}
              className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={performHardDelete}
              disabled={isMutating}
              className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {isMutating ? "Deleting…" : "Delete permanently"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
