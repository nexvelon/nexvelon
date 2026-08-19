"use client";

// UIDG-12 — the interactive Gantt. Hand-built SVG (no Gantt library, Jay's call),
// fully themed via useGanttTheme (→ useChartTheme → the active theme; no hardcoded
// colour). Bars are TASKS with collapsible job parents. Zoom day/week/month/
// quarter; drag to move/resize (persisted through the gated action layer — view-
// only can't drag); typed dependency arrows with lag; a toggleable baseline
// overlay (planned vs actual). All geometry is the pure lib (lib/gantt/geometry);
// all date/cycle validation is the UIDG-11 data layer — this file only renders and
// wires drags to the gated actions.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Layers,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getProjectGanttAction, getBaselineTasksAction, getProjectResourceLoadAction } from "@/app/(app)/projects/schedule-actions";
import { updateTaskAction } from "@/app/(app)/projects/task-actions";
import type { ResourceLoad } from "@/lib/gantt/resource-load";
import { ResourcePane, type HScrollSync } from "./ResourcePane";
import type { ProjectGantt } from "@/lib/api/gantt";
import type { DbScheduleBaselineTask } from "@/lib/types/database";
import {
  ZOOM_LEVELS,
  type ZoomLevel,
  type GanttRow,
  chooseInitialZoom,
  axisOrigin,
  contentWidth,
  dateToX,
  barGeom,
  flattenRows,
  applyDrag,
  isDependencyViolated,
  arrowGeom,
  axisHeader,
  visibleRowRange,
  rowCenters,
  visibleTaskDeps,
  daysBetween,
  toDayNum,
  fromDayNum,
  pxPerDay,
  ROW_HEIGHT,
  BAR_HEIGHT,
} from "@/lib/gantt/geometry";
import { computeCriticalPath, type CriticalPathResult, type CpNode } from "@/lib/gantt/critical-path";
import { makeWorkingCalendar, ALL_DAYS_CALENDAR, snapDragResult, nonWorkingRuns } from "@/lib/gantt/working-calendar";
import { useGanttTheme } from "./useGanttTheme";
import { GitBranch } from "lucide-react";

const GRID_W = 356;
const HEADER_H = 44;
const MILESTONE_H = 18;
// Task · Start · End · % · Float (UIDG-13 added Float).
const GRID_COLS = "1fr 58px 58px 34px 52px";

interface Props {
  projectId: string;
  canEdit: boolean;
  /** Below desktop the Gantt is read-only (no drag / keyboard reschedule). */
  interactive?: boolean;
}

export function InteractiveGantt({ projectId, canEdit, interactive = true }: Props) {
  const [gantt, setGantt] = useState<ProjectGantt | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const [collapsed, toggleCollapsed] = useCollapsed(projectId);
  const [showBaseline, setShowBaseline] = useState(false);
  const [baselineTasks, setBaselineTasks] = useState<Map<string, DbScheduleBaselineTask> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // UIDG-14 — resource lane. Fetched once the range is known; "denied" when the
  // caller lacks scheduling:view (the pane then isn't offered).
  const [resource, setResource] = useState<ResourceLoad | null>(null);
  const [resourceDenied, setResourceDenied] = useState(false);

  const editable = canEdit && interactive;

  const load = useCallback(() => {
    getProjectGanttAction(projectId).then((res) => {
      setLoaded(true);
      if (res.ok) {
        setGantt(res.data);
        setZoom((z) => (z === "week" && res.data.range ? chooseInitialZoom(res.data.range) : z));
      }
    });
  }, [projectId]);
  useEffect(load, [load]);

  // Baseline overlay: lazily load the most recent baseline's task snapshot.
  useEffect(() => {
    if (!showBaseline || !gantt || gantt.baselines.length === 0 || baselineTasks) return;
    getBaselineTasksAction(gantt.baselines[0].id).then((res) => {
      if (res.ok) setBaselineTasks(new Map(res.data.map((t) => [t.task_id, t])));
    });
  }, [showBaseline, gantt, baselineTasks]);

  // Resource load over the project's window (gated scheduling:view server-side).
  const range = gantt?.range ?? null;
  useEffect(() => {
    if (!range) return;
    getProjectResourceLoadAction(projectId, range.from, range.to).then((res) => {
      if (res.ok) setResource(res.data);
      else setResourceDenied(true);
    });
  }, [projectId, range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Horizontal-scroll sync between the Gantt and the resource pane (they share the
  // time axis + zoom). A tiny pub/sub over the two scroll containers.
  const panesRef = useRef<Set<HTMLElement>>(new Set());
  const syncingRef = useRef(false);
  const hsync = useMemo<HScrollSync>(
    () => ({
      attach: (el) => {
        if (el) panesRef.current.add(el);
      },
      broadcast: (left, from) => {
        if (syncingRef.current) return;
        syncingRef.current = true;
        panesRef.current.forEach((el) => {
          if (el !== from && el.scrollLeft !== left) el.scrollLeft = left;
        });
        syncingRef.current = false;
      },
    }),
    []
  );

  if (!loaded) {
    return <div className="text-muted-foreground p-8 text-sm">Loading schedule…</div>;
  }
  if (!gantt || !gantt.range || (gantt.jobs.length === 0 && gantt.project_tasks.length === 0)) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-3">
      <GanttCanvas
        gantt={gantt}
        zoom={zoom}
        setZoom={setZoom}
        collapsed={collapsed}
        toggleCollapsed={toggleCollapsed}
        showBaseline={showBaseline}
        setShowBaseline={setShowBaseline}
        hasBaseline={gantt.baselines.length > 0}
        baselineTasks={baselineTasks}
        selected={selected}
        setSelected={setSelected}
        editable={editable}
        projectId={projectId}
        onChanged={load}
        applyOptimistic={setGantt}
        hsync={hsync}
      />
      {!resourceDenied && gantt.range && (
        <ResourcePane
          load={resource}
          range={gantt.range}
          zoom={zoom}
          gridW={GRID_W}
          hsync={hsync}
        />
      )}
    </div>
  );
}

// ─── The canvas (split pane + virtualized rows + SVG timeline) ────────────────

interface CanvasProps {
  gantt: ProjectGantt;
  zoom: ZoomLevel;
  setZoom: (z: ZoomLevel) => void;
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (id: string) => void;
  showBaseline: boolean;
  setShowBaseline: (v: boolean) => void;
  hasBaseline: boolean;
  baselineTasks: Map<string, DbScheduleBaselineTask> | null;
  selected: string | null;
  setSelected: (id: string | null) => void;
  editable: boolean;
  projectId: string;
  onChanged: () => void;
  applyOptimistic: (g: ProjectGantt) => void;
  hsync: HScrollSync;
}

function GanttCanvas(p: CanvasProps) {
  const t = useGanttTheme();
  const { gantt, zoom } = p;
  const range = gantt.range!;
  const origin = useMemo(() => axisOrigin(range), [range]);
  const contentW = useMemo(() => contentWidth(range, zoom), [range, zoom]);
  const rows = useMemo(() => flattenRows(gantt, p.collapsed), [gantt, p.collapsed]);
  const totalH = rows.length * ROW_HEIGHT;

  // UIDG-13 — critical path + float, recomputed whenever the graph changes (incl.
  // after a drag commit's optimistic patch). Pure + memoized.
  const cp = useMemo<CriticalPathResult>(() => computeCriticalPath(gantt), [gantt]);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const criticalActive = showCriticalOnly && cp.meaningful && cp.ok;

  // GANTT-CAL — non-working-day (weekend/holiday) shading, only where per-day
  // columns are legible (day + week zoom, 2f).
  const cal = useMemo(() => makeWorkingCalendar(gantt.calendar ?? ALL_DAYS_CALENDAR), [gantt.calendar]);
  const shadeRuns = useMemo(
    () => (zoom === "day" || zoom === "week" ? nonWorkingRuns(cal, toDayNum(range.from) - 3, toDayNum(range.to) + 3) : []),
    [cal, zoom, range]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    p.hsync.attach(el);
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.hsync]);

  // Jump to today on first data.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && gantt.today) el.scrollLeft = Math.max(0, dateToX(gantt.today, origin, zoom) - 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gantt.project_id]);

  // Virtualize only when a real height is known (tests / SSR render all rows).
  const win = viewportH > 0 ? visibleRowRange(scrollTop, viewportH, rows.length) : { start: 0, end: rows.length };
  const visibleRows = rows.slice(win.start, win.end);
  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  const centers = useMemo(() => rowCenters(rows), [rows]);
  const deps = useMemo(() => visibleTaskDeps(gantt.task_dependencies, visibleIds), [gantt.task_dependencies, visibleIds]);
  const barFor = useCallback(
    (start: string | null, end: string | null) => barGeom(start, end, origin, zoom),
    [origin, zoom]
  );

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    setScrollTop(e.currentTarget.scrollTop);
    p.hsync.broadcast(e.currentTarget.scrollLeft, e.currentTarget);
  }

  function jumpToday() {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, dateToX(gantt.today, origin, zoom) - 240);
  }

  const zoomIdx = ZOOM_LEVELS.indexOf(zoom);

  return (
    <div className="bg-card flex h-[70vh] min-h-[420px] flex-col rounded-lg border" style={{ borderColor: t.grid }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: t.grid }}>
        <div className="flex items-center gap-1">
          <ToolbarBtn label="Zoom out" disabled={zoomIdx >= ZOOM_LEVELS.length - 1} onClick={() => p.setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1)])}>
            <ZoomOut className="h-4 w-4" />
          </ToolbarBtn>
          <span className="text-muted-foreground w-14 text-center text-xs capitalize">{zoom}</span>
          <ToolbarBtn label="Zoom in" disabled={zoomIdx <= 0} onClick={() => p.setZoom(ZOOM_LEVELS[Math.max(0, zoomIdx - 1)])}>
            <ZoomIn className="h-4 w-4" />
          </ToolbarBtn>
        </div>
        <ToolbarBtn label="Jump to today" onClick={jumpToday}>
          <Crosshair className="h-4 w-4" /> <span className="text-xs">Today</span>
        </ToolbarBtn>

        {/* UIDG-13 — critical path toggle (only when the network can compute one). */}
        <button
          type="button"
          onClick={() => setShowCriticalOnly((v) => !v)}
          disabled={!cp.meaningful || !cp.ok}
          aria-pressed={criticalActive}
          title={cp.ok ? (cp.meaningful ? "Highlight the critical path" : "Add task dependencies to compute a critical path") : "Dependency loop — can't compute"}
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs disabled:opacity-40"
          style={{ borderColor: t.grid, background: criticalActive ? t.rowAltBg : "transparent", color: criticalActive ? t.critical : t.text }}
        >
          <GitBranch className="h-3.5 w-3.5" /> Critical path
        </button>

        <CalendarBadge calendar={gantt.calendar} theme={t} />

        {/* Projected finish + variance banner (the number the operator wants). */}
        <div className="ml-auto"><FinishBanner cp={cp} theme={t} /></div>

        {p.hasBaseline && (
          <button
            type="button"
            onClick={() => p.setShowBaseline(!p.showBaseline)}
            aria-pressed={p.showBaseline}
            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
            style={{
              borderColor: t.grid,
              background: p.showBaseline ? t.rowAltBg : "transparent",
              color: t.text,
            }}
          >
            <Layers className="h-3.5 w-3.5" /> Baseline
          </button>
        )}
        {!p.hasBaseline && <span className="text-muted-foreground text-[11px]">No baseline captured</span>}
      </div>

      {/* Scroll body — one container; sticky header + sticky-left grid keep the two
          panes aligned with zero manual scroll-syncing. */}
      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-auto" data-testid="gantt-scroll">
        <div style={{ width: GRID_W + contentW, height: HEADER_H + MILESTONE_H + totalH, position: "relative" }}>
          {/* Header band (sticky top) */}
          <div className="sticky top-0 z-30 flex" style={{ height: HEADER_H, background: t.headerBg }}>
            <div className="sticky left-0 z-40 flex items-end border-r px-3 pb-1" style={{ width: GRID_W, background: t.headerBg, borderColor: t.grid }}>
              <div className="text-muted-foreground grid w-full gap-1 text-[10px] font-medium uppercase tracking-wide" style={{ gridTemplateColumns: GRID_COLS }}>
                <span>Task</span><span className="text-right">Start</span><span className="text-right">End</span><span className="text-right">%</span><span className="text-right">Float</span>
              </div>
            </div>
            <AxisHeaderSvg origin={origin} zoom={zoom} contentW={contentW} theme={t} range={range} />
          </div>

          {/* Milestone strip (sticky just below the header) */}
          <div className="sticky z-20 flex" style={{ top: HEADER_H, height: MILESTONE_H }}>
            <div className="sticky left-0 z-30 border-r" style={{ width: GRID_W, height: MILESTONE_H, background: t.headerBg, borderColor: t.grid }} />
            <MilestoneStrip gantt={gantt} origin={origin} zoom={zoom} contentW={contentW} theme={t} />
          </div>

          {/* Body: sticky-left grid + timeline svg */}
          <div className="flex" style={{ minHeight: totalH }}>
            <div className="sticky left-0 z-10 border-r" style={{ width: GRID_W, background: t.headerBg, borderColor: t.grid }}>
              {/* virtualization spacers keep scroll height correct */}
              <div style={{ height: win.start * ROW_HEIGHT }} />
              {visibleRows.map((row, i) => (
                <GridRow
                  key={row.id}
                  row={row}
                  index={win.start + i}
                  selected={p.selected === row.id}
                  editable={p.editable}
                  cpNode={row.task ? cp.nodes.get(row.task.id) ?? null : null}
                  dimmed={criticalActive && row.kind === "task" && !cp.criticalTaskIds.has(row.id)}
                  onToggle={() => row.hasChildren && p.toggleCollapsed(row.id)}
                  onSelect={() => p.setSelected(row.id)}
                  onNudge={(mode, dir) => nudge(p, row, mode, dir)}
                  theme={t}
                />
              ))}
              <div style={{ height: (rows.length - win.end) * ROW_HEIGHT }} />
            </div>

            <svg width={contentW} height={totalH} style={{ display: "block" }} role="img" aria-label="Project timeline">
              {/* non-working-day shading (weekends + holidays), behind everything */}
              {shadeRuns.map((r, i) => (
                <rect
                  key={i}
                  x={dateToX(fromDayNum(r.from), origin, zoom)}
                  y={0}
                  width={(r.to - r.from + 1) * pxPerDay(zoom)}
                  height={totalH}
                  fill={t.nonWorking}
                />
              ))}
              <TimelineGridLines origin={origin} zoom={zoom} contentW={contentW} totalH={totalH} range={range} theme={t} />
              <TodayLine x={dateToX(gantt.today, origin, zoom)} totalH={totalH} theme={t} />
              {/* dependency arrows (visible endpoints only) */}
              {deps.map((d) => (
                <DepArrow key={d.id} dep={d} rows={rows} centers={centers} barFor={barFor} zoom={zoom} theme={t} />
              ))}
              {/* bars for visible rows */}
              {visibleRows.map((row, i) => (
                <TimelineRow
                  key={row.id}
                  row={row}
                  y={(win.start + i) * ROW_HEIGHT}
                  barFor={barFor}
                  showBaseline={p.showBaseline}
                  baseline={p.baselineTasks?.get(row.id) ?? null}
                  today={gantt.today}
                  editable={p.editable && row.kind === "task"}
                  selected={p.selected === row.id}
                  cpNode={row.task ? cp.nodes.get(row.task.id) ?? null : null}
                  dimmed={criticalActive && row.kind === "task" && !cp.criticalTaskIds.has(row.id)}
                  onSelect={() => p.setSelected(row.id)}
                  onDrag={(mode, deltaPx) => commitDrag(p, row, mode, deltaPx, zoom)}
                  theme={t}
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Persisting a drag / keyboard nudge through the gated action layer ────────

async function persistDates(
  p: CanvasProps,
  row: GanttRow,
  next: { start: string; end: string }
) {
  const task = row.task;
  if (!task) return;
  // Optimistic: patch the local tree so the bar moves immediately.
  const patched = patchTaskDates(p.gantt, task.id, next.start, next.end);
  p.applyOptimistic(patched);
  const res = await updateTaskAction(task.id, p.projectId, { startDate: next.start, endDate: next.end }, task.job_id);
  if (!res.ok) {
    toast.error(res.error);
    p.onChanged(); // revert to server truth
  }
}

// GANTT-CAL — snap a dragged/nudged result onto working days so a drag never lands
// a task on a Sunday. A move snaps the start and carries the end by the same shift;
// a resize snaps the dragged edge. All-days calendar → no-op.
function snapNext(
  p: CanvasProps,
  next: { start: string; end: string },
  mode: "move" | "resize-start" | "resize-end"
): { start: string; end: string } {
  const cal = makeWorkingCalendar(p.gantt.calendar ?? ALL_DAYS_CALENDAR);
  return snapDragResult(cal, next, mode);
}

function commitDrag(p: CanvasProps, row: GanttRow, mode: "move" | "resize-start" | "resize-end", deltaPx: number, zoom: ZoomLevel) {
  const task = row.task;
  if (!task || !task.start_date || !task.end_date) return; // only scheduled bars drag
  const next = snapNext(p, applyDrag(task.start_date, task.end_date, deltaPx, zoom, mode), mode);
  if (next.start === task.start_date && next.end === task.end_date) return;
  void persistDates(p, row, next);
}

function nudge(p: CanvasProps, row: GanttRow, mode: "move" | "resize-end", dir: 1 | -1) {
  const task = row.task;
  if (!task || !task.start_date || !task.end_date) return;
  // A keyboard nudge is exactly ONE day regardless of zoom, then snapped to a
  // working day so nudging never parks a task on a weekend/holiday.
  const raw =
    mode === "move"
      ? { start: addOne(task.start_date, dir), end: addOne(task.end_date, dir) }
      : { start: task.start_date, end: maxDate(task.start_date, addOne(task.end_date, dir)) };
  const shifted = snapNext(p, raw, mode === "move" ? "move" : "resize-end");
  void persistDates(p, row, shifted);
}

function addOne(iso: string, dir: 1 | -1): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dir * 86_400_000).toISOString().slice(0, 10);
}
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function patchTaskDates(g: ProjectGantt, taskId: string, start: string, end: string): ProjectGantt {
  const walk = (t: ProjectGantt["jobs"][number]["tasks"][number]): typeof t => {
    if (t.id === taskId) {
      return { ...t, start_date: start, end_date: end, bar_start: start, bar_end: end, is_point: false, has_no_dates: false, children: t.children.map(walk) };
    }
    return { ...t, children: t.children.map(walk) };
  };
  return {
    ...g,
    jobs: g.jobs.map((j) => ({ ...j, tasks: j.tasks.map(walk) })),
    project_tasks: g.project_tasks.map(walk),
  };
}

// ─── Left grid row ────────────────────────────────────────────────────────────

function GridRow({
  row,
  index,
  selected,
  editable,
  cpNode,
  dimmed,
  onToggle,
  onSelect,
  onNudge,
  theme,
}: {
  row: GanttRow;
  index: number;
  selected: boolean;
  editable: boolean;
  cpNode: CpNode | null;
  dimmed: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onNudge: (mode: "move" | "resize-end", dir: 1 | -1) => void;
  theme: ReturnType<typeof useGanttTheme>;
}) {
  const indent = Math.min(row.depth, 4) * 12;
  const isTask = row.kind === "task";
  const critical = !!cpNode?.critical;
  const atRisk = !!cpNode?.atRisk;

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === " ") && row.hasChildren) {
      e.preventDefault();
      onToggle();
      return;
    }
    if (!editable || !isTask) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); onNudge(e.shiftKey ? "resize-end" : "move", -1); }
    if (e.key === "ArrowRight") { e.preventDefault(); onNudge(e.shiftKey ? "resize-end" : "move", 1); }
  }

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onFocus={onSelect}
      onKeyDown={onKeyDown}
      data-critical={critical || undefined}
      aria-label={critical ? `${row.label} — on the critical path` : undefined}
      className="grid items-center gap-1 border-b px-3 text-xs outline-none focus:ring-1"
      style={{
        height: ROW_HEIGHT,
        gridTemplateColumns: GRID_COLS,
        borderColor: theme.grid,
        background: selected ? theme.rowAltBg : index % 2 ? theme.rowAltBg : "transparent",
        color: theme.text,
        opacity: dimmed ? 0.35 : 1,
        // @ts-expect-error CSS var for focus ring colour from the theme
        "--tw-ring-color": theme.today,
      }}
    >
      <span className="flex min-w-0 items-center" style={{ paddingLeft: indent }}>
        {row.hasChildren ? (
          <button type="button" onClick={onToggle} aria-label={row.collapsed ? `Expand ${row.label}` : `Collapse ${row.label}`} className="mr-1 shrink-0">
            {row.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="mr-1 w-3.5 shrink-0" />
        )}
        {/* Critical marker — a non-colour signal (shape) so status isn't colour-only. */}
        {critical && <span className="mr-1 shrink-0" style={{ color: theme.critical }} title="On the critical path" aria-hidden>◆</span>}
        <span className={`truncate ${row.kind === "job" || row.kind === "group" ? "font-medium" : ""}`} title={row.label}>
          {row.label}
        </span>
      </span>
      <span className="text-muted-foreground truncate text-right tabular-nums text-[11px]">{row.barStart ?? "—"}</span>
      <span className="text-muted-foreground truncate text-right tabular-nums text-[11px]">{row.barEnd ?? "—"}</span>
      <span className="text-right tabular-nums text-[11px]">{row.kind === "task" ? `${row.effectivePercent}%` : ""}</span>
      <span
        className="text-right tabular-nums text-[11px]"
        style={{ color: critical ? theme.critical : atRisk ? theme.atRisk : theme.textMuted, fontWeight: critical ? 600 : 400 }}
        title={cpNode ? (critical ? "Critical — no float" : `${cpNode.totalFloat} day(s) of float`) : undefined}
      >
        {cpNode ? (critical ? "Critical" : `${cpNode.totalFloat}d`) : ""}
      </span>
    </div>
  );
}

// ─── Timeline row (bar / point / job summary + baseline overlay + drag) ───────

function TimelineRow({
  row,
  y,
  barFor,
  showBaseline,
  baseline,
  today,
  editable,
  selected,
  cpNode,
  dimmed,
  onSelect,
  onDrag,
  theme,
}: {
  row: GanttRow;
  y: number;
  barFor: (s: string | null, e: string | null) => ReturnType<typeof barGeom>;
  showBaseline: boolean;
  baseline: DbScheduleBaselineTask | null;
  today: string;
  editable: boolean;
  selected: boolean;
  cpNode: CpNode | null;
  dimmed: boolean;
  onSelect: () => void;
  onDrag: (mode: "move" | "resize-start" | "resize-end", deltaPx: number) => void;
  theme: ReturnType<typeof useGanttTheme>;
}) {
  const g = barFor(row.barStart, row.barEnd);
  const cy = y + ROW_HEIGHT / 2;
  const barY = cy - BAR_HEIGHT / 2;
  const drag = useBarDrag(editable, onDrag);
  const critical = !!cpNode?.critical;
  const atRisk = !!cpNode?.atRisk;
  const groupOpacity = dimmed ? 0.3 : 1;

  if (g.empty) return null;

  // Overdue: end before today and not done.
  const overdue = !!row.barEnd && row.barEnd < today && row.status !== "done" && row.kind === "task";

  // Point marker (due-date-only task) → a diamond.
  if (g.isPoint) {
    const s = 6;
    return (
      <g onPointerDown={onSelect} style={{ cursor: "pointer", opacity: groupOpacity }} data-critical={critical || undefined}>
        <title>{hoverText(row, cpNode)}</title>
        <rect
          x={g.x - s} y={cy - s} width={s * 2} height={s * 2}
          transform={`rotate(45 ${g.x} ${cy})`}
          fill={overdue ? theme.danger : theme.marker}
          stroke={critical ? theme.critical : "none"} strokeWidth={critical ? 2 : 0}
        />
      </g>
    );
  }

  const isJob = row.kind === "job";
  const fill = isJob ? theme.jobFill : overdue ? theme.danger : theme.taskFill;
  const pct = row.kind === "task" ? row.effectivePercent : 0;
  const progressW = (g.width * Math.min(100, Math.max(0, pct))) / 100;

  const baselineGeom = showBaseline && baseline ? barFor(baseline.start_date, baseline.end_date) : null;

  // Critical = a bold OUTLINE (overdue is a fill, a violated dep is a red arrow —
  // so the three read differently and can coexist). At-risk = a thin dashed outline.
  const outlineStroke = critical ? theme.critical : atRisk ? theme.atRisk : selected ? theme.today : "none";
  const outlineW = critical ? 2 : atRisk ? 1.25 : selected ? 1.5 : 0;

  return (
    <g onPointerDown={onSelect} style={{ cursor: editable ? "grab" : "pointer", opacity: groupOpacity }} data-critical={critical || undefined} data-atrisk={atRisk || undefined}>
      <title>{hoverText(row, cpNode)}</title>
      {/* baseline overlay (thin bar behind, above the live bar) */}
      {baselineGeom && !baselineGeom.empty && !baselineGeom.isPoint && (
        <rect x={baselineGeom.x} y={barY - 6} width={baselineGeom.width} height={4} rx={2} fill={theme.baseline} data-testid="baseline-bar" />
      )}
      {/* track + progress fill */}
      <rect x={g.x} y={barY} width={g.width} height={BAR_HEIGHT} rx={isJob ? 2 : 4} fill={theme.taskTrack} />
      <rect x={g.x} y={barY} width={progressW} height={BAR_HEIGHT} rx={isJob ? 2 : 4} fill={fill} />
      {/* critical / at-risk / selected outline */}
      {outlineW > 0 && (
        <rect x={g.x} y={barY} width={g.width} height={BAR_HEIGHT} rx={isJob ? 2 : 4} fill="none" stroke={outlineStroke} strokeWidth={outlineW} strokeDasharray={atRisk && !critical ? "3 2" : undefined} />
      )}
      {isJob && (
        <>
          <rect x={g.x} y={barY} width={3} height={BAR_HEIGHT} fill={fill} />
          <rect x={g.x + g.width - 3} y={barY} width={3} height={BAR_HEIGHT} fill={fill} />
        </>
      )}
      {/* drag zones (editable tasks only) */}
      {editable && (
        <>
          <rect x={g.x + 5} y={barY} width={Math.max(0, g.width - 10)} height={BAR_HEIGHT} fill="transparent" style={{ cursor: "grab" }} onPointerDown={(e) => drag(e, "move")} data-testid="drag-move" />
          <rect x={g.x} y={barY} width={5} height={BAR_HEIGHT} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={(e) => drag(e, "resize-start")} />
          <rect x={g.x + g.width - 5} y={barY} width={5} height={BAR_HEIGHT} fill="transparent" style={{ cursor: "ew-resize" }} onPointerDown={(e) => drag(e, "resize-end")} />
        </>
      )}
    </g>
  );
}

function useBarDrag(editable: boolean, onDrag: (mode: "move" | "resize-start" | "resize-end", deltaPx: number) => void) {
  return useCallback(
    (e: React.PointerEvent, mode: "move" | "resize-start" | "resize-end") => {
      if (!editable) return;
      e.stopPropagation();
      const startX = e.clientX;
      const move = (ev: PointerEvent) => {
        void ev;
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        onDrag(mode, ev.clientX - startX);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [editable, onDrag]
  );
}

function hoverText(row: GanttRow, cpNode?: CpNode | null): string {
  const t = row.task;
  const parts = [row.label];
  if (row.barStart) parts.push(`${row.barStart} → ${row.barEnd ?? row.barStart}`);
  if (row.barStart && row.barEnd) parts.push(`${daysBetween(row.barStart, row.barEnd) + 1}d`);
  if (t?.status) parts.push(`Status: ${t.status}`);
  if (row.kind === "task") parts.push(`${row.effectivePercent}%`);
  if (cpNode) parts.push(cpNode.critical ? "Critical (no float)" : `Float: ${cpNode.totalFloat}d`);
  return parts.join(" · ");
}

// ─── Projected finish + variance banner (UIDG-13) ─────────────────────────────

function FinishBanner({ cp, theme }: { cp: CriticalPathResult; theme: ReturnType<typeof useGanttTheme> }) {
  if (!cp.ok) {
    return <span className="text-[11px]" style={{ color: theme.danger }}>Dependency loop — can’t compute</span>;
  }
  if (!cp.projectEnd) return null;
  const v = cp.varianceDays;
  const varColor = v == null ? theme.textMuted : v > 0 ? theme.danger : theme.jobFill;
  return (
    <div className="text-[11px] leading-tight" style={{ color: theme.text }}>
      <span className="text-muted-foreground">Projected finish </span>
      <span className="font-medium tabular-nums">{cp.projectEnd}</span>
      {v != null && (
        <span className="ml-1 font-medium" style={{ color: varColor }}>
          ({v === 0 ? "on target" : v > 0 ? `${v}d late` : `${-v}d early`})
        </span>
      )}
      {!cp.meaningful && <span className="text-muted-foreground ml-1">· add dependencies for a critical path</span>}
    </div>
  );
}

// ─── Dependency arrow ─────────────────────────────────────────────────────────

function DepArrow({
  dep,
  rows,
  centers,
  barFor,
  zoom,
  theme,
}: {
  dep: { id: string; task_id: string; depends_on_task_id: string; dependency_type: string; lag_days: number };
  rows: GanttRow[];
  centers: Map<string, number>;
  barFor: (s: string | null, e: string | null) => ReturnType<typeof barGeom>;
  zoom: ZoomLevel;
  theme: ReturnType<typeof useGanttTheme>;
}) {
  const predRow = rows.find((r) => r.id === dep.depends_on_task_id);
  const succRow = rows.find((r) => r.id === dep.task_id);
  if (!predRow || !succRow) return null;
  const pb = barFor(predRow.barStart, predRow.barEnd);
  const sb = barFor(succRow.barStart, succRow.barEnd);
  if (pb.empty || sb.empty) return null;
  const predCy = centers.get(dep.depends_on_task_id)!;
  const succCy = centers.get(dep.task_id)!;
  const a = arrowGeom(dep, { x: pb.x, width: pb.width, cy: predCy }, { x: sb.x, width: sb.width, cy: succCy }, zoom);

  const violated = isDependencyViolated(
    dep,
    { start: predRow.barStart, end: predRow.barEnd },
    { start: succRow.barStart, end: succRow.barEnd }
  );
  const color = violated ? theme.arrowViolated : theme.arrow;

  return (
    <g data-testid={`dep-${dep.dependency_type}`} data-violated={violated}>
      <path d={a.path} fill="none" stroke={color} strokeWidth={1.25} markerEnd="url(#gantt-arrow)" opacity={0.85} />
      <defs>
        <marker id="gantt-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={color} />
        </marker>
      </defs>
      {a.lag && (
        <>
          <line x1={a.lag.x1} y1={a.lag.y} x2={a.lag.x2} y2={a.lag.y} stroke={color} strokeDasharray="2 2" strokeWidth={1.25} />
          <text x={(a.lag.x1 + a.lag.x2) / 2} y={a.lag.y - 3} textAnchor="middle" fontSize={9} fill={theme.textMuted}>
            {a.lag.label}
          </text>
        </>
      )}
    </g>
  );
}

// ─── Axis, grid lines, today, milestones ──────────────────────────────────────

function AxisHeaderSvg({
  origin,
  zoom,
  contentW,
  theme,
  range,
}: {
  origin: string;
  zoom: ZoomLevel;
  contentW: number;
  theme: ReturnType<typeof useGanttTheme>;
  range: { from: string; to: string };
}) {
  // Render the whole span's header (bounded to the padded range) — the browser
  // clips to the viewport; virtualizing header ticks is unnecessary at these counts.
  const h = axisHeader(origin, zoom, addDaysISO(range.from, -3), addDaysISO(range.to, 3));
  return (
    <svg width={contentW} height={HEADER_H} style={{ display: "block" }} aria-hidden>
      {h.top.map((tk, i) => (
        <g key={`t${i}`}>
          <line x1={tk.x} y1={0} x2={tk.x} y2={HEADER_H} stroke={theme.grid} />
          <text x={tk.x + 4} y={14} fontSize={10} fill={theme.textMuted} fontWeight={600}>{tk.label}</text>
        </g>
      ))}
      {h.unit.map((tk, i) => (
        <g key={`u${i}`}>
          <line x1={tk.x} y1={20} x2={tk.x} y2={HEADER_H} stroke={theme.grid} opacity={0.6} />
          <text x={tk.x + 3} y={36} fontSize={10} fill={theme.textMuted}>{tk.label}</text>
        </g>
      ))}
    </svg>
  );
}

function TimelineGridLines({
  origin,
  zoom,
  contentW,
  totalH,
  range,
  theme,
}: {
  origin: string;
  zoom: ZoomLevel;
  contentW: number;
  totalH: number;
  range: { from: string; to: string };
  theme: ReturnType<typeof useGanttTheme>;
}) {
  const h = axisHeader(origin, zoom, addDaysISO(range.from, -3), addDaysISO(range.to, 3));
  return (
    <g aria-hidden>
      {h.unit.map((tk, i) => (
        <line key={i} x1={tk.x} y1={0} x2={tk.x} y2={totalH} stroke={theme.grid} opacity={0.25} />
      ))}
      <rect x={0} y={0} width={contentW} height={0} fill="none" />
    </g>
  );
}

function TodayLine({ x, totalH, theme }: { x: number; totalH: number; theme: ReturnType<typeof useGanttTheme> }) {
  return <line x1={x} y1={0} x2={x} y2={totalH} stroke={theme.today} strokeWidth={1.5} strokeDasharray="4 3" data-testid="today-line" />;
}

function MilestoneStrip({
  gantt,
  origin,
  zoom,
  contentW,
  theme,
}: {
  gantt: ProjectGantt;
  origin: string;
  zoom: ZoomLevel;
  contentW: number;
  theme: ReturnType<typeof useGanttTheme>;
}) {
  return (
    <svg width={contentW} height={MILESTONE_H} style={{ display: "block", background: theme.headerBg }} aria-hidden>
      {gantt.milestones.map((m) => {
        const x = dateToX(m.target_date, origin, zoom);
        const cy = MILESTONE_H / 2;
        const s = 5;
        const met = m.status === "met";
        return (
          <g key={m.id}>
            <title>{`${m.title} · ${m.target_date}${met ? " · met" : ""}`}</title>
            <rect x={x - s} y={cy - s} width={s * 2} height={s * 2} transform={`rotate(45 ${x} ${cy})`} fill={met ? theme.jobFill : theme.marker} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Small bits ───────────────────────────────────────────────────────────────

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** GANTT-CAL — states the working calendar in effect so the schedule's weekend-
 *  skipping is explicable (2g / §2.8). */
function CalendarBadge({ calendar, theme }: { calendar?: { workingWeekdays: number[]; holidays: string[] }; theme: ReturnType<typeof useGanttTheme> }) {
  if (!calendar) return null;
  const wd = [...calendar.workingWeekdays].sort((a, b) => a - b);
  const allDays = wd.length === 7 && calendar.holidays.length === 0;
  // Contiguous Mon–Fri renders as a range, else a list.
  const isMonFri = wd.length === 5 && wd.join() === "1,2,3,4,5";
  const label = allDays
    ? "Calendar days"
    : isMonFri
      ? "Mon–Fri"
      : wd.map((d) => DOW_SHORT[d]).join(" ");
  const hol = calendar.holidays.length;
  return (
    <span
      className="hidden items-center gap-1 text-[11px] sm:inline-flex"
      style={{ color: theme.textMuted }}
      title={allDays ? "No working calendar set — using calendar days (weekends counted)." : `Working week: ${label}${hol ? ` · ${hol} holiday${hol === 1 ? "" : "s"}` : ""}. Schedules skip non-working days.`}
    >
      {label}{hol > 0 ? ` · ${hol}h` : ""}
    </span>
  );
}

function ToolbarBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="text-muted-foreground hover:text-brand-navy inline-flex items-center gap-1 rounded-md p-1.5 disabled:opacity-40">
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="bg-card flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-[var(--border)] p-8 text-center">
      <CalendarClock className="text-muted-foreground mb-3 h-8 w-8" />
      <p className="text-brand-navy font-serif text-lg">No scheduled work yet</p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        Add tasks with start and end dates to a job, and they’ll appear here as a schedule you can zoom, reorder and track against a baseline.
      </p>
    </div>
  );
}

function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// ─── Per-session collapse persistence ─────────────────────────────────────────

function useCollapsed(projectId: string): [ReadonlySet<string>, (id: string) => void] {
  const key = `gantt-collapsed-${projectId}`;
  const [, force] = useReducer((n) => n + 1, 0);
  const ref = useRef<Set<string> | null>(null);
  if (ref.current === null) {
    ref.current = new Set();
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem(key);
        if (raw) ref.current = new Set(JSON.parse(raw) as string[]);
      } catch {
        /* ignore */
      }
    }
  }
  const toggle = useCallback(
    (id: string) => {
      const s = ref.current!;
      if (s.has(id)) s.delete(id);
      else s.add(id);
      try {
        window.sessionStorage.setItem(key, JSON.stringify([...s]));
      } catch {
        /* ignore */
      }
      force();
    },
    [key]
  );
  return [ref.current, toggle];
}
