"use client";

// MOVE-1 (CHANGE 6) — universal Move / Assign dialog. Destination is EITHER:
//   (a) a location  — pick a Warehouse / Truck from stock_locations, or
//   (b) a job       — search by PROJECT NUMBER or SITE NAME, pick the project,
//                     then pick its cost-center.
// Plus a quantity (partial moves split the source) and an optional note. There
// is NO way to land stock on a bare site — jobs are cost-centers only.

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { moveStockAction } from "@/app/(app)/inventory/movement-actions";
import {
  listProjectsAction,
  getProjectByIdAction,
} from "@/app/(app)/projects/actions";
import type {
  DbInventoryStock,
  DbStockLocation,
  DbProjectCostCenter,
} from "@/lib/types/database";
import type { ProjectListRow } from "@/lib/api/projects";

type DestMode = "location" | "job";

export function MoveAssignDialog({
  productId,
  unit,
  locations,
  open,
  onOpenChange,
  onMoved,
}: {
  productId: string;
  unit: DbInventoryStock | null;
  locations: DbStockLocation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved: () => void;
}) {
  const [mode, setMode] = useState<DestMode>("location");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  // Job picker state.
  const [projects, setProjects] = useState<ProjectListRow[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [costCenters, setCostCenters] = useState<DbProjectCostCenter[]>([]);
  const [costCenterId, setCostCenterId] = useState("");
  const [loadingCcs, setLoadingCcs] = useState(false);

  // Reset + seed when (re)opened for a unit.
  useEffect(() => {
    if (open && unit) {
      setMode("location");
      setLocationId("");
      setQuantity(String(unit.quantity));
      setNote("");
      setProjectSearch("");
      setProjectId("");
      setCostCenters([]);
      setCostCenterId("");
    }
  }, [open, unit]);

  // Load projects once when the job tab is first used.
  useEffect(() => {
    if (mode !== "job" || projects.length > 0) return;
    let active = true;
    listProjectsAction()
      .then((rows) => {
        if (active) setProjects(rows);
      })
      .catch(() => {
        /* leave empty */
      });
    return () => {
      active = false;
    };
  }, [mode, projects.length]);

  // Load cost-centers when a project is picked.
  useEffect(() => {
    if (!projectId) {
      setCostCenters([]);
      setCostCenterId("");
      return;
    }
    let active = true;
    setLoadingCcs(true);
    getProjectByIdAction(projectId)
      .then((detail) => {
        if (!active) return;
        setCostCenters(detail?.costCenters ?? []);
        setCostCenterId("");
      })
      .catch(() => {
        if (active) setCostCenters([]);
      })
      .finally(() => {
        if (active) setLoadingCcs(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects.slice(0, 20);
    return projects
      .filter((p) =>
        `${p.project_number} ${p.title ?? ""} ${p.client_name ?? ""} ${
          p.site_name ?? ""
        }`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 20);
  }, [projects, projectSearch]);

  if (!unit) return null;

  const max = Number(unit.quantity);
  const qtyNum = Number(quantity);
  const qtyValid = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= max;

  const destReady =
    mode === "location" ? locationId !== "" : costCenterId !== "";

  function handleSubmit() {
    if (!unit) return;
    if (!qtyValid) {
      toast.error(`Quantity must be between 1 and ${max}.`);
      return;
    }
    if (!destReady) {
      toast.error(
        mode === "location" ? "Pick a destination location." : "Pick a cost-center."
      );
      return;
    }
    const destination =
      mode === "location"
        ? ({ kind: "location", locationId } as const)
        : ({ kind: "job", costCenterId } as const);

    startTransition(async () => {
      const result = await moveStockAction({
        productId,
        stockId: unit.id,
        quantity: qtyNum,
        destination,
        note: note.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Moved ${result.data.quantity} to ${result.data.toLabel}${
          result.data.split ? " (split)" : ""
        }`
      );
      onMoved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move / Assign stock</DialogTitle>
          <DialogDescription>
            Relocate this stock to a warehouse, a truck, or a job&rsquo;s
            cost-center. Moving part of the quantity splits the row.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Destination type toggle */}
          <div className="bg-muted/40 inline-flex gap-1 rounded-lg border p-1">
            {(["location", "job"] as DestMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-brand-navy text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-brand-charcoal"
                )}
              >
                {m === "location" ? "Warehouse / Truck" : "Job (cost-center)"}
              </button>
            ))}
          </div>

          {mode === "location" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Destination location</Label>
              <Select value={locationId} onValueChange={(v) => setLocationId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a warehouse or truck…" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.location_type === "truck" && l.holder_name
                        ? `${l.name} — ${l.holder_name}`
                        : l.name}
                      {l.location_type === "truck" ? " (truck)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Find project (number or site)</Label>
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
                  <Input
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder="P-number, site, or client…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)]">
                  {filteredProjects.length === 0 ? (
                    <p className="text-muted-foreground p-3 text-xs">
                      No matching projects.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {filteredProjects.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setProjectId(p.id)}
                            className={cn(
                              "flex w-full flex-col items-start px-3 py-1.5 text-left text-xs hover:bg-muted",
                              projectId === p.id && "bg-muted"
                            )}
                          >
                            <span className="text-brand-navy font-mono font-semibold">
                              {p.project_number}
                            </span>
                            <span className="text-muted-foreground">
                              {p.title || "—"}
                              {p.site_name ? ` · ${p.site_name}` : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {projectId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Cost-center</Label>
                  {loadingCcs ? (
                    <p className="text-muted-foreground text-xs">Loading…</p>
                  ) : costCenters.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      This project has no cost-centers.
                    </p>
                  ) : (
                    <Select
                      value={costCenterId}
                      onValueChange={(v) => setCostCenterId(v ?? "")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a cost-center…" />
                      </SelectTrigger>
                      <SelectContent>
                        {costCenters.map((cc) => (
                          <SelectItem key={cc.id} value={cc.id}>
                            {cc.name}
                            {cc.contract_value
                              ? ` · ${formatCurrency(Number(cc.contract_value))}`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quantity + note */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Quantity <span className="text-muted-foreground">(max {max})</span>
              </Label>
              <Input
                type="number"
                min="1"
                max={max}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Reason / reference…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !qtyValid || !destReady}
          >
            {pending ? "Moving…" : "Move / Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
