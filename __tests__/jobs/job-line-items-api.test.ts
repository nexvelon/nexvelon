// PROJ2-6a — lib/api/job-line-items DB helpers against the chainable Supabase
// mock. Verifies sort_order defaulting, quoted_* immutability, the reorder
// batch, and the convert-time copy (quoted snapshot + CC-by-name resolution).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  maxSort: 4 as number, // nextSortOrder reads this as the current MAX
  insert: null as Record<string, unknown> | null,
  inserts: null as Record<string, unknown>[] | null,
  update: null as Record<string, unknown> | null,
  updates: [] as Array<{ payload: Record<string, unknown> }>,
  deleted: false,
  ccRows: [] as Record<string, unknown>[],
  quote: null as unknown,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "job_line_items":
      if (ctx.op === "select") {
        // nextSortOrder: newest sort_order first, limit 1.
        return { data: [{ sort_order: s.maxSort }], error: null };
      }
      if (ctx.op === "insert") {
        if (Array.isArray(ctx.payload)) {
          s.inserts = ctx.payload as Record<string, unknown>[];
          return { data: null, error: null }; // bulk insert (copy) — awaited
        }
        s.insert = ctx.payload as Record<string, unknown>;
        return {
          data: { id: "li-new", ...(ctx.payload as object) },
          error: null,
        };
      }
      if (ctx.op === "update") {
        s.update = ctx.payload as Record<string, unknown>;
        s.updates.push({ payload: ctx.payload as Record<string, unknown> });
        return { data: null, error: null };
      }
      if (ctx.op === "delete") {
        s.deleted = true;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    case "project_cost_centers":
      return { data: s.ccRows, error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/quotes", () => ({ getQuoteById: async () => s.quote }));

import {
  createLineItem,
  updateLineItem,
  deleteLineItem,
  reorderLineItems,
  copyQuoteSectionsToJob,
} from "@/lib/api/job-line-items";

beforeEach(() => {
  s.maxSort = 4;
  s.insert = null;
  s.inserts = null;
  s.update = null;
  s.updates = [];
  s.deleted = false;
  s.ccRows = [];
  s.quote = null;
});

describe("createLineItem", () => {
  it("defaults sort_order to MAX+1 and sets no quoted_* snapshot", async () => {
    await createLineItem({
      jobId: "j1",
      costCenterId: "cc1",
      lineKind: "part",
      itemCode: "SKU-1",
      description: "Widget",
      category: "Materials",
      quantity: 3,
      unitCost: 10,
      unitPrice: 20,
      discountPct: 0,
      taxable: true,
      actorId: "u1",
    });
    expect(s.insert).toMatchObject({
      job_id: "j1",
      cost_center_id: "cc1",
      line_kind: "part",
      sort_order: 5, // MAX(4) + 1
    });
    // Manual line → no snapshot columns present.
    expect(s.insert).not.toHaveProperty("quoted_quantity");
    expect(s.insert).not.toHaveProperty("quoted_unit_cost");
    expect(s.insert).not.toHaveProperty("quoted_unit_price");
  });

  it("honours an explicit sortOrder", async () => {
    await createLineItem({
      jobId: "j1",
      costCenterId: null,
      lineKind: "labour",
      itemCode: null,
      description: "Labour",
      category: null,
      quantity: 8,
      unitCost: 87,
      unitPrice: 145,
      discountPct: 0,
      taxable: true,
      sortOrder: 99,
      actorId: "u1",
    });
    expect(s.insert).toMatchObject({ sort_order: 99, line_kind: "labour" });
  });
});

describe("updateLineItem", () => {
  it("never writes quoted_* even if the patch includes them (§2.2)", async () => {
    await updateLineItem({
      id: "li1",
      // quoted_* keys are not part of UpdateLineItemPatch — cast to smuggle them.
      patch: {
        quantity: 7,
        quoted_quantity: 999,
        quoted_unit_cost: 999,
      } as unknown as Parameters<typeof updateLineItem>[0]["patch"],
      actorId: "u1",
    });
    expect(s.update).toMatchObject({ quantity: 7, updated_by: "u1" });
    expect(s.update).not.toHaveProperty("quoted_quantity");
    expect(s.update).not.toHaveProperty("quoted_unit_cost");
  });

  it("maps camelCase patch keys to snake_case columns", async () => {
    await updateLineItem({
      id: "li1",
      patch: { unitCost: 12, unitPrice: 25, discountPct: 5, costCenterId: "cc2" },
      actorId: "u1",
    });
    expect(s.update).toMatchObject({
      unit_cost: 12,
      unit_price: 25,
      discount_pct: 5,
      cost_center_id: "cc2",
    });
  });

  it("empty patch → no write", async () => {
    await updateLineItem({ id: "li1", patch: {}, actorId: "u1" });
    expect(s.update).toBeNull();
  });
});

describe("deleteLineItem", () => {
  it("hard-deletes the row", async () => {
    await deleteLineItem("li1");
    expect(s.deleted).toBe(true);
  });
});

describe("reorderLineItems", () => {
  it("writes sort_order by index for each id", async () => {
    await reorderLineItems({ orderedIds: ["a", "b", "c"], actorId: "u1" });
    expect(s.updates.map((u) => u.payload.sort_order)).toEqual([0, 1, 2]);
  });
});

describe("copyQuoteSectionsToJob", () => {
  it("inserts one row per part + labour with quoted_* == current, CC by name", async () => {
    s.ccRows = [
      { id: "cc-A", name: "Cameras", sort_order: 0 },
      { id: "cc-B", name: "Labour", sort_order: 1 },
    ];
    s.quote = {
      id: "q1",
      sections: [
        {
          id: "s1",
          name: "Cameras",
          items: [
            {
              id: "li1",
              type: "product",
              name: "Dome cam",
              description: "4MP",
              classification: "Materials",
              sku: "CAM-4",
              qty: 2,
              unitCost: 100,
              unitPrice: 180,
              margin: 44,
            },
          ],
        },
        {
          id: "s2",
          name: "Labour",
          items: [
            {
              id: "li2",
              type: "labor",
              name: "",
              description: "Install",
              classification: "Technician Labour",
              qty: 8,
              unitCost: 87,
              unitPrice: 145,
              margin: 40,
              labour: { hours: 8, sellRate: 145 },
            },
          ],
        },
      ],
    };

    const { inserted } = await copyQuoteSectionsToJob({
      jobId: "job1",
      quoteId: "q1",
      actorId: "u1",
    });

    expect(inserted).toBe(2);
    expect(s.inserts).toHaveLength(2);

    const part = s.inserts![0];
    expect(part).toMatchObject({
      job_id: "job1",
      cost_center_id: "cc-A", // resolved by section name "Cameras"
      line_kind: "part",
      item_code: "CAM-4",
      description: "Dome cam",
      quantity: 2,
      unit_cost: 100,
      unit_price: 180,
      quoted_quantity: 2, // snapshot == current
      quoted_unit_cost: 100,
      quoted_unit_price: 180,
      sort_order: 0,
    });

    const labour = s.inserts![1];
    expect(labour).toMatchObject({
      cost_center_id: "cc-B",
      line_kind: "labour",
      item_code: null, // labour never carries a code
      description: "Install",
      quantity: 8,
      unit_cost: 87,
      unit_price: 145,
      quoted_unit_price: 145,
      sort_order: 1,
    });
  });

  it("no sections → inserts nothing", async () => {
    s.quote = { id: "q1", sections: [] };
    const { inserted } = await copyQuoteSectionsToJob({
      jobId: "job1",
      quoteId: "q1",
      actorId: "u1",
    });
    expect(inserted).toBe(0);
    expect(s.inserts).toBeNull();
  });
});
