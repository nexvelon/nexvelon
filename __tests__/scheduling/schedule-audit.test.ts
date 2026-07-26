// SCHED-4 — every booking mutation writes the right append-only audit action
// with before/after windows, and audit logging is BEST-EFFORT: an audit insert
// failure never rolls back the booking.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  techs: [] as Record<string, unknown>[],
  bookings: [] as Record<string, unknown>[],
  audit: [] as Record<string, unknown>[],
  auditShouldError: false,
  seq: 0,
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
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
      const rows = filt(h.jobs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "techs": {
      const rows = filt(h.techs, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "tech_certifications":
    case "tech_working_hours":
    case "tech_absences":
      return { data: [], error: null };
    case "schedule_assignments": {
      if (ctx.op === "insert") {
        const row = { id: `b${++h.seq}`, ...(ctx.payload as object) };
        h.bookings.push(row);
        return { data: single ? { ...row } : [{ ...row }], error: null };
      }
      if (ctx.op === "update") {
        const t = filt(h.bookings, ctx.filters);
        for (const r of t) Object.assign(r, ctx.payload as object);
        return { data: single ? (t[0] ? { ...t[0] } : null) : t.map((r) => ({ ...r })), error: null };
      }
      // Return COPIES so a captured pre-update snapshot isn't aliased to the
      // stored row (mirrors real Supabase returning fresh objects).
      const rows = filt(h.bookings, ctx.filters).map((r) => ({ ...r }));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "schedule_audit":
      if (ctx.op === "insert") {
        if (h.auditShouldError) return { data: null, error: { message: "audit boom" } };
        h.audit.push(ctx.payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      return { data: [], error: null };
    default:
      return { data: single ? null : [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => "2026-07-25",
}));

import { createBooking, moveBooking, cancelBooking, completeBooking } from "@/lib/api/schedule-assignments";

const T0 = "2026-08-03T09:00:00.000Z";
const T1 = "2026-08-03T12:00:00.000Z";

beforeEach(() => {
  h.seq = 0;
  h.auditShouldError = false;
  h.jobs = [{ id: "job1", status: "unscheduled", required_certs: [] }];
  h.techs = [{ id: "techA", is_active: true }, { id: "techB", is_active: true }];
  h.bookings = [];
  h.audit = [];
});

describe("audit actions", () => {
  it("createBooking → 'created' with the to-window", async () => {
    await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    const a = h.audit.at(-1)!;
    expect(a).toMatchObject({ action: "created", to_starts_at: T0, to_ends_at: T1, to_tech_id: "techA" });
  });

  it("moveBooking → 'moved' with from/to windows + techs", async () => {
    const r = await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    if (!r.ok) throw new Error("setup");
    await moveBooking({ id: r.booking.id, techId: "techB", startsAt: "2026-08-03T13:00:00.000Z", endsAt: "2026-08-03T15:00:00.000Z", actorId: "u1" });
    const a = h.audit.at(-1)!;
    expect(a).toMatchObject({ action: "moved", from_tech_id: "techA", to_tech_id: "techB", from_starts_at: T0 });
  });

  it("cancelBooking → 'cancelled'; completeBooking → 'completed'", async () => {
    const r = await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    if (!r.ok) throw new Error("setup");
    await completeBooking({ id: r.booking.id, actorId: "u1" });
    expect(h.audit.at(-1)!.action).toBe("completed");
    await cancelBooking({ id: r.booking.id, actorId: "u1" });
    expect(h.audit.at(-1)!.action).toBe("cancelled");
  });
});

describe("best-effort logging", () => {
  it("an audit insert failure does NOT roll back the booking", async () => {
    h.auditShouldError = true;
    const r = await createBooking({ scheduleJobId: "job1", techId: "techA", startsAt: T0, endsAt: T1, actorId: "u1" });
    expect(r.ok).toBe(true); // booking still succeeded
    expect(h.bookings).toHaveLength(1); // and was inserted
    expect(h.audit).toHaveLength(0); // audit was not recorded
  });
});
