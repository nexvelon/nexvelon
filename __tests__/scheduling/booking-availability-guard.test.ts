// SCHED-3 — the availability guard inside createBooking (server-side, direct
// call): an approved absence covering the slot BLOCKS (tech_on_leave); off-hours
// SUCCEEDS with a warning; and the cert + overlap guards still fire, in order.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m, d, h, min, 0, 0).toISOString();
// 2026-08-03 = Monday.
const MON = { y: 2026, m: 7, d: 3 };

const h = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  techs: [] as Record<string, unknown>[],
  certs: [] as Record<string, unknown>[],
  bookings: [] as Record<string, unknown>[],
  hours: [] as Record<string, unknown>[],
  absences: [] as Record<string, unknown>[],
  seq: 0,
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "neq") out = out.filter((r) => r[col] !== a[1]);
    else if (f.method === "lt") out = out.filter((r) => (r[col] as string) < (a[1] as string));
    else if (f.method === "gt") out = out.filter((r) => (r[col] as string) > (a[1] as string));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "schedule_jobs": {
      if (ctx.op === "update") return { data: null, error: null };
      const rows = applyFilters(h.jobs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "techs": {
      const rows = applyFilters(h.techs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "tech_certifications":
      return { data: applyFilters(h.certs, ctx.filters), error: null };
    case "tech_working_hours":
      return { data: applyFilters(h.hours, ctx.filters), error: null };
    case "tech_absences":
      return { data: applyFilters(h.absences, ctx.filters), error: null };
    case "schedule_assignments": {
      if (ctx.op === "insert") {
        const row = { id: `b${++h.seq}`, ...(ctx.payload as object) };
        h.bookings.push(row);
        return { data: single ? row : [row], error: null };
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

import { createBooking } from "@/lib/api/schedule-assignments";

const weekdays9to5 = [1, 2, 3, 4, 5].map((dow) => ({ tech_id: "techA", day_of_week: dow, start_time: "09:00", end_time: "17:00" }));

beforeEach(() => {
  h.seq = 0;
  h.jobs = [{ id: "job1", status: "unscheduled", required_certs: [] }];
  h.techs = [{ id: "techA", is_active: true }];
  h.certs = [];
  h.bookings = [];
  h.hours = [...weekdays9to5];
  h.absences = [];
});

it("BLOCKS on an approved absence covering the window (tech_on_leave)", async () => {
  h.absences = [{ tech_id: "techA", starts_at: local(MON.y, MON.m, MON.d, 0), ends_at: local(MON.y, MON.m, MON.d + 1, 0), status: "approved" }];
  const r = await createBooking({
    scheduleJobId: "job1", techId: "techA",
    startsAt: local(MON.y, MON.m, MON.d, 10), endsAt: local(MON.y, MON.m, MON.d, 12), actorId: "u1",
  });
  expect(r).toMatchObject({ ok: false, error: "tech_on_leave" });
  expect(h.bookings).toHaveLength(0); // never inserted
});

it("SUCCEEDS with an off_hours warning when outside working hours", async () => {
  const r = await createBooking({
    scheduleJobId: "job1", techId: "techA",
    startsAt: local(MON.y, MON.m, MON.d, 19), endsAt: local(MON.y, MON.m, MON.d, 21), actorId: "u1",
  });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.warning).toBe("off_hours");
  expect(h.bookings).toHaveLength(1); // booking created
});

it("SUCCEEDS with no warning within working hours", async () => {
  const r = await createBooking({
    scheduleJobId: "job1", techId: "techA",
    startsAt: local(MON.y, MON.m, MON.d, 10), endsAt: local(MON.y, MON.m, MON.d, 12), actorId: "u1",
  });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.warning).toBeNull();
});

it("cert block fires BEFORE availability (even off-hours)", async () => {
  h.jobs = [{ id: "job1", status: "unscheduled", required_certs: ["kantech"] }];
  const r = await createBooking({
    scheduleJobId: "job1", techId: "techA",
    startsAt: local(MON.y, MON.m, MON.d, 19), endsAt: local(MON.y, MON.m, MON.d, 21), actorId: "u1",
  });
  expect(r).toMatchObject({ ok: false, error: "cert_block" });
});

it("overlap still fires after the availability guard", async () => {
  h.bookings = [{ id: "existing", tech_id: "techA", schedule_job_id: "job1", starts_at: local(MON.y, MON.m, MON.d, 9), ends_at: local(MON.y, MON.m, MON.d, 12), status: "confirmed" }];
  const r = await createBooking({
    scheduleJobId: "job1", techId: "techA",
    startsAt: local(MON.y, MON.m, MON.d, 10), endsAt: local(MON.y, MON.m, MON.d, 11), actorId: "u1",
  });
  expect(r).toMatchObject({ ok: false, error: "tech_double_booked" });
});
