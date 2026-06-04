"use client";

// Chunk B-1 — settings pane to manage the inventory vocabularies. Segmented by
// kind (Categories / Manufacturers / Units / Storage Locations). Per kind:
// add, inline-rename, deactivate (soft-delete) with a restore path. The seeded
// 'Default' storage location is protected (no delete control). Mirrors the
// ClassificationsPane UX; writes go through requireAdmin-gated server actions.

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  createInventoryVocabAction,
  deleteInventoryVocabAction,
  listInventoryVocabAction,
  restoreInventoryVocabAction,
  updateInventoryVocabAction,
} from "@/app/(app)/settings/inventory-vocab-actions";
import type {
  DbInventoryVocab,
  VocabKind,
} from "@/lib/api/inventory-vocab";

const KINDS: { key: VocabKind; label: string }[] = [
  { key: "category", label: "Categories" },
  { key: "manufacturer", label: "Manufacturers" },
  { key: "unit_of_measure", label: "Units" },
  { key: "storage_location", label: "Storage Locations" },
];

export function InventoryVocabPane() {
  const [kind, setKind] = useState<VocabKind>("category");
  const [rows, setRows] = useState<DbInventoryVocab[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DbInventoryVocab | null>(
    null
  );
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listInventoryVocabAction(kind, { includeInactive });
    if (result.ok) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, [kind, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const isProtected = (r: DbInventoryVocab) =>
    r.kind === "storage_location" && r.name === "Default";

  function handleAdd() {
    const name = newName.trim();
    if (name === "") return;
    start(async () => {
      const result = await createInventoryVocabAction(kind, name);
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Inventory Lists</h2>
        <p className="text-muted-foreground text-sm">
          Manage the dropdown values used across the inventory module. Existing
          free-text values keep working; these power the suggestions.
        </p>
      </div>

      {/* Kind segmented control */}
      <div className="bg-muted/40 inline-flex flex-wrap gap-1 rounded-lg border p-1">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => {
              setKind(k.key);
              setEditingId(null);
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              kind === k.key
                ? "bg-brand-navy text-white"
                : "text-muted-foreground hover:bg-muted hover:text-brand-charcoal"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* Add row */}
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={`Add a ${KINDS.find((k) => k.key === kind)?.label.replace(/s$/, "").toLowerCase()}…`}
          className="max-w-xs"
          disabled={pending}
        />
        <Button onClick={handleAdd} disabled={pending || newName.trim() === ""}>
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

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Name</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="w-32 text-right text-[11px] uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground py-8 text-center text-sm">
                  No values yet. Add one above.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((r) => (
                <TableRow key={r.id} className={cn(!r.is_active && "opacity-60")}>
                  <TableCell className="text-sm">
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
                      <span className="text-brand-charcoal">{r.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        r.is_active
                          ? "text-emerald-700"
                          : "text-muted-foreground"
                      )}
                    >
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
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
                          {!isProtected(r) && (
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
                          )}
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
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      {/* Deactivate confirm */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate “{confirmDelete?.name}”?</DialogTitle>
            <DialogDescription>
              It will be hidden from the dropdowns. You can restore it later.
              {confirmDelete?.kind === "storage_location" && (
                <> Stock in this location will move to Default.</>
              )}
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
