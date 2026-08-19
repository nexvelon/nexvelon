// UIDG-12 — the PURE geometry the interactive Gantt renders from. No React, no DOM:
// dates ↔ pixels, bar spans, the collapsible row model, dependency-arrow routing,
// drag date maths, axis ticks and the virtualization window all live here so they
// are unit-testable and the component is a thin renderer over them. Date rules and
// cycle detection stay in the UIDG-11 data layer — this module only positions
// things.

import type {
  ProjectGantt,
  GanttTask,
  GanttJobRow,
  GanttTaskDependencyRow,
} from "@/lib/api/gantt";

const MS_DAY = 86_400_000;

/** ISO yyyy-mm-dd → integer day number (UTC), the unit all geometry works in. */
export function toDayNum(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / MS_DAY);
}
export function fromDayNum(n: number): string {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}
/** Inclusive-exclusive day delta: daysBetween(a,a) === 0. */
export function daysBetween(a: string, b: string): number {
  return toDayNum(b) - toDayNum(a);
}
export function addDays(iso: string, days: number): string {
  return fromDayNum(toDayNum(iso) + days);
}

// ─── Zoom ────────────────────────────────────────────────────────────────────

export type ZoomLevel = "day" | "week" | "month" | "quarter";
export const ZOOM_LEVELS: ZoomLevel[] = ["day", "week", "month", "quarter"];

/** Pixels per DAY at each zoom. Bars are day-typed, so px/day is the one knob;
 *  the header bands are derived from it. */
export const PX_PER_DAY: Record<ZoomLevel, number> = {
  day: 28,
  week: 11,
  month: 3.4,
  quarter: 1.3,
};

export const ROW_HEIGHT = 34;
export const BAR_HEIGHT = 16;
export const MIN_BAR_PX = 6;

export function pxPerDay(zoom: ZoomLevel): number {
  return PX_PER_DAY[zoom];
}

/**
 * Choose the opening zoom so the whole project fits ~targetPx without opening a
 * long project at day zoom (which would show a sliver). Finest zoom whose full
 * span is ≤ targetPx; the coarsest (quarter) if nothing fits.
 */
export function chooseInitialZoom(
  range: { from: string; to: string } | null,
  targetPx = 1600
): ZoomLevel {
  if (!range) return "week";
  const totalDays = daysBetween(range.from, range.to) + 1;
  for (const z of ZOOM_LEVELS) {
    if (totalDays * PX_PER_DAY[z] <= targetPx) return z;
  }
  return "quarter";
}

// ─── Axis origin + width ─────────────────────────────────────────────────────

/** The axis origin date — the project start padded a few days left for breathing
 *  room and so a bar starting on day 0 isn't flush to the edge. */
export function axisOrigin(range: { from: string; to: string }, padDays = 3): string {
  return addDays(range.from, -padDays);
}

export function dateToX(iso: string, origin: string, zoom: ZoomLevel): number {
  return daysBetween(origin, iso) * PX_PER_DAY[zoom];
}

/** Pixel offset → the whole day it lands on (dates are day-typed → snap to days). */
export function xToDate(x: number, origin: string, zoom: ZoomLevel): string {
  return addDays(origin, Math.round(x / PX_PER_DAY[zoom]));
}

/** Total content width for a range at a zoom (+ padding both sides). */
export function contentWidth(range: { from: string; to: string }, zoom: ZoomLevel, padDays = 3): number {
  const origin = axisOrigin(range, padDays);
  const end = addDays(range.to, padDays);
  return Math.max(0, dateToX(end, origin, zoom));
}

// ─── Bar geometry ────────────────────────────────────────────────────────────

export interface BarGeom {
  /** left edge px (for a point marker, the marker centre). */
  x: number;
  /** bar width px (0 for a point marker). */
  width: number;
  /** true → render a diamond marker (a due-date-only task), not a bar (2c). */
  isPoint: boolean;
  /** true → nothing to place (no start/end/due). */
  empty: boolean;
}

/** A task's bar. A day-typed span is inclusive of its end day, so a 1-day task is
 *  one px-per-day wide, not zero. A due-date-only task is a point marker. */
export function barGeom(
  barStart: string | null,
  barEnd: string | null,
  origin: string,
  zoom: ZoomLevel
): BarGeom {
  const ppd = PX_PER_DAY[zoom];
  if (!barStart && !barEnd) return { x: 0, width: 0, isPoint: false, empty: true };
  if (!barStart && barEnd) {
    return { x: dateToX(barEnd, origin, zoom), width: 0, isPoint: true, empty: false };
  }
  const start = barStart as string;
  const end = barEnd ?? start;
  const x = dateToX(start, origin, zoom);
  const spanDays = Math.max(0, daysBetween(start, end)) + 1; // inclusive
  return { x, width: Math.max(MIN_BAR_PX, spanDays * ppd), isPoint: false, empty: false };
}

// ─── Row model (collapsible jobs → nested tasks) ─────────────────────────────

export type GanttRowKind = "job" | "task" | "group";

export interface GanttRow {
  kind: GanttRowKind;
  id: string;
  label: string;
  /** Indent level (0 = job/group). Visual indent is clamped at DEPTH_CAP. */
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  /** The bar span to draw (a job's is its summary span; a task's is its bar). */
  barStart: string | null;
  barEnd: string | null;
  isPoint: boolean;
  effectivePercent: number;
  status: string;
  /** The underlying task (null for job/group rows). */
  task: GanttTask | null;
  jobId: string | null;
}

export const DEPTH_CAP = 4;

/** A collapsed job's summary span = min child bar_start → max child bar_end; when
 *  no child has dates, its own planned dates (2c). */
export function jobSummarySpan(job: GanttJobRow): { start: string | null; end: string | null } {
  let min: string | null = null;
  let max: string | null = null;
  const walk = (t: GanttTask) => {
    if (t.bar_start && (!min || t.bar_start < min)) min = t.bar_start;
    const e = t.bar_end ?? t.bar_start;
    if (e && (!max || e > max)) max = e;
    t.children.forEach(walk);
  };
  job.tasks.forEach(walk);
  if (min || max) return { start: min, end: max ?? min };
  return { start: job.planned_start_date, end: job.planned_end_date };
}

/**
 * Flatten the nested Gantt into ordered visual rows, honouring collapse. A
 * collapsed job/task hides its descendants; the job row still shows its summary
 * bar. Project-level tasks (job_id null) group under a synthetic "Project tasks"
 * header row.
 */
export function flattenRows(gantt: ProjectGantt, collapsed: ReadonlySet<string>): GanttRow[] {
  const rows: GanttRow[] = [];

  const pushTask = (t: GanttTask, depth: number) => {
    const hasKids = t.children.length > 0;
    const isCollapsed = collapsed.has(t.id);
    rows.push({
      kind: "task",
      id: t.id,
      label: t.title,
      depth,
      hasChildren: hasKids,
      collapsed: isCollapsed,
      barStart: t.bar_start,
      barEnd: t.bar_end,
      isPoint: t.is_point,
      effectivePercent: t.effective_percent,
      status: t.status,
      task: t,
      jobId: t.job_id,
    });
    if (hasKids && !isCollapsed) for (const c of t.children) pushTask(c, depth + 1);
  };

  for (const job of gantt.jobs) {
    const span = jobSummarySpan(job);
    const isCollapsed = collapsed.has(job.job_id);
    const hasKids = job.tasks.length > 0;
    rows.push({
      kind: "job",
      id: job.job_id,
      label: job.label,
      depth: 0,
      hasChildren: hasKids,
      collapsed: isCollapsed,
      barStart: span.start,
      barEnd: span.end,
      isPoint: false,
      effectivePercent: 0,
      status: job.status,
      task: null,
      jobId: job.job_id,
    });
    if (hasKids && !isCollapsed) for (const t of job.tasks) pushTask(t, 1);
  }

  if (gantt.project_tasks.length > 0) {
    const groupId = "__project_tasks__";
    const isCollapsed = collapsed.has(groupId);
    rows.push({
      kind: "group",
      id: groupId,
      label: "Project tasks",
      depth: 0,
      hasChildren: true,
      collapsed: isCollapsed,
      barStart: null,
      barEnd: null,
      isPoint: false,
      effectivePercent: 0,
      status: "",
      task: null,
      jobId: null,
    });
    if (!isCollapsed) for (const t of gantt.project_tasks) pushTask(t, 1);
  }

  return rows;
}

// ─── Vertical virtualization ─────────────────────────────────────────────────

/** The row index window to render for a scroll position (with overscan). Keeps a
 *  200-task project from mounting 200 rows at once (2f). */
export function visibleRowRange(
  scrollTop: number,
  viewportH: number,
  total: number,
  overscan = 8,
  rowH = ROW_HEIGHT
): { start: number; end: number } {
  const start = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / rowH) + overscan);
  return { start, end };
}

// ─── Drag maths ──────────────────────────────────────────────────────────────

export type DragMode = "move" | "resize-start" | "resize-end";

/**
 * New start/end after a pixel drag, snapped to whole days at every zoom (dates are
 * day-typed). Resizing never inverts the bar (start ≤ end enforced). Returns the
 * new dates; the caller persists them through the gated action layer, where the
 * UIDG-11 validators run again.
 */
export function applyDrag(
  start: string,
  end: string,
  deltaPx: number,
  zoom: ZoomLevel,
  mode: DragMode
): { start: string; end: string } {
  const deltaDays = Math.round(deltaPx / PX_PER_DAY[zoom]);
  if (deltaDays === 0) return { start, end };
  if (mode === "move") return { start: addDays(start, deltaDays), end: addDays(end, deltaDays) };
  if (mode === "resize-start") {
    const ns = addDays(start, deltaDays);
    return { start: ns > end ? end : ns, end };
  }
  const ne = addDays(end, deltaDays);
  return { start, end: ne < start ? start : ne };
}

// ─── Dependency violations ───────────────────────────────────────────────────

/**
 * Is a typed dependency currently VIOLATED by the live bar positions? We do not
 * block the drag (2d) — we flag it. FS: successor must start on/after predecessor
 * end + lag. SS/FF/SF analogous. Missing dates → not evaluated (no violation).
 */
export function isDependencyViolated(
  dep: { dependency_type: string; lag_days: number },
  predBar: { start: string | null; end: string | null },
  succBar: { start: string | null; end: string | null }
): boolean {
  const ps = predBar.start;
  const pe = predBar.end ?? predBar.start;
  const ss = succBar.start;
  const se = succBar.end ?? succBar.start;
  const lag = dep.lag_days;
  switch (dep.dependency_type) {
    case "FS":
      return pe != null && ss != null && toDayNum(ss) < toDayNum(pe) + lag;
    case "SS":
      return ps != null && ss != null && toDayNum(ss) < toDayNum(ps) + lag;
    case "FF":
      return pe != null && se != null && toDayNum(se) < toDayNum(pe) + lag;
    case "SF":
      return ps != null && se != null && toDayNum(se) < toDayNum(ps) + lag;
    default:
      return false;
  }
}

// ─── Dependency arrow routing ────────────────────────────────────────────────

export interface ArrowEndpoints {
  /** Source point (on the predecessor bar) + target point (on the successor). */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /** SVG path (orthogonal elbow, routed clear of the bars). */
  path: string;
  /** Lag segment: a dashed run of |lag| days near the target (null when lag 0). */
  lag: { x1: number; x2: number; y: number; label: string } | null;
}

interface Rect {
  x: number;
  width: number;
  cy: number; // row centre y
}

/** Route an arrow between two bars for a link type, in the row gutters so it stays
 *  clear of the bars. Lag (≠0) is drawn as a dashed segment at the target. */
export function arrowGeom(
  dep: { dependency_type: string; lag_days: number },
  pred: Rect,
  succ: Rect,
  zoom: ZoomLevel
): ArrowEndpoints {
  const type = dep.dependency_type;
  const predRight = pred.x + pred.width;
  const succRight = succ.x + succ.width;

  // Source/target x by link type.
  const sx = type === "SS" || type === "SF" ? pred.x : predRight;
  const tx = type === "FF" || type === "SF" ? succRight : succ.x;
  const sy = pred.cy;
  const ty = succ.cy;

  // Elbow: short stub out of the source, vertical in the gutter, into the target.
  const dir = tx >= sx ? 1 : -1;
  const stub = 10;
  const midX = tx - dir * stub;
  const path = `M ${sx} ${sy} H ${sx + dir * stub} V ${ty} H ${tx}`;
  void midX;

  const ppd = PX_PER_DAY[zoom];
  const lag =
    dep.lag_days !== 0
      ? {
          x1: tx - Math.sign(dep.lag_days) * dep.lag_days * ppd,
          x2: tx,
          y: ty,
          label: `${dep.lag_days > 0 ? "+" : "−"}${Math.abs(dep.lag_days)}d`,
        }
      : null;

  return { sx, sy, tx, ty, path, lag };
}

// ─── Axis header ticks ───────────────────────────────────────────────────────

export interface AxisTick {
  label: string;
  x: number;
  width: number;
}
export interface AxisHeader {
  /** Coarse band (month / quarter / year depending on zoom). */
  top: AxisTick[];
  /** Fine band (day / week / month / quarter). */
  unit: AxisTick[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymd(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/**
 * Two-tier header for the VISIBLE window [fromDay, toDay] (clamping keeps the tick
 * count bounded regardless of total span — 2f). x is relative to the axis origin.
 */
export function axisHeader(
  origin: string,
  zoom: ZoomLevel,
  visibleFrom: string,
  visibleTo: string
): AxisHeader {
  const ppd = PX_PER_DAY[zoom];
  const startDay = toDayNum(visibleFrom);
  const endDay = toDayNum(visibleTo);
  const xOf = (iso: string) => dateToX(iso, origin, zoom);
  const top: AxisTick[] = [];
  const unit: AxisTick[] = [];

  if (zoom === "day") {
    // top = month, unit = day-of-month
    for (let d = startDay; d <= endDay; d++) {
      const iso = fromDayNum(d);
      const { d: dom } = ymd(iso);
      unit.push({ label: String(dom), x: xOf(iso), width: ppd });
    }
    monthBands(top, startDay, endDay, xOf);
  } else if (zoom === "week") {
    // top = month, unit = week starting Monday
    let d = startDay;
    while (d <= endDay) {
      const dow = (new Date(d * MS_DAY).getUTCDay() + 6) % 7; // 0=Mon
      const weekStart = d - dow;
      const wsIso = fromDayNum(Math.max(startDay, weekStart));
      const { d: dom } = ymd(fromDayNum(weekStart));
      unit.push({ label: `${dom}`, x: xOf(wsIso), width: ppd * 7 });
      d = weekStart + 7;
    }
    monthBands(top, startDay, endDay, xOf);
  } else if (zoom === "month") {
    // top = year, unit = month
    let cur = ymd(visibleFrom);
    let iter = `${cur.y}-${String(cur.m).padStart(2, "0")}-01`;
    while (toDayNum(iter) <= endDay) {
      const first = iter;
      const next = cur.m === 12 ? `${cur.y + 1}-01-01` : `${cur.y}-${String(cur.m + 1).padStart(2, "0")}-01`;
      const w = (toDayNum(next) - toDayNum(first)) * ppd;
      unit.push({ label: MONTHS[cur.m - 1], x: xOf(first), width: w });
      cur = ymd(next);
      iter = next;
    }
    yearBands(top, startDay, endDay, xOf);
  } else {
    // quarter: top = year, unit = quarter
    let cur = ymd(visibleFrom);
    let qMonth = Math.floor((cur.m - 1) / 3) * 3 + 1;
    let iter = `${cur.y}-${String(qMonth).padStart(2, "0")}-01`;
    while (toDayNum(iter) <= endDay) {
      const first = iter;
      const y = ymd(first).y;
      const nextQMonth = qMonth + 3;
      const next = nextQMonth > 12 ? `${y + 1}-01-01` : `${y}-${String(nextQMonth).padStart(2, "0")}-01`;
      const w = (toDayNum(next) - toDayNum(first)) * ppd;
      unit.push({ label: `Q${Math.floor((qMonth - 1) / 3) + 1}`, x: xOf(first), width: w });
      const nc = ymd(next);
      cur = nc;
      qMonth = Math.floor((nc.m - 1) / 3) * 3 + 1;
      iter = next;
    }
    yearBands(top, startDay, endDay, xOf);
  }

  return { top, unit };
}

function monthBands(out: AxisTick[], startDay: number, endDay: number, xOf: (iso: string) => number) {
  const cur = ymd(fromDayNum(startDay));
  let iter = `${cur.y}-${String(cur.m).padStart(2, "0")}-01`;
  if (toDayNum(iter) < startDay) iter = fromDayNum(startDay);
  while (toDayNum(iter) <= endDay) {
    const c = ymd(iter);
    const next = c.m === 12 ? `${c.y + 1}-01-01` : `${c.y}-${String(c.m + 1).padStart(2, "0")}-01`;
    const segStart = Math.max(toDayNum(iter), startDay);
    const segEnd = Math.min(toDayNum(next), endDay + 1);
    out.push({
      label: `${MONTHS[c.m - 1]} ${c.y}`,
      x: xOf(fromDayNum(segStart)),
      width: (segEnd - segStart) * (xOf(fromDayNum(segStart + 1)) - xOf(fromDayNum(segStart))),
    });
    iter = next;
  }
}

function yearBands(
  out: AxisTick[],
  startDay: number,
  endDay: number,
  xOf: (iso: string) => number
) {
  let year = ymd(fromDayNum(startDay)).y;
  while (toDayNum(`${year}-01-01`) <= endDay) {
    const first = `${year}-01-01`;
    const next = `${year + 1}-01-01`;
    const segStart = Math.max(toDayNum(first), startDay);
    const segEnd = Math.min(toDayNum(next), endDay + 1);
    out.push({
      label: String(year),
      x: xOf(fromDayNum(segStart)),
      width: (segEnd - segStart) * (xOf(fromDayNum(segStart + 1)) - xOf(fromDayNum(segStart))),
    });
    year += 1;
  }
}

// ─── Dependency index helper (for the renderer) ──────────────────────────────

/** Map task id → its row centre y, for arrow routing. */
export function rowCenters(rows: GanttRow[], rowH = ROW_HEIGHT): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r, i) => m.set(r.id, i * rowH + rowH / 2));
  return m;
}

/** Filter to the task dependencies whose BOTH endpoints are currently visible rows. */
export function visibleTaskDeps(
  deps: GanttTaskDependencyRow[],
  visibleIds: ReadonlySet<string>
): GanttTaskDependencyRow[] {
  return deps.filter((d) => visibleIds.has(d.task_id) && visibleIds.has(d.depends_on_task_id));
}
