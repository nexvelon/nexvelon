// UIDG-12 — the interactive Gantt component: renders real data, gates drag on
// edit permission (view-only cannot drag), shows the honest empty state, renders
// the baseline overlay only from real baseline data, draws typed dependency arrows
// (flagging a violated one), and derives every colour from the theme (no hardcoded
// colour). Geometry correctness is covered by gantt-geometry.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProjectGantt } from "@/lib/api/gantt";

// jsdom lacks ResizeObserver (the Gantt observes its scroll container).
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const h = vi.hoisted(() => ({
  gantt: null as ProjectGantt | null,
  baselineTasks: [] as unknown[],
  update: vi.fn(async () => ({ ok: true as const, data: { id: "t1" } })),
}));

vi.mock("@/app/(app)/projects/schedule-actions", () => ({
  getProjectGanttAction: async () => ({ ok: true as const, data: h.gantt }),
  getBaselineTasksAction: async () => ({ ok: true as const, data: h.baselineTasks }),
  getProjectResourceLoadAction: async () => ({ ok: false as const, error: "no scheduling access in test" }),
}));
vi.mock("@/app/(app)/projects/task-actions", () => ({ updateTaskAction: h.update }));

// Fixed themed tokens (real hex) so useGanttTheme derives without a theme provider.
vi.mock("@/components/charts/useChartTheme", () => ({
  useChartTheme: () => ({
    palette: ["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"],
    primary: "#0A1226",
    accent: "#B8924B",
    statusGreen: "#4F7A3A",
    statusRed: "#B23A48",
    axisTick: "#5C6A8A",
    gridStroke: "#E0D9C8",
    tooltipBg: "#FAF7F0",
    tooltipBorder: "#E0D9C8",
    tooltipFg: "#1A1F2E",
    tooltipMuted: "#8A8578",
    cursorFill: "#0A122610",
    legendFg: "#5C6A8A",
    trackFill: "#5C6A8A26",
  }),
}));

import { InteractiveGantt } from "@/components/modules/projects/gantt/InteractiveGantt";

function makeGantt(over: Partial<ProjectGantt> = {}): ProjectGantt {
  const t1 = {
    id: "t1", title: "Framing", job_id: "j1", parent_id: null, status: "in_progress",
    priority: "normal", start_date: "2026-03-02", end_date: "2026-03-10", due_date: null,
    bar_start: "2026-03-02", bar_end: "2026-03-10", is_point: false, has_no_dates: false,
    percent_complete: 40, effective_percent: 40, children: [],
  };
  const t2 = {
    id: "t2", title: "Inspection", job_id: "j1", parent_id: null, status: "todo",
    priority: "normal", start_date: null, end_date: null, due_date: "2026-03-14",
    bar_start: null, bar_end: "2026-03-14", is_point: true, has_no_dates: false,
    percent_complete: 0, effective_percent: 0, children: [],
  };
  return {
    project_id: "p1",
    today: "2026-03-08",
    jobs: [{
      job_id: "j1", label: "Main Job", job_type: "main_job", status: "active",
      planned_start_date: "2026-03-01", planned_end_date: "2026-03-20",
      actual_start_date: null, actual_end_date: null, tasks: [t1, t2],
    }],
    project_tasks: [],
    task_dependencies: [
      { id: "d1", task_id: "t2", depends_on_task_id: "t1", dependency_type: "FS", lag_days: 0 },
    ],
    job_dependencies: [],
    milestones: [{ id: "m1", project_id: "p1", job_id: "j1", title: "Handover", target_date: "2026-03-18", completed_at: null, status: "pending", sort_order: 0, notes: null, created_by: null, updated_by: null, created_at: "", updated_at: "" }],
    baselines: [],
    range: { from: "2026-03-01", to: "2026-03-20" },
    ...over,
  };
}

beforeEach(() => {
  h.gantt = makeGantt();
  h.baselineTasks = [];
  h.update.mockClear();
});

describe("InteractiveGantt", () => {
  it("renders the job and task rows from real data", async () => {
    render(<InteractiveGantt projectId="p1" canEdit />);
    expect(await screen.findByText("Framing")).toBeInTheDocument();
    expect(screen.getByText("Main Job")).toBeInTheDocument();
    // a task shows its effective percent in the grid
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("shows an honest empty state when there is no scheduled work (§2.8)", async () => {
    h.gantt = makeGantt({ jobs: [], project_tasks: [], task_dependencies: [], range: { from: "2026-03-01", to: "2026-03-20" } });
    render(<InteractiveGantt projectId="p1" canEdit />);
    expect(await screen.findByText(/No scheduled work yet/i)).toBeInTheDocument();
  });

  it("view-only users cannot drag — no drag zones are rendered", async () => {
    render(<InteractiveGantt projectId="p1" canEdit={false} />);
    await screen.findByText("Framing");
    expect(screen.queryAllByTestId("drag-move")).toHaveLength(0);
  });

  it("editors get drag zones on scheduled task bars", async () => {
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Framing");
    expect(screen.getAllByTestId("drag-move").length).toBeGreaterThan(0);
  });

  it("draws a typed dependency arrow and a today line", async () => {
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Framing");
    expect(screen.getByTestId("dep-FS")).toBeInTheDocument();
    expect(screen.getByTestId("today-line")).toBeInTheDocument();
  });

  it("flags a violated dependency (successor before predecessor end)", async () => {
    // t2 now a bar starting before t1 ends → FS violated
    h.gantt = makeGantt();
    h.gantt.jobs[0].tasks[1] = {
      ...h.gantt.jobs[0].tasks[1],
      start_date: "2026-03-05", end_date: "2026-03-07", due_date: null,
      bar_start: "2026-03-05", bar_end: "2026-03-07", is_point: false,
    };
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Framing");
    expect(screen.getByTestId("dep-FS").getAttribute("data-violated")).toBe("true");
  });

  it("renders the baseline overlay only when a baseline exists and is toggled on", async () => {
    h.gantt = makeGantt({ baselines: [{ id: "b1", project_id: "p1", name: "Kickoff", notes: null, captured_by: null, captured_at: "" }] });
    h.baselineTasks = [{ id: "bt1", baseline_id: "b1", task_id: "t1", start_date: "2026-03-01", end_date: "2026-03-08", percent_complete: 0, created_at: "" }];
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("Framing");
    // not shown until toggled
    expect(screen.queryByTestId("baseline-bar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Baseline/i }));
    await waitFor(() => expect(screen.getByTestId("baseline-bar")).toBeInTheDocument());
  });
});

// useGanttTheme derives every colour from the theme (no hardcoded colour).
import { useGanttTheme } from "@/components/modules/projects/gantt/useGanttTheme";
import { renderHook } from "@testing-library/react";

describe("useGanttTheme", () => {
  it("derives Gantt colours from the active theme tokens", () => {
    const { result } = renderHook(() => useGanttTheme());
    expect(result.current.taskFill).toBe("#0A1226"); // primary
    expect(result.current.jobFill).toBe("#B8924B"); // accent
    expect(result.current.danger).toBe("#B23A48"); // statusRed
    // derived alpha tokens are real hex, not colour names
    expect(result.current.taskTrack).toMatch(/^#[0-9a-fA-F]{8}$/);
  });
});
