"use client";

// SCHED-3 — a technician's availability: the weekly working-hours template (7 day
// rows, copy-to-all) and time-off/absences with the approve/deny/cancel workflow.
// Opened from the Techs settings row, mirroring the certifications dialog.

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  getWorkingHoursAction,
  setWorkingHoursAction,
  listAbsencesAction,
  requestAbsenceAction,
  setAbsenceStatusAction,
} from "@/app/(app)/scheduling/actions";
import { cn } from "@/lib/utils";
import type { DbTech, DbTechAbsence, DbAbsenceStatus } from "@/lib/types/database";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayState {
  on: boolean;
  start: string;
  end: string;
}

const emptyWeek = (): DayState[] =>
  DAYS.map((_, i) => ({ on: i >= 1 && i <= 5, start: "09:00", end: "17:00" }));

const STATUS_BADGE: Record<DbAbsenceStatus, string> = {
  requested: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  denied: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export function TechAvailabilityDialog({
  tech,
  open,
  onClose,
}: {
  tech: DbTech;
  open: boolean;
  onClose: () => void;
}) {
  const [week, setWeek] = useState<DayState[]>(emptyWeek);
  const [absences, setAbsences] = useState<DbTechAbsence[]>([]);
  const [absStart, setAbsStart] = useState("");
  const [absEnd, setAbsEnd] = useState("");
  const [pending, start] = useTransition();

  const load = () => {
    getWorkingHoursAction(tech.id).then((r) => {
      if (!r.ok) return;
      const next = emptyWeek().map((d) => ({ ...d, on: false }));
      for (const row of r.data) {
        next[row.day_of_week] = { on: true, start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) };
      }
      setWeek(next);
    });
    listAbsencesAction({ techId: tech.id }).then((r) => r.ok && setAbsences(r.data));
  };
  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tech.id]);

  const setDay = (i: number, patch: Partial<DayState>) =>
    setWeek((w) => w.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const copyToAll = () => {
    const src = week.find((d) => d.on) ?? week[1];
    setWeek((w) => w.map((d) => (d.on ? { ...d, start: src.start, end: src.end } : d)));
  };

  const saveHours = () =>
    start(async () => {
      const rows = week
        .map((d, i) => ({ dayOfWeek: i, startTime: d.start, endTime: d.end, on: d.on }))
        .filter((r) => r.on)
        .map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }));
      const res = await setWorkingHoursAction(tech.id, rows);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Working hours saved");
    });

  const addAbsence = () =>
    start(async () => {
      if (!absStart || !absEnd) { toast.error("Set start and end"); return; }
      const res = await requestAbsenceAction({
        techId: tech.id,
        startsAt: new Date(absStart).toISOString(),
        endsAt: new Date(absEnd).toISOString(),
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Time off requested");
      setAbsStart(""); setAbsEnd("");
      load();
    });

  const setStatus = (id: string, status: DbAbsenceStatus) =>
    start(async () => {
      const res = await setAbsenceStatusAction(id, status);
      if (!res.ok) { toast.error(res.error); return; }
      load();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{tech.name} — availability</DialogTitle>
          <DialogDescription>
            Working hours shade the board; approved time off blocks booking that slot.
          </DialogDescription>
        </DialogHeader>

        {/* Working hours */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-brand-navy text-xs font-semibold uppercase tracking-wide">Weekly hours</h4>
            <div className="flex gap-2">
              <Button type="button" size="xs" variant="outline" onClick={copyToAll} disabled={pending}>Copy to all</Button>
              <Button type="button" size="xs" onClick={saveHours} disabled={pending}>Save hours</Button>
            </div>
          </div>
          <div className="space-y-1">
            {week.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <label className="flex w-14 items-center gap-1.5">
                  <input type="checkbox" checked={d.on} onChange={(e) => setDay(i, { on: e.target.checked })} />
                  {DAYS[i]}
                </label>
                <Input type="time" value={d.start} disabled={!d.on} onChange={(e) => setDay(i, { start: e.target.value })} className="h-7 w-28" />
                <span className="text-muted-foreground">–</span>
                <Input type="time" value={d.end} disabled={!d.on} onChange={(e) => setDay(i, { end: e.target.value })} className="h-7 w-28" />
              </div>
            ))}
          </div>
        </div>

        {/* Absences */}
        <div className="mt-2">
          <h4 className="text-brand-navy mb-2 text-xs font-semibold uppercase tracking-wide">Time off</h4>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <label className="text-[11px]">
              <span className="text-muted-foreground uppercase">From</span>
              <Input type="datetime-local" value={absStart} onChange={(e) => setAbsStart(e.target.value)} className="mt-1 h-8" />
            </label>
            <label className="text-[11px]">
              <span className="text-muted-foreground uppercase">To</span>
              <Input type="datetime-local" value={absEnd} onChange={(e) => setAbsEnd(e.target.value)} className="mt-1 h-8" />
            </label>
            <Button type="button" size="sm" onClick={addAbsence} disabled={pending}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Request
            </Button>
          </div>
          {absences.length === 0 ? (
            <p className="text-muted-foreground text-xs">No time off recorded.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {absences.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--brand-border)" }}>
                  <span>
                    {new Date(a.starts_at).toLocaleDateString()} → {new Date(a.ends_at).toLocaleDateString()}
                    <span className="text-muted-foreground"> · {a.absence_type}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize", STATUS_BADGE[a.status])}>{a.status}</span>
                    {a.status === "requested" && (
                      <>
                        <button type="button" onClick={() => setStatus(a.id, "approved")} disabled={pending} className="text-emerald-700 hover:underline">Approve</button>
                        <button type="button" onClick={() => setStatus(a.id, "denied")} disabled={pending} className="text-red-600 hover:underline">Deny</button>
                      </>
                    )}
                    {a.status !== "cancelled" && a.status !== "denied" && (
                      <button type="button" onClick={() => setStatus(a.id, "cancelled")} disabled={pending} className="text-muted-foreground hover:text-red-600" aria-label="Cancel">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
