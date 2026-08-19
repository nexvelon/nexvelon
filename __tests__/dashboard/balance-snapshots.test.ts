// SNAP-1 — daily balance snapshots: capture writes one row per metric per opco per
// day and is idempotent (ON CONFLICT DO NOTHING → never overwrites, immutable §2.2);
// the day boundary is America/Toronto incl. a DST transition; deltas compute from
// snapshots (nearest-≤ prior) per the UIDG-6B comparison anchor; polarity is correct
// per metric; insufficient history reads as "building history"; a missing day is
// detected; and reads are gated identically to the live figures.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── balance sources return fixed values (capture must store what they return) ──
vi.mock("@/lib/api/ar-aging", () => ({ getArAgingSummary: async () => ({ total: 184000, overdueTotal: 42000, buckets: {}, asOf: "2026-06-08" }) }));
vi.mock("@/lib/api/vendor-bills", () => ({ getApSummary: async () => ({ outstanding: 91000, overdue: 8000, billCount: 12 }) }));
vi.mock("@/lib/api/deposits", () => ({ getDepositsHeldTotal: async () => 30500 }));
vi.mock("@/lib/api/wip", () => ({ getWipPortfolio: async () => ({ rows: [], totals: { overbilled: 22000, underbilled: -8000, net: 14000 } }) }));

// ── client mocks ───────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  captured: null as { rows: unknown[]; opts: unknown } | null,
  auditRows: [] as unknown[],
  readRows: [] as { metric_key: string; captured_date: string; amount: number }[],
  countRows: 0,
}));

function chain(resolve: () => { data: unknown; error: unknown; count?: number }) {
  const p: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "gte", "lte", "order", "neq"];
  for (const m of methods) p[m] = () => p;
  // terminal awaits
  (p as { then: unknown }).then = (onF: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onF);
  return p;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "balance_snapshots") {
        return {
          upsert: (rows: unknown[], opts: unknown) => ({
            select: () => {
              h.captured = { rows, opts };
              return Promise.resolve({ data: rows, error: null });
            },
          }),
          select: () => chain(() => ({ data: [], error: null, count: h.countRows })),
        };
      }
      if (table === "activity_log") {
        return { insert: (row: unknown) => { h.auditRows.push(row); return Promise.resolve({ error: null }); } };
      }
      return {};
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => chain(() => ({ data: h.readRows, error: null })),
  }),
}));

import {
  captureBalanceSnapshots,
  getBalanceHistory,
  detectSnapshotGaps,
  BALANCE_METRICS,
} from "@/lib/api/balance-snapshots";
import { businessDateISO } from "@/lib/format";

beforeEach(() => {
  h.captured = null;
  h.auditRows = [];
  h.readRows = [];
  h.countRows = 0;
});

describe("capture — one row per metric per opco per day, from the live queries", () => {
  it("writes the 8 balance metrics with opco 'all' and the captured values", async () => {
    const res = await captureBalanceSnapshots(new Date("2026-06-08T12:00:00Z"));
    const rows = h.captured!.rows as { captured_date: string; metric_key: string; opco: string; amount: number }[];
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.opco))).toEqual(new Set(["all"]));
    expect(rows.every((r) => r.captured_date === "2026-06-08")).toBe(true);
    const byKey = Object.fromEntries(rows.map((r) => [r.metric_key, r.amount]));
    expect(byKey.ar_outstanding).toBe(184000);
    expect(byKey.ap_outstanding).toBe(91000);
    expect(byKey.deposits_held).toBe(30500);
    expect(byKey.wip_net).toBe(14000);
    expect(res.inserted).toBe(8);
  });

  it("is idempotent — the write uses ON CONFLICT DO NOTHING (never overwrites, §2.2)", async () => {
    await captureBalanceSnapshots(new Date("2026-06-08T12:00:00Z"));
    expect(h.captured!.opts).toMatchObject({ onConflict: "metric_key,opco,captured_date", ignoreDuplicates: true });
  });

  it("writes a §5 audit row for the run", async () => {
    await captureBalanceSnapshots(new Date("2026-06-08T12:00:00Z"));
    expect(h.auditRows).toHaveLength(1);
    expect(h.auditRows[0]).toMatchObject({ entity_type: "balance_snapshot", action: "create", entity_id: "2026-06-08", actor_id: null });
  });
});

describe("day boundary is America/Toronto, incl. a DST transition (2g)", () => {
  it("assigns the Toronto calendar date, not the UTC date", () => {
    // 2026-06-08 01:30 UTC is still 2026-06-07 21:30 in Toronto (EDT, UTC-4).
    expect(businessDateISO(new Date("2026-06-08T01:30:00Z"))).toBe("2026-06-07");
  });
  it("spring-forward night (2026-03-08) does not double a local day", () => {
    // Around the DST jump the Toronto date is still well-defined via the IANA zone.
    expect(businessDateISO(new Date("2026-03-08T06:59:00Z"))).toBe("2026-03-08"); // 01:59 EST
    expect(businessDateISO(new Date("2026-03-08T07:30:00Z"))).toBe("2026-03-08"); // 03:30 EDT (2am skipped)
  });
});

describe("polarity per metric (Step 5)", () => {
  const byKey = Object.fromEntries(BALANCE_METRICS.map((m) => [m.key, m]));
  it("AR/AP up = caution (inverted); deposits + WIP net up = good (normal)", () => {
    expect(byKey.ar_outstanding.polarity).toBe("inverted");
    expect(byKey.ap_outstanding.polarity).toBe("inverted");
    expect(byKey.deposits_held.polarity).toBe("normal");
    expect(byKey.wip_net.polarity).toBe("normal");
  });
  it("WIP metrics require financials:edit; AR/AP/deposits require financials:view", () => {
    expect(byKey.wip_net.gate).toEqual({ resource: "financials", action: "edit" });
    expect(byKey.ar_outstanding.gate).toEqual({ resource: "financials", action: "view" });
  });
});

describe("deltas compute from snapshots (nearest-≤ prior at the comparison anchor)", () => {
  it("prior = the last snapshot on/before the anchor; series ascending", async () => {
    h.readRows = [
      { metric_key: "ar_outstanding", captured_date: "2026-05-01", amount: 150000 },
      { metric_key: "ar_outstanding", captured_date: "2026-05-08", amount: 160000 }, // the anchor day
      { metric_key: "ar_outstanding", captured_date: "2026-06-08", amount: 184000 }, // today
    ];
    const [h1] = await getBalanceHistory(["ar_outstanding"], "2026-05-01", "2026-06-08", "2026-05-08");
    expect(h1.priorAt).toBe(160000); // snapshot AT the anchor
    expect(h1.points.map((p) => p.amount)).toEqual([150000, 160000, 184000]);
  });

  it("uses the nearest EARLIER snapshot when the anchor has no exact row", async () => {
    h.readRows = [
      { metric_key: "ap_outstanding", captured_date: "2026-05-05", amount: 80000 },
      { metric_key: "ap_outstanding", captured_date: "2026-06-08", amount: 91000 },
    ];
    const [ap] = await getBalanceHistory(["ap_outstanding"], "2026-05-01", "2026-06-08", "2026-05-10");
    expect(ap.priorAt).toBe(80000); // 05-05 is the last ≤ 05-10
  });

  it("insufficient history → priorAt null (the tile shows 'building history', §2.8)", async () => {
    h.readRows = [{ metric_key: "ar_outstanding", captured_date: "2026-06-01", amount: 170000 }];
    const [ar] = await getBalanceHistory(["ar_outstanding"], "2026-05-01", "2026-06-08", "2026-05-08");
    expect(ar.priorAt).toBeNull(); // nothing on/before the anchor
    expect(ar.points).toHaveLength(1);
  });

  it("requesting no metrics returns nothing (the caller gates which keys to read)", async () => {
    expect(await getBalanceHistory([], "2026-05-01", "2026-06-08", "2026-05-08")).toEqual([]);
  });
});

describe("gap detection — a missed day is visible, not smoothed (2d)", () => {
  it("reports the missing Toronto dates between the first snapshot and yesterday", async () => {
    // captured 06-01, 06-02, then a gap on 06-03/06-04, then 06-05. today = 06-08.
    h.readRows = ["2026-06-01", "2026-06-02", "2026-06-05"].map((d) => ({ metric_key: BALANCE_METRICS[0].key, captured_date: d, amount: 0 }));
    const gaps = await detectSnapshotGaps(new Date("2026-06-08T12:00:00Z"));
    expect(gaps.firstDate).toBe("2026-06-01");
    expect(gaps.missing).toContain("2026-06-03");
    expect(gaps.missing).toContain("2026-06-04");
    expect(gaps.missing).toContain("2026-06-06"); // after the last capture, before today
    expect(gaps.missing).not.toContain("2026-06-08"); // today may not be captured yet
  });

  it("no snapshots yet → no gaps (history hasn't begun)", async () => {
    h.readRows = [];
    const gaps = await detectSnapshotGaps(new Date("2026-06-08T12:00:00Z"));
    expect(gaps).toEqual({ firstDate: null, lastDate: null, missing: [] });
  });
});
