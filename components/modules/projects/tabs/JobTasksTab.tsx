"use client";

// PROJ2-11 — the real Tasks tab on the Job detail page (replaces the disabled
// "Coming in PROJ2-11" placeholder). Two views over the same data:
//   • LIST (default) — sortable table, overdue dates in red.
//   • KANBAN — todo / in_progress / blocked / done columns; drag to move
//     status and to reorder within a column.
//
// The drag mechanics mirror PROJ2-6a's JobLineItemsTab (@dnd-kit/sortable,
// optimistic reorder → server action → rollback+refresh on failure). The old
// MOCK TasksTab (components/modules/projects/tabs/TasksTab.tsx) is built on the
// legacy mock `Project` type and lib/mock-data/users and is not mounted
// anywhere; its column/card LAYOUT informed this one, but the data layer,
// the sortable behaviour and every control here are new.
//
// Overdue/open semantics come from lib/tasks/task-status.ts so this tab, the
// kanban and the project summary card can never disagree.

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
  listTasksForJobAction,
  createTaskAction,
  updateTaskAction,
  setTaskStatusAction,
  reorderTasksAction,
  deleteTaskAction,
  getTaskAssigneeOptionsAction,
} from "@/app/(app)/projects/task-actions";
import type { TaskRow, TaskAssigneeOptions } from "@/lib/api/job-tasks";
import {
  KANBAN_STATUSES,
  TASK_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_RANK,
  isOverdue,
  isOpen,
} from "@/lib/tasks/task-status";
import type { DbTaskPriority, DbTaskStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const PRIORITIES: DbTaskPriority[] = ["low", "normal", "high", "urgent"];

const PRIORITY_TONE: Record<DbTaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-[color-mix(in_oklab,var(--brand-navy)_12%,transparent)] text-brand-navy",
  high: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]",
  urgent: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

const STATUS_TONE: Record<DbTaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy",
  blocked: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
  done: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const COLUMN_PREFIX = "col:";

export function JobTasksTab({
  jobId,
  projectId,
  canEdit,
}: {
  jobId: string;
  projectId: string;
  canEdit: boolean;
}) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showCancelled, setShowCancelled] = useState(false);
  const [sortBy, setSortBy] = useState<"due" | "priority">("due");
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [options, setOptions] = useState<TaskAssigneeOptions>({
    techs: [],
    subcontractors: [],
  });
  const today = todayIso();

  const load = () => {
    listTasksForJobAction(jobId).then((res) => {
      if (res.ok) setTasks(res.data);
    });
  };
  useEffect(load, [jobId]);
  useEffect(() => {
    getTaskAssigneeOptionsAction().then((r) => r.ok && setOptions(r.data));
  }, []);

  const visible = useMemo(
    () => (showCancelled ? tasks : tasks.filter((t) => t.status !== "cancelled")),
    [tasks, showCancelled]
  );

  const sorted = useMemo(() => {
    const rows = [...visible];
    if (sortBy === "priority") {
      rows.sort(
        (a, b) =>
          TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority] ||
          a.sort_order - b.sort_order
      );
    } else {
      // Due date ascending, undated last, then by column order.
      rows.sort((a, b) => {
        if (a.due_date !== b.due_date) {
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date < b.due_date ? -1 : 1;
        }
        return a.sort_order - b.sort_order;
      });
    }
    return rows;
  }, [visible, sortBy]);

  const handleStatus = async (task: TaskRow, status: DbTaskStatus) => {
    const prev = tasks;
    setTasks((rows) => rows.map((r) => (r.id === task.id ? { ...r, status } : r)));
    const res = await setTaskStatusAction(task.id, projectId, status, jobId);
    if (!res.ok) {
      setTasks(prev);
      toast.error(res.error);
      return;
    }
    load();
  };

  const handleDelete = async (task: TaskRow) => {
    const prev = tasks;
    setTasks((rows) => rows.filter((r) => r.id !== task.id));
    const res = await deleteTaskAction(task.id, projectId, jobId);
    if (!res.ok) {
      setTasks(prev);
      toast.error(res.error);
      return;
    }
    toast.success("Task deleted");
  };

  const openCount = tasks.filter(isOpen).length;
  const overdueCount = tasks.filter((t) => isOverdue(t, today)).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant={view === "list" ? "secondary" : "outline"}
            onClick={() => setView("list")}
          >
            <List className="mr-1 h-3.5 w-3.5" /> List
          </Button>
          <Button
            type="button"
            size="xs"
            variant={view === "kanban" ? "secondary" : "outline"}
            onClick={() => setView("kanban")}
          >
            <KanbanSquare className="mr-1 h-3.5 w-3.5" /> Kanban
          </Button>
        </div>

        {view === "list" && (
          <Select value={sortBy} onValueChange={(v) => setSortBy((v ?? "due") as "due" | "priority")}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due" className="text-xs">Sort by due date</SelectItem>
              <SelectItem value="priority" className="text-xs">Sort by priority</SelectItem>
            </SelectContent>
          </Select>
        )}

        <label className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="h-3 w-3"
          />
          Show cancelled
        </label>

        <span className="text-muted-foreground ml-auto text-[11px]">
          {openCount} open
          {overdueCount > 0 && (
            <span className="text-destructive ml-2 font-medium">
              · {overdueCount} overdue
            </span>
          )}
        </span>

        {canEdit && (
          <Button type="button" size="xs" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New task
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <Card className="p-6 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            No tasks on this job yet.
            {canEdit ? " Create one to start tracking the work." : ""}
          </p>
        </Card>
      ) : view === "list" ? (
        <TaskList
          tasks={sorted}
          today={today}
          canEdit={canEdit}
          onEdit={setEditing}
          onStatus={handleStatus}
          onDelete={handleDelete}
        />
      ) : (
        <TaskKanban
          tasks={visible}
          today={today}
          canEdit={canEdit}
          projectId={projectId}
          jobId={jobId}
          onEdit={setEditing}
          setTasks={setTasks}
          reload={load}
        />
      )}

      {canEdit && (creating || editing) && (
        <TaskFormDialog
          open
          task={editing}
          options={options}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (values) => {
            const res = editing
              ? await updateTaskAction(editing.id, projectId, values, jobId)
              : await createTaskAction({ projectId, jobId, ...values });
            if (!res.ok) {
              toast.error(res.error);
              return false;
            }
            toast.success(editing ? "Task updated" : "Task created");
            setCreating(false);
            setEditing(null);
            load();
            return true;
          }}
        />
      )}
    </div>
  );
}

// ─── List view ───────────────────────────────────────────────────────────────

function TaskList({
  tasks,
  today,
  canEdit,
  onEdit,
  onStatus,
  onDelete,
}: {
  tasks: TaskRow[];
  today: string;
  canEdit: boolean;
  onEdit: (t: TaskRow) => void;
  onStatus: (t: TaskRow, s: DbTaskStatus) => void;
  onDelete: (t: TaskRow) => void;
}) {
  return (
    <Card className="p-0 shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Task</TableHead>
              <TableHead className="text-[11px] uppercase">Assignee</TableHead>
              <TableHead className="text-[11px] uppercase">Priority</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-[11px] uppercase">Due</TableHead>
              {canEdit && <TableHead className="text-[11px] uppercase" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => {
              const overdue = isOverdue(t, today);
              return (
                <TableRow key={t.id}>
                  <TableCell className="text-xs">
                    <div className="text-brand-charcoal font-medium">{t.title}</div>
                    {t.description && (
                      <div className="text-muted-foreground line-clamp-1 text-[10px]">
                        {t.description}
                      </div>
                    )}
                    {t.source === "client_request" && (
                      <span className="text-brand-navy text-[10px]">Client request</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.assignee_name ?? <span className="text-muted-foreground">Unassigned</span>}
                    {t.assignee_kind === "subcontractor" && (
                      <span className="text-muted-foreground ml-1 text-[10px]">(sub)</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", PRIORITY_TONE[t.priority])}>
                      {TASK_PRIORITY_LABEL[t.priority]}
                    </span>
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Select value={t.status} onValueChange={(v) => v && onStatus(t, v as DbTaskStatus)}>
                        <SelectTrigger className="h-7 w-32 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["todo", "in_progress", "blocked", "done", "cancelled"] as DbTaskStatus[]).map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {TASK_STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[t.status])}>
                        {TASK_STATUS_LABEL[t.status]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn("text-xs tabular-nums", overdue && "font-semibold text-red-600")}>
                    {t.due_date ?? "—"}
                    {overdue && " · overdue"}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(t)}
                          className="text-muted-foreground hover:text-brand-charcoal"
                          aria-label="Edit task"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(t)}
                          className="text-muted-foreground hover:text-red-600"
                          aria-label="Delete task"
                        >
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

// ─── Kanban view ─────────────────────────────────────────────────────────────

function TaskKanban({
  tasks,
  today,
  canEdit,
  projectId,
  jobId,
  onEdit,
  setTasks,
  reload,
}: {
  tasks: TaskRow[];
  today: string;
  canEdit: boolean;
  projectId: string;
  jobId: string;
  onEdit: (t: TaskRow) => void;
  setTasks: React.Dispatch<React.SetStateAction<TaskRow[]>>;
  reload: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const byStatus = useMemo(() => {
    const map = new Map<DbTaskStatus, TaskRow[]>();
    for (const s of KANBAN_STATUSES) map.set(s, []);
    for (const t of tasks) {
      const list = map.get(t.status);
      if (list) list.push(t);
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [tasks]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const moving = tasks.find((t) => t.id === activeId);
    if (!moving) return;

    // The drop target is either a column shell or another card.
    const targetStatus: DbTaskStatus | undefined = overId.startsWith(COLUMN_PREFIX)
      ? (overId.slice(COLUMN_PREFIX.length) as DbTaskStatus)
      : tasks.find((t) => t.id === overId)?.status;
    if (!targetStatus) return;

    const sameColumn = moving.status === targetStatus;
    const column = (byStatus.get(targetStatus) ?? []).filter((t) => t.id !== activeId);

    let ordered: string[];
    if (sameColumn) {
      const current = byStatus.get(targetStatus) ?? [];
      const oldIdx = current.findIndex((t) => t.id === activeId);
      const newIdx = current.findIndex((t) => t.id === overId);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      ordered = arrayMove(current, oldIdx, newIdx).map((t) => t.id);
    } else {
      // Insert above the card it was dropped on; append when dropped on the shell.
      const at = overId.startsWith(COLUMN_PREFIX)
        ? column.length
        : Math.max(0, column.findIndex((t) => t.id === overId));
      const ids = column.map((t) => t.id);
      ids.splice(at, 0, activeId);
      ordered = ids;
    }

    const prev = tasks;
    // Optimistic: apply the new status + order locally, then persist.
    setTasks((rows) =>
      rows.map((r) =>
        ordered.includes(r.id)
          ? { ...r, status: targetStatus, sort_order: ordered.indexOf(r.id) }
          : r
      )
    );

    const res = await reorderTasksAction(ordered, targetStatus, projectId, jobId);
    if (!res.ok) {
      setTasks(prev);
      toast.error(res.error);
      reload();
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={canEdit ? handleDragEnd : undefined}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {KANBAN_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={byStatus.get(status) ?? []}
            today={today}
            canEdit={canEdit}
            onEdit={onEdit}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  tasks,
  today,
  canEdit,
  onEdit,
}: {
  status: DbTaskStatus;
  tasks: TaskRow[];
  today: string;
  canEdit: boolean;
  onEdit: (t: TaskRow) => void;
}) {
  // The column shell is itself droppable so an EMPTY column still accepts cards.
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status}` });

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "min-h-[140px] space-y-2 p-3 shadow-sm transition-colors",
        isOver && "bg-muted/50"
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[status])}>
          {TASK_STATUS_LABEL[status]}
        </span>
        <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
          {tasks.length}
        </span>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map((t) => (
            <KanbanCard key={t.id} task={t} today={today} canEdit={canEdit} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>

      {tasks.length === 0 && (
        <p className="text-muted-foreground py-3 text-center text-[11px] italic">
          Nothing here
        </p>
      )}
    </Card>
  );
}

function KanbanCard({
  task,
  today,
  canEdit,
  onEdit,
}: {
  task: TaskRow;
  today: string;
  canEdit: boolean;
  onEdit: (t: TaskRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !canEdit });
  const overdue = isOverdue(task, today);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-md border border-[var(--border)] bg-card p-2 text-xs shadow-sm",
        isDragging && "opacity-50",
        overdue && "border-l-2 border-l-red-500"
      )}
    >
      <div className="flex items-start gap-1.5">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-muted-foreground hover:text-brand-charcoal mt-0.5 cursor-grab active:cursor-grabbing"
            aria-label="Drag task"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-brand-charcoal font-medium">{task.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium", PRIORITY_TONE[task.priority])}>
              {TASK_PRIORITY_LABEL[task.priority]}
            </span>
            {task.assignee_name && (
              <span className="text-muted-foreground text-[10px]">{task.assignee_name}</span>
            )}
            {task.due_date && (
              <span className={cn("text-[10px] tabular-nums", overdue ? "font-semibold text-red-600" : "text-muted-foreground")}>
                {overdue && <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
                {task.due_date}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="text-muted-foreground hover:text-brand-charcoal"
            aria-label="Edit task"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Create / edit dialog ────────────────────────────────────────────────────

interface TaskFormValues {
  title: string;
  description: string | null;
  priority: DbTaskPriority;
  assigneeTechId: string | null;
  assigneeSubcontractorId: string | null;
  dueDate: string | null;
}

// One picker over BOTH party kinds, grouped — mirrors SUB-6's assignee model.
const UNASSIGNED = "none";
const TECH_PREFIX = "tech:";
const SUB_PREFIX = "sub:";

function TaskFormDialog({
  open,
  task,
  options,
  onClose,
  onSubmit,
}: {
  open: boolean;
  task: TaskRow | null;
  options: TaskAssigneeOptions;
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<DbTaskPriority>(task?.priority ?? "normal");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [assignee, setAssignee] = useState(
    task?.assignee_tech_id
      ? `${TECH_PREFIX}${task.assignee_tech_id}`
      : task?.assignee_subcontractor_id
        ? `${SUB_PREFIX}${task.assignee_subcontractor_id}`
        : UNASSIGNED
  );
  const [saving, setSaving] = useState(false);

  const invalid = !title.trim() || title.trim().length > 200 || saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigneeTechId: assignee.startsWith(TECH_PREFIX)
          ? assignee.slice(TECH_PREFIX.length)
          : null,
        assigneeSubcontractorId: assignee.startsWith(SUB_PREFIX)
          ? assignee.slice(SUB_PREFIX.length)
          : null,
        dueDate: dueDate || null,
      });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            Track a piece of work on this job. An assignee is optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="h-9 text-sm"
              placeholder="e.g. Pull cable to IDF 3"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select value={priority} onValueChange={(v) => setPriority((v ?? "normal") as DbTaskPriority)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Due date">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 text-sm tabular-nums"
              />
            </Field>
          </div>
          <Field label="Assignee">
            <Select value={assignee} onValueChange={(v) => setAssignee(v ?? UNASSIGNED)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {options.techs.length > 0 && (
                  <>
                    <div className="text-muted-foreground px-2 py-1 text-[10px] uppercase tracking-wide">
                      Technicians
                    </div>
                    {options.techs.map((t) => (
                      <SelectItem key={t.id} value={`${TECH_PREFIX}${t.id}`}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </>
                )}
                {options.subcontractors.length > 0 && (
                  <>
                    <div className="text-muted-foreground px-2 py-1 text-[10px] uppercase tracking-wide">
                      Subcontractors
                    </div>
                    {options.subcontractors.map((s) => (
                      <SelectItem key={s.id} value={`${SUB_PREFIX}${s.id}`}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={invalid}>
            {saving ? "Saving…" : task ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
