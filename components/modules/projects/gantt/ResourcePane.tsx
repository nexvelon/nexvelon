"use client";

// UIDG-14 — the resource lane: a collapsible pane BELOW the Gantt, sharing its time
// axis, horizontal scroll and zoom (hsync). One row per person: aggregate
// utilisation + a per-day heat strip, with over-allocated days flagged (not by
// colour alone — an icon + text on the row, a hover breakdown per day). All colour
// from the theme. Read-only. The computation is the pure lib/gantt/resource-load;
// this only renders it, and states plainly what it counts (§2.8).

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Users } from "lucide-react";
import type { ResourceLoad, RlRow, RlDay } from "@/lib/gantt/resource-load";
import { axisOrigin, contentWidth, dateToX, pxPerDay, type ZoomLevel } from "@/lib/gantt/geometry";
import { useGanttTheme } from "./useGanttTheme";

/** The horizontal-scroll bridge shared with the Gantt (defined in InteractiveGantt). */
export interface HScrollSync {
  attach: (el: HTMLElement | null) => void;
  broadcast: (left: number, from: HTMLElement) => void;
}

const ROW_H = 30;
const STRIP_H = 20;

interface Props {
  load: ResourceLoad | null; // null = still loading
  range: { from: string; to: string };
  zoom: ZoomLevel;
  gridW: number;
  hsync: HScrollSync;
}

export function ResourcePane({ load, range, zoom, gridW, hsync }: Props) {
  const t = useGanttTheme();
  const [open, setOpen] = useState(false); // collapsed by default (2g)

  const origin = useMemo(() => axisOrigin(range), [range]);
  const contentW = useMemo(() => contentWidth(range, zoom), [range, zoom]);

  const overAllocPeople = load ? load.rows.filter((r) => r.overAllocatedDays > 0).length : 0;
  const summary = !load
    ? "loading…"
    : !load.hasAnyAssignment
      ? "nothing assigned in this window"
      : `${load.rows.length} ${load.rows.length === 1 ? "person" : "people"}${overAllocPeople > 0 ? ` · ${overAllocPeople} over-allocated` : ""}`;

  return (
    <div className="bg-card rounded-lg border" style={{ borderColor: t.grid }}>
      {/* Collapsed header advertises the headline even when closed (2g). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        style={{ color: t.text }}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Users className="h-4 w-4" />
        <span className="font-medium">Resources</span>
        <span className="text-muted-foreground text-xs">· {summary}</span>
        {overAllocPeople > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs" style={{ color: t.danger }}>
            <AlertTriangle className="h-3.5 w-3.5" /> over-allocated
          </span>
        )}
      </button>

      {open && (
        <div className="border-t" style={{ borderColor: t.grid }}>
          {/* honesty label — what this counts (2a/2e) */}
          <p className="text-muted-foreground px-3 py-1.5 text-[11px]">
            Planned (task assignments) + booked (dispatch), <strong>this project only</strong>, against each person’s full daily capacity — they may also be booked elsewhere.
          </p>

          {!load ? (
            <p className="text-muted-foreground px-3 pb-3 text-xs">Loading resource load…</p>
          ) : !load.hasAnyAssignment ? (
            <p className="text-muted-foreground px-3 pb-3 text-xs">Nothing assigned in this window.</p>
          ) : (
            <div ref={(el) => hsync.attach(el)} className="overflow-x-auto" onScroll={(e) => hsync.broadcast(e.currentTarget.scrollLeft, e.currentTarget)}>
              <div style={{ width: gridW + contentW }}>
                {load.rows.map((row) => (
                  <ResourceRow key={row.person.id} row={row} origin={origin} zoom={zoom} contentW={contentW} gridW={gridW} theme={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  row,
  origin,
  zoom,
  contentW,
  gridW,
  theme,
}: {
  row: RlRow;
  origin: string;
  zoom: ZoomLevel;
  contentW: number;
  gridW: number;
  theme: ReturnType<typeof useGanttTheme>;
}) {
  const ppd = pxPerDay(zoom);
  const cellW = Math.max(2, ppd);

  // Aggregate label: utilisation %, or the honest unknown-capacity wording (§2.8).
  const util =
    row.overallUtilPct != null
      ? `${Math.round(row.overallUtilPct)}%`
      : row.person.kind === "subcontractor"
        ? "capacity not tracked"
        : "no capacity set";

  return (
    <div className="flex border-b" style={{ height: ROW_H, borderColor: theme.grid }}>
      <div className="sticky left-0 z-10 flex items-center gap-2 border-r px-3" style={{ width: gridW, background: theme.headerBg }}>
        <span className="truncate text-xs font-medium" style={{ color: theme.text }} title={row.person.name}>
          {row.person.name}
        </span>
        <span className="text-muted-foreground text-[10px] uppercase">{row.person.kind === "tech" ? "Tech" : "Sub"}</span>
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: row.overAllocatedDays > 0 ? theme.danger : theme.textMuted }}>
          {util}
        </span>
        {row.overAllocatedDays > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: theme.danger }} title={`Over-allocated on ${row.overAllocatedDays} day(s)`}>
            <AlertTriangle className="h-3 w-3" /> {row.overAllocatedDays}
          </span>
        )}
      </div>

      <svg width={contentW} height={ROW_H} style={{ display: "block" }} aria-hidden>
        <defs>
          {/* diagonal hatch — the non-colour signal for over-allocated cells */}
          <pattern id={`hatch-${row.person.id}`} width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill={theme.danger} />
            <line x1="0" y1="0" x2="0" y2="4" stroke={theme.headerBg} strokeWidth="1.5" />
          </pattern>
        </defs>
        {row.days.map((day) => {
          const cell = cellVisual(day, theme, row.person.id);
          if (!cell) return null;
          const x = dateToX(day.date, origin, zoom);
          return (
            <rect
              key={day.date}
              x={x}
              y={(ROW_H - STRIP_H) / 2}
              width={cellW}
              height={STRIP_H}
              rx={1}
              fill={cell.fill}
              stroke={cell.stroke}
              strokeWidth={cell.stroke === "none" ? 0 : 1}
            >
              <title>{cellTitle(day, row)}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

/** A day's cell fill/stroke, or null when the day has nothing to show. Over-allocated
 *  days use a hatch pattern (shape, not colour alone) + a danger stroke. */
function cellVisual(day: RlDay, theme: ReturnType<typeof useGanttTheme>, personId: string) {
  if (day.overAllocated) return { fill: `url(#hatch-${personId})`, stroke: theme.danger };
  if (day.bookedHours > 0) {
    // opacity by utilisation where capacity is known; a flat tint otherwise
    const frac = day.utilisationPct != null ? Math.min(1, Math.max(0.15, day.utilisationPct / 100)) : 0.5;
    return { fill: withOpacity(theme.taskFill, frac), stroke: "none" as const };
  }
  if (day.plannedTasks.length > 0) return { fill: withOpacity(theme.jobFill, 0.5), stroke: "none" as const };
  return null;
}

function cellTitle(day: RlDay, row: RlRow): string {
  const bits = [`${row.person.name} · ${day.date}`];
  if (day.bookedHours > 0) bits.push(`Booked ${day.bookedHours}h${day.capacityHours != null ? ` / ${day.capacityHours}h capacity` : ""}`);
  if (day.plannedTasks.length > 0) bits.push(`Planned: ${day.plannedTasks.join(", ")}`);
  if (day.capacityHours == null) bits.push(row.person.kind === "subcontractor" ? "capacity not tracked" : "no capacity set");
  if (day.overAllocated) bits.push("OVER-ALLOCATED");
  return bits.join(" · ");
}

/** Apply an opacity to a #rrggbb as an #rrggbbaa suffix (theme colours are hex). */
function withOpacity(hex: string, frac: number): string {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, frac)) * 255).toString(16).padStart(2, "0");
  return `#${h}${a}`;
}
