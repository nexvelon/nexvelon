"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  GitBranch,
  HardHat,
  KanbanSquare,
  List,
  ListTree,
  Plus,
  User as UserIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { users } from "@/lib/mock-data/users";
import {
  TASK_PHASES,
  TASK_STATUSES,
  buildTasks,
  type ProjectTask,
  type TaskStatus,
} from "@/lib/project-data";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  readOnly?: boolean;
}

const PRIORITY_STYLE: Record<ProjectTask["priority"], string> = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-sky-50 text-sky-700",
  High: "bg-amber-50 text-amber-800",
  Critical: "bg-red-50 text-red-700",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TasksTab({ project, readOnly }: Props) {
  const seed = useMemo(() => buildTasks(project), [project]);
  const [tasks, setTasks] = useState<ProjectTask[]>(seed);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const userById = new Map(users.map((u) => [u.id, u]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || readOnly) return;
    const targetStatus = over.id as TaskStatus;
    setTasks((prev) =>
      prev.map((t) => (t.id === active.id ? { ...t, status: targetStatus } : t))
    );
  };

  const addTask = (status: TaskStatus) => {
    const next: ProjectTask = {
      id: `t-${project.id}-new-${Date.now()}`,
      projectId: project.id,
      name: "New task",
      phase: "Install",
      status,
      priority: "Medium",
      assigneeId: project.managerId,
      startDate: new Date().toISOString().slice(0, 10),
      durationDays: 2,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString().slice(0, 10),
    };
    setTasks((prev) => [...prev, next]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          <span className="text-brand-charcoal font-semibold">{tasks.length}</span>{" "}
          tasks across {TASK_PHASES.length} phases · drag to reschedule between
          columns.
        </p>
        <div className="bg-muted inline-flex items-center rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setView("kanban")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              view === "kanban"
                ? "bg-card text-brand-navy shadow-sm"
                : "text-muted-foreground hover:text-brand-charcoal"
            )}
          >
            <KanbanSquare className="h-3.5 w-3.5" />
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              view === "list"
                ? "bg-card text-brand-navy shadow-sm"
                : "text-muted-foreground hover:text-brand-charcoal"
            )}
          >
            <List className="h-3.5 w-3.5" />
            List by phase
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {TASK_STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={tasks.filter((t) => t.status === status)}
                userById={userById}
                onAdd={() => addTask(status)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <ListView tasks={tasks} userById={userById} />
      )}
    </div>
  );
}

function KanbanColumn({
  status,
  tasks,
  userById,
  onAdd,
  readOnly,
}: {
  status: TaskStatus;
  tasks: ProjectTask[];
  userById: Map<string, (typeof users)[number]>;
  onAdd: () => void;
  readOnly?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-muted/40 rounded-lg border border-[var(--border)] p-3",
        isOver && "ring-brand-gold/60 ring-2"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-brand-navy font-serif text-sm">{status}</h3>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} assignee={userById.get(t.assigneeId ?? "")} />
        ))}
      </div>
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAdd}
          className="text-muted-foreground hover:text-brand-charcoal mt-2 h-7 w-full justify-start text-xs"
        >
          <Plus className="mr-1 h-3 w-3" />
          Add task
        </Button>
      )}
    </div>
  );
}

function KanbanCard({
  task,
  assignee,
}: {
  task: ProjectTask;
  assignee?: (typeof users)[number];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
      className="bg-card cursor-grab space-y-2 p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-brand-charcoal text-xs leading-snug font-medium">
          {task.name}
        </p>
        {task.isMilestone && (
          <span className="bg-brand-gold/15 text-amber-800 rounded-full px-1.5 py-0.5 text-[9px] font-semibold">
            ★ Milestone
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 font-medium",
            PRIORITY_STYLE[task.priority]
          )}
        >
          {task.priority}
        </span>
        <span className="bg-muted text-brand-charcoal/70 rounded-full px-1.5 py-0.5">
          {task.phase}
        </span>
        {task.isSubcontractor && (
          <span className="bg-purple-100 text-purple-700 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5">
            <HardHat className="h-2.5 w-2.5" />
            Sub
          </span>
        )}
      </div>

      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px]">
        <div className="flex items-center gap-1.5">
          {assignee ? (
            <Avatar className="h-5 w-5">
              <AvatarFallback
                className="text-[8px] font-semibold text-white"
                style={{ backgroundColor: assignee.avatarColor }}
              >
                {initials(assignee.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <UserIcon className="h-3 w-3" />
          )}
          <span>Due {format(parseISO(task.dueDate), "MMM d")}</span>
        </div>
        <div className="flex items-center gap-2">
          {task.dependsOn && task.dependsOn.length > 0 && (
            <span title="Has dependency">
              <GitBranch className="h-3 w-3" />
            </span>
          )}
          {task.subtaskCount && (
            <span className="inline-flex items-center gap-0.5">
              <ListTree className="h-3 w-3" />
              {task.subtaskCount}
            </span>
          )}
          {task.priority === "Critical" && (
            <AlertTriangle className="h-3 w-3 text-red-500" />
          )}
        </div>
      </div>
    </Card>
  );
}

function ListView({
  tasks,
  userById,
}: {
  tasks: ProjectTask[];
  userById: Map<string, (typeof users)[number]>;
}) {
  return (
    <div className="space-y-4">
      {TASK_PHASES.map((phase) => {
        const inPhase = tasks.filter((t) => t.phase === phase);
        if (inPhase.length === 0) return null;
        return (
          <Card key={phase}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
              <h3 className="text-brand-navy font-serif text-sm">{phase}</h3>
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {inPhase.length} tasks
              </span>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {inPhase.map((t) => {
                const assignee = userById.get(t.assigneeId ?? "");
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs"
                  >
                    <Input
                      type="checkbox"
                      checked={t.status === "Done"}
                      readOnly
                      className="h-3.5 w-3.5 cursor-default"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate font-medium",
                          t.status === "Done"
                            ? "text-muted-foreground line-through"
                            : "text-brand-charcoal"
                        )}
                      >
                        {t.name}
                      </p>
                      <p className="text-muted-foreground text-[10px]">
                        Due {format(parseISO(t.dueDate), "MMM d, yyyy")}
                        {assignee ? ` · ${assignee.name}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        PRIORITY_STYLE[t.priority]
                      )}
                    >
                      {t.priority}
                    </span>
                    <span className="bg-muted text-brand-charcoal/70 rounded-full px-1.5 py-0.5 text-[10px]">
                      {t.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
