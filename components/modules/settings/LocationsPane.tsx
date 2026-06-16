"use client";

// MOVE-1 — Settings → Locations. Manages stock_locations (warehouses + trucks).
// Mirrors ManufacturersPane, plus a Type toggle (Warehouse / Truck) and a
// holder field for trucks. The seeded Main Warehouse shows here. Writes go
// through requireAdmin-gated server actions. Delete is hard (FK SET NULL keeps
// it non-corrupting + movement history keeps label snapshots); deactivate hides
// a location from the move pickers while preserving it.

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
  listStockLocationsAction,
  createStockLocationAction,
  updateStockLocationAction,
  deleteStockLocationAction,
} from "@/app/(app)/settings/stock-locations-actions";
import type { DbStockLocation } from "@/lib/types/database";

export function LocationsPane() {
  const [rows, setRows] = useState<DbStockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"warehouse" | "truck">("warehouse");
  const [newHolder, setNewHolder] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"warehouse" | "truck">("warehouse");
  const [editHolder, setEditHolder] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<DbStockLocation | null>(
    null
  );
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listStockLocationsAction({ includeInactive });
    if (result.ok) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  // The seeded Main Warehouse (oldest warehouse) is protected from deletion.
  const oldestWarehouseId = rows
    .filter((r) => r.location_type === "warehouse")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.id;

  function handleAdd() {
    const name = newName.trim();
    if (name === "") return;
    start(async () => {
      const result = await createStockLocationAction({
        name,
        location_type: newType,
        holder_name: newType === "truck" ? newHolder.trim() || null : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added "${name}"`);
      setNewName("");
      setNewHolder("");
      setNewType("warehouse");
      load();
    });
  }

  function beginEdit(r: DbStockLocation) {
    setEditingId(r.id);
    setEditName(r.name);
    setEditType(r.location_type === "truck" ? "truck" : "warehouse");
    setEditHolder(r.holder_name ?? "");
  }

  function saveEdit(r: DbStockLocation) {
    const name = editName.trim();
    if (name === "") {
      toast.error("Name is required.");
      return;
    }
    start(async () => {
      const result = await updateStockLocationAction(r.id, {
        name,
        location_type: editType,
        holder_name: editType === "truck" ? editHolder.trim() || null : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Updated");
      setEditingId(null);
      load();
    });
  }

  function setActive(r: DbStockLocation, is_active: boolean) {
    start(async () => {
      const result = await updateStockLocationAction(r.id, { is_active });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(is_active ? `Reactivated "${r.name}"` : `Deactivated "${r.name}"`);
      load();
    });
  }

  function doDelete(r: DbStockLocation) {
    start(async () => {
      const result = await deleteStockLocationAction(r.id);
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
        <h2 className="text-brand-navy font-serif text-lg">Locations</h2>
        <p className="text-muted-foreground text-sm">
          Warehouses and trucks that stock can move between. Trucks carry a
          holder (the tech or sub it&rsquo;s assigned to).
        </p>
      </div>

      {/* Add row */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px]">Name</label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={newType === "truck" ? "Truck 2" : "North Warehouse"}
            className="w-44"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-[11px]">Type</label>
          <Select
            value={newType}
            onValueChange={(v) => setNewType((v as "warehouse" | "truck") ?? "warehouse")}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="warehouse">Warehouse</SelectItem>
              <SelectItem value="truck">Truck</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {newType === "truck" && (
          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px]">Holder</label>
            <Input
              value={newHolder}
              onChange={(e) => setNewHolder(e.target.value)}
              placeholder="e.g. Raj"
              className="w-40"
              disabled={pending}
            />
          </div>
        )}
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
              <TableHead className="text-[11px] uppercase">Type</TableHead>
              <TableHead className="text-[11px] uppercase">Holder</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="w-40 text-right text-[11px] uppercase">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">
                  No locations yet. Add one above.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((r) => {
                const editing = editingId === r.id;
                const protectedRow = r.id === oldestWarehouseId;
                return (
                  <TableRow key={r.id} className={cn(!r.is_active && "opacity-60")}>
                    <TableCell className="text-sm">
                      {editing ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 w-44"
                          disabled={pending}
                        />
                      ) : (
                        <span className="text-brand-charcoal">{r.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Select
                          value={editType}
                          onValueChange={(v) =>
                            setEditType((v as "warehouse" | "truck") ?? "warehouse")
                          }
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="warehouse">Warehouse</SelectItem>
                            <SelectItem value="truck">Truck</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {r.location_type}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {editing ? (
                        editType === "truck" ? (
                          <Input
                            value={editHolder}
                            onChange={(e) => setEditHolder(e.target.value)}
                            placeholder="Holder"
                            className="h-8 w-36"
                            disabled={pending}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        r.holder_name || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          r.is_active ? "text-emerald-700" : "text-muted-foreground"
                        )}
                      >
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
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
                        ) : r.is_active ? (
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
                              onClick={() => setActive(r, false)}
                              disabled={pending}
                              aria-label="Deactivate"
                              title="Deactivate"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            {!protectedRow && (
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
                            )}
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setActive(r, true)}
                              disabled={pending}
                            >
                              Reactivate
                            </Button>
                            {!protectedRow && (
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
                            )}
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

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{confirmDelete?.name}”?</DialogTitle>
            <DialogDescription>
              It will be removed from the move pickers. Stock currently shown
              here loses its location pointer, but movement history keeps its
              label. Prefer Deactivate to retire a truck while keeping it.
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
