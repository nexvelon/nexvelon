"use client";

// SCHED-1 — a functional dispatch-job backlog: create a dispatchable job
// (standalone service call or from a project job), set required certs + a target
// window, and BOOK a technician to a time. This proves the model end to end (the
// cert hard-block + double-booking rejection surface here) BEFORE SCHED-2 builds
// the drag-and-drop calendar board. Deliberately a list + dialogs, not a board.

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, ClipboardList, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  listScheduleJobsAction,
  createScheduleJobAction,
  listSchedulingTechsAction,
  createBookingAction,
} from "@/app/(app)/scheduling/actions";
import { KNOWN_CERT_TYPES, certTypeLabel } from "@/lib/scheduling/tech-eligibility";
import { cn } from "@/lib/utils";
import type {
  DbScheduleJob,
  DbScheduleJobPriority,
  DbScheduleJobType,
  DbTech,
} from "@/lib/types/database";

const JOB_TYPES: DbScheduleJobType[] = ["install", "service", "inspection", "commissioning", "other"];
const PRIORITIES: DbScheduleJobPriority[] = ["low", "normal", "high", "urgent"];

const STATUS_CLS: Record<string, string> = {
  unscheduled: "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export function ScheduleJobsManager() {
  const [jobs, setJobs] = useState<DbScheduleJob[]>([]);
  const [techs, setTechs] = useState<DbTech[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [bookJob, setBookJob] = useState<DbScheduleJob | null>(null);

  const load = () =>
    listScheduleJobsAction().then((r) => {
      if (r.ok) setJobs(r.data);
      setLoading(false);
    });
  useEffect(() => {
    load();
    listSchedulingTechsAction().then((r) => r.ok && setTechs(r.data));
  }, []);

  const activeTechs = useMemo(() => techs.filter((t) => t.is_active), [techs]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dispatch"
        title="Service jobs"
        description="Dispatchable jobs & bookings — the backlog the calendar board will schedule"
        actions={
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New service call
          </Button>
        }
      />

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        {loading ? (
          <p className="text-muted-foreground p-5 text-sm">Loading…</p>
        ) : jobs.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
            <ClipboardList className="h-4 w-4" />
            No service jobs yet. Create one to book a technician.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Ref</TableHead>
                  <TableHead className="text-[11px] uppercase">Title</TableHead>
                  <TableHead className="text-[11px] uppercase">Type</TableHead>
                  <TableHead className="text-[11px] uppercase">Priority</TableHead>
                  <TableHead className="text-[11px] uppercase">Required certs</TableHead>
                  <TableHead className="text-[11px] uppercase">Status</TableHead>
                  <TableHead className="text-right text-[11px] uppercase" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs">{j.reference}</TableCell>
                    <TableCell className="text-xs" style={{ color: "var(--brand-primary)" }}>{j.title}</TableCell>
                    <TableCell className="text-muted-foreground text-xs capitalize">{j.job_type}</TableCell>
                    <TableCell className="text-xs capitalize">{j.priority}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {j.required_certs.length ? j.required_certs.map(certTypeLabel).join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", STATUS_CLS[j.status])}>
                        {j.status.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {(j.status === "unscheduled" || j.status === "scheduled") && (
                        <Button type="button" size="xs" variant="outline" onClick={() => setBookJob(j)}>
                          <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Book
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {createOpen && (
        <CreateJobDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load(); }}
        />
      )}
      {bookJob && (
        <BookDialog
          job={bookJob}
          techs={activeTechs}
          onClose={() => setBookJob(null)}
          onBooked={() => { setBookJob(null); load(); }}
        />
      )}
    </div>
  );
}

function CreateJobDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState<DbScheduleJobType>("service");
  const [priority, setPriority] = useState<DbScheduleJobPriority>("normal");
  const [certs, setCerts] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [pending, start] = useTransition();

  const toggleCert = (c: string) =>
    setCerts((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submit = () =>
    start(async () => {
      if (!title.trim()) { toast.error("Title is required"); return; }
      const res = await createScheduleJobAction({
        title: title.trim(),
        jobType,
        priority,
        requiredCerts: certs,
        locationText: location.trim() || null,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Service job created");
      onCreated();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New service call</DialogTitle>
          <DialogDescription>A standalone dispatchable job. Required certs gate who can be booked.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Title (e.g. Replace failed reader — lobby)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-3">
            <label className="text-[11px] flex-1">
              <span className="text-muted-foreground uppercase tracking-wide">Type</span>
              <select value={jobType} onChange={(e) => setJobType(e.target.value as DbScheduleJobType)} className="mt-1 block w-full rounded-md border bg-card px-2 py-1.5 text-sm capitalize" style={{ borderColor: "var(--brand-border)" }}>
                {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-[11px] flex-1">
              <span className="text-muted-foreground uppercase tracking-wide">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as DbScheduleJobPriority)} className="mt-1 block w-full rounded-md border bg-card px-2 py-1.5 text-sm capitalize" style={{ borderColor: "var(--brand-border)" }}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="text-muted-foreground text-[11px] uppercase tracking-wide">Required certifications</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {KNOWN_CERT_TYPES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleCert(c)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    certs.includes(c) ? "bg-brand-navy text-white" : "text-muted-foreground"
                  )}
                  style={{ borderColor: "var(--brand-border)" }}
                >
                  {certTypeLabel(c)}
                </button>
              ))}
            </div>
          </div>
          <Input placeholder="Location (optional, e.g. 200 King St W)" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookDialog({
  job,
  techs,
  onClose,
  onBooked,
}: {
  job: DbScheduleJob;
  techs: DbTech[];
  onClose: () => void;
  onBooked: () => void;
}) {
  const [techId, setTechId] = useState<string>(techs[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (!techId) { toast.error("Pick a technician"); return; }
      if (!startsAt || !endsAt) { toast.error("Set a start and end time"); return; }
      const res = await createBookingAction({
        scheduleJobId: job.id,
        techId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      });
      if (!res.ok) { toast.error(res.error); return; }
      const r = res.data;
      if (r.ok) { toast.success("Technician booked"); onBooked(); return; }
      // Surface the guard verdicts clearly.
      if (r.error === "cert_block") {
        toast.error(`Blocked — ${r.reasons.join(" ")}`);
      } else if (r.error === "tech_double_booked") {
        toast.error(
          `Double-booked — that tech already has ${new Date(r.conflict.starts_at).toLocaleString()} → ${new Date(r.conflict.ends_at).toLocaleString()}.`
        );
      } else if (r.error === "invalid_window") {
        toast.error("End must be after start.");
      } else {
        toast.error("Could not book (not found).");
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Book a technician — {job.reference}</DialogTitle>
          <DialogDescription>
            {job.title}
            {job.required_certs.length ? ` · requires ${job.required_certs.map(certTypeLabel).join(", ")}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">Technician</span>
            <select value={techId} onChange={(e) => setTechId(e.target.value)} className="mt-1 block w-full rounded-md border bg-card px-2 py-1.5 text-sm" style={{ borderColor: "var(--brand-border)" }}>
              {techs.length === 0 && <option value="">No active techs</option>}
              {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex-1 text-[11px]">
              <span className="text-muted-foreground uppercase tracking-wide">Start</span>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1" />
            </label>
            <label className="flex-1 text-[11px]">
              <span className="text-muted-foreground uppercase tracking-wide">End</span>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1" />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Booking…" : "Book"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
