"use client";

// SCHED-2 — the real Dispatch Board. Renders getDispatchBoard data (tech rows,
// bookings, unscheduled backlog) and persists drag-to-assign / drag-to-reschedule
// through the SCHED-1 booking APIs, surfacing cert-block and double-booking
// rejections live. Updates are SERVER-CONFIRMED: we reflect a booking only after
// the server accepts it (never a false success on screen — the #310 lesson),
// then re-fetch the window. scheduling:view sees the board read-only;
// scheduling:edit can drag + act.

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, endOfDay, format, startOfDay, startOfWeek } from "date-fns";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarRange, ChevronLeft, ChevronRight, ListChecks, Lock, PieChart, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { UnassignedQueue } from "@/components/modules/scheduling/UnassignedQueue";
import { CalendarView } from "@/components/modules/scheduling/CalendarView";
import {
  getDispatchBoardAction,
  createBookingAction,
  moveBookingAction,
  cancelBookingAction,
  completeBookingAction,
} from "@/app/(app)/scheduling/actions";
import {
  bookingErrorMessage,
  computeSlot,
  parseDroppableId,
  slotMinutes,
} from "@/lib/scheduling/board-slots";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { BookingResult } from "@/lib/api/schedule-assignments";
import type { DispatchBoard, DispatchBookingRow } from "@/lib/api/dispatch-board";

export default function SchedulingPage() {
  const { role } = useRole();
  const canView = hasPermission(role, "scheduling", "view");
  const canEdit = hasPermission(role, "scheduling", "edit");

  const [view, setView] = useState<"day" | "week">("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [board, setBoard] = useState<DispatchBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionBooking, setActionBooking] = useState<DispatchBookingRow | null>(null);

  const { days, from, to } = useMemo(() => {
    const first = view === "week" ? startOfWeek(anchor, { weekStartsOn: 1 }) : anchor;
    const list = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(first, i)) : [first];
    return {
      days: list,
      from: startOfDay(first).toISOString(),
      to: endOfDay(list[list.length - 1]).toISOString(),
    };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getDispatchBoardAction({ from, to });
    if (res.ok) setBoard(res.data);
    else toast.error(res.error);
    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    if (canView) load();
  }, [canView, load]);

  const techName = useCallback(
    (id: string) => board?.techs.find((t) => t.id === id)?.name ?? "that technician",
    [board]
  );

  // Reflect a booking-API verdict: only reload on real success; surface typed
  // rejections and leave the board unchanged (the job stays in the backlog).
  const surface = useCallback(
    async (res: Awaited<ReturnType<typeof createBookingAction>>, techId: string) => {
      if (!res.ok) { toast.error(res.error); return; }
      const r: BookingResult = res.data;
      if (r.ok) {
        if (r.warning === "off_hours") toast.warning("Booked — but outside the tech's working hours.");
        else toast.success("Booked");
        await load();
        return;
      }
      // Rejected — surface the typed verdict; the board is unchanged so the job
      // stays in the backlog (no false success on screen).
      toast.error(bookingErrorMessage(r, techName(techId)) ?? "Could not book.");
    },
    [load, techName]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!canEdit || !event.over) return;
      const target = parseDroppableId(String(event.over.id));
      if (!target) return;
      const data = event.active.data.current as
        | { kind: "unassigned"; scheduleJobId: string; estimatedHours: number | null }
        | { kind: "booking"; bookingId: string; durationMs: number }
        | undefined;
      if (!data) return;

      if (data.kind === "unassigned") {
        const { startsAt, endsAt } = computeSlot(target.dayStr, target.hour, slotMinutes(data.estimatedHours));
        const res = await createBookingAction({
          scheduleJobId: data.scheduleJobId,
          techId: target.techId,
          startsAt,
          endsAt,
        });
        await surface(res, target.techId);
      } else {
        const minutes = Math.round(data.durationMs / 60_000);
        const { startsAt, endsAt } = computeSlot(target.dayStr, target.hour, minutes);
        const res = await moveBookingAction({
          id: data.bookingId,
          techId: target.techId,
          startsAt,
          endsAt,
        });
        await surface(res, target.techId);
      }
    },
    [canEdit, surface]
  );

  if (!canView) return <Restricted />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={board ? `${board.bookings.length} booked · ${board.unscheduled.length} unassigned` : "Loading…"}
        title="Dispatch Board"
        description="Technician bookings and the unscheduled backlog."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Booked (window)" value={board?.bookings.length ?? 0} icon={CalendarRange} />
        <Stat label="Unassigned" value={board?.unscheduled.length ?? 0} icon={ListChecks} accent={(board?.unscheduled.length ?? 0) > 5 ? "warning" : "default"} />
        <Stat
          label="Utilization"
          display={board?.stats.utilization_pct != null ? `${board.stats.utilization_pct}%` : "—"}
          icon={PieChart}
        />
        <Stat label="Techs out (today)" value={board?.stats.techs_out ?? 0} icon={UserMinus} accent={(board?.stats.techs_out ?? 0) > 0 ? "warning" : "default"} />
      </section>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setAnchor((a) => addDays(a, view === "week" ? -7 : -1))} aria-label="Previous">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor((a) => addDays(a, view === "week" ? 7 : 1))} aria-label="Next">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <span className="text-muted-foreground ml-2 text-xs">
            {format(days[0], "MMM d")}{days.length > 1 ? ` – ${format(days[days.length - 1], "MMM d")}` : ""}
          </span>
        </div>
        <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
          {(["day", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded px-3 py-1 transition-colors",
                view === v ? "bg-card text-brand-navy shadow-sm" : "text-muted-foreground hover:text-brand-charcoal"
              )}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <UnassignedQueue
            jobs={(board?.unscheduled ?? []).filter((j) => !search || j.title.toLowerCase().includes(search.toLowerCase()))}
            search={search}
            onSearch={setSearch}
            canEdit={canEdit}
          />
          <div className="overflow-auto">
            {loading && !board ? (
              <Card className="bg-card p-8 text-center text-sm shadow-sm text-muted-foreground">Loading board…</Card>
            ) : (
              <CalendarView
                techs={board?.techs ?? []}
                bookings={board?.bookings ?? []}
                absences={board?.absences ?? []}
                days={days}
                today={startOfDay(new Date())}
                canEdit={canEdit}
                onBookingClick={setActionBooking}
              />
            )}
          </div>
        </div>
      </DndContext>

      {actionBooking && (
        <BookingActionsDialog
          booking={actionBooking}
          canEdit={canEdit}
          onClose={() => setActionBooking(null)}
          onDone={async () => { setActionBooking(null); await load(); }}
        />
      )}
    </div>
  );
}

function BookingActionsDialog({
  booking,
  canEdit,
  onClose,
  onDone,
}: {
  booking: DispatchBookingRow;
  canEdit: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? "Failed"); return; }
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{booking.title}</DialogTitle>
          <DialogDescription>
            {new Date(booking.starts_at).toLocaleString()} → {new Date(booking.ends_at).toLocaleString()}
            {booking.site_label ? ` · ${booking.site_label}` : ""} · {booking.status}
          </DialogDescription>
        </DialogHeader>
        {canEdit ? (
          confirmCancel ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={busy}>Keep</Button>
              <Button className="bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={() => run(() => cancelBookingAction(booking.id))}>
                {busy ? "Cancelling…" : "Cancel booking"}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel booking</Button>
              <Button disabled={busy} onClick={() => run(() => completeBookingAction(booking.id))}>
                {busy ? "…" : "Mark complete"}
              </Button>
            </DialogFooter>
          )
        ) : (
          <p className="text-muted-foreground text-xs">You have read-only access to the schedule.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  display,
  icon: Icon,
  accent,
}: {
  label: string;
  value?: number;
  display?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "default" | "warning";
}) {
  return (
    <Card className={cn("border-t-2 flex h-full flex-col gap-1.5 p-4 shadow-sm", accent === "warning" ? "border-t-red-500" : "border-t-[#C9A24B]")}>
      <div className="flex items-center justify-between">
        <span className="font-serif text-xs tracking-wide text-brand-charcoal/70">{label}</span>
        <Icon className={cn("h-4 w-4", accent === "warning" ? "text-red-500" : "text-brand-gold")} />
      </div>
      <div className="text-brand-navy text-2xl font-semibold tracking-tight tabular-nums">{display ?? value}</div>
    </Card>
  );
}

function Restricted() {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
        <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
        <p className="text-muted-foreground mt-2 text-sm">Contact your administrator for access to scheduling.</p>
      </Card>
    </div>
  );
}
