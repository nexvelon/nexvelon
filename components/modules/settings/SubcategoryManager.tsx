"use client";

// CAT-3 — Settings management for inventory sub-categories. A sub-category is an
// inventory_vocab row of kind 'subcategory' whose parent_id points at a
// 'category' row. Mirrors the InventoryVocabPane UX (add / inline-rename /
// deactivate + restore) but adds a required parent-category selector and groups
// the list under each parent. Writes go through the requireAdmin-gated actions.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  createInventoryVocabAction,
  deleteInventoryVocabAction,
  listInventoryVocabAction,
  listSubcategoriesAction,
  restoreInventoryVocabAction,
  updateInventoryVocabAction,
} from "@/app/(app)/settings/inventory-vocab-actions";
import type { DbInventoryVocab } from "@/lib/api/inventory-vocab";

export function SubcategoryManager() {
  const [categories, setCategories] = useState<DbInventoryVocab[]>([]);
  const [subs, setSubs] = useState<DbInventoryVocab[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DbInventoryVocab | null>(
    null
  );
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const [cats, subRows] = await Promise.all([
      listInventoryVocabAction("category"),
      listSubcategoriesAction({ includeInactive }),
    ]);
    if (cats.ok) setCategories(cats.data);
    else toast.error(cats.error);
    if (subRows.ok) setSubs(subRows.data);
    else toast.error(subRows.error);
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryName = useCallback(
    (id: string | null) =>
      categories.find((c) => c.id === id)?.name ?? "(unknown category)",
    [categories]
  );

  // Group subcategories under their parent, ordered by parent name.
  const grouped = useMemo(() => {
    const byParent = new Map<string, DbInventoryVocab[]>();
    for (const s of subs) {
      const key = s.parent_id ?? "";
      const list = byParent.get(key);
      if (list) list.push(s);
      else byParent.set(key, [s]);
    }
    return [...byParent.entries()].sort((a, b) =>
      categoryName(a[0]).localeCompare(categoryName(b[0]))
    );
  }, [subs, categoryName]);

  function handleAdd() {
    const name = newName.trim();
    if (name === "" || newParentId === "") return;
    start(async () => {
      const result = await createInventoryVocabAction(
        "subcategory",
        name,
        newParentId
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added "${name}"`);
      setNewName("");
      load();
    });
  }

  function saveRename(r: DbInventoryVocab) {
    const name = editingValue.trim();
    if (name === "" || name === r.name) {
      setEditingId(null);
      return;
    }
    start(async () => {
      const result = await updateInventoryVocabAction(r.id, { name });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Renamed");
      setEditingId(null);
      load();
    });
  }

  function doDelete(r: DbInventoryVocab) {
    start(async () => {
      const result = await deleteInventoryVocabAction(r.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deactivated "${r.name}"`);
      setConfirmDelete(null);
      load();
    });
  }

  function doRestore(r: DbInventoryVocab) {
    start(async () => {
      const result = await restoreInventoryVocabAction(r.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Restored "${r.name}"`);
      load();
    });
  }

  const activeCategories = categories.filter((c) => c.is_active);

  return (
    <div className="space-y-4">
      {/* Add row — name + parent category */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a sub-category…"
          className="max-w-xs"
          disabled={pending}
        />
        <Select value={newParentId} onValueChange={(v) => setNewParentId(v ?? "")}>
          <SelectTrigger className="h-9 w-56 text-sm">
            <SelectValue placeholder="Parent category…" />
          </SelectTrigger>
          <SelectContent>
            {activeCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleAdd}
          disabled={pending || newName.trim() === "" || newParentId === ""}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
        <label className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {activeCategories.length === 0 && (
        <p className="text-muted-foreground text-xs">
          Add a category first (Categories tab) — every sub-category needs a
          parent.
        </p>
      )}

      <Card className="bg-card p-4 shadow-sm">
        {loading && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Loading…
          </p>
        )}
        {!loading && subs.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No sub-categories yet. Add one above.
          </p>
        )}
        {!loading &&
          grouped.map(([parentId, rows]) => (
            <div key={parentId} className="mb-4 last:mb-0">
              <h4 className="text-muted-foreground mb-1.5 text-[11px] font-semibold uppercase tracking-wider">
                {categoryName(parentId)}
              </h4>
              <ul className="space-y-1">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-1.5",
                      !r.is_active && "opacity-60"
                    )}
                  >
                    {editingId === r.id ? (
                      <Input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveRename(r);
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                        className="h-8 max-w-xs"
                        disabled={pending}
                      />
                    ) : (
                      <span className="text-brand-charcoal flex-1 text-sm">
                        {r.name}
                      </span>
                    )}
                    {!r.is_active && (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        Inactive
                      </Badge>
                    )}
                    <div className="inline-flex items-center gap-1">
                      {editingId === r.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => saveRename(r)}
                            disabled={pending}
                            aria-label="Save"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            disabled={pending}
                            aria-label="Cancel"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : r.is_active ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(r.id);
                              setEditingValue(r.name);
                            }}
                            disabled={pending}
                            aria-label="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setConfirmDelete(r)}
                            disabled={pending}
                            aria-label="Deactivate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => doRestore(r)}
                          disabled={pending}
                          aria-label="Restore"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </Card>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate “{confirmDelete?.name}”?</DialogTitle>
            <DialogDescription>
              It will be hidden from the sub-category dropdowns. You can restore
              it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => confirmDelete && doDelete(confirmDelete)}
              disabled={pending}
            >
              {pending ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
