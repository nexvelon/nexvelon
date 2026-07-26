"use client";

// SCHED-2 — the dispatch swimlane board, now rendering REAL bookings from
// getDispatchBoard. Tech rows × day/hour grid; booking blocks placed at their
// real starts_at/ends_at, colored by job_type + priority, styled by status
// (tentative dashed, completed check). Drag is enabled only when canEdit; the
// DndContext lives on the page (so a card can drag from the backlog into a cell).

import { format, isSameDay, parseISO } from "date-fns";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Check } from "lucide-react";
import {
  JOB_TYPE_COLOR,
  PRIORITY_ACCENT,
  bookingStatusStyle,
  makeDroppableId,
} from "@/lib/scheduling/board-slots";
import { cn } from "@/lib/utils";
import type { DispatchBookingRow, DispatchTechRow } from "@/lib/api/dispatch-board";

const HOUR_HEIGHT = 28;
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 20;
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

interface Props {
  techs: DispatchTechRow[];
  bookings: DispatchBookingRow[];
  days: Date[];
  today: Date;
  canEdit: boolean;
  onBookingClick: (b: DispatchBookingRow) => void;
}

export function CalendarView({ techs, bookings, days, today, canEdit, onBookingClick }: Props) {
  return (
    <div className="bg-card overflow-hidden rounded-lg border border-[var(--border)] shadow-sm">
      <div
        className="grid"
        style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(140px, 1fr))` }}
      >
        <div className="bg-muted/40 sticky top-0 border-b border-[var(--border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tech
        </div>
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={cn(
              "border-b border-l border-[var(--border)] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider",
              isSameDay(d, today) ? "bg-brand-gold/10 text-brand-navy" : "bg-muted/40 text-muted-foreground"
            )}
          >
            {format(d, "EEE d")}
          </div>
        ))}

        {techs.length === 0 && (
          <div className="text-muted-foreground col-span-full px-3 py-8 text-center text-xs">
            No technicians yet. Add techs in Settings → Techs.
          </div>
        )}

        {techs.map((t) => (
          <Swimlane
            key={t.id}
            tech={t}
            days={days}
            today={today}
            bookings={bookings.filter((b) => b.tech_id === t.id)}
            canEdit={canEdit}
            onBookingClick={onBookingClick}
          />
        ))}
      </div>
    </div>
  );
}

function Swimlane({
  tech,
  days,
  today,
  bookings,
  canEdit,
  onBookingClick,
}: {
  tech: DispatchTechRow;
  days: Date[];
  today: Date;
  bookings: DispatchBookingRow[];
  canEdit: boolean;
  onBookingClick: (b: DispatchBookingRow) => void;
}) {
  return (
    <>
      <div className={cn("border-b border-[var(--border)] bg-card px-3 py-2", !tech.is_active && "opacity-50")}>
        <p className="text-brand-charcoal text-xs font-semibold leading-tight">{tech.name}</p>
        <p className="text-muted-foreground text-[10px]">
          {tech.cert_summary.valid_types.length} cert{tech.cert_summary.valid_types.length === 1 ? "" : "s"}
          {tech.cert_summary.expired_count > 0 ? ` · ${tech.cert_summary.expired_count} expired` : ""}
        </p>
      </div>

      {days.map((d) => (
        <DayCell
          key={d.toISOString()}
          day={d}
          today={today}
          techId={tech.id}
          bookings={bookings.filter((b) => isSameDay(parseISO(b.starts_at), d))}
          canEdit={canEdit}
          onBookingClick={onBookingClick}
        />
      ))}
    </>
  );
}

function DayCell({
  day,
  today,
  techId,
  bookings,
  canEdit,
  onBookingClick,
}: {
  day: Date;
  today: Date;
  techId: string;
  bookings: DispatchBookingRow[];
  canEdit: boolean;
  onBookingClick: (b: DispatchBookingRow) => void;
}) {
  return (
    <div
      className={cn("relative border-b border-l border-[var(--border)]", isSameDay(day, today) && "bg-brand-gold/5")}
      style={{ height: HOUR_HEIGHT * HOURS.length }}
    >
      {canEdit &&
        HOURS.map((h) => <DropZone key={h} day={day} techId={techId} hour={h} />)}
      {bookings.map((b) => (
        <BookingBlock key={b.id} booking={b} canEdit={canEdit} onClick={() => onBookingClick(b)} />
      ))}
    </div>
  );
}

function DropZone({ day, techId, hour }: { day: Date; techId: string; hour: number }) {
  const id = makeDroppableId(techId, format(day, "yyyy-MM-dd"), hour);
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("border-border/40 absolute left-0 right-0 border-t", isOver && "bg-brand-gold/20")}
      style={{ top: (hour - DAY_START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
    />
  );
}

function BookingBlock({
  booking,
  canEdit,
  onClick,
}: {
  booking: DispatchBookingRow;
  canEdit: boolean;
  onClick: () => void;
}) {
  const start = parseISO(booking.starts_at);
  const end = parseISO(booking.ends_at);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  const top = (startHour - DAY_START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(24, (endHour - startHour) * HOUR_HEIGHT);
  const color = JOB_TYPE_COLOR[booking.job_type];
  const st = bookingStatusStyle(booking.status);
  const durationMs = end.getTime() - start.getTime();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `booking::${booking.id}`,
    data: { kind: "booking", bookingId: booking.id, durationMs },
    disabled: !canEdit,
  });
  const dragStyle = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...(canEdit ? attributes : {})}
      {...(canEdit ? listeners : {})}
      className={cn(
        "absolute left-1 right-1 overflow-hidden rounded-md text-left shadow-sm transition-shadow hover:shadow-md",
        canEdit && "cursor-grab active:cursor-grabbing",
        st.dashed && "border border-dashed"
      )}
      style={{
        ...dragStyle,
        top,
        height,
        background: color.bg,
        color: color.text,
        opacity: isDragging ? 0.5 : st.opacity,
        borderLeft: `3px solid ${PRIORITY_ACCENT[booking.priority] ?? "transparent"}`,
      }}
    >
      <div className="px-1.5 py-0.5">
        <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider opacity-90">
          {st.done && <Check className="h-2.5 w-2.5" />}
          {booking.job_type} · {format(start, "HH:mm")}
        </div>
        <div className="truncate text-[10px] font-medium leading-tight">{booking.title}</div>
        {booking.site_label && <div className="truncate text-[9px] opacity-80">{booking.site_label}</div>}
      </div>
    </button>
  );
}
