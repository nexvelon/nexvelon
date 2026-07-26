"use client";

// SCHED-4 — a technician's read-only schedule (the "field" view). Techs are NOT
// linked to logins (the techs roster carries no profile/user id — audit 2e), so
// a true self-scoped "my schedule" can't be derived; a dispatcher SELECTS a tech
// and sees that tech's day/week. Read-only: job, site, window, status — no cost.

import { useEffect, useMemo, useState } from "react";
import { addDays, endOfDay, format, isSameDay, parseISO, startOfDay, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  getDispatchBoardAction,
  listSchedulingTechsAction,
} from "@/app/(app)/scheduling/actions";
import { cn } from "@/lib/utils";
import type { DispatchBoard, DispatchBookingRow } from "@/lib/api/dispatch-board";
import type { DbTech } from "@/lib/types/database";

const STATUS_CLS: Record<string, string> = {
  tentative: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export function TechScheduleView() {
  const [techs, setTechs] = useState<DbTech[]>([]);
  const [techId, setTechId] = useState<string>("");
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [board, setBoard] = useState<DispatchBoard | null>(null);

  useEffect(() => {
    listSchedulingTechsAction().then((r) => {
      if (r.ok) { setTechs(r.data); if (r.data[0]) setTechId((cur) => cur || r.data[0].id); }
    });
  }, []);

  const { days, from, to } = useMemo(() => {
    const list = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
    return { days: list, from: startOfDay(anchor).toISOString(), to: endOfDay(list[6]).toISOString() };
  }, [anchor]);

  useEffect(() => {
    getDispatchBoardAction({ from, to }).then((r) => {
      if (r.ok) setBoard(r.data);
      else toast.error(r.error);
    });
  }, [from, to]);

  const bookings: DispatchBookingRow[] = useMemo(
    () => (board?.bookings ?? []).filter((b) => b.tech_id === techId),
    [board, techId]
  );
  const tech = techs.find((t) => t.id === techId);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Field" title="Technician schedule" description="A read-only view of a technician's week." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={techId} onChange={(e) => setTechId(e.target.value)} className="rounded-md border bg-card px-3 py-1.5 text-sm" style={{ borderColor: "var(--brand-border)" }}>
          {techs.length === 0 && <option value="">No techs</option>}
          {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setAnchor((a) => addDays(a, -7))} aria-label="Previous week"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This week</Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor((a) => addDays(a, 7))} aria-label="Next week"><ChevronRight className="h-3.5 w-3.5" /></Button>
          <span className="text-muted-foreground ml-2 text-xs">{format(days[0], "MMM d")} – {format(days[6], "MMM d")}</span>
        </div>
      </div>

      {!tech ? (
        <Card className="bg-card p-6 text-sm text-muted-foreground shadow-sm">Pick a technician.</Card>
      ) : (
        <div className="space-y-3">
          {days.map((d) => {
            const dayBookings = bookings
              .filter((b) => isSameDay(parseISO(b.starts_at), d))
              .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            return (
              <div key={d.toISOString()}>
                <p className="text-brand-navy mb-1 text-xs font-semibold uppercase tracking-wide">{format(d, "EEE d MMM")}</p>
                {dayBookings.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">—</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayBookings.map((b) => (
                      <li key={b.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-xs shadow-sm" style={{ borderColor: "var(--brand-border)" }}>
                        <div>
                          <span style={{ color: "var(--brand-primary)" }}>{b.title}</span>
                          <span className="text-muted-foreground">
                            {" · "}{format(parseISO(b.starts_at), "HH:mm")}–{format(parseISO(b.ends_at), "HH:mm")}
                            {b.site_label ? ` · ${b.site_label}` : ""}
                          </span>
                        </div>
                        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize", STATUS_CLS[b.status] ?? "bg-slate-100 text-slate-600")}>{b.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
