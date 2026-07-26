// SCHED-1 — the booking guards (server-side, called directly). Cert block fires;
// ends<=starts rejected; and the core conflict logic: a second confirmed booking
// overlapping the same tech is rejected, a CANCELLED overlapping one is allowed,
// and the same window on a different tech is allowed. Booking flips the job to
// 'scheduled'; cancel frees it.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  techs: [] as Record<string, unknown>[],
  certs: [] as Record<string, unknown>[],
  bookings: [] as Record<string, unknown>[],
  seq: 0,
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "neq") out = out.filter((r) => r[col] !== a[1]);
    else if (f.method === "in") out = out.filter((r) => (a[1] as unknown[]).includes(r[col]));
    else if (f.method === "lt") out = out.filter((r) => (r[col] as string) < (a[1] as string));
    else if (f.method === "gt") out = out.filter((r) => (r[col] as string) > (a[1] as string));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "schedule_jobs": {
      if (ctx.op === "update") {
        const t = applyFilters(h.jobs, ctx.filters);
        for (const r of t) Object.assign(r, ctx.payload as object);
        return { data: null, error: null };
      }
      const rows = applyFilters(h.jobs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "techs": {
      const rows = applyFilters(h.techs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "tech_certifications":
      return { data: applyFilters(h.certs, ctx.filters), error: null };
    case "schedule_assignments": {
      if (ctx.op === "insert") {
        const row = { id: `b${++h.seq}`, ...(ctx.payload as object) };
        h.bookings.push(row);
        return { data: single ? row : [row], error: null };
      }
      if (ctx.op === "update") {
        const t = applyFilters(h.bookings, ctx.filters);
        for (const r of t) Object.assign(r, ctx.payload as object);
        return { data: single ? (t[0] ?? null) : t, error: null };
      }
      const rows = applyFilters(h.bookings, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    default:
      return { data: single ? null : [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => "2026-07-25",
}));

import {
  createBooking,
  moveBooking,
  cancelBooking,
} from "@/lib/api/schedule-assignments";

const T0 = "2026-08-01T09:00:00.000Z";
const T1 = "2026-08-01T12:00:00.000Z";

beforeEach(() => {
  h.seq = 0;
  h.jobs = [{ id: "job1", status: "unscheduled", required_certs: [] }];
  h.techs = [
    { id: "techA", is_active: true },
    { id: "techB", is_active: true },
  ];
  h.certs = [];
  h.bookings = [];
});

describe("createBooking guards", () => {
  it("rejects ends <= starts (invalid_window)", async () => {
    const r = await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T1, endsAt: T0, actorId: "u1" });
    expect(r).toMatchObject({ ok: false, error: "invalid_window" });
  });

  it("cert-blocks server-side with reasons", async () => {
    h.jobs = [{ id: "job1", status: "unscheduled", required_certs: ["kantech"] }];
    const r = await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error === "cert_block") expect(r.reasons.join(" ")).toMatch(/Kantech/i);
    else throw new Error("expected cert_block");
  });

  it("books, and flips the schedule_job to 'scheduled'", async () => {
    const r = await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    expect(r.ok).toBe(true);
    expect(h.jobs[0].status).toBe("scheduled");
    expect(h.bookings).toHaveLength(1);
  });
});

describe("double-booking detection", () => {
  beforeEach(async () => {
    // an existing confirmed booking 09:00–12:00 for techA
    await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
  });

  it("rejects an overlapping confirmed booking for the same tech", async () => {
    const r = await createBooking({
      scheduleJobId: "job1", techId: "techA",
      startsAt: "2026-08-01T10:00:00.000Z", endsAt: "2026-08-01T11:00:00.000Z", actorId: "u1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error === "tech_double_booked") {
      expect(r.conflict.starts_at).toBe(T0);
    } else throw new Error("expected tech_double_booked");
  });

  it("ALLOWS an overlapping booking when the existing one is cancelled", async () => {
    h.bookings[0].status = "cancelled"; // free the slot
    const r = await createBooking({
      scheduleJobId: "job1", techId: "techA",
      startsAt: "2026-08-01T10:00:00.000Z", endsAt: "2026-08-01T11:00:00.000Z", actorId: "u1",
    });
    expect(r.ok).toBe(true);
  });

  it("ALLOWS the same window on a different tech", async () => {
    const r = await createBooking({ scheduleJobId: "job1", techId: "techB", startsAt: T0, endsAt: T1, actorId: "u1" });
    expect(r.ok).toBe(true);
  });
});

describe("moveBooking + cancelBooking", () => {
  it("moving into a conflicting slot is rejected", async () => {
    await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    // techB books 13:00–14:00
    const other = await createBooking({
      scheduleJobId: "job1", techId: "techB",
      startsAt: "2026-08-01T13:00:00.000Z", endsAt: "2026-08-01T14:00:00.000Z", actorId: "u1",
    });
    if (!other.ok) throw new Error("setup booking failed");
    // move techB's booking onto techA's 09–12 slot, reassigning to techA → conflict
    const r = await moveBooking({ id: other.booking.id, techId: "techA", startsAt: "2026-08-01T10:00:00.000Z", endsAt: "2026-08-01T11:00:00.000Z", actorId: "u1" });
    expect(r).toMatchObject({ ok: false, error: "tech_double_booked" });
  });

  it("cancelling the job's only active booking returns it to 'unscheduled'", async () => {
    const r = await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    if (!r.ok) throw new Error("booking failed");
    expect(h.jobs[0].status).toBe("scheduled");
    await cancelBooking({ id: r.booking.id, actorId: "u1" });
    expect(h.bookings[0].status).toBe("cancelled");
    expect(h.jobs[0].status).toBe("unscheduled");
  });
});
