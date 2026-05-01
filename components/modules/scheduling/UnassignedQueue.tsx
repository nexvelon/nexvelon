"use client";

import { format, parseISO } from "date-fns";
import { AlertTriangle, Clock, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDraggable } from "@dnd-kit/core";
import {
  JOB_TYPE_COLOR,
  type UnassignedJob,
  getClient,
  getSite,
} from "@/lib/scheduling-data";
import { cn } from "@/lib/utils";

interface Props {
  jobs: UnassignedJob[];
  search: string;
  onSearch: (s: string) => void;
}

const PRIORITY_STYLE: Record<UnassignedJob["priority"], string> = {
  Low: "bg-slate-100 text-slate-600",
  Normal: "bg-sky-50 text-sky-700",
  High: "bg-amber-50 text-amber-800",
  Urgent: "bg-red-50 text-red-700",
};

export function UnassignedQueue({ jobs, search, onSearch }: Props) {
  return (
    <div className="bg-card rounded-lg border border-[var(--border)] p-3 shadow-sm">
      <div className="mb-3">
        <h2 className="text-brand-navy mb-1 font-serif text-base">
          Unassigned Jobs
        </h2>
        <p className="text-muted-foreground text-[11px]">
          Drag onto the calendar to assign — or right-click for options.
        </p>
      </div>
      <Input
        placeholder="Search…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="mb-3 h-8 text-xs"
      />
      <div className="space-y-2 overflow-y-auto pr-1">
        {jobs.length === 0 && (
          <p className="text-muted-foreground py-4 text-center text-xs">
            Queue is clear.
          </p>
        )}
        {jobs.map((job) => (
          <UnassignedCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

function UnassignedCard({ job }: { job: UnassignedJob }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { kind: "unassigned" },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const color = JOB_TYPE_COLOR[job.type];
  const client = getClient(job.clientId);
  const site = getSite(job.siteId);

  return (
    <Card
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
      className="cursor-grab space-y-1.5 border-l-4 p-2.5 text-xs shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
    >
      <div
        className="-ml-2.5 -mt-2.5 mb-1 h-1 rounded-t-md"
        style={{ background: color.bg }}
      />
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: color.bg }}
        >
          {job.type}
        </span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
              PRIORITY_STYLE[job.priority]
            )}
          >
            <Flag className="-mt-0.5 mr-0.5 inline h-2.5 w-2.5" />
            {job.priority}
          </span>
        </div>
      </div>

      <p className="text-brand-charcoal font-medium leading-snug">
        {client?.name ?? "—"}
      </p>
      {site && (
        <p className="text-muted-foreground truncate text-[10px]">{site.name}</p>
      )}
      <p className="text-brand-charcoal/85 leading-snug">{job.systemSummary}</p>

      <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
        <Clock className="h-3 w-3" />
        Requested {format(parseISO(job.requestedDate), "MMM d")} ·{" "}
        {Math.round(job.durationMin / 60)}h
      </div>

      {job.priority === "Urgent" && (
        <div className="text-red-600 inline-flex items-center gap-1 text-[10px]">
          <AlertTriangle className="h-3 w-3" />
          Same-day dispatch required
        </div>
      )}

      {job.requiredSkills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.requiredSkills.map((s) => (
            <span
              key={s}
              className="bg-brand-navy/8 text-brand-navy rounded-full px-1.5 py-0.5 text-[9px]"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
