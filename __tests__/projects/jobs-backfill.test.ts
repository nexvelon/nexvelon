// PROJ2-4a — unit tests for the Job API helpers. Chainable supabase mock; no DB.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const state = vi.hoisted(() => ({
  selectData: [] as unknown, // project_jobs select result
  lastInsert: null as unknown, // captured insert payload
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "project_jobs") {
    if (ctx.op === "insert") {
      state.lastInsert = ctx.payload;
      const p = ctx.payload as Record<string, unknown>;
      return { data: { id: "job-new", ...p }, error: null };
    }
    return { data: state.selectData, error: null }; // select
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  createMainJob,
  createChangeOrderJob,
  getNextCoNumber,
  listJobsForProject,
} from "@/lib/api/projects";

beforeEach(() => {
  state.selectData = [];
  state.lastInsert = null;
});

describe("createMainJob", () => {
  it("inserts a main_job row with co_number null", async () => {
    const job = await createMainJob({
      projectId: "p1",
      title: "My project",
      sourceQuoteId: "q1",
      contractValue: 1000,
      actorId: "u1",
    });
    const p = state.lastInsert as Record<string, unknown>;
    expect(p.job_type).toBe("main_job");
    expect(p.co_number).toBeNull();
    expect(p.contract_value).toBe(1000);
    expect(job.job_type).toBe("main_job");
  });
});

describe("getNextCoNumber", () => {
  it("returns 1 when there are no change orders", async () => {
    state.selectData = [];
    expect(await getNextCoNumber("p1")).toBe(1);
  });
  it("returns max+1 when change orders exist", async () => {
    state.selectData = [{ co_number: 4 }];
    expect(await getNextCoNumber("p1")).toBe(5);
  });
});

describe("createChangeOrderJob", () => {
  it("assigns co_number = getNextCoNumber() and sort_order = co_number", async () => {
    state.selectData = [{ co_number: 2 }]; // → next is 3
    await createChangeOrderJob({
      projectId: "p1",
      title: "CO",
      sourceQuoteId: "q2",
      contractValue: 500,
      actorId: "u1",
    });
    const p = state.lastInsert as Record<string, unknown>;
    expect(p.job_type).toBe("change_order");
    expect(p.co_number).toBe(3);
    expect(p.sort_order).toBe(3);
  });

  it("uses co_number 1 for the first change order", async () => {
    state.selectData = [];
    await createChangeOrderJob({
      projectId: "p1",
      title: "CO1",
      sourceQuoteId: "q2",
      contractValue: 0,
      actorId: null,
    });
    expect((state.lastInsert as Record<string, unknown>).co_number).toBe(1);
  });
});

describe("listJobsForProject", () => {
  it("orders Main Job first, then Change Orders by co_number", async () => {
    state.selectData = [
      { id: "co2", job_type: "change_order", co_number: 2, sort_order: 2 },
      { id: "main", job_type: "main_job", co_number: null, sort_order: 0 },
      { id: "co1", job_type: "change_order", co_number: 1, sort_order: 1 },
    ];
    const jobs = await listJobsForProject("p1");
    expect(jobs.map((j) => j.id)).toEqual(["main", "co1", "co2"]);
  });
});
