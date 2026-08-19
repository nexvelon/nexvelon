// UIDG-14 — the resource pane wiring: it appears only when scheduling:view is
// granted (the action's denial hides it), renders per-person rows with the honest
// aggregate labels ("no capacity set" / "capacity not tracked"), flags over-
// allocation with a non-colour signal (icon + count) whose colour comes from the
// theme, and shows the honest empty state. The MATHS is covered by
// resource-load.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProjectGantt } from "@/lib/api/gantt";
import type { ResourceLoad } from "@/lib/gantt/resource-load";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const h = vi.hoisted(() => ({
  gantt: null as ProjectGantt | null,
  resource: null as { ok: true; data: ResourceLoad } | { ok: false; error: string } | null,
  statusRed: "#B23A48",
}));

vi.mock("@/app/(app)/projects/schedule-actions", () => ({
  getProjectGanttAction: async () => ({ ok: true as const, data: h.gantt }),
  getBaselineTasksAction: async () => ({ ok: true as const, data: [] }),
  getProjectResourceLoadAction: async () => h.resource,
}));
vi.mock("@/app/(app)/projects/task-actions", () => ({ updateTaskAction: vi.fn(async () => ({ ok: true, data: { id: "t" } })) }));
vi.mock("@/components/charts/useChartTheme", () => ({
  useChartTheme: () => ({
    palette: ["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"],
    primary: "#0A1226", accent: "#B8924B", statusGreen: "#4F7A3A", statusRed: h.statusRed,
    axisTick: "#5C6A8A", gridStroke: "#E0D9C8", tooltipBg: "#FAF7F0", tooltipBorder: "#E0D9C8",
    tooltipFg: "#1A1F2E", tooltipMuted: "#8A8578", cursorFill: "#0A122610", legendFg: "#5C6A8A", trackFill: "#5C6A8A26",
  }),
}));

import { InteractiveGantt } from "@/components/modules/projects/gantt/InteractiveGantt";

function baseGantt(): ProjectGantt {
  const A = { id: "a", title: "Task A", job_id: "j1", parent_id: null, status: "todo", priority: "normal",
    start_date: "2026-03-02", end_date: "2026-03-06", due_date: null, bar_start: "2026-03-02", bar_end: "2026-03-06",
    is_point: false, has_no_dates: false, percent_complete: 0, effective_percent: 0, children: [] };
  return {
    project_id: "p1", today: "2026-03-03",
    jobs: [{ job_id: "j1", label: "Job", job_type: "main_job", status: "active", planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null, tasks: [A] }],
    project_tasks: [], task_dependencies: [], job_dependencies: [], milestones: [], baselines: [],
    range: { from: "2026-03-02", to: "2026-03-10" }, target_end: null,
  };
}

function makeLoad(over: Partial<ResourceLoad> = {}): ResourceLoad {
  return {
    from: "2026-03-02", to: "2026-03-10",
    hasAnyAssignment: true,
    rows: [
      { person: { id: "t1", name: "Alex Tech", kind: "tech" }, days: [
          { date: "2026-03-02", capacityHours: 8, bookedHours: 12, plannedTasks: ["Task A"], utilisationPct: 150, overAllocated: true },
        ], totalBookedHours: 12, totalCapacityHours: 8, capacityKnown: true, overallUtilPct: 150, overAllocatedDays: 1, maxConcurrentPlanned: 1, hasWork: true },
      { person: { id: "s1", name: "Sparks Ltd", kind: "subcontractor" }, days: [
          { date: "2026-03-02", capacityHours: null, bookedHours: 0, plannedTasks: ["Task A"], utilisationPct: null, overAllocated: false },
        ], totalBookedHours: 0, totalCapacityHours: 0, capacityKnown: false, overallUtilPct: null, overAllocatedDays: 0, maxConcurrentPlanned: 1, hasWork: true },
    ],
    ...over,
  };
}

beforeEach(() => {
  h.gantt = baseGantt();
  h.resource = { ok: true, data: makeLoad() };
  h.statusRed = "#B23A48";
});

describe("resource pane", () => {
  it("is offered (collapsed) with a headline summary, and expands to the rows", async () => {
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Task A");
    const toggle = await screen.findByRole("button", { name: /Resources/i });
    // collapsed by default → rows not shown yet
    expect(screen.queryByText("Alex Tech")).not.toBeInTheDocument();
    // the headline advertises the over-allocation even when collapsed
    expect(toggle.textContent).toMatch(/over-allocated/i);
    fireEvent.click(toggle);
    expect(await screen.findByText("Alex Tech")).toBeInTheDocument();
    expect(screen.getByText("Sparks Ltd")).toBeInTheDocument();
  });

  it("shows honest aggregate labels: a % for a tech with capacity, 'capacity not tracked' for a sub", async () => {
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Task A");
    fireEvent.click(await screen.findByRole("button", { name: /Resources/i }));
    await screen.findByText("Alex Tech");
    expect(screen.getByText("150%")).toBeInTheDocument();
    expect(screen.getAllByText(/capacity not tracked/i).length).toBeGreaterThan(0);
  });

  it("flags over-allocation with a non-colour signal (icon + day count) coloured from the theme token", async () => {
    const { container } = render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Task A");
    fireEvent.click(await screen.findByRole("button", { name: /Resources/i }));
    await screen.findByText("Alex Tech");
    // the over-allocated hatch pattern uses the theme danger token
    const hatchRect = container.querySelector("pattern rect");
    expect(hatchRect?.getAttribute("fill")).toBe("#B23A48");
    // the row carries a count (non-colour signal), findable as text
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("does NOT render when the caller lacks scheduling:view (action denied)", async () => {
    h.resource = { ok: false, error: "You don't have permission to view scheduling." };
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Task A");
    await waitFor(() => expect(screen.queryByRole("button", { name: /Resources/i })).not.toBeInTheDocument());
  });

  it("shows an honest empty state when nothing is assigned (§2.8)", async () => {
    h.resource = { ok: true, data: makeLoad({ hasAnyAssignment: false, rows: [] }) };
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Task A");
    const toggle = await screen.findByRole("button", { name: /Resources/i });
    expect(toggle.textContent).toMatch(/nothing assigned/i);
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getAllByText(/Nothing assigned in this window/i).length).toBeGreaterThan(0));
  });
});
