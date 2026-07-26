// DASH-2 — the four cross-portfolio aggregates: overdue tasks (only past-due +
// open, days_overdue correct), deficiency rollup (open + safety), upcoming
// milestones (within window, pending, ordered), and the global activity feed
// (most-recent-first, limit respected, actor resolved).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  tasks: [] as Record<string, unknown>[],
  deficiencies: [] as Record<string, unknown>[],
  milestones: [] as Record<string, unknown>[],
  activity: [] as Record<string, unknown>[],
  projects: [] as Record<string, unknown>[],
  profiles: [] as Record<string, unknown>[],
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "in") out = out.filter((r) => (a[1] as unknown[]).includes(r[col]));
    else if (f.method === "lt") out = out.filter((r) => (r[col] as string) < (a[1] as string));
    else if (f.method === "gte") out = out.filter((r) => (r[col] as string) >= (a[1] as string));
    else if (f.method === "lte") out = out.filter((r) => (r[col] as string) <= (a[1] as string));
    else if (f.method === "not" && a[1] === "is" && a[2] === null) out = out.filter((r) => r[col] != null);
    else if (f.method === "order") {
      const asc = (a[1] as { ascending?: boolean } | undefined)?.ascending !== false;
      out = [...out].sort((x, y) => {
        const xv = String(x[col] ?? ""), yv = String(y[col] ?? "");
        return asc ? xv.localeCompare(yv) : yv.localeCompare(xv);
      });
    }
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const map: Record<string, Record<string, unknown>[]> = {
    job_tasks: h.tasks,
    job_deficiencies: h.deficiencies,
    schedule_milestones: h.milestones,
    activity_log: h.activity,
    projects: h.projects,
    profiles: h.profiles,
  };
  const rows = map[ctx.table];
  if (!rows) return { data: [], error: null };
  return { data: applyFilters(rows, ctx.filters), error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => "2026-07-25",
  businessDatePlusDaysISO: () => "2026-08-08",
}));

import {
  getPortfolioOverdueTasks,
  getPortfolioDeficiencies,
  getUpcomingMilestones,
  getRecentActivity,
} from "@/lib/api/dashboard";

beforeEach(() => {
  h.projects = [
    { id: "p1", project_number: "P-1", title: "Tower" },
    { id: "p2", project_number: "P-2", title: null },
  ];
  h.profiles = [{ id: "u1", display_name: "Ada", first_name: null, last_name: null, email: "a@x.co" }];
});

describe("getPortfolioOverdueTasks", () => {
  it("returns only open + past-due tasks, with days_overdue", async () => {
    h.tasks = [
      { id: "t1", title: "Wire panel", project_id: "p1", due_date: "2026-07-20", status: "todo" }, // overdue 5d
      { id: "t2", title: "Order parts", project_id: "p2", due_date: "2026-07-24", status: "in_progress" }, // overdue 1d
      { id: "t3", title: "Done thing", project_id: "p1", due_date: "2026-07-10", status: "done" }, // done → excluded by query
      { id: "t4", title: "Future", project_id: "p1", due_date: "2026-08-01", status: "todo" }, // not due → excluded by query
    ];
    const r = await getPortfolioOverdueTasks();
    expect(r.count).toBe(2); // t1, t2 (t3 done, t4 future excluded by the .in/.lt filters)
    const t1 = r.items.find((i) => i.task_id === "t1")!;
    expect(t1).toMatchObject({ project: "P-1 — Tower", days_overdue: 5 });
    const t2 = r.items.find((i) => i.task_id === "t2")!;
    expect(t2.project).toBe("P-2"); // null title → number only
    expect(t2.days_overdue).toBe(1);
  });
});

describe("getPortfolioDeficiencies", () => {
  it("aggregates open + safety across projects", async () => {
    h.deficiencies = [
      { project_id: "p1", status: "open", severity: "minor", due_date: null },
      { project_id: "p1", status: "in_progress", severity: "safety", due_date: null }, // open + safety
      { project_id: "p2", status: "open", severity: "major", due_date: null },
      { project_id: "p2", status: "closed", severity: "safety", due_date: null }, // resolved → not open
    ];
    const r = await getPortfolioDeficiencies();
    expect(r.open).toBe(3); // the 3 open/in_progress
    expect(r.safety_open).toBe(1); // the in_progress safety one
    expect(r.projects_affected).toBe(2); // p1 + p2 both have open
  });
});

describe("getUpcomingMilestones", () => {
  it("returns pending milestones within the window, ordered by date", async () => {
    h.milestones = [
      { id: "m1", title: "Rough-in", project_id: "p1", target_date: "2026-08-01", status: "pending" },
      { id: "m2", title: "Commission", project_id: "p2", target_date: "2026-07-28", status: "pending" },
      { id: "m3", title: "Past", project_id: "p1", target_date: "2026-07-01", status: "pending" }, // before today → excluded
      { id: "m4", title: "Met", project_id: "p1", target_date: "2026-07-30", status: "met" }, // not pending → excluded
    ];
    const r = await getUpcomingMilestones({ days: 14 });
    expect(r.items.map((i) => i.milestone_id)).toEqual(["m2", "m1"]); // ordered by target_date asc
    expect(r.items[0]).toMatchObject({ project: "P-2", days_until: 3 });
  });
});

describe("getRecentActivity", () => {
  it("returns most-recent-first, respects limit, resolves actor", async () => {
    h.activity = [
      { id: "a1", entity_type: "project", action: "update", actor_id: "u1", created_at: "2026-07-25T10:00:00Z" },
      { id: "a2", entity_type: "client", action: "create", actor_id: null, created_at: "2026-07-24T10:00:00Z" },
    ];
    const r = await getRecentActivity({ limit: 15 });
    expect(r.items.map((i) => i.id)).toEqual(["a1", "a2"]);
    expect(r.items[0].actor_name).toBe("Ada");
    expect(r.items[1].actor_name).toBeNull(); // system / no actor
  });
});
