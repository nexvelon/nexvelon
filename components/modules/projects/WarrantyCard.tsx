"use client";

// PROJ2-14 — the Warranty & handover card on the project detail page. Lists
// warranties with a derived active/expiring/expired badge (shared expiry
// vocabulary, 60-day window), a "Record handover" action, and an add/edit
// dialog whose start date defaults to the project's substantial-completion date
// (actual_completion) — that's when the warranty clock conventionally starts.

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import {
  listWarrantiesForProjectAction,
  createWarrantyAction,
  updateWarrantyAction,
  recordHandoverAction,
  deleteWarrantyAction,
} from "@/app/(app)/projects/warranty-bond-actions";
import type { WarrantyRow } from "@/lib/api/warranties";
import type { DbWarrantyScope } from "@/lib/types/database";
import { ExpiryBadge } from "@/components/modules/projects/ExpiryBadge";
import { cn } from "@/lib/utils";

const SCOPES: DbWarrantyScope[] = ["workmanship", "equipment", "manufacturer", "extended", "other"];
const SCOPE_LABEL: Record<DbWarrantyScope, string> = {
  workmanship: "Workmanship",
  equipment: "Equipment",
  manufacturer: "Manufacturer",
  extended: "Extended",
  other: "Other",
};

export function WarrantyCard({
  projectId,
  actualCompletion,
  canEdit,
}: {
  projectId: string;
  actualCompletion: string | null;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<WarrantyRow[]>([]);
  const [editing, setEditing] = useState<WarrantyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [handover, setHandover] = useState<WarrantyRow | null>(null);

  const load = () => {
    listWarrantiesForProjectAction(projectId).then((res) => {
      if (res.ok) setRows(res.data);
    });
  };
  useEffect(load, [projectId]);

  const handleDelete = async (w: WarrantyRow) => {
    const res = await deleteWarrantyAction(w.id, projectId, w.job_id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    load();
    toast.success("Warranty removed");
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="nx-eyebrow-soft">Warranty &amp; handover</p>
        {canEdit && (
          <Button type="button" size="xs" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add warranty
          </Button>
        )}
      </div>
      <Card className="p-0 shadow-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground p-4 text-xs">No warranties recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Scope</TableHead>
                  <TableHead className="text-[11px] uppercase">Provider</TableHead>
                  <TableHead className="text-[11px] uppercase">Period</TableHead>
                  <TableHead className="text-[11px] uppercase">State</TableHead>
                  <TableHead className="text-[11px] uppercase">Handover</TableHead>
                  {canEdit && <TableHead className="text-[11px] uppercase" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs">
                      <div className="text-brand-charcoal font-medium">{SCOPE_LABEL[w.scope]}</div>
                      {w.job_label && <div className="text-muted-foreground text-[10px]">{w.job_label}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{w.provider ?? "—"}</TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {w.start_date} → {w.end_date}
                    </TableCell>
                    <TableCell><ExpiryBadge state={w.state} /></TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {w.handover_date ?? (
                        canEdit ? (
                          <button type="button" onClick={() => setHandover(w)} className="text-brand-navy hover:underline">
                            Record
                          </button>
                        ) : "—"
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setEditing(w)} className="text-muted-foreground hover:text-brand-charcoal" aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => handleDelete(w)} className="text-muted-foreground hover:text-red-600" aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {canEdit && (creating || editing) && (
        <WarrantyDialog
          open
          warranty={editing}
          projectId={projectId}
          actualCompletion={actualCompletion}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}

      {canEdit && handover && (
        <HandoverDialog
          warranty={handover}
          projectId={projectId}
          onClose={() => setHandover(null)}
          onSaved={() => {
            setHandover(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function WarrantyDialog({
  open,
  warranty,
  projectId,
  actualCompletion,
  onClose,
  onSaved,
}: {
  open: boolean;
  warranty: WarrantyRow | null;
  projectId: string;
  actualCompletion: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<DbWarrantyScope>(warranty?.scope ?? "workmanship");
  const [provider, setProvider] = useState(warranty?.provider ?? "");
  // Default start to substantial completion (that's when the warranty clock
  // conventionally starts). Editing keeps the stored value.
  const [startDate, setStartDate] = useState(warranty?.start_date ?? actualCompletion ?? "");
  const [durationMonths, setDurationMonths] = useState(
    warranty?.duration_months != null ? String(warranty.duration_months) : "12"
  );
  const [endDate, setEndDate] = useState(warranty?.end_date ?? "");
  const [referenceNumber, setReferenceNumber] = useState(warranty?.reference_number ?? "");
  const [description, setDescription] = useState(warranty?.description ?? "");
  const [saving, setSaving] = useState(false);

  const usedDefault = !warranty && !!actualCompletion && startDate === actualCompletion;
  const invalid = !startDate || (!durationMonths && !endDate) || saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        scope,
        provider: provider.trim() || null,
        startDate,
        durationMonths: durationMonths.trim() === "" ? null : Number(durationMonths),
        endDate: endDate || null,
        referenceNumber: referenceNumber.trim() || null,
        description: description.trim() || null,
      };
      const res = warranty
        ? await updateWarrantyAction(warranty.id, projectId, payload, warranty.job_id)
        : await createWarrantyAction({ projectId, ...payload });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(warranty ? "Warranty updated" : "Warranty added");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{warranty ? "Edit warranty" : "Add warranty"}</DialogTitle>
          <DialogDescription>
            End date is the truth — enter a duration to compute it, or set the end date directly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scope">
              <Select value={scope} onValueChange={(v) => setScope((v ?? "workmanship") as DbWarrantyScope)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (<SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Provider">
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9 text-sm" placeholder="Nexvelon / manufacturer" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Duration (months)">
              <Input value={durationMonths} inputMode="numeric" onChange={(e) => setDurationMonths(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="End date (optional)">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>
          {usedDefault && (
            <p className="text-muted-foreground text-[11px]">
              Start defaulted to the project&rsquo;s substantial-completion date.
            </p>
          )}
          {endDate && (
            <p className="text-muted-foreground text-[11px]">
              End date is set explicitly and takes precedence over the duration.
            </p>
          )}
          <Field label="Reference number">
            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-sm" />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={invalid}>
            {saving ? "Saving…" : warranty ? "Save changes" : "Add warranty"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoverDialog({
  warranty,
  projectId,
  onClose,
  onSaved,
}: {
  warranty: WarrantyRow;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [signedBy, setSignedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await recordHandoverAction(warranty.id, projectId, {
        handoverDate: date,
        signedBy: signedBy.trim() || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Handover recorded");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Record handover
          </DialogTitle>
          <DialogDescription>When the client took possession under this warranty.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Handover date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm tabular-nums" />
          </Field>
          <Field label="Signed by (client rep)">
            <Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} className="h-9 text-sm" />
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving || !date}>
            {saving ? "Saving…" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1")}>
      <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}
