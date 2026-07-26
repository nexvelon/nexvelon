// SCHED-1 — the dispatch-board read assembly returns tech rows, the bookings in
// the window, and the unscheduled backlog; a cancelled booking is excluded.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  techs: [] as Record<string, unknown>[],
  certs: [] as Record<string, unknown>[],
  bookings: [] as Record<string, unknown>[],
  jobs: [] as Record<string, unknown>[],
  sites: [] as Record<string, unknown>[],
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
  switch (ctx.table) {
    case "techs":
      return { data: applyFilters(h.techs, ctx.filters), error: null };
    case "tech_certifications":
      return { data: applyFilters(h.certs, ctx.filters), error: null };
    case "schedule_assignments":
      return { data: applyFilters(h.bookings, ctx.filters), error: null };
    case "schedule_jobs":
      return { data: applyFilters(h.jobs, ctx.filters), error: null };
    case "sites":
      return { data: applyFilters(h.sites, ctx.filters), error: null };
    default:
      return { data: [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => "2026-07-25",
}));

import { getDispatchBoard } from "@/lib/api/dispatch-board";

beforeEach(() => {
  h.techs = [
    { id: "techA", name: "Ana", is_active: true },
    { id: "techB", name: "Ben", is_active: true },
  ];
  h.certs = [
    { tech_id: "techA", cert_type: "kantech", expiry_date: "2027-01-01" }, // valid
    { tech_id: "techA", cert_type: "genetec", expiry_date: "2020-01-01" }, // expired
  ];
  h.bookings = [
    { id: "b1", schedule_job_id: "sjA", tech_id: "techA", starts_at: "2026-08-01T09:00:00.000Z", ends_at: "2026-08-01T12:00:00.000Z", status: "confirmed" },
    { id: "b2", schedule_job_id: "sjB", tech_id: "techB", starts_at: "2026-08-01T09:00:00.000Z", ends_at: "2026-08-01T12:00:00.000Z", status: "cancelled" },
  ];
  h.jobs = [
    { id: "sjA", title: "Install", priority: "high", job_type: "install", required_certs: ["kantech"], site_id: "s1", location_text: null, window_start: null, window_end: null, status: "scheduled" },
    { id: "sjU", title: "Backlog call", priority: "urgent", job_type: "service", required_certs: [], site_id: null, location_text: "42 Front St", window_start: null, window_end: null, status: "unscheduled" },
  ];
  h.sites = [{ id: "s1", name: "Bay 4" }];
});

describe("getDispatchBoard", () => {
  it("assembles tech rows, active bookings, and the unscheduled backlog", async () => {
    const board = await getDispatchBoard({ from: "2026-08-01T00:00:00.000Z", to: "2026-08-02T00:00:00.000Z" });

    // rows
    expect(board.techs.map((t) => t.id)).toEqual(["techA", "techB"]);
    const ana = board.techs.find((t) => t.id === "techA")!;
    expect(ana.cert_summary.valid_types).toEqual(["kantech"]); // expired genetec excluded
    expect(ana.cert_summary.expired_count).toBe(1);

    // bookings in window — the cancelled b2 is excluded
    expect(board.bookings.map((b) => b.id)).toEqual(["b1"]);
    expect(board.bookings[0]).toMatchObject({ title: "Install", site_label: "Bay 4", priority: "high", job_type: "install" });

    // backlog
    expect(board.unscheduled.map((u) => u.schedule_job_id)).toEqual(["sjU"]);
    expect(board.unscheduled[0]).toMatchObject({ title: "Backlog call", site_label: "42 Front St", priority: "urgent" });
  });
});
