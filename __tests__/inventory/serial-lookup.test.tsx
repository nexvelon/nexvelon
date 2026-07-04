import { describe, it, expect, beforeEach, vi } from "vitest";

// INV-2 — unit tests for serial-number lookup. No live DB: the supabase server
// client is mocked with a chainable thenable that resolves canned rows, routed
// by table name. The action's heavy sibling imports (products / PO / email /
// attachments / activity-log) are stubbed so actions.ts loads under vitest.
//
// server-only is aliased to an empty stub in vitest.config.ts, so the real
// lookup helper (which imports it) loads here.

const m = vi.hoisted(() => ({
  stockRows: [] as unknown[],
  moveRows: [] as unknown[],
  profile: null as { id: string; role: string } | null,
}));

// Chainable, awaitable query builder — every method returns itself; awaiting it
// resolves to the given { data, error }.
function builder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const k of ["select", "not", "ilike", "order", "limit", "in", "eq"]) {
    b[k] = () => b;
  }
  (b as { then: unknown }).then = (res: (v: unknown) => unknown) => res(result);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) =>
      table === "stock_movements"
        ? builder({ data: m.moveRows, error: null })
        : builder({ data: m.stockRows, error: null }),
  }),
}));

vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => m.profile,
}));

// actions.ts sibling imports — stubbed (never exercised by the lookup path).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/products", () => ({}));
vi.mock("@/lib/api/purchase-orders", () => ({}));
vi.mock("@/lib/api/activity-log", () => ({
  computeChanges: vi.fn(() => ({})),
  logActivity: vi.fn(),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({
  deleteAttachmentsForEntity: vi.fn(),
}));
vi.mock("@/lib/auth/email", () => ({ sendLowStockAlert: vi.fn() }));

import { lookupBySerial } from "@/lib/api/inventory-serial-lookup";
import { lookupBySerialAction } from "@/app/(app)/inventory/actions";

function warehouseRow() {
  return {
    id: "stock-1",
    product_id: "prod-1",
    serial_number: "ABC123",
    quantity: 1,
    status: "in_stock",
    custody_status: "in_stock",
    po_number: "PO-0001",
    acquired_at: "2026-01-01T00:00:00Z",
    last_known_label: null,
    current_location_id: "loc-1",
    current_cost_center_id: null,
    product: { name: "Axis P3245", sku: "CAM-001" },
    location: {
      id: "loc-1",
      name: "Main Warehouse",
      location_type: "warehouse",
      holder_name: null,
    },
    cost_center: null,
  };
}

beforeEach(() => {
  m.stockRows = [];
  m.moveRows = [];
  m.profile = null;
});

describe("lookupBySerial", () => {
  it("returns empty for a blank query without hitting the DB", async () => {
    expect(await lookupBySerial("   ")).toEqual([]);
  });

  it("returns empty when no serial matches", async () => {
    m.stockRows = [];
    expect(await lookupBySerial("ZZZ")).toEqual([]);
  });

  it("returns a normalized result with product, location + custody context", async () => {
    m.stockRows = [warehouseRow()];
    m.moveRows = [{ stock_id: "stock-1", created_at: "2026-02-02T00:00:00Z" }];

    const results = await lookupBySerial("ABC");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      stockId: "stock-1",
      serial: "ABC123",
      productId: "prod-1",
      productName: "Axis P3245",
      productSku: "CAM-001",
      quantity: 1,
      status: "in_stock",
      custodyStatus: "in_stock",
      currentLocation: {
        kind: "warehouse",
        id: "loc-1",
        label: "Main Warehouse",
      },
      project: null,
      poNumber: "PO-0001",
      lastMovementAt: "2026-02-02T00:00:00Z",
    });
  });

  it("resolves job/project context when the unit sits on a cost center", async () => {
    m.stockRows = [
      {
        ...warehouseRow(),
        current_location_id: null,
        current_cost_center_id: "cc-1",
        location: null,
        cost_center: {
          id: "cc-1",
          cc_number: "CC-9",
          name: "Cameras",
          project: {
            id: "proj-1",
            project_number: "P-2026-010",
            title: "Downtown Retrofit",
            client: { id: "cl-1", name: "Acme Corp" },
          },
        },
      },
    ];

    const [r] = await lookupBySerial("ABC");
    expect(r.currentLocation).toEqual({
      kind: "job",
      id: "cc-1",
      label: "P-2026-010 — Cameras",
    });
    expect(r.project).toEqual({
      id: "proj-1",
      label: "Downtown Retrofit",
      clientName: "Acme Corp",
    });
  });
});

describe("lookupBySerialAction", () => {
  it("denies a role without inventory:view", async () => {
    m.profile = { id: "u1", role: "Subcontractor" };
    const res = await lookupBySerialAction("ABC123");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
  });

  it("allows an inventory-permitted role and returns results", async () => {
    m.profile = { id: "u1", role: "Admin" };
    m.stockRows = [warehouseRow()];
    m.moveRows = [];
    const res = await lookupBySerialAction("ABC");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].serial).toBe("ABC123");
    }
  });
});
