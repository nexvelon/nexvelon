"use client";

// PART-FORM B1 — Settings → Manufacturers. A managed list (add / inline-rename
// / delete) for the manufacturers feeding the part form's Manufacturer
// dropdown. Mirrors InventoryVocabPane's UX; writes go through requireAdmin-
// gated server actions. Deletion is a hard delete (the table has no is_active);
// existing parts keep their free-text manufacturer value regardless.

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
import {
  listManufacturersAction,
  createManufacturerAction,
  renameManufacturerAction,
  deleteManufacturerAction,
} from "@/app/(app)/settings/manufacturers-actions";
import type { DbManufacturer } from "@/lib/types/database";

export function ManufacturersPane() {
  const [rows, setRows] = useState<DbManufacturer[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DbManufacturer | null>(
    null
  );
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listManufacturersAction();
    if (result.ok) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleAdd() {
    const name = newName.trim();
    if (name === "") return;
    start(async () => {
      const result = await createManufacturerAction(name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added "${name}"`);
      setNewName("");
      load();
    });
  }

  function saveRename(r: DbManufacturer) {
    const name = editingValue.trim();
    if (name === "" || name === r.name) {
      setEditingId(null);
      return;
    }
    start(async () => {
      const result = await renameManufacturerAction(r.id, name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Renamed");
      setEditingId(null);
      load();
    });
  }

  function doDelete(r: DbManufacturer) {
    start(async () => {
      const result = await deleteManufacturerAction(r.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${r.name}"`);
      setConfirmDelete(null);
      load();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-brand-navy font-serif text-lg">Manufacturers</h2>
        <p className="text-muted-foreground text-sm">
          Manage the manufacturer options offered on the part form. Existing
          free-text values keep working; these power the dropdown.
        </p>
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
          placeholder="Add a manufacturer…"
          className="max-w-xs"
          disabled={pending}
        />
        <Button onClick={handleAdd} disabled={pending || newName.trim() === ""}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Name</TableHead>
              <TableHead className="w-32 text-right text-[11px] uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={2}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  No manufacturers yet. Add one above.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((r) => (
                <TableRow key={r.id}>
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
                      ) : (
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
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      {/* Delete confirm */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.name}”?</DialogTitle>
            <DialogDescription>
              It will be removed from the manufacturer dropdown. Parts already
              set to this manufacturer keep their value.
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
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
