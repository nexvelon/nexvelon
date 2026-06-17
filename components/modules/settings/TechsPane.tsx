"use client";

// JC-1 — Settings → Techs. A managed list (add / inline-edit name + default
// cost rate / deactivate-activate / delete) for the techs feeding labour
// entries on project cost centers. Mirrors ManufacturersPane's UX; writes go
// through requireAdmin-gated server actions.
//
// Delete is blocked server-side once a tech has labour entries (the message
// tells the admin to Deactivate instead). Inactive techs stay listed (and
// historical labour keeps referencing them) but are hidden from the Add Labour
// Select on the project page.

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Pencil, Plus, Power, Trash2, X } from "lucide-react";
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
  listTechsAction,
  createTechAction,
  editTechAction,
  setTechActiveAction,
  deleteTechAction,
} from "@/app/(app)/settings/techs-actions";
import { formatCurrency } from "@/lib/format";
import type { DbTech } from "@/lib/types/database";

export function TechsPane() {
  const [rows, setRows] = useState<DbTech[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DbTech | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listTechsAction();
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
      const result = await createTechAction(name, newRate);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added "${name}"`);
      setNewName("");
      setNewRate("");
      load();
    });
  }

  function beginEdit(r: DbTech) {
    setEditingId(r.id);
    setEditName(r.name);
    setEditRate(r.default_cost_rate === null ? "" : String(r.default_cost_rate));
  }

  function saveEdit(r: DbTech) {
    const name = editName.trim();
    if (name === "") {
      toast.error("Name is required.");
      return;
    }
    start(async () => {
      const result = await editTechAction(r.id, name, editRate);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
      setEditingId(null);
      load();
    });
  }

  function toggleActive(r: DbTech) {
    start(async () => {
      const result = await setTechActiveAction(r.id, !r.is_active);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(r.is_active ? `Deactivated "${r.name}"` : `Activated "${r.name}"`);
      load();
    });
  }

  function doDelete(r: DbTech) {
    start(async () => {
      const result = await deleteTechAction(r.id);
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
        <h2 className="text-brand-navy font-serif text-lg">Techs</h2>
        <p className="text-muted-foreground text-sm">
          Manage the workers available for logging labour against project cost
          centers. A default cost rate (optional) prefills new labour entries
          and can be overridden per entry.
        </p>
      </div>

      {/* Add row */}
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
          placeholder="Add a tech…"
          className="max-w-xs"
          disabled={pending}
        />
        <Input
          value={newRate}
          onChange={(e) => setNewRate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Default rate (optional)"
          inputMode="decimal"
          className="max-w-[12rem]"
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
              <TableHead className="w-40 text-[11px] uppercase">
                Default rate
              </TableHead>
              <TableHead className="w-24 text-[11px] uppercase">Status</TableHead>
              <TableHead className="w-40 text-right text-[11px] uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  No techs yet. Add one above.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((r) => {
                const editing = editingId === r.id;
                return (
                  <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                    <TableCell className="text-sm">
                      {editing ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveEdit(r);
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
                    <TableCell className="text-sm">
                      {editing ? (
                        <Input
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveEdit(r);
                            } else if (e.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                          placeholder="—"
                          inputMode="decimal"
                          className="h-8 max-w-[10rem]"
                          disabled={pending}
                        />
                      ) : (
                        <span className="text-brand-charcoal tabular-nums">
                          {r.default_cost_rate === null
                            ? "—"
                            : formatCurrency(r.default_cost_rate)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.is_active ? (
                        <span className="text-emerald-700">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {editing ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => saveEdit(r)}
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
                              onClick={() => beginEdit(r)}
                              disabled={pending}
                              aria-label="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActive(r)}
                              disabled={pending}
                              aria-label={r.is_active ? "Deactivate" : "Activate"}
                              title={r.is_active ? "Deactivate" : "Activate"}
                            >
                              <Power className="h-3.5 w-3.5" />
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
                );
              })}
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
              This permanently removes the tech. If it has any labour entries the
              delete is blocked — deactivate it instead so history stays intact.
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
