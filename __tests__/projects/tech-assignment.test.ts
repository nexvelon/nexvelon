// PROJ2-15 — in-house tech assignment. SUB-6's job_assignments already handles
// techId; this asserts the tech path end to end plus the two new guards
// (dup-active-tech, single-active-lead — surfaced from the partial unique
// indexes as typed errors), that NO compliance block applies to a tech, and the
// deduped project-team view.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  job: { id: "job1", project_id: "p1" } as Record<string, unknown> | null,
  insertError: null as string | null,
  // spies for the SUB-only paths — must NOT be hit for a tech.
  getSubcontractorById: vi.fn(async () => ({ id: "sub1", status: "active" })),
  listComplianceDocs: vi.fn(async () => []),
  logActivity: vi.fn(async () => {}),
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
    if (f.method === "neq") out = out.filter((r) => r[col] !== args[1]);
    if (f.method === "in") out = out.filter((r) => (args[1] as unknown[]).includes(r[col]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "job_assignments") {
    if (ctx.op === "insert") {
      if (h.insertError) return { data: null, error: { message: h.insertError } };
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `a-${h.inserts.length + 1}`, ...p };
      h.inserts.push(p);
      h.rows = [...h.rows, row];
      return { data: row, error: null };
    }
    const rows = filt(h.rows, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  if (ctx.table === "techs") return { data: [{ id: "t1", name: "Al", default_cost_rate: 55 }], error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => h.job }));
vi.mock("@/lib/api/subcontractors", () => ({ getSubcontractorById: h.getSubcontractorById }));
vi.mock("@/lib/api/subcontractor-compliance", () => ({ listComplianceDocs: h.listComplianceDocs }));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => "2026-07-23",
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));

import {
  createAssignment,
  listAssignmentsForTech,
  listAssignableTechs,
  getProjectTeam,
  AssignmentError,
} from "@/lib/api/job-assignments";

beforeEach(() => {
  h.rows = [];
  h.inserts = [];
  h.job = { id: "job1", project_id: "p1" };
  h.insertError = null;
  h.getSubcontractorById.mockClear();
  h.listComplianceDocs.mockClear();
  h.logActivity.mockClear();
});

describe("createAssignment — tech path", () => {
  it("assigns a tech with NO compliance check (the block is sub-only)", async () => {
    const res = await createAssignment({ projectId: "p1", jobId: "job1", techId: "t1", role: "crew" });
    expect(res.ok).toBe(true);
    expect(h.inserts[0]).toMatchObject({ tech_id: "t1", subcontractor_id: null, status: "active" });
    // the compliance path was never touched
    expect(h.getSubcontractorById).not.toHaveBeenCalled();
    expect(h.listComplianceDocs).not.toHaveBeenCalled();
  });

  it("still rejects both / neither assignee", async () => {
    await expect(
      createAssignment({ projectId: "p1", jobId: "job1", techId: "t1", subcontractorId: "sub1" })
    ).rejects.toMatchObject({ code: "invalid_assignee" });
    await expect(
      createAssignment({ projectId: "p1", jobId: "job1" })
    ).rejects.toBeInstanceOf(AssignmentError);
  });

  it("surfaces a duplicate active tech (unique index) as already_assigned", async () => {
    h.insertError = "duplicate key value violates unique constraint job_assignments_unique_active_tech";
    await expect(
      createAssignment({ projectId: "p1", jobId: "job1", techId: "t1" })
    ).rejects.toMatchObject({ code: "already_assigned" });
  });

  it("surfaces a second active lead (unique index) as lead_taken", async () => {
    h.insertError = "duplicate key value violates unique constraint job_assignments_single_active_lead";
    await expect(
      createAssignment({ projectId: "p1", jobId: "job1", techId: "t1", role: "lead" })
    ).rejects.toMatchObject({ code: "lead_taken" });
  });

  it("job_mismatch when the job isn't in the project", async () => {
    h.job = { id: "job1", project_id: "OTHER" };
    await expect(
      createAssignment({ projectId: "p1", jobId: "job1", techId: "t1" })
    ).rejects.toMatchObject({ code: "job_mismatch" });
  });
});

describe("listAssignableTechs", () => {
  it("returns active techs with their rate", async () => {
    const techs = await listAssignableTechs();
    expect(techs).toEqual([{ id: "t1", name: "Al", default_cost_rate: 55 }]);
  });
});

describe("listAssignmentsForTech", () => {
  it("returns only that tech's rows", async () => {
    h.rows = [
      { id: "a1", tech_id: "t1", subcontractor_id: null, project_id: "p1", job_id: "job1", role: "crew", status: "active" },
      { id: "a2", tech_id: "t2", subcontractor_id: null, project_id: "p1", job_id: "job1", role: "crew", status: "active" },
    ];
    const rows = await listAssignmentsForTech("t1");
    expect(rows.map((r) => r.id)).toEqual(["a1"]);
  });
});

describe("getProjectTeam — dedupe across jobs", () => {
  it("collapses a person on multiple jobs into one row with a job list, lead first", async () => {
    h.rows = [
      // tech t1 on two jobs (crew + lead)
      { id: "a1", tech_id: "t1", subcontractor_id: null, project_id: "p1", job_id: "job1", role: "lead", status: "active", tech: { name: "Al" }, job: { job_type: "main_job", co_number: null, title: "Main" } },
      { id: "a2", tech_id: "t1", subcontractor_id: null, project_id: "p1", job_id: "job2", role: "crew", status: "active", tech: { name: "Al" }, job: { job_type: "change_order", co_number: 1, title: "CO1" } },
      // sub on one job (crew)
      { id: "a3", tech_id: null, subcontractor_id: "s1", project_id: "p1", job_id: "job1", role: "crew", status: "active", subcontractor: { name: "Ace", status: "active" }, job: { job_type: "main_job", co_number: null, title: "Main" } },
      // a REMOVED row must be ignored
      { id: "a4", tech_id: "t2", subcontractor_id: null, project_id: "p1", job_id: "job1", role: "crew", status: "removed", tech: { name: "Bob" }, job: { job_type: "main_job", co_number: null, title: "Main" } },
    ];
    const team = await getProjectTeam("p1");
    expect(team).toHaveLength(2); // Al (deduped) + Ace; Bob excluded (removed)
    // lead first
    expect(team[0]).toMatchObject({ kind: "tech", party_id: "t1", is_lead: true, active_count: 2 });
    expect(team[0].jobs).toHaveLength(2);
    expect(team[0].roles.sort()).toEqual(["crew", "lead"]);
    expect(team[1]).toMatchObject({ kind: "subcontractor", party_id: "s1", is_lead: false });
  });
});
