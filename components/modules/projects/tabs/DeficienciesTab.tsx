"use client";

// PROJ2-12 — the Deficiencies (punch list) tab. Mirrors PROJ2-11's JobTasksTab:
// list (default) + kanban by status, create/edit dialog, dnd-kit sortable
// reorder. Adds a severity axis (safety = red) and photo evidence via the shared
// signed-URL attachment flow (entity_type='deficiency'; no browser supabase-js).

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  KanbanSquare,
  List,
  Plus,
  Trash2,
  Pencil,
  AlertTriangle,
  Camera,
  Upload,
  X,
} from "lucide-react";
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
  listDeficienciesForJobAction,
  createDeficiencyAction,
  updateDeficiencyAction,
  setDeficiencyStatusAction,
  reorderDeficienciesAction,
  deleteDeficiencyAction,
  getDeficiencyAssigneeOptionsAction,
} from "@/app/(app)/projects/deficiency-actions";
import { listAttachments, createAttachment, deleteAttachment } from "@/app/(app)/attachments/actions";
import { getSignedDownloadUrlAction } from "@/app/(app)/attachments/actions";
import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import type { DeficiencyRow } from "@/lib/api/job-deficiencies";
import type { TaskAssigneeOptions } from "@/lib/api/job-tasks";
import type { DbAttachment } from "@/lib/types/database";
import {
  DEFICIENCY_KANBAN_STATUSES,
  DEFICIENCY_STATUS_LABEL,
  DEFICIENCY_SEVERITY_LABEL,
  DEFICIENCY_SEVERITY_RANK,
  isDeficiencyOverdue,
  isOpenDeficiency,
} from "@/lib/deficiencies/deficiency-status";
import type {
  DbDeficiencySeverity,
  DbDeficiencyStatus,
} from "@/lib/types/database";
import { cn } from "@/lib/utils";

const SEVERITIES: DbDeficiencySeverity[] = ["minor", "major", "safety"];
const ALL_STATUSES: DbDeficiencyStatus[] = [
  "open",
  "in_progress",
  "ready_for_review",
  "closed",
  "waived",
];

const SEVERITY_TONE: Record<DbDeficiencySeverity, string> = {
  minor: "bg-muted text-muted-foreground",
  major: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]",
  safety: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};
const STATUS_TONE: Record<DbDeficiencyStatus, string> = {
  open: "bg-muted text-muted-foreground",
  in_progress: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy",
  ready_for_review: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]",
  closed: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  waived: "bg-muted text-muted-foreground line-through",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
const COLUMN_PREFIX = "col:";
const TECH_PREFIX = "tech:";
const SUB_PREFIX = "sub:";
const UNASSIGNED = "none";

export function DeficienciesTab({
  jobId,
  projectId,
  canEdit,
}: {
  jobId: string;
  projectId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<DeficiencyRow[]>([]);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showWaived, setShowWaived] = useState(false);
  const [editing, setEditing] = useState<DeficiencyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [options, setOptions] = useState<TaskAssigneeOptions>({ techs: [], subcontractors: [] });
  const today = todayIso();

  const load = () => {
    listDeficienciesForJobAction(jobId).then((res) => {
      if (res.ok) setRows(res.data);
    });
  };
  useEffect(load, [jobId]);
  useEffect(() => {
    getDeficiencyAssigneeOptionsAction().then((r) => r.ok && setOptions(r.data));
  }, []);

  const visible = useMemo(
    () => (showWaived ? rows : rows.filter((r) => r.status !== "waived")),
    [rows, showWaived]
  );

  const sorted = useMemo(() => {
    return [...visible].sort(
      (a, b) =>
        DEFICIENCY_SEVERITY_RANK[a.severity] - DEFICIENCY_SEVERITY_RANK[b.severity] ||
        a.sort_order - b.sort_order
    );
  }, [visible]);

  const handleStatus = async (row: DeficiencyRow, status: DbDeficiencyStatus) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status } : r)));
    const res = await setDeficiencyStatusAction(row.id, projectId, jobId, status);
    if (!res.ok) {
      setRows(prev);
      toast.error(res.error);
      return;
    }
    load();
  };

  const handleDelete = async (row: DeficiencyRow) => {
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    const res = await deleteDeficiencyAction(row.id, projectId, jobId);
    if (!res.ok) {
      setRows(prev);
      toast.error(res.error);
      return;
    }
    toast.success("Deficiency deleted");
  };

  const openCount = rows.filter(isOpenDeficiency).length;
  const overdueCount = rows.filter((r) => isDeficiencyOverdue(r, today)).length;
  const safetyOpen = rows.filter((r) => isOpenDeficiency(r) && r.severity === "safety").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button type="button" size="xs" variant={view === "list" ? "secondary" : "outline"} onClick={() => setView("list")}>
            <List className="mr-1 h-3.5 w-3.5" /> List
          </Button>
          <Button type="button" size="xs" variant={view === "kanban" ? "secondary" : "outline"} onClick={() => setView("kanban")}>
            <KanbanSquare className="mr-1 h-3.5 w-3.5" /> Kanban
          </Button>
        </div>
        <label className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={showWaived} onChange={(e) => setShowWaived(e.target.checked)} className="h-3 w-3" />
          Show waived
        </label>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {openCount} open
          {safetyOpen > 0 && <span className="text-destructive ml-2 font-medium">· {safetyOpen} safety</span>}
          {overdueCount > 0 && <span className="text-destructive ml-2 font-medium">· {overdueCount} overdue</span>}
        </span>
        {canEdit && (
          <Button type="button" size="xs" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New deficiency
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="p-6 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            No deficiencies logged on this job.
            {canEdit ? " Log a punch-list item to start tracking." : ""}
          </p>
        </Card>
      ) : view === "list" ? (
        <DeficiencyList
          rows={sorted}
          today={today}
          canEdit={canEdit}
          onEdit={setEditing}
          onStatus={handleStatus}
          onDelete={handleDelete}
        />
      ) : (
        <DeficiencyKanban
          rows={visible}
          today={today}
          canEdit={canEdit}
          projectId={projectId}
          jobId={jobId}
          onEdit={setEditing}
          setRows={setRows}
          reload={load}
        />
      )}

      {canEdit && (creating || editing) && (
        <DeficiencyDialog
          open
          deficiency={editing}
          options={options}
          projectId={projectId}
          jobId={jobId}
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
    </div>
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

function DeficiencyList({
  rows,
  today,
  canEdit,
  onEdit,
  onStatus,
  onDelete,
}: {
  rows: DeficiencyRow[];
  today: string;
  canEdit: boolean;
  onEdit: (d: DeficiencyRow) => void;
  onStatus: (d: DeficiencyRow, s: DbDeficiencyStatus) => void;
  onDelete: (d: DeficiencyRow) => void;
}) {
  return (
    <Card className="p-0 shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Ref</TableHead>
              <TableHead className="text-[11px] uppercase">Deficiency</TableHead>
              <TableHead className="text-[11px] uppercase">Severity</TableHead>
              <TableHead className="text-[11px] uppercase">Assignee</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Due</TableHead>
              <TableHead className="text-[11px] uppercase">Photos</TableHead>
              {canEdit && <TableHead className="text-[11px] uppercase" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => {
              const overdue = isDeficiencyOverdue(d, today);
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.reference ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    <div className="text-brand-charcoal font-medium">{d.title}</div>
                    {d.location && <div className="text-muted-foreground text-[10px]">{d.location}</div>}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", SEVERITY_TONE[d.severity])}>
                      {DEFICIENCY_SEVERITY_LABEL[d.severity]}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.assignee_name ?? <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Select value={d.status} onValueChange={(v) => v && onStatus(d, v as DbDeficiencyStatus)}>
                        <SelectTrigger className="h-7 w-36 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">{DEFICIENCY_STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[d.status])}>
                        {DEFICIENCY_STATUS_LABEL[d.status]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-xs tabular-nums", overdue && "font-semibold text-red-600")}>
                    {d.due_date ?? "—"}
                    {overdue && " · overdue"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {d.photo_count > 0 ? (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <Camera className="h-3 w-3" /> {d.photo_count}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => onEdit(d)} className="text-muted-foreground hover:text-brand-charcoal" aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => onDelete(d)} className="text-muted-foreground hover:text-red-600" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

function DeficiencyKanban({
  rows,
  today,
  canEdit,
  projectId,
  jobId,
  onEdit,
  setRows,
  reload,
}: {
  rows: DeficiencyRow[];
  today: string;
  canEdit: boolean;
  projectId: string;
  jobId: string;
  onEdit: (d: DeficiencyRow) => void;
  setRows: React.Dispatch<React.SetStateAction<DeficiencyRow[]>>;
  reload: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const byStatus = useMemo(() => {
    const map = new Map<DbDeficiencyStatus, DeficiencyRow[]>();
    for (const s of DEFICIENCY_KANBAN_STATUSES) map.set(s, []);
    for (const d of rows) {
      const list = map.get(d.status);
      if (list) list.push(d);
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [rows]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const moving = rows.find((d) => d.id === activeId);
    if (!moving) return;

    const targetStatus: DbDeficiencyStatus | undefined = overId.startsWith(COLUMN_PREFIX)
      ? (overId.slice(COLUMN_PREFIX.length) as DbDeficiencyStatus)
      : rows.find((d) => d.id === overId)?.status;
    if (!targetStatus) return;

    const sameColumn = moving.status === targetStatus;
    let ordered: string[];
    if (sameColumn) {
      const current = byStatus.get(targetStatus) ?? [];
      const oldIdx = current.findIndex((d) => d.id === activeId);
      const newIdx = current.findIndex((d) => d.id === overId);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      ordered = arrayMove(current, oldIdx, newIdx).map((d) => d.id);
    } else {
      const column = (byStatus.get(targetStatus) ?? []).filter((d) => d.id !== activeId);
      const at = overId.startsWith(COLUMN_PREFIX)
        ? column.length
        : Math.max(0, column.findIndex((d) => d.id === overId));
      const ids = column.map((d) => d.id);
      ids.splice(at, 0, activeId);
      ordered = ids;
    }

    const prev = rows;
    setRows((rs) =>
      rs.map((r) =>
        ordered.includes(r.id) ? { ...r, status: targetStatus, sort_order: ordered.indexOf(r.id) } : r
      )
    );
    const res = await reorderDeficienciesAction(ordered, targetStatus, projectId, jobId);
    if (!res.ok) {
      setRows(prev);
      toast.error(res.error);
      reload();
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={canEdit ? handleDragEnd : undefined}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {DEFICIENCY_KANBAN_STATUSES.map((status) => (
          <DeficiencyColumn
            key={status}
            status={status}
            rows={byStatus.get(status) ?? []}
            today={today}
            canEdit={canEdit}
            onEdit={onEdit}
          />
        ))}
      </div>
    </DndContext>
  );
}

function DeficiencyColumn({
  status,
  rows,
  today,
  canEdit,
  onEdit,
}: {
  status: DbDeficiencyStatus;
  rows: DeficiencyRow[];
  today: string;
  canEdit: boolean;
  onEdit: (d: DeficiencyRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });
  return (
    <Card ref={setNodeRef} className={cn("min-h-[140px] space-y-2 p-3 shadow-sm transition-colors", isOver && "bg-muted/50")}>
      <div className="flex items-center justify-between">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[status])}>
          {DEFICIENCY_STATUS_LABEL[status]}
        </span>
        <span className="text-muted-foreground font-mono text-[10px] tabular-nums">{rows.length}</span>
      </div>
      <SortableContext items={rows.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {rows.map((d) => (
            <DeficiencyCard key={d.id} deficiency={d} today={today} canEdit={canEdit} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>
      {rows.length === 0 && <p className="text-muted-foreground py-3 text-center text-[11px] italic">Nothing here</p>}
    </Card>
  );
}

function DeficiencyCard({
  deficiency: d,
  today,
  canEdit,
  onEdit,
}: {
  deficiency: DeficiencyRow;
  today: string;
  canEdit: boolean;
  onEdit: (d: DeficiencyRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: d.id,
    disabled: !canEdit,
  });
  const overdue = isDeficiencyOverdue(d, today);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-md border border-[var(--border)] bg-card p-2 text-xs shadow-sm",
        isDragging && "opacity-50",
        d.severity === "safety" && "border-l-2 border-l-red-500"
      )}
    >
      <div className="flex items-start gap-1.5">
        {canEdit && (
          <button type="button" {...attributes} {...listeners} className="text-muted-foreground hover:text-brand-charcoal mt-0.5 cursor-grab active:cursor-grabbing" aria-label="Drag">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-brand-charcoal font-medium">{d.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium", SEVERITY_TONE[d.severity])}>
              {DEFICIENCY_SEVERITY_LABEL[d.severity]}
            </span>
            {d.assignee_name && <span className="text-muted-foreground text-[10px]">{d.assignee_name}</span>}
            {d.photo_count > 0 && (
              <span className="text-muted-foreground inline-flex items-center gap-0.5 text-[10px]">
                <Camera className="h-2.5 w-2.5" /> {d.photo_count}
              </span>
            )}
            {d.due_date && (
              <span className={cn("text-[10px] tabular-nums", overdue ? "font-semibold text-red-600" : "text-muted-foreground")}>
                {overdue && <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
                {d.due_date}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <button type="button" onClick={() => onEdit(d)} className="text-muted-foreground hover:text-brand-charcoal" aria-label="Edit">
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Create / edit dialog (with photo evidence) ──────────────────────────────

function DeficiencyDialog({
  open,
  deficiency,
  options,
  projectId,
  jobId,
  onClose,
  onSaved,
}: {
  open: boolean;
  deficiency: DeficiencyRow | null;
  options: TaskAssigneeOptions;
  projectId: string;
  jobId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reference, setReference] = useState(deficiency?.reference ?? "");
  const [title, setTitle] = useState(deficiency?.title ?? "");
  const [description, setDescription] = useState(deficiency?.description ?? "");
  const [location, setLocation] = useState(deficiency?.location ?? "");
  const [severity, setSeverity] = useState<DbDeficiencySeverity>(deficiency?.severity ?? "minor");
  const [raisedBy, setRaisedBy] = useState(deficiency?.raised_by ?? "");
  const [dueDate, setDueDate] = useState(deficiency?.due_date ?? "");
  const [assignee, setAssignee] = useState(
    deficiency?.assignee_tech_id
      ? `${TECH_PREFIX}${deficiency.assignee_tech_id}`
      : deficiency?.assignee_subcontractor_id
        ? `${SUB_PREFIX}${deficiency.assignee_subcontractor_id}`
        : UNASSIGNED
  );
  const [saving, setSaving] = useState(false);

  const invalid = !title.trim() || title.trim().length > 200 || saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        reference: reference.trim() || null,
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        severity,
        raisedBy: raisedBy.trim() || null,
        dueDate: dueDate || null,
        assigneeTechId: assignee.startsWith(TECH_PREFIX) ? assignee.slice(TECH_PREFIX.length) : null,
        assigneeSubcontractorId: assignee.startsWith(SUB_PREFIX) ? assignee.slice(SUB_PREFIX.length) : null,
      };
      const res = deficiency
        ? await updateDeficiencyAction(deficiency.id, projectId, jobId, payload)
        : await createDeficiencyAction({ projectId, jobId, ...payload });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(deficiency ? "Deficiency updated" : "Deficiency logged");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{deficiency ? "Edit deficiency" : "New deficiency"}</DialogTitle>
          <DialogDescription>A punch-list item against this job.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Reference">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 text-sm" placeholder="D-001" />
            </Field>
            <Field label="Severity">
              <Select value={severity} onValueChange={(v) => setSeverity((v ?? "minor") as DbDeficiencySeverity)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (<SelectItem key={s} value={s}>{DEFICIENCY_SEVERITY_LABEL[s]}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-9 text-sm" placeholder="e.g. Camera 4 offline" />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-9 text-sm" placeholder="Level 2 east corridor" />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Raised by">
              <Input value={raisedBy} onChange={(e) => setRaisedBy(e.target.value)} className="h-9 text-sm" placeholder="Consultant / client" />
            </Field>
            <Field label="Assignee">
              <Select value={assignee} onValueChange={(v) => setAssignee(v ?? UNASSIGNED)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {options.techs.length > 0 && <div className="text-muted-foreground px-2 py-1 text-[10px] uppercase">Technicians</div>}
                  {options.techs.map((t) => (<SelectItem key={t.id} value={`${TECH_PREFIX}${t.id}`}>{t.name}</SelectItem>))}
                  {options.subcontractors.length > 0 && <div className="text-muted-foreground px-2 py-1 text-[10px] uppercase">Subcontractors</div>}
                  {options.subcontractors.map((s) => (<SelectItem key={s.id} value={`${SUB_PREFIX}${s.id}`}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Photos — only after the deficiency exists (needs an id to attach to). */}
          {deficiency ? (
            <DeficiencyPhotos deficiencyId={deficiency.id} />
          ) : (
            <p className="text-muted-foreground text-[11px]">Save the deficiency first, then reopen it to add photos.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={invalid}>
            {saving ? "Saving…" : deficiency ? "Save changes" : "Log deficiency"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeficiencyPhotos({ deficiencyId }: { deficiencyId: string }) {
  const [photos, setPhotos] = useState<DbAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    listAttachments("deficiency", deficiencyId).then((r) => r.ok && setPhotos(r.data));
  };
  useEffect(load, [deficiencyId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const up = await uploadViaSignedUrl({ entityType: "deficiency", entityId: deficiencyId, file });
      if (!up.ok) {
        toast.error(up.error);
        return;
      }
      const att = await createAttachment("deficiency", deficiencyId, "Photos", {
        path: up.path,
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (!att.ok) {
        toast.error(att.error);
        return;
      }
      load();
      toast.success("Photo added");
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (id: string) => {
    const res = await getSignedDownloadUrlAction({ attachmentId: id });
    if (res.ok) window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    else toast.error(res.error);
  };

  const handleDelete = async (id: string) => {
    const res = await deleteAttachment(id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    load();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">Photos</Label>
        <label className="text-brand-navy inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium">
          <Upload className="h-3 w-3" /> {uploading ? "Uploading…" : "Add photo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {photos.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">No photos yet.</p>
      ) : (
        <ul className="space-y-1">
          {photos.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-xs">
              <button type="button" onClick={() => handleView(p.id)} className="text-brand-navy inline-flex items-center gap-1 hover:underline">
                <Camera className="h-3 w-3" /> {p.filename}
              </button>
              <button type="button" onClick={() => handleDelete(p.id)} className="text-muted-foreground ml-auto hover:text-red-600" aria-label="Remove photo">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}
