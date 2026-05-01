"use client";

import { useMemo } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Truck } from "lucide-react";
import {
  JOB_TYPE_COLOR,
  jobLabelTime,
  schedulingTechs,
  schedulingSubs,
  type ScheduleJob,
  weekStart,
} from "@/lib/scheduling-data";
import { TODAY } from "@/lib/dashboard-data";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { currentUser } from "@/lib/mock-data/users";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface Props {
  jobs: ScheduleJob[];
  view: "day" | "week" | "month";
  onJobsChange: (j: ScheduleJob[]) => void;
  onJobClick: (j: ScheduleJob) => void;
  onTechClick: (u: User) => void;
}

const HOUR_HEIGHT = 28; // px per hour at week view
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 20;
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

export function CalendarView({
  jobs,
  view,
  onJobsChange,
  onJobClick,
  onTechClick,
}: Props) {
  const { role } = useRole();
  const canViewAll = hasPermission(role, "scheduling", "viewAll");
  const allTechs = useMemo(() => {
    const techs = schedulingTechs();
    const subs = schedulingSubs();
    return [...techs, ...subs];
  }, []);
  const subsIds = useMemo(() => new Set(schedulingSubs().map((u) => u.id)), []);

  // Filter techs based on role.
  const visibleTechs = canViewAll
    ? allTechs
    : allTechs.filter((u) => u.id === currentUser.id);

  const days = useMemo(() => {
    const start = weekStart();
    if (view === "day") return [TODAY];
    if (view === "week")
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    // month: show 28 days starting from start of week, in compact mode
    return Array.from({ length: 28 }, (_, i) => addDays(start, i));
  }, [view]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const droppable = over.id as string; // format: tech::dayIso::hour
    const [techId, dayIso, hourStr] = droppable.split("::");
    if (!techId || !dayIso || !hourStr) return;

    if (active.data.current?.kind === "unassigned") {
      // Convert to a scheduled job
      const newStart = new Date(dayIso);
      newStart.setHours(parseInt(hourStr, 10), 0, 0, 0);
      const placeholder: ScheduleJob = {
        id: `job-${active.id}`,
        type: "Service",
        status: "Scheduled",
        clientId: "c-001",
        techId,
        start: newStart.toISOString(),
        end: new Date(newStart.getTime() + 90 * 60_000).toISOString(),
        durationMin: 90,
        systemSummary: `Newly assigned (${active.id})`,
        priority: "Normal",
        requiredSkills: [],
      };
      onJobsChange([...jobs, placeholder]);
      return;
    }

    // Existing job being moved
    const job = jobs.find((j) => j.id === active.id);
    if (!job) return;
    const newStart = new Date(dayIso);
    newStart.setHours(parseInt(hourStr, 10), 0, 0, 0);
    const duration = job.durationMin;
    const newEnd = new Date(newStart.getTime() + duration * 60_000);
    onJobsChange(
      jobs.map((j) =>
        j.id === job.id
          ? {
              ...j,
              techId,
              start: newStart.toISOString(),
              end: newEnd.toISOString(),
            }
          : j
      )
    );
  };

  return (
    <div className="bg-card overflow-hidden rounded-lg border border-[var(--border)] shadow-sm">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `200px repeat(${days.length}, minmax(${
              view === "month" ? 70 : 140
            }px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="bg-muted/40 sticky top-0 border-b border-[var(--border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tech
          </div>
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={cn(
                "border-b border-l border-[var(--border)] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider",
                isSameDay(d, TODAY)
                  ? "bg-brand-gold/10 text-brand-navy"
                  : "bg-muted/40 text-muted-foreground"
              )}
            >
              {format(d, view === "month" ? "EEEEE d" : "EEE d")}
            </div>
          ))}

          {/* Tech swimlanes */}
          {visibleTechs.map((u) => (
            <Swimlane
              key={u.id}
              tech={u}
              days={days}
              jobs={jobs.filter((j) => j.techId === u.id)}
              isSub={subsIds.has(u.id)}
              compact={view === "month"}
              onJobClick={onJobClick}
              onTechClick={onTechClick}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Swimlane({
  tech,
  days,
  jobs,
  isSub,
  compact,
  onJobClick,
  onTechClick,
}: {
  tech: User;
  days: Date[];
  jobs: ScheduleJob[];
  isSub: boolean;
  compact: boolean;
  onJobClick: (j: ScheduleJob) => void;
  onTechClick: (u: User) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onTechClick(tech)}
        className={cn(
          "border-b border-[var(--border)] bg-card px-3 py-2 text-left transition-colors hover:bg-muted",
          isSub && "border-l-4 border-l-purple-500 border-l-dashed"
        )}
        style={isSub ? { borderLeftStyle: "dashed" } : undefined}
      >
        <p className="text-brand-charcoal text-xs font-semibold leading-tight">
          {tech.name}
          {isSub && (
            <span className="ml-1 inline-flex items-center text-[9px] text-purple-600">
              <Truck className="-mt-0.5 mr-0.5 inline h-2.5 w-2.5" />
              Sub
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-[10px]">{tech.role}</p>
      </button>

      {days.map((d) => {
        const dayJobs = jobs.filter((j) => isSameDay(parseISO(j.start), d));
        return (
          <DayCell
            key={d.toISOString()}
            day={d}
            techId={tech.id}
            jobs={dayJobs}
            compact={compact}
            onJobClick={onJobClick}
          />
        );
      })}
    </>
  );
}

function DayCell({
  day,
  techId,
  jobs,
  compact,
  onJobClick,
}: {
  day: Date;
  techId: string;
  jobs: ScheduleJob[];
  compact: boolean;
  onJobClick: (j: ScheduleJob) => void;
}) {
  const cellHeight = compact ? 44 : HOUR_HEIGHT * HOURS.length;
  return (
    <div
      className={cn(
        "relative border-b border-l border-[var(--border)]",
        isSameDay(day, TODAY) && "bg-brand-gold/5"
      )}
      style={{ height: cellHeight }}
    >
      {!compact && (
        <>
          {HOURS.map((h) => (
            <DropZone key={h} day={day} techId={techId} hour={h} />
          ))}
        </>
      )}
      {compact && (
        <DropZone day={day} techId={techId} hour={9} fullHeight />
      )}

      {jobs.map((j) => (
        <JobBlock
          key={j.id}
          job={j}
          compact={compact}
          onClick={() => onJobClick(j)}
        />
      ))}
    </div>
  );
}

function DropZone({
  day,
  techId,
  hour,
  fullHeight,
}: {
  day: Date;
  techId: string;
  hour: number;
  fullHeight?: boolean;
}) {
  const id = `${techId}::${day.toISOString()}::${hour}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-border/40 absolute left-0 right-0 border-t",
        isOver && "bg-brand-gold/15"
      )}
      style={
        fullHeight
          ? { top: 0, bottom: 0 }
          : {
              top: (hour - DAY_START_HOUR) * HOUR_HEIGHT,
              height: HOUR_HEIGHT,
            }
      }
    />
  );
}

function JobBlock({
  job,
  compact,
  onClick,
}: {
  job: ScheduleJob;
  compact: boolean;
  onClick: () => void;
}) {
  const start = parseISO(job.start);
  const end = parseISO(job.end);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  const top = compact ? 4 : (startHour - DAY_START_HOUR) * HOUR_HEIGHT;
  const height = compact ? 36 : Math.max(28, (endHour - startHour) * HOUR_HEIGHT);
  const color = JOB_TYPE_COLOR[job.type];

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute left-1 right-1 overflow-hidden rounded-md text-left shadow-sm transition-shadow hover:shadow-md"
      style={{
        top,
        height,
        background: color.bg,
        color: color.text,
      }}
    >
      <div className="px-1.5 py-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider opacity-90">
          {job.type} · {jobLabelTime(job)}
        </div>
        <div className="truncate text-[10px] font-medium leading-tight">
          {job.systemSummary}
        </div>
      </div>
    </button>
  );
}
