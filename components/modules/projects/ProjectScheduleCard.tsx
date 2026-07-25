"use client";

// PROJ2-20 — the project "Schedule" section: a read-first, lightweight Gantt
// (pure CSS/SVG — NO heavy Gantt dependency) + an upcoming-milestones list + a
// small management area (per-job planned dates, add milestone, add dependency).
//
// Deliberately the HOOK, not the scheduler — no calendar, no dispatch, no
// drag-to-reschedule. Editing dates happens in the inline inputs, not by
// dragging bars. Sprint 3 owns the dispatch surface.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Flag, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  getProjectScheduleAction,
  setJobPlannedDatesAction,
  createMilestoneAction,
  setMilestoneStatusAction,
  deleteMilestoneAction,
  addDependencyAction,
} from "@/app/(app)/projects/schedule-actions";
import type { ProjectSchedule } from "@/lib/api/schedule";
import type { DbMilestoneStatus } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const MS_TONE: Record<DbMilestoneStatus, string> = {
  pending: "text-muted-foreground",
  met: "text-[var(--brand-status-green)]",
  missed: "text-red-600",
  cancelled: "text-muted-foreground line-through",
};
const MS_FILL: Record<DbMilestoneStatus, string> = {
  pending: "var(--muted-foreground, #94a3b8)",
  met: "var(--brand-status-green)",
  missed: "#dc2626",
  cancelled: "#94a3b8",
};

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function ProjectScheduleCard({ projectId }: { projectId: string }) {
  const { role } = useRole();
  const canEdit = hasPermission(role, "projects", "edit");
  const [sched, setSched] = useState<ProjectSchedule | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    getProjectScheduleAction(projectId).then((res) => {
      setLoaded(true);
      if (res.ok) setSched(res.data);
    });
  };
  useEffect(load, [projectId]);

  if (!loaded || !sched || sched.jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="nx-eyebrow-soft">Schedule</p>
      <Gantt sched={sched} />
      <div className="grid gap-3 lg:grid-cols-2">
        <UpcomingMilestones sched={sched} projectId={projectId} canEdit={canEdit} onChanged={load} />
        {canEdit && <ScheduleManager sched={sched} projectId={projectId} onChanged={load} />}
      </div>
    </div>
  );
}

// ─── Gantt (CSS/SVG) ─────────────────────────────────────────────────────────

function Gantt({ sched }: { sched: ProjectSchedule }) {
  const range = sched.range;
  const geom = useMemo(() => {
    if (!range) return null;
    // Pad the axis a little on both sides.
    const from = range.from;
    const to = range.to;
    const totalDays = Math.max(1, daysBetween(from, to));
    const pct = (d: string) => Math.min(100, Math.max(0, (daysBetween(from, d) / totalDays) * 100));
    return { from, to, totalDays, pct };
  }, [range]);

  if (!geom) return null;

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground tabular-nums">{geom.from}</span>
        <span className="text-muted-foreground">{geom.totalDays} days</span>
        <span className="text-muted-foreground tabular-nums">{geom.to}</span>
      </div>

      <div className="space-y-1.5">
        {sched.jobs.map((j) => {
          const left = geom.pct(j.start);
          const right = geom.pct(j.end);
          const width = Math.max(1.5, right - left);
          return (
            <div key={j.job_id} className="grid grid-cols-[140px_1fr] items-center gap-2">
              <Link href={`/projects/${sched.project_id}/jobs/${j.job_id}`} className="text-brand-charcoal truncate text-xs hover:underline" title={j.label}>
                {j.label}
                {j.depends_on.length > 0 && (
                  <span className="text-muted-foreground ml-1 text-[9px]">↳ after {j.depends_on.length}</span>
                )}
              </Link>
              <div className="relative h-5 rounded bg-[color-mix(in_oklab,var(--border)_50%,transparent)]">
                {/* today line */}
                <TodayLine pct={geom.pct(sched.today)} />
                {/* the bar */}
                <div
                  className={cn(
                    "absolute top-1/2 h-3 -translate-y-1/2 rounded",
                    j.is_overdue
                      ? "bg-[color-mix(in_oklab,var(--destructive)_60%,transparent)]"
                      : j.inferred
                        ? "bg-[repeating-linear-gradient(45deg,color-mix(in_oklab,var(--brand-navy)_25%,transparent)_0_4px,transparent_4px_8px)] border border-[color-mix(in_oklab,var(--brand-navy)_35%,transparent)]"
                        : "bg-[color-mix(in_oklab,var(--brand-navy)_55%,transparent)]"
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${j.start} → ${j.end}${j.inferred ? " (inferred — no planned dates)" : ""}${j.is_overdue ? " · overdue" : ""}`}
                />
              </div>
            </div>
          );
        })}

        {/* Milestone markers on a shared axis row. */}
        {sched.milestones.length > 0 && (
          <div className="grid grid-cols-[140px_1fr] items-center gap-2 pt-1">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Milestones</span>
            <div className="relative h-5">
              <TodayLine pct={geom.pct(sched.today)} />
              {sched.milestones.map((m) => (
                <svg
                  key={m.id}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${geom.pct(m.target_date)}%` }}
                  width="10" height="10" viewBox="0 0 10 10"
                >
                  <title>{`${m.title} — ${m.target_date} (${m.status})`}</title>
                  <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 5)" fill={MS_FILL[m.status]} />
                </svg>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-[10px]">
        Solid bars use planned dates; hatched bars are inferred (no planned dates
        set). Diamonds are milestones. The vertical line is today.
      </p>
    </Card>
  );
}

function TodayLine({ pct }: { pct: number }) {
  if (pct < 0 || pct > 100) return null;
  return (
    <div className="absolute inset-y-0 w-px bg-[color-mix(in_oklab,var(--brand-accent)_70%,transparent)]" style={{ left: `${pct}%` }} />
  );
}

// ─── Upcoming milestones ─────────────────────────────────────────────────────

function UpcomingMilestones({
  sched, projectId, canEdit, onChanged,
}: {
  sched: ProjectSchedule; projectId: string; canEdit: boolean; onChanged: () => void;
}) {
  const upcoming = [...sched.milestones]
    .filter((m) => m.status !== "cancelled")
    .sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
    .slice(0, 8);

  const setStatus = async (id: string, status: DbMilestoneStatus) => {
    const res = await setMilestoneStatusAction(id, projectId, status);
    if (!res.ok) { toast.error(res.error); return; }
    onChanged();
  };

  const remove = async (id: string) => {
    const res = await deleteMilestoneAction(id, projectId);
    if (!res.ok) { toast.error(res.error); return; }
    onChanged();
  };

  return (
    <Card className="p-4 shadow-sm">
      <h3 className="text-brand-navy mb-2 font-serif text-base">Upcoming milestones</h3>
      {upcoming.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">No milestones.</p>
      ) : (
        <ul className="space-y-1.5">
          {upcoming.map((m) => {
            const overdue = m.status === "pending" && m.target_date < sched.today;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Flag className={cn("h-3 w-3", MS_TONE[m.status])} />
                <span className="text-brand-charcoal font-medium">{m.title}</span>
                <span className={cn("tabular-nums", overdue ? "font-semibold text-red-600" : "text-muted-foreground")}>
                  {m.target_date}{overdue && " · overdue"}
                </span>
                <span className={cn("text-[10px] uppercase", MS_TONE[m.status])}>{m.status}</span>
                {canEdit && (
                  <span className="ml-auto flex items-center gap-1.5">
                    {m.status === "pending" && (
                      <>
                        <button type="button" onClick={() => setStatus(m.id, "met")} className="text-[var(--brand-status-green)] text-[10px] hover:underline">Met</button>
                        <button type="button" onClick={() => setStatus(m.id, "missed")} className="text-red-600 text-[10px] hover:underline">Missed</button>
                      </>
                    )}
                    <button type="button" onClick={() => remove(m.id)} className="text-muted-foreground hover:text-red-600" aria-label="Delete milestone">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ─── Management (planned dates, add milestone, add dependency) ────────────────

function ScheduleManager({
  sched, projectId, onChanged,
}: {
  sched: ProjectSchedule; projectId: string; onChanged: () => void;
}) {
  const [msTitle, setMsTitle] = useState("");
  const [msDate, setMsDate] = useState("");
  const [msJob, setMsJob] = useState("project");
  const [depJob, setDepJob] = useState("");
  const [depOn, setDepOn] = useState("");
  const [busy, setBusy] = useState(false);

  const addMilestone = async () => {
    if (!msTitle.trim() || !msDate) { toast.error("Title and date required."); return; }
    setBusy(true);
    try {
      const res = await createMilestoneAction({
        projectId, jobId: msJob === "project" ? null : msJob,
        title: msTitle.trim(), targetDate: msDate,
      });
      if (!res.ok) { toast.error(res.error); return; }
      setMsTitle(""); setMsDate(""); setMsJob("project");
      onChanged();
    } finally { setBusy(false); }
  };

  const addDep = async () => {
    if (!depJob || !depOn) { toast.error("Pick both jobs."); return; }
    setBusy(true);
    try {
      const res = await addDependencyAction(depJob, depOn, projectId);
      if (!res.ok) { toast.error(res.error); return; }
      setDepJob(""); setDepOn("");
      onChanged();
      toast.success("Dependency added");
    } finally { setBusy(false); }
  };

  return (
    <Card className="space-y-4 p-4 shadow-sm">
      <div>
        <h3 className="text-brand-navy mb-2 font-serif text-base">Planned dates</h3>
        <div className="space-y-1.5">
          {sched.jobs.map((j) => (
            <PlannedDatesRow key={j.job_id} job={j} projectId={projectId} onChanged={onChanged} />
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-3">
        <h4 className="text-muted-foreground mb-1.5 text-[11px] uppercase tracking-wide">Add milestone</h4>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="e.g. Rough-in complete" className="h-8 flex-1 text-xs" />
          <Input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} className="h-8 w-36 text-xs tabular-nums" />
          <Select value={msJob} onValueChange={(v) => setMsJob(v ?? "project")}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Whole project</SelectItem>
              {sched.jobs.map((j) => (<SelectItem key={j.job_id} value={j.job_id}>{j.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button type="button" size="xs" onClick={addMilestone} disabled={busy}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {sched.jobs.length > 1 && (
        <div className="border-t border-[var(--border)] pt-3">
          <h4 className="text-muted-foreground mb-1.5 text-[11px] uppercase tracking-wide">Add dependency (finish-to-start)</h4>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Select value={depJob} onValueChange={(v) => setDepJob(v ?? "")}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="This job" /></SelectTrigger>
              <SelectContent>
                {sched.jobs.map((j) => (<SelectItem key={j.job_id} value={j.job_id}>{j.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">starts after</span>
            <Select value={depOn} onValueChange={(v) => setDepOn(v ?? "")}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="depends on" /></SelectTrigger>
              <SelectContent>
                {sched.jobs.filter((j) => j.job_id !== depJob).map((j) => (<SelectItem key={j.job_id} value={j.job_id}>{j.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button type="button" size="xs" onClick={addDep} disabled={busy}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PlannedDatesRow({
  job, projectId, onChanged,
}: {
  job: ProjectSchedule["jobs"][number]; projectId: string; onChanged: () => void;
}) {
  const [start, setStart] = useState(job.planned_start_date ?? "");
  const [end, setEnd] = useState(job.planned_end_date ?? "");

  const save = async () => {
    const res = await setJobPlannedDatesAction(job.job_id, projectId, start || null, end || null);
    if (!res.ok) { toast.error(res.error); return; }
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-brand-charcoal w-28 truncate" title={job.label}>{job.label}</span>
      <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} onBlur={save} className="h-7 w-32 text-[11px] tabular-nums" />
      <span className="text-muted-foreground">→</span>
      <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} onBlur={save} className="h-7 w-32 text-[11px] tabular-nums" />
      {job.inferred && <span className="text-muted-foreground text-[10px] italic">inferred</span>}
    </div>
  );
}
