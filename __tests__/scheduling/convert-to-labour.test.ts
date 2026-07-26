// SCHED-4 — THE COST SEAM. Conversion requires 'completed', is single-per-booking
// (the double-feed guard), needs a resolvable cost center, produces exactly ONE
// labour_entry (amount = hours × rate) with the link + audit, respects an hours
// override, and unconvert reverses it. completeBooking must NOT auto-create labour.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  bookings: [] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  ccs: [] as Record<string, unknown>[],
  techs: [] as Record<string, unknown>[],
  labour: [] as Record<string, unknown>[],
  audit: [] as Record<string, unknown>[],
  seq: 0,
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "is" && a[1] === null) out = out.filter((r) => r[col] == null);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "schedule_assignments": {
      if (ctx.op === "update") {
        const t = filt(h.bookings, ctx.filters);
        for (const r of t) Object.assign(r, ctx.payload as object);
        return { data: single ? (t[0] ?? null) : t.map((r) => ({ id: r.id })), error: null };
      }
      const rows = filt(h.bookings, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "schedule_jobs": {
      const rows = filt(h.jobs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "project_cost_centers":
      return { data: filt(h.ccs, ctx.filters), error: null };
    case "techs": {
      const rows = filt(h.techs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "labour_entries": {
      if (ctx.op === "insert") {
        const row = { id: `lab${++h.seq}`, ...(ctx.payload as object) };
        h.labour.push(row);
        return { data: single ? row : [row], error: null };
      }
      if (ctx.op === "delete") {
        const t = filt(h.labour, ctx.filters);
        h.labour = h.labour.filter((r) => !t.includes(r));
        return { data: t, error: null };
      }
      return { data: filt(h.labour, ctx.filters), error: null };
    }
    case "schedule_audit":
      if (ctx.op === "insert") { h.audit.push(ctx.payload as Record<string, unknown>); return { data: null, error: null }; }
      return { data: [], error: null };
    default:
      return { data: single ? null : [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));

import { convertBookingToLabour, unconvertBooking } from "@/lib/api/schedule-cost";
import { completeBooking } from "@/lib/api/schedule-assignments";

beforeEach(() => {
  h.seq = 0;
  h.bookings = [{
    id: "asg1", schedule_job_id: "sj1", tech_id: "techA",
    starts_at: "2026-08-03T09:00:00.000Z", ends_at: "2026-08-03T12:00:00.000Z",
    status: "completed", converted_labour_entry_id: null,
  }];
  h.jobs = [{ id: "sj1", reference: "SVC-2026-0001", project_job_id: "pjob1" }];
  h.ccs = [{ id: "cc1", job_id: "pjob1", sort_order: 0 }];
  h.techs = [{ id: "techA", name: "Ana", default_cost_rate: 80 }];
  h.labour = [];
  h.audit = [];
});

describe("convertBookingToLabour", () => {
  it("requires a completed booking", async () => {
    h.bookings[0].status = "confirmed";
    const r = await convertBookingToLabour({ assignmentId: "asg1", actorId: "u1" });
    expect(r).toMatchObject({ ok: false, error: "not_completed" });
    expect(h.labour).toHaveLength(0);
  });

  it("happy path: ONE labour_entry, amount = hours × rate, link + audit set", async () => {
    const r = await convertBookingToLabour({ assignmentId: "asg1", actorId: "u1" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.hours).toBe(3); expect(r.amount).toBe(240); expect(r.costCenterId).toBe("cc1"); }
    expect(h.labour).toHaveLength(1);
    expect(h.labour[0]).toMatchObject({ cost_center_id: "cc1", hours: 3, cost_rate: 80, amount: 240, note: "From booking SVC-2026-0001" });
    expect(h.bookings[0].converted_labour_entry_id).toBe(h.labour[0].id);
    expect(h.audit.some((a) => a.action === "converted_to_labour")).toBe(true);
  });

  it("single-conversion: a second convert → already_converted, NO second labour_entry", async () => {
    await convertBookingToLabour({ assignmentId: "asg1", actorId: "u1" });
    const r2 = await convertBookingToLabour({ assignmentId: "asg1", actorId: "u1" });
    expect(r2).toMatchObject({ ok: false, error: "already_converted" });
    expect(h.labour).toHaveLength(1); // still just one
  });

  it("no cost center (standalone service call) → no_cost_center, no labour", async () => {
    h.jobs[0].project_job_id = null;
    const r = await convertBookingToLabour({ assignmentId: "asg1", actorId: "u1" });
    expect(r).toMatchObject({ ok: false, error: "no_cost_center" });
    expect(h.labour).toHaveLength(0);
  });

  it("respects an hours override", async () => {
    const r = await convertBookingToLabour({ assignmentId: "asg1", hours: 2, actorId: "u1" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.hours).toBe(2); expect(r.amount).toBe(160); }
  });
});

describe("unconvertBooking", () => {
  it("deletes the labour_entry + clears the link + audits", async () => {
    await convertBookingToLabour({ assignmentId: "asg1", actorId: "u1" });
    expect(h.labour).toHaveLength(1);
    const r = await unconvertBooking({ assignmentId: "asg1", actorId: "u1" });
    expect(r.ok).toBe(true);
    expect(h.labour).toHaveLength(0);
    expect(h.bookings[0].converted_labour_entry_id).toBeNull();
    expect(h.audit.some((a) => a.action === "unconverted")).toBe(true);
  });
});

describe("the invariant: completeBooking does NOT auto-create labour", () => {
  it("completing a booking writes zero labour_entries", async () => {
    h.bookings[0].status = "confirmed";
    await completeBooking({ id: "asg1", actorId: "u1" });
    expect(h.bookings[0].status).toBe("completed");
    expect(h.labour).toHaveLength(0); // NEVER auto-converts
  });
});
