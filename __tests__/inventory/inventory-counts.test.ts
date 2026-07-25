// INV-9-2 — cycle-count workflow. The correctness point: applyCount posts an
// adjustment ONLY for counted lines whose count differs from expected, and it
// SKIPS uncounted lines (an empty count is NOT "0 found"). Plus: variance value
// uses the unit_cost snapshot, and a single failing adjustment doesn't abort the
// rest (best-effort §2.8).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  sessions: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  stock: [] as Record<string, unknown>[],
  products: [] as Record<string, unknown>[],
  seq: 0,
  adjustCalls: [] as { stockId: string; newQty: number; reason: string }[],
  failOn: null as string | null,
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "neq") out = out.filter((r) => r[col] !== a[1]);
    else if (f.method === "in") out = out.filter((r) => (a[1] as unknown[]).includes(r[col]));
    else if (f.method === "is" && a[1] === null) out = out.filter((r) => r[col] == null);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "rpc:next_count_reference") return { data: "CNT-2026-0001", error: null };

  if (ctx.table === "inventory_stock") {
    return { data: applyFilters(h.stock, ctx.filters), error: null };
  }
  if (ctx.table === "inventory_products") {
    return { data: applyFilters(h.products, ctx.filters), error: null };
  }
  if (ctx.table === "inventory_count_sessions") {
    if (ctx.op === "insert") {
      const row = { id: `sess${++h.seq}`, opened_at: "2026-07-24", ...(ctx.payload as object) };
      h.sessions.push(row);
      return { data: single ? row : [row], error: null };
    }
    if (ctx.op === "update") {
      const t = applyFilters(h.sessions, ctx.filters);
      for (const r of t) Object.assign(r, ctx.payload as object);
      return { data: single ? (t[0] ?? null) : t, error: null };
    }
    const rows = applyFilters(h.sessions, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  if (ctx.table === "inventory_count_lines") {
    if (ctx.op === "insert") {
      const payload = ctx.payload as Record<string, unknown> | Record<string, unknown>[];
      const arr = Array.isArray(payload) ? payload : [payload];
      for (const p of arr) h.lines.push({ id: `ln${++h.seq}`, applied: false, variance_qty: null, variance_value: null, ...p });
      return { data: null, error: null };
    }
    if (ctx.op === "update") {
      const t = applyFilters(h.lines, ctx.filters);
      for (const r of t) Object.assign(r, ctx.payload as object);
      return { data: single ? (t[0] ?? null) : t, error: null };
    }
    const rows = applyFilters(h.lines, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: single ? null : [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/stock-movements", () => ({
  adjustStockQuantity: vi.fn(async (stockId: string, newQty: number, reason: string) => {
    h.adjustCalls.push({ stockId, newQty, reason });
    if (h.failOn && stockId === h.failOn) throw new Error("adjust boom");
    return { quantity: newQty, delta: 0 };
  }),
}));

import {
  createCountSession,
  enterCount,
  submitForReview,
  applyCount,
  cancelCount,
  getCountVarianceSummary,
} from "@/lib/api/inventory-counts";

beforeEach(() => {
  h.sessions = [];
  h.lines = [];
  h.stock = [];
  h.products = [];
  h.seq = 0;
  h.adjustCalls = [];
  h.failOn = null;
});

describe("createCountSession snapshot", () => {
  beforeEach(() => {
    h.stock = [
      { id: "s1", product_id: "pA", quantity: 5, unit_cost: 10, serial_number: null, status: "in_stock", current_location_id: "L1", current_cost_center_id: null },
      { id: "s2", product_id: "pB", quantity: 3, unit_cost: 20, serial_number: null, status: "in_stock", current_location_id: "L1", current_cost_center_id: null },
      { id: "s3", product_id: "pC", quantity: 9, unit_cost: 5, serial_number: null, status: "in_stock", current_location_id: "L2", current_cost_center_id: null },
      { id: "s4", product_id: "pA", quantity: 1, unit_cost: 10, serial_number: null, status: "in_stock", current_location_id: "L1", current_cost_center_id: "cc1" }, // on a job — excluded
      { id: "s5", product_id: "pB", quantity: 2, unit_cost: 20, serial_number: null, status: "consumed", current_location_id: "L1", current_cost_center_id: null }, // consumed — excluded
    ];
    h.products = [
      { id: "pA", name: "Widget A", sku: "WA", category_id: "cat1" },
      { id: "pB", name: "Widget B", sku: "WB", category_id: "cat2" },
      { id: "pC", name: "Widget C", sku: "WC", category_id: "cat1" },
    ];
  });

  it("snapshots one line per in_stock row at the location (excludes job/consumed rows)", async () => {
    await createCountSession({ locationId: "L1", actorId: "u1" });
    const snap = h.lines.filter((l) => l.product_id === "pA" || l.product_id === "pB");
    expect(h.lines).toHaveLength(2); // s1, s2 only
    const a = h.lines.find((l) => l.stock_id === "s1")!;
    expect(a).toMatchObject({ expected_qty: 5, unit_cost_snapshot: 10, sku_snapshot: "WA", counted_qty: null });
    expect(snap.every((l) => l.stock_id === "s1" || l.stock_id === "s2")).toBe(true);
  });

  it("applies the category filter", async () => {
    await createCountSession({ categoryId: "cat1", actorId: "u1" });
    // cat1 = pA (s1) + pC (s3); pB excluded.
    expect(h.lines.map((l) => l.stock_id).sort()).toEqual(["s1", "s3"]);
  });
});

describe("enter + submit computes variance at the cost snapshot", () => {
  it("stamps variance_qty and variance_value = variance × unit_cost_snapshot", async () => {
    h.sessions = [{ id: "sess1", reference: "CNT-2026-0001", status: "open" }];
    h.lines = [{ id: "ln1", session_id: "sess1", expected_qty: 5, counted_qty: null, unit_cost_snapshot: 10, stock_id: "s1", applied: false }];

    await enterCount({ lineId: "ln1", countedQty: 4, actorId: "u1" });
    expect(h.lines[0].counted_qty).toBe(4);
    expect(h.sessions[0].status).toBe("counting");

    await submitForReview("sess1", "u1");
    expect(h.lines[0]).toMatchObject({ variance_qty: -1, variance_value: -10 });
    expect(h.sessions[0].status).toBe("review");
  });
});

describe("applyCount — the uncounted-skip rule", () => {
  beforeEach(() => {
    h.sessions = [{ id: "sess1", reference: "CNT-2026-0001", status: "review" }];
    h.lines = [
      // counted, has variance → adjusted
      { id: "ln1", session_id: "sess1", expected_qty: 5, counted_qty: 4, unit_cost_snapshot: 10, stock_id: "s1", applied: false },
      // UNCOUNTED → must be skipped, never adjusted
      { id: "ln2", session_id: "sess1", expected_qty: 3, counted_qty: null, unit_cost_snapshot: 20, stock_id: "s2", applied: false },
      // counted, no variance → reconciled no-op (not adjusted)
      { id: "ln3", session_id: "sess1", expected_qty: 2, counted_qty: 2, unit_cost_snapshot: 5, stock_id: "s3", applied: false },
    ];
  });

  it("adjusts ONLY counted lines with variance; skips the uncounted line entirely", async () => {
    const result = await applyCount({ sessionId: "sess1", actorId: "u1" });

    // s1 adjusted to 4; s3 no-op; s2 (uncounted) NEVER touched — the critical assertion.
    expect(h.adjustCalls).toHaveLength(1);
    expect(h.adjustCalls[0]).toMatchObject({ stockId: "s1", newQty: 4, reason: "Cycle count CNT-2026-0001" });
    expect(h.adjustCalls.some((c) => c.stockId === "s2")).toBe(false);

    expect(result.adjusted).toBe(1);
    expect(result.skipped_uncounted).toBe(1);
    expect(result.applied).toBe(2); // ln1 (adjusted) + ln3 (no-op reconciled)
    expect(result.failed).toBe(0);

    expect(h.sessions[0].status).toBe("applied");
    // the uncounted line stays unapplied
    expect(h.lines.find((l) => l.id === "ln2")!.applied).toBe(false);
  });
});

describe("applyCount — best-effort partial apply", () => {
  it("one failing adjustment doesn't abort the rest", async () => {
    h.failOn = "sFail";
    h.sessions = [{ id: "sess1", reference: "CNT-2026-0001", status: "review" }];
    h.lines = [
      { id: "ln1", session_id: "sess1", expected_qty: 5, counted_qty: 4, unit_cost_snapshot: 10, stock_id: "sOk", applied: false },
      { id: "ln2", session_id: "sess1", expected_qty: 3, counted_qty: 1, unit_cost_snapshot: 20, stock_id: "sFail", applied: false },
    ];

    const result = await applyCount({ sessionId: "sess1", actorId: "u1" });
    expect(result.adjusted).toBe(1); // sOk succeeded
    expect(result.failed).toBe(1); // sFail threw, recorded, not aborted
    expect(h.sessions[0].status).toBe("applied");
    expect(h.lines.find((l) => l.id === "ln1")!.applied).toBe(true);
    expect(h.lines.find((l) => l.id === "ln2")!.applied).toBe(false);
  });
});

describe("cancelCount touches no stock", () => {
  it("cancels without any adjustment", async () => {
    h.sessions = [{ id: "sess1", reference: "CNT-2026-0001", status: "review" }];
    await cancelCount("sess1", "u1");
    expect(h.sessions[0].status).toBe("cancelled");
    expect(h.adjustCalls).toHaveLength(0);
  });
});

describe("variance summary", () => {
  it("counts over/short and nets qty + value at the cost snapshot", async () => {
    h.lines = [
      { session_id: "sess1", expected_qty: 5, counted_qty: 4, unit_cost_snapshot: 10 }, // -1, -$10
      { session_id: "sess1", expected_qty: 3, counted_qty: 5, unit_cost_snapshot: 20 }, // +2, +$40
      { session_id: "sess1", expected_qty: 2, counted_qty: null, unit_cost_snapshot: 5 }, // uncounted
    ];
    const s = await getCountVarianceSummary("sess1");
    expect(s).toMatchObject({
      total_lines: 3,
      counted_lines: 2,
      uncounted_lines: 1,
      net_variance_qty: 1,
      net_variance_value: 30,
      over_lines: 1,
      short_lines: 1,
    });
  });
});
