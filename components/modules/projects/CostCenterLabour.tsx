"use client";

// JC-1 — per-cost-center Labour subsection rendered under each cost center on
// the project detail view. Shows the cost center's total labour cost as a chip
// (even collapsed); when expanded, lists entries newest-first with per-row
// Edit / Delete and an Add-labour dialog. All writes are financials:edit-gated
// (the `canEdit` prop) at the action layer too.

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  addLabourEntryAction,
  updateLabourEntryAction,
  deleteLabourEntryAction,
  type ProjectLabour,
} from "@/app/(app)/projects/labour-actions";
import { formatCurrency, businessDate, businessDateISO } from "@/lib/format";
import type { DbTech } from "@/lib/types/database";

type LabourEntry = ProjectLabour["entries"][string][number];

interface Props {
  projectId: string;
  costCenter: { id: string; cc_number: string; name: string };
  entries: LabourEntry[];
  total: number;
  techs: DbTech[]; // active techs only
  canEdit: boolean;
  onChanged: () => void;
}

function hoursLabel(h: number): string {
  const n = Number(h);
  return `${Number.isInteger(n) ? n : n.toFixed(2)} h`;
}

export function CostCenterLabour({
  projectId,
  costCenter,
  entries,
  total,
  techs,
  canEdit,
  onChanged,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LabourEntry | null>(null);
  const [pending, start] = useTransition();

  // form state
  const [techId, setTechId] = useState("");
  const [workedOn, setWorkedOn] = useState("");
  const [hours, setHours] = useState("");
  const [costRate, setCostRate] = useState("");
  const [note, setNote] = useState("");

  function openAdd() {
    setEditing(null);
    setTechId("");
    setWorkedOn(businessDateISO());
    setHours("");
    setCostRate("");
    setNote("");
    setDialogOpen(true);
  }

  function openEdit(e: LabourEntry) {
    setEditing(e);
    setTechId(e.tech_id ?? "");
    setWorkedOn(e.worked_on);
    setHours(String(e.hours));
    setCostRate(String(e.cost_rate));
    setNote(e.note ?? "");
    setDialogOpen(true);
  }

  function pickTech(id: string | null) {
    const next = id ?? "";
    setTechId(next);
    // Prefill the rate from the tech's default when the field is still empty,
    // leaving any rate the user already typed untouched.
    if (next && costRate.trim() === "") {
      const t = techs.find((x) => x.id === next);
      if (t?.default_cost_rate != null) setCostRate(String(t.default_cost_rate));
    }
  }

  function submit() {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) {
      toast.error("Hours must be greater than 0.");
      return;
    }
    const rateProvided = costRate.trim() !== "";
    const rate = Number(costRate);
    if (rateProvided && (!Number.isFinite(rate) || rate < 0)) {
      toast.error("Cost rate can't be negative.");
      return;
    }

    if (editing) {
      const patch: {
        tech_id?: string | null;
        tech_name?: string;
        hours?: number;
        cost_rate?: number;
        worked_on?: string;
        note?: string | null;
      } = {};
      if (h !== Number(editing.hours)) patch.hours = h;
      if (rateProvided && rate !== Number(editing.cost_rate)) patch.cost_rate = rate;
      if (workedOn !== editing.worked_on) patch.worked_on = workedOn;
      if ((note.trim() || null) !== (editing.note ?? null)) patch.note = note;
      // Reassigning to a different tech is an explicit name change, so we pass
      // tech_name alongside tech_id. (The API never auto-rewrites tech_name on a
      // tech_id change — and renames never touch it — preserving history.)
      if (techId && techId !== (editing.tech_id ?? "")) {
        patch.tech_id = techId;
        const t = techs.find((x) => x.id === techId);
        if (t) patch.tech_name = t.name;
      }
      if (Object.keys(patch).length === 0) {
        setDialogOpen(false);
        return;
      }
      start(async () => {
        const res = await updateLabourEntryAction(projectId, editing.id, patch);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Labour updated");
        setDialogOpen(false);
        onChanged();
      });
    } else {
      if (!techId) {
        toast.error("Select a tech.");
        return;
      }
      start(async () => {
        const res = await addLabourEntryAction(projectId, {
          cost_center_id: costCenter.id,
          tech_id: techId,
          hours: h,
          cost_rate: rateProvided ? rate : undefined,
          worked_on: workedOn || undefined,
          note: note.trim() || null,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Labour added");
        setDialogOpen(false);
        onChanged();
      });
    }
  }

  function remove(e: LabourEntry) {
    if (!window.confirm(`Delete this labour entry for ${e.tech_name}?`)) return;
    start(async () => {
      const res = await deleteLabourEntryAction(projectId, e.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Labour deleted");
      onChanged();
    });
  }

  // The Add Labour Select shows active techs; when editing an entry whose tech
  // is inactive (or gone), surface it so the control stays meaningful.
  const techOptions = [...techs];
  if (editing && techId && !techOptions.some((t) => t.id === techId)) {
    techOptions.unshift({
      id: techId,
      name: `${editing.tech_name} (inactive)`,
      default_cost_rate: null,
      is_active: false,
      created_at: "",
      updated_at: "",
    });
  }

  return (
    <div className="mt-1.5 rounded-md border border-[var(--border)] bg-[var(--muted)]/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          Labour
        </span>
        <span className="text-muted-foreground text-[11px]">
          · {entries.length}
        </span>
        <span className="text-brand-charcoal ml-auto rounded-full bg-[var(--brand-card)] px-2 py-0.5 text-[11px] font-semibold tabular-nums">
          {formatCurrency(total)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] px-3 py-2">
          {entries.length === 0 ? (
            <p className="text-muted-foreground py-1 text-xs">
              No labour logged yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground w-24 shrink-0 tabular-nums">
                    {businessDate(e.worked_on)}
                  </span>
                  <span className="text-brand-charcoal w-40 shrink-0 truncate">
                    {e.tech_name}
                  </span>
                  <span className="text-muted-foreground w-16 shrink-0 text-right tabular-nums">
                    {hoursLabel(Number(e.hours))}
                  </span>
                  <span className="text-muted-foreground w-24 shrink-0 text-right tabular-nums">
                    {formatCurrency(Number(e.cost_rate))}/h
                  </span>
                  <span className="text-brand-charcoal w-24 shrink-0 text-right font-semibold tabular-nums">
                    {formatCurrency(Number(e.amount))}
                  </span>
                  {e.note ? (
                    <span className="text-muted-foreground flex-1 truncate" title={e.note}>
                      {e.note}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  {canEdit && (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-brand-charcoal"
                        aria-label="Edit labour"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(e)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-red-600"
                        aria-label="Delete labour"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <div className="mt-2">
              <Button type="button" size="sm" variant="outline" onClick={openAdd}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add labour
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit labour" : "Add labour"}
            </DialogTitle>
            <DialogDescription>
              {costCenter.cc_number} · {costCenter.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tech</Label>
              <Select value={techId} onValueChange={pickTech}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tech…" />
                </SelectTrigger>
                <SelectContent>
                  {techOptions.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={t.id}
                      disabled={!t.is_active && t.id !== techId}
                    >
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="labour-date">Date</Label>
                <Input
                  id="labour-date"
                  type="date"
                  value={workedOn}
                  onChange={(e) => setWorkedOn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="labour-hours">Hours</Label>
                <Input
                  id="labour-hours"
                  type="number"
                  min="0"
                  step="0.25"
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="labour-rate">Cost rate / h (optional)</Label>
              <Input
                id="labour-rate"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={costRate}
                onChange={(e) => setCostRate(e.target.value)}
                placeholder="Defaults to the tech's rate"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="labour-note">Note</Label>
              <Textarea
                id="labour-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Saving…" : editing ? "Save" : "Add labour"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
