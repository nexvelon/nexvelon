// UIDG-13 — the critical path surfaced in the Gantt: critical tasks marked (not by
// colour alone — a ◆ tag + data attr), the styling resolving from theme tokens in
// both light and dark, the projected-finish + variance banner, the critical-path
// toggle, and the honest sparse-network note. The MATHS is covered exhaustively by
// critical-path.test.ts; this pins the wiring.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProjectGantt } from "@/lib/api/gantt";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

const h = vi.hoisted(() => ({
  gantt: null as ProjectGantt | null,
  statusRed: "#B23A48", // swapped to simulate dark mode
}));

vi.mock("@/app/(app)/projects/schedule-actions", () => ({
  getProjectGanttAction: async () => ({ ok: true as const, data: h.gantt }),
  getBaselineTasksAction: async () => ({ ok: true as const, data: [] }),
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

function chain(withDeps: boolean, target: string | null = null): ProjectGantt {
  // A immediately followed by B (no gap) so both are on the critical chain.
  const A = mkTask("A", "2026-03-02", "2026-03-06");
  const B = mkTask("B", "2026-03-07", "2026-03-11");
  return {
    project_id: "p1", today: "2026-03-01",
    jobs: [{ job_id: "j1", label: "Job", job_type: "main_job", status: "active", planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null, tasks: [A, B] }],
    project_tasks: [],
    task_dependencies: withDeps ? [{ id: "d", task_id: "B", depends_on_task_id: "A", dependency_type: "FS", lag_days: 0 }] : [],
    job_dependencies: [], milestones: [], baselines: [],
    range: { from: "2026-03-01", to: "2026-03-31" }, target_end: target,
  };
}
function mkTask(id: string, s: string, e: string) {
  return { id, title: id, job_id: "j1", parent_id: null, status: "todo", priority: "normal",
    start_date: s, end_date: e, due_date: null, bar_start: s, bar_end: e, is_point: false,
    has_no_dates: false, percent_complete: 0, effective_percent: 0, children: [] };
}

beforeEach(() => {
  h.gantt = chain(true, "2026-03-08");
  h.statusRed = "#B23A48";
});

describe("critical path in the Gantt", () => {
  it("marks critical tasks with a ◆ tag (not colour alone) and a data attr", async () => {
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("A");
    // both A and B are on the single critical chain → two ◆ tags in the grid
    expect(screen.getAllByText("◆").length).toBeGreaterThanOrEqual(2);
    // and the grid rows carry the non-colour signal
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
  });

  it("critical bar outline resolves from the theme status token (and swaps with the mode)", async () => {
    const { container, unmount } = render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("A");
    const strokeUsed = (root: ParentNode) => {
      const g = root.querySelector("svg [data-critical]")!; // the timeline bar group
      const rect = [...g.querySelectorAll("rect")].find((r) => r.getAttribute("stroke") && r.getAttribute("stroke") !== "none");
      return rect?.getAttribute("stroke");
    };
    expect(strokeUsed(container)).toBe("#B23A48"); // light-mode token
    unmount();

    // simulate the dark-mode palette resolving a different status red
    h.statusRed = "#F2545B";
    const { container: c2 } = render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("A");
    expect(strokeUsed(c2)).toBe("#F2545B");
  });

  it("shows the projected finish and the variance against target", async () => {
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("A");
    // B ends 2026-03-11; target 2026-03-08 → 3 days late
    const banner = screen.getByText(/Projected finish/i).closest("div")!;
    expect(banner.textContent).toContain("2026-03-11");
    expect(screen.getByText(/3d late/i)).toBeInTheDocument();
  });

  it("a sparse network (no dependencies) does NOT mark everything critical and says so (§2.8)", async () => {
    h.gantt = chain(false, null);
    render(<InteractiveGantt projectId="p1" canEdit />);
    await screen.findByText("A");
    expect(screen.queryByText("◆")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Critical").length).toBe(0);
    expect(screen.getByText(/add dependencies for a critical path/i)).toBeInTheDocument();
    // the toggle is disabled when there is no computable path
    expect(screen.getByRole("button", { name: /Critical path/i })).toBeDisabled();
  });
});
