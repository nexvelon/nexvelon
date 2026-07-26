// SCHED-1 — schedule_jobs: SVC reference minted; createFromProjectJob copies the
// planned window + project/site; a standalone service call stores location_text.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[], // schedule_jobs inserted
  projectJobs: [] as Record<string, unknown>[],
  projects: [] as Record<string, unknown>[],
  seq: 0,
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "rpc:next_schedule_job_reference") return { data: "SVC-2026-0001", error: null };
  if (ctx.table === "schedule_jobs") {
    if (ctx.op === "insert") {
      const row = { id: `sj${++h.seq}`, ...(ctx.payload as object) };
      h.jobs.push(row);
      return { data: single ? row : [row], error: null };
    }
    return { data: single ? null : [], error: null };
  }
  if (ctx.table === "project_jobs") {
    const rows = applyFilters(h.projectJobs, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  if (ctx.table === "projects") {
    const rows = applyFilters(h.projects, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: single ? null : [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));

import {
  createScheduleJob,
  createScheduleJobFromProjectJob,
} from "@/lib/api/schedule-jobs";

beforeEach(() => {
  h.seq = 0;
  h.jobs = [];
  h.projectJobs = [
    { id: "pj1", project_id: "p1", title: "Rough-in", planned_start_date: "2026-09-01", planned_end_date: "2026-09-05" },
  ];
  h.projects = [{ id: "p1", client_id: "c1", site_id: "s1" }];
});

describe("createScheduleJob", () => {
  it("mints an SVC reference and stores a standalone location", async () => {
    const job = await createScheduleJob({
      title: "Replace reader",
      jobType: "service",
      requiredCerts: ["kantech"],
      locationText: "200 King St W",
      actorId: "u1",
    });
    expect(job.reference).toBe("SVC-2026-0001");
    expect(job.location_text).toBe("200 King St W");
    expect(job.required_certs).toEqual(["kantech"]);
    expect(job.project_id).toBeNull();
  });
});

describe("createScheduleJobFromProjectJob", () => {
  it("copies title, project/client/site and the planned window", async () => {
    const job = await createScheduleJobFromProjectJob({ projectJobId: "pj1", actorId: "u1" });
    expect(job.title).toBe("Rough-in");
    expect(job.project_id).toBe("p1");
    expect(job.project_job_id).toBe("pj1");
    expect(job.client_id).toBe("c1");
    expect(job.site_id).toBe("s1");
    expect(job.window_start).toBe("2026-09-01"); // planned dates become the window
    expect(job.window_end).toBe("2026-09-05");
  });
});
