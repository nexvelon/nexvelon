"use client";

// SCHED-2 — the unscheduled backlog, now real (getDispatchBoard.unscheduled).
// Each card drags onto a tech's calendar slot to book it. Drag is enabled only
// when canEdit; the DndContext lives on the page.

import { AlertTriangle, Flag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDraggable } from "@dnd-kit/core";
import { JOB_TYPE_COLOR, PRIORITY_ACCENT } from "@/lib/scheduling/board-slots";
import { certTypeLabel } from "@/lib/scheduling/tech-eligibility";
import { cn } from "@/lib/utils";
import type { DispatchUnscheduledRow } from "@/lib/api/dispatch-board";

interface Props {
  jobs: DispatchUnscheduledRow[];
  search: string;
  onSearch: (s: string) => void;
  canEdit: boolean;
}

export function UnassignedQueue({ jobs, search, onSearch, canEdit }: Props) {
  return (
    <div className="bg-card rounded-lg border border-[var(--border)] p-3 shadow-sm">
      <div className="mb-3">
        <h2 className="text-brand-navy mb-1 font-serif text-base">Unassigned jobs</h2>
        <p className="text-muted-foreground text-[11px]">
          {canEdit ? "Drag onto a technician's slot to book." : "Read-only — you can't book jobs."}
        </p>
      </div>
      <Input placeholder="Search…" value={search} onChange={(e) => onSearch(e.target.value)} className="mb-3 h-8 text-xs" />
      <div className="space-y-2 overflow-y-auto pr-1">
        {jobs.length === 0 && (
          <p className="text-muted-foreground py-4 text-center text-xs">Backlog is clear.</p>
        )}
        {jobs.map((job) => (
          <UnassignedCard key={job.schedule_job_id} job={job} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function UnassignedCard({ job, canEdit }: { job: DispatchUnscheduledRow; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unsched::${job.schedule_job_id}`,
    data: { kind: "unassigned", scheduleJobId: job.schedule_job_id, estimatedHours: job.estimated_hours },
    disabled: !canEdit,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const color = JOB_TYPE_COLOR[job.job_type];

  return (
    <Card
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.5 : 1, borderLeftColor: PRIORITY_ACCENT[job.priority] }}
      {...(canEdit ? attributes : {})}
      {...(canEdit ? listeners : {})}
      className={cn(
        "space-y-1.5 border-l-4 p-2.5 text-xs shadow-sm transition-shadow hover:shadow-md",
        canEdit && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: color.bg }}>
          {job.job_type}
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize">
          <Flag className="h-2.5 w-2.5" />
          {job.priority}
        </span>
      </div>

      <p className="text-brand-charcoal font-medium leading-snug">{job.title}</p>
      {job.site_label && <p className="text-muted-foreground truncate text-[10px]">{job.site_label}</p>}
      {job.estimated_hours != null && (
        <p className="text-muted-foreground text-[10px]">~{job.estimated_hours}h</p>
      )}

      {job.priority === "urgent" && (
        <div className="text-red-600 inline-flex items-center gap-1 text-[10px]">
          <AlertTriangle className="h-3 w-3" /> Same-day dispatch
        </div>
      )}

      {job.required_certs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.required_certs.map((c) => (
            <span key={c} className="bg-brand-navy/8 text-brand-navy rounded-full px-1.5 py-0.5 text-[9px]">
              {certTypeLabel(c)}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
