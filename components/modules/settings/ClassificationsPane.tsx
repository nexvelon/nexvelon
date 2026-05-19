"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, ToggleLeft, ToggleRight } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  createClassificationAction,
  listClassificationsAction,
  restoreClassificationAction,
  softDeleteClassificationAction,
  updateClassificationAction,
} from "@/app/(app)/settings/classifications-actions";
// Type-only import — erased at compile time, so the server-only guard in
// lib/api/classifications.ts never executes in the client bundle.
import type { DbLineItemClassification } from "@/lib/api/classifications";

type AppliesTo = "product" | "labor" | "misc" | "both";

const APPLIES_OPTIONS: { value: AppliesTo; label: string }[] = [
  { value: "product", label: "Product" },
  { value: "labor", label: "Labour" },
  { value: "misc", label: "Misc" },
  { value: "both", label: "Both" },
];

const APPLIES_LABEL: Record<AppliesTo, string> = {
  product: "Product",
  labor: "Labour",
  misc: "Misc",
  both: "Both",
};

const APPLIES_BADGE: Record<AppliesTo, string> = {
  product: "bg-blue-100 text-blue-800",
  labor: "bg-orange-100 text-orange-800",
  misc: "bg-gray-100 text-gray-700",
  both: "bg-purple-100 text-purple-800",
};

type DrawerMode = "create" | "edit";

export function ClassificationsPane() {
  const [rows, setRows] = useState<DbLineItemClassification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editing, setEditing] = useState<DbLineItemClassification | null>(null);

  const [name, setName] = useState("");
  const [appliesTo, setAppliesTo] = useState<AppliesTo>("product");
  const [displayOrder, setDisplayOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  const [isMutating, startTransition] = useTransition();

  const load = useCallback(() => {
    setIsLoading(true);
    listClassificationsAction({ includeInactive }).then((res) => {
      if (res.ok) {
        const sorted = [...res.data].sort(
          (a, b) =>
            a.display_order - b.display_order || a.name.localeCompare(b.name)
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
    setName("");
    setAppliesTo("product");
    setDisplayOrder(nextOrder);
    setIsActive(true);
    setDrawerOpen(true);
  };

  const openEdit = (row: DbLineItemClassification) => {
    setDrawerMode("edit");
    setEditing(row);
    setName(row.name);
    setAppliesTo(row.applies_to);
    setDisplayOrder(row.display_order);
    setIsActive(row.is_active);
    setDrawerOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required.");
      return;
    }
    if (trimmed.length > 100) {
      toast.error("Name must be 100 characters or fewer.");
      return;
    }

    startTransition(async () => {
      const result =
        drawerMode === "edit" && editing
          ? await updateClassificationAction(editing.id, {
              name: trimmed,
              applies_to: appliesTo,
              display_order: displayOrder,
              is_active: isActive,
            })
          : await createClassificationAction({
              name: trimmed,
              applies_to: appliesTo,
              display_order: displayOrder,
              is_active: isActive,
            });

      if (result.ok) {
        toast.success(
          drawerMode === "edit"
            ? "Classification saved"
            : "Classification created"
        );
        setDrawerOpen(false);
        load();
      } else {
        toast.error(result.error);
      }
    });
  };

  const toggleActive = (row: DbLineItemClassification) => {
    startTransition(async () => {
      const result = row.is_active
        ? await softDeleteClassificationAction(row.id)
        : await restoreClassificationAction(row.id);
      if (result.ok) {
        toast.success(
          row.is_active
            ? "Classification deactivated"
            : "Classification reactivated"
        );
        load();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-brand-navy font-serif text-2xl">
            Classifications
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Manage the categories shown in the Type dropdown for line items.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add classification
        </Button>
      </div>

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

      <div className="bg-card rounded-lg border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center text-xs"
                >
                  Loading classifications…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center text-xs"
                >
                  No classifications yet. Click &ldquo;Add
                  classification&rdquo; to create the first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        APPLIES_BADGE[row.applies_to]
                      )}
                    >
                      {APPLIES_LABEL[row.applies_to]}
                    </span>
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
                        aria-label={`Edit ${row.name}`}
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
                            ? `Deactivate ${row.name}`
                            : `Activate ${row.name}`
                        }
                        className="text-muted-foreground hover:text-brand-navy hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded disabled:opacity-30"
                      >
                        {row.is_active ? (
                          <ToggleRight className="h-4 w-4 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={drawerOpen} onOpenChange={(o) => !o && setDrawerOpen(false)}>
        <SheetContent
          side="right"
          className="w-[440px] overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl">
              {drawerMode === "edit"
                ? "Edit classification"
                : "Add classification"}
            </SheetTitle>
            <SheetDescription>
              {drawerMode === "edit"
                ? "Update this line item category."
                : "Create a new line item category for the Type dropdown."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="cls-name" className="text-xs">
                Name
              </Label>
              <Input
                id="cls-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                autoFocus
                placeholder="e.g. Installation Labour"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cls-applies" className="text-xs">
                Applies to
              </Label>
              <Select
                value={appliesTo}
                onValueChange={(v) => setAppliesTo((v ?? "product") as AppliesTo)}
              >
                <SelectTrigger id="cls-applies">
                  <SelectValue>{APPLIES_LABEL[appliesTo]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {APPLIES_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cls-order" className="text-xs">
                Display order
              </Label>
              <Input
                id="cls-order"
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
                <Label htmlFor="cls-active" className="text-xs">
                  Active
                </Label>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Inactive classifications are hidden from the Type dropdown.
                </p>
              </div>
              <Button
                id="cls-active"
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
    </div>
  );
}
