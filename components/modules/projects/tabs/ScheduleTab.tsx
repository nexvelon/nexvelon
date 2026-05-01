"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { HardHat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { users } from "@/lib/mock-data/users";
import { TODAY } from "@/lib/dashboard-data";
import { buildTasks, type ProjectTask } from "@/lib/project-data";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface Props {
  project: Project;
  readOnly?: boolean;
}

type Granularity = "day" | "week" | "month";

const CELL_PX: Record<Granularity, number> = {
  day: 30,
  week: 14,
  month: 6,
};

export function ScheduleTab({ project, readOnly }: Props) {
  const initial = useMemo(() => buildTasks(project), [project]);
  const [tasks, setTasks] = useState<ProjectTask[]>(initial);
  const [granularity, setGranularity] = useState<Granularity>("week");
  const userById = new Map(users.map((u) => [u.id, u]));

  const projectStart = parseISO(project.startDate);
  const projectEnd = parseISO(project.targetDate);

  // Calendar window — pad project window with one month each side.
  const calStart = startOfWeek(addDays(startOfMonth(projectStart), -7));
  const calEnd = addDays(endOfMonth(projectEnd), 14);
  const totalDays = differenceInCalendarDays(calEnd, calStart) + 1;
  const cell = CELL_PX[granularity];
  const totalWidth = totalDays * cell;
  const todayOffset = differenceInCalendarDays(TODAY, calStart);

  const handleDrag = (taskId: string, deltaDays: number) => {
    if (readOnly) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const newStart = addDays(parseISO(t.startDate), deltaDays);
        const newDue = addDays(parseISO(t.dueDate), deltaDays);
        return {
          ...t,
          startDate: newStart.toISOString().slice(0, 10),
          dueDate: newDue.toISOString().slice(0, 10),
        };
      })
    );
  };

  // Build month band header for context (shown on top in addition to day cells).
  const monthBands: Array<{ label: string; offsetDays: number; widthDays: number }> = [];
  {
    let cursor = calStart;
    while (cursor <= calEnd) {
      const monthEnd = endOfMonth(cursor);
      const offset = differenceInCalendarDays(cursor, calStart);
      const span =
        Math.min(differenceInCalendarDays(monthEnd, calStart), totalDays - 1) - offset + 1;
      monthBands.push({
        label: format(cursor, "MMM yyyy"),
        offsetDays: offset,
        widthDays: span,
      });
      cursor = addDays(monthEnd, 1);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-muted-foreground text-xs">
          {tasks.length} tasks · {format(parseISO(project.startDate), "MMM d, yyyy")} →{" "}
          {format(parseISO(project.targetDate), "MMM d, yyyy")}
        </p>
        <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
          {(["day", "week", "month"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                granularity === g
                  ? "bg-card text-brand-navy shadow-sm"
                  : "text-muted-foreground hover:text-brand-charcoal"
              )}
            >
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[280px_1fr]">
        {/* Sticky task list */}
        <div className="border-r border-[var(--border)]">
          <div className="bg-muted/50 text-muted-foreground sticky top-0 z-10 grid grid-cols-[1fr_auto_auto] gap-2 border-b border-[var(--border)] px-3 py-2 text-[10px] uppercase tracking-wider">
            <span>Task</span>
            <span>Owner</span>
            <span>Days</span>
          </div>
          {tasks.map((t) => {
            const owner = userById.get(t.assigneeId ?? "");
            return (
              <div
                key={t.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-xs"
                style={{ height: 38 }}
              >
                <div className="min-w-0 truncate">
                  <p
                    className={cn(
                      "truncate",
                      t.isMilestone ? "text-brand-gold font-semibold" : "text-brand-charcoal"
                    )}
                  >
                    {t.isMilestone ? "★ " : ""}
                    {t.name}
                  </p>
                  <p className="text-muted-foreground text-[10px]">{t.phase}</p>
                </div>
                <div className="text-muted-foreground inline-flex items-center gap-1 text-[10px]">
                  {t.isSubcontractor && (
                    <HardHat className="h-3 w-3 text-purple-600" />
                  )}
                  {owner?.name.split(" ")[0] ?? "—"}
                </div>
                <span className="text-brand-charcoal text-[10px] tabular-nums">
                  {t.durationDays}d
                </span>
              </div>
            );
          })}
        </div>

        {/* Timeline */}
        <div className="relative overflow-x-auto">
          <div style={{ width: totalWidth }} className="relative">
            {/* Month bands */}
            <div className="bg-muted/40 border-b border-[var(--border)]">
              {monthBands.map((band, idx) => (
                <span
                  key={idx}
                  className="text-muted-foreground absolute top-0 inline-block py-1 text-[10px] uppercase tracking-wider"
                  style={{
                    left: band.offsetDays * cell,
                    width: band.widthDays * cell,
                  }}
                >
                  <span className="px-2">{band.label}</span>
                </span>
              ))}
              <div style={{ height: 22 }} />
            </div>

            {/* Day grid */}
            <div className="relative">
              {/* Vertical guidelines every 7 days for week view, daily for day view */}
              {Array.from({ length: totalDays }, (_, i) => i)
                .filter((i) =>
                  granularity === "day"
                    ? true
                    : granularity === "week"
                      ? i % 7 === 0
                      : i % 30 === 0
                )
                .map((i) => (
                  <div
                    key={i}
                    className="border-border/50 absolute top-0 bottom-0 border-l"
                    style={{ left: i * cell }}
                  />
                ))}

              {/* Today line */}
              {todayOffset >= 0 && todayOffset <= totalDays && (
                <div
                  className="bg-brand-gold pointer-events-none absolute top-0 bottom-0 z-10 w-[2px]"
                  style={{ left: todayOffset * cell }}
                  aria-hidden
                >
                  <span className="bg-brand-gold absolute -top-0.5 -left-3 rounded px-1 py-0 text-[9px] font-semibold tracking-wider text-white uppercase">
                    Today
                  </span>
                </div>
              )}

              {/* Task rows */}
              {tasks.map((t) => {
                const startDay = differenceInCalendarDays(parseISO(t.startDate), calStart);
                const widthDays = Math.max(1, t.durationDays);
                return (
                  <GanttRow
                    key={t.id}
                    height={38}
                    cell={cell}
                    task={t}
                    startDay={startDay}
                    widthDays={widthDays}
                    onDrag={handleDrag}
                    readOnly={readOnly}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="text-muted-foreground border-t border-[var(--border)] px-4 py-2 text-[11px]">
        <span className="bg-brand-navy mr-1 inline-block h-2 w-3 rounded-sm align-middle" />
        Task ·
        <span className="bg-brand-gold mx-1 inline-block h-2 w-3 rounded-sm align-middle" />
        Milestone ·
        <span
          className="border-brand-navy mx-1 inline-block h-2 w-3 rounded-sm border align-middle"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent 0 3px, rgba(11,27,59,0.5) 3px 5px)",
          }}
        />
        Sub-contractor · drag bars to reschedule (visual only)
      </div>
    </Card>
  );
}

function GanttRow({
  height,
  cell,
  task,
  startDay,
  widthDays,
  onDrag,
  readOnly,
}: {
  height: number;
  cell: number;
  task: ProjectTask;
  startDay: number;
  widthDays: number;
  onDrag: (id: string, deltaDays: number) => void;
  readOnly?: boolean;
}) {
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (readOnly) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    let lastDelta = 0;

    const onMove = (ev: PointerEvent) => {
      const px = ev.clientX - startX;
      const days = Math.round(px / cell);
      target.style.transform = `translateX(${days * cell}px)`;
      lastDelta = days;
    };
    const onUp = () => {
      target.style.transform = "";
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", onMove as unknown as EventListener);
      target.removeEventListener("pointerup", onUp as unknown as EventListener);
      if (lastDelta !== 0) onDrag(task.id, lastDelta);
    };

    target.addEventListener("pointermove", onMove as unknown as EventListener);
    target.addEventListener("pointerup", onUp as unknown as EventListener);
  };

  return (
    <div className="relative" style={{ height }}>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        className={cn(
          "absolute top-1.5 cursor-grab rounded-md text-left text-[10px] font-medium text-white shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
          task.isMilestone
            ? "bg-brand-gold text-brand-navy"
            : task.isSubcontractor
              ? "bg-brand-navy/80 border-brand-navy border"
              : "bg-brand-navy"
        )}
        style={{
          left: startDay * cell,
          width: widthDays * cell,
          height: height - 12,
          backgroundImage: task.isSubcontractor
            ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 4px, transparent 4px 8px)"
            : undefined,
        }}
        title={`${task.name} (${task.startDate} → ${task.dueDate})`}
      >
        <span className="block truncate px-2 py-1">
          {task.isMilestone ? "★ " : ""}
          {task.name}
        </span>
      </button>
    </div>
  );
}
