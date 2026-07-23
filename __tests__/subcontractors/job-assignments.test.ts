// SUB-6 — the assignment API. The point of the chunk: createAssignment enforces
// the compliance hard-block SERVER-SIDE (called directly, no UI), one-assignee
// and job-in-project guards, duplicate protection, and — critically — a doc
// lapse AFTER assignment does NOT remove the row (it flags, never auto-removes).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  job: { id: "job1", project_id: "p1" } as Record<string, unknown> | null,
  sub: { id: "sub1", status: "active" } as Record<string, unknown> | null,
  docs: [
    { doc_type: "wsib_clearance", expiry_date: "2099-01-01" },
    { doc_type: "liability_insurance", expiry_date: "2099-01-01" },
  ] as { doc_type: string; expiry_date: string | null }[],
  insertError: null as string | null,
  logActivity: vi.fn(async () => {}),
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    if (f.method === "eq") out = out.filter((r) => r[col] === val);
    if (f.method === "in") out = out.filter((r) => (val as unknown[]).includes(r[col]));
    if (f.method === "neq") out = out.filter((r) => r[col] !== val);
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
    if (ctx.op === "update") {
      h.updates.push(ctx.payload as Record<string, unknown>);
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      h.rows = h.rows.map((r) => (r.id === id ? { ...r, ...(ctx.payload as object) } : r));
      return { data: h.rows.find((r) => r.id === id) ?? null, error: null };
    }
    if (ctx.op === "delete") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1] as string;
      const existed = h.rows.some((r) => r.id === id);
      h.rows = h.rows.filter((r) => r.id !== id);
      return { data: existed ? [{ id }] : [], error: null };
    }
    const rows = filt(h.rows, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => h.job }));
vi.mock("@/lib/api/subcontractors", () => ({ getSubcontractorById: async () => h.sub }));
vi.mock("@/lib/api/subcontractor-compliance", () => ({
  listComplianceDocs: async () => h.docs,
}));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));

import {
  createAssignment,
  updateAssignment,
  setAssignmentStatus,
  listAssignmentsForSubcontractor,
  AssignmentError,
} from "@/lib/api/job-assignments";

beforeEach(() => {
  h.rows = [];
  h.inserts = [];
  h.updates = [];
  h.job = { id: "job1", project_id: "p1" };
  h.sub = { id: "sub1", status: "active" };
  h.docs = [
    { doc_type: "wsib_clearance", expiry_date: "2099-01-01" },
    { doc_type: "liability_insurance", expiry_date: "2099-01-01" },
  ];
  h.insertError = null;
  h.logActivity.mockClear();
});

describe("createAssignment — the compliance hard block (server-side)", () => {
  it("blocks assignment when a required doc is missing, and writes NO row", async () => {
    h.docs = [{ doc_type: "liability_insurance", expiry_date: "2099-01-01" }]; // no WSIB
    const res = await createAssignment({ projectId: "p1", jobId: "job1", subcontractorId: "sub1" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("compliance_block");
      expect(res.reasons.join(" ")).toMatch(/WSIB/i);
    }
    expect(h.inserts).toHaveLength(0);
  });

  it("blocks when the sub is inactive", async () => {
    h.sub = { id: "sub1", status: "do_not_use" };
    const res = await createAssignment({ projectId: "p1", jobId: "job1", subcontractorId: "sub1" });
    expect(res.ok).toBe(false);
    expect(h.inserts).toHaveLength(0);
  });

  it("an eligible sub assigns successfully", async () => {
    const res = await createAssignment({
      projectId: "p1", jobId: "job1", subcontractorId: "sub1", role: "lead",
    });
    expect(res.ok).toBe(true);
    expect(h.inserts[0]).toMatchObject({
      project_id: "p1", job_id: "job1", subcontractor_id: "sub1", role: "lead", status: "active",
    });
  });
});

describe("createAssignment — structural guards", () => {
  it("rejects both assignee kinds (invalid_assignee)", async () => {
    await expect(
      createAssignment({ projectId: "p1", subcontractorId: "sub1", techId: "t1" })
    ).rejects.toMatchObject({ code: "invalid_assignee" });
  });

  it("rejects neither assignee (invalid_assignee)", async () => {
    await expect(createAssignment({ projectId: "p1" })).rejects.toBeInstanceOf(AssignmentError);
  });

  it("rejects a job that doesn't belong to the project (job_mismatch)", async () => {
    h.job = { id: "job1", project_id: "OTHER" };
    await expect(
      createAssignment({ projectId: "p1", jobId: "job1", subcontractorId: "sub1" })
    ).rejects.toMatchObject({ code: "job_mismatch" });
  });

  it("surfaces a duplicate active sub-on-job as already_assigned", async () => {
    h.insertError = "duplicate key value violates unique constraint job_assignments_unique_active_sub";
    await expect(
      createAssignment({ projectId: "p1", jobId: "job1", subcontractorId: "sub1" })
    ).rejects.toMatchObject({ code: "already_assigned" });
  });

  it("a TECH assignee needs no compliance check and assigns", async () => {
    const res = await createAssignment({ projectId: "p1", jobId: "job1", techId: "tech1", role: "crew" });
    expect(res.ok).toBe(true);
    expect(h.inserts[0]).toMatchObject({ tech_id: "tech1", subcontractor_id: null });
  });
});

describe("updateAssignment / status", () => {
  it("empty-diff update is a no-op (no write)", async () => {
    h.rows = [{ id: "a1", start_date: null, end_date: null }];
    await updateAssignment("a1", {}, "u1");
    expect(h.updates).toHaveLength(0);
  });

  it("active → completed → removed transitions; invalid jump rejected", async () => {
    h.rows = [{ id: "a1", status: "active" }];
    await setAssignmentStatus({ id: "a1", status: "completed" });
    expect(h.updates.at(-1)).toMatchObject({ status: "completed" });
    h.rows = [{ id: "a1", status: "removed" }];
    await expect(
      setAssignmentStatus({ id: "a1", status: "completed" })
    ).rejects.toMatchObject({ code: "invalid_status" });
  });
});

describe("mid-job lapse does NOT auto-remove (§4)", () => {
  it("an assignment created while eligible survives a later doc lapse", async () => {
    // assign while eligible
    const res = await createAssignment({ projectId: "p1", jobId: "job1", subcontractorId: "sub1" });
    expect(res.ok).toBe(true);

    // docs lapse AFTER assignment — nothing in the API touches the row
    h.docs = []; // now missing both required docs

    const rows = await listAssignmentsForSubcontractor("sub1");
    // the assignment still exists and is still active (flagged elsewhere, not removed)
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
  });
});
