// PROJ2-14 — the warranty API. end_date computed from duration_months (incl.
// the Jan-31 month-end clamp), explicit end wins, end<start rejected,
// job_mismatch, handover stamp, and the derived-state status rollup.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as { id: unknown; payload: Record<string, unknown> }[],
  job: { id: "job1", project_id: "p1" } as Record<string, unknown> | null,
  today: "2026-07-23",
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "warranties") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `w-${h.inserts.length + 1}`, ...p };
      h.inserts.push(p);
      h.rows = [...h.rows, row];
      return { data: row, error: null };
    }
    if (ctx.op === "update") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      h.updates.push({ id, payload: ctx.payload as Record<string, unknown> });
      h.rows = h.rows.map((r) => (r.id === id ? { ...r, ...(ctx.payload as object) } : r));
      return { data: h.rows.find((r) => r.id === id) ?? null, error: null };
    }
    const rows = filt(h.rows, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => h.today,
}));
vi.mock("@/lib/api/projects", () => ({ getJobById: async () => h.job }));
vi.mock("@/lib/api/sub-agreements", () => ({ jobLabel: () => "Main Job" }));

import {
  createWarranty,
  recordHandover,
  getWarrantyStatusForProject,
  addMonthsClamped,
  WarrantyError,
} from "@/lib/api/warranties";

beforeEach(() => {
  h.rows = [];
  h.inserts = [];
  h.updates = [];
  h.job = { id: "job1", project_id: "p1" };
  h.today = "2026-07-23";
});

describe("addMonthsClamped — month-end handling", () => {
  it("clamps to the last valid day when the target month is shorter", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28"); // not Mar 3
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29"); // leap year
    expect(addMonthsClamped("2026-01-15", 12)).toBe("2027-01-15"); // whole year
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28"); // year rollover + clamp
  });
});

describe("createWarranty — end date resolution", () => {
  it("computes end_date from duration_months when no explicit end", async () => {
    await createWarranty({ projectId: "p1", startDate: "2026-01-31", durationMonths: 1 });
    expect(h.inserts[0]).toMatchObject({
      start_date: "2026-01-31",
      duration_months: 1,
      end_date: "2026-02-28",
    });
  });

  it("explicit endDate wins over duration (duration stored as entered, not corrected)", async () => {
    await createWarranty({
      projectId: "p1", startDate: "2026-01-01", durationMonths: 12, endDate: "2027-06-30",
    });
    expect(h.inserts[0]).toMatchObject({
      end_date: "2027-06-30",
      duration_months: 12, // stored as entered, NOT recomputed to match the end
    });
  });

  it("rejects when neither end nor duration is given", async () => {
    await expect(
      createWarranty({ projectId: "p1", startDate: "2026-01-01" })
    ).rejects.toMatchObject({ code: "invalid_dates" });
  });

  it("rejects end < start (explicit end before start)", async () => {
    await expect(
      createWarranty({ projectId: "p1", startDate: "2026-06-01", endDate: "2026-01-01" })
    ).rejects.toBeInstanceOf(WarrantyError);
  });

  it("rejects a job not in the project (job_mismatch)", async () => {
    h.job = { id: "job1", project_id: "OTHER" };
    await expect(
      createWarranty({ projectId: "p1", jobId: "job1", startDate: "2026-01-01", durationMonths: 12 })
    ).rejects.toMatchObject({ code: "job_mismatch" });
  });
});

describe("recordHandover", () => {
  it("stamps the handover date + signer", async () => {
    h.rows = [{ id: "w1" }];
    await recordHandover({ warrantyId: "w1", handoverDate: "2026-07-01", signedBy: "Client Rep" });
    expect(h.updates.at(-1)!.payload).toMatchObject({
      handover_date: "2026-07-01",
      handover_signed_by: "Client Rep",
    });
  });
});

describe("getWarrantyStatusForProject — rollup by derived state", () => {
  it("counts active / expiring / expired and picks the soonest future expiry", async () => {
    // today = 2026-07-23, warranty window = 60 days
    h.rows = [
      { id: "w1", project_id: "p1", start_date: "2020-01-01", end_date: "2029-01-01" }, // active
      { id: "w2", project_id: "p1", start_date: "2020-01-01", end_date: "2026-08-10" }, // 18 days → expiring_soon
      { id: "w3", project_id: "p1", start_date: "2020-01-01", end_date: "2026-06-01" }, // past → expired
    ];
    const roll = await getWarrantyStatusForProject("p1");
    expect(roll).toMatchObject({ active: 1, expiring_soon: 1, expired: 1, total: 3 });
    // soonest FUTURE (non-expired) end date
    expect(roll.soonest_expiry).toBe("2026-08-10");
  });
});
