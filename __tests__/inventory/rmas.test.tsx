import { describe, it, expect, beforeEach, vi } from "vitest";

// INV-4 — unit tests for the RMA data layer + send action gate. No live
// DB/storage/email: @/lib/supabase/server is a chainable client whose terminal
// result is produced by resolve() routed on (table, op, terminal). Vendor
// lookups, PDF render/upload, email, and sender settings are stubbed.
// server-only is aliased to a stub in vitest.config.ts.

const m = vi.hoisted(() => ({
  vendor: null as Record<string, unknown> | null, // vendors table row (supabase)
  vendorRecord: null as Record<string, unknown> | null, // getVendorById (mocked)
  stockRows: [] as unknown[],
  existingRmaNumber: null as string | null,
  rmaHeader: null as Record<string, unknown> | null,
  rmaLines: [] as unknown[],
  profile: null as Record<string, unknown> | null,
  // captured
  insertedHeader: null as Record<string, unknown> | null,
  insertedLines: null as Record<string, unknown>[] | null,
  rmaUpdate: null as Record<string, unknown> | null,
  stockUpdate: null as Record<string, unknown> | null,
  movements: null as Record<string, unknown>[] | null,
}));

type Ctx = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  terminal: "await" | "single" | "maybeSingle";
  usedLike: boolean;
  payload?: unknown;
};

function resolve(ctx: Ctx): { data: unknown; error: unknown } {
  const { table, op, terminal } = ctx;
  if (table === "vendors") return { data: m.vendor, error: null };
  if (table === "inventory_stock") {
    if (op === "update") {
      m.stockUpdate = ctx.payload as Record<string, unknown>;
      return { data: null, error: null };
    }
    return { data: m.stockRows, error: null };
  }
  if (table === "rmas") {
    if (op === "insert") {
      m.insertedHeader = ctx.payload as Record<string, unknown>;
      return { data: { id: "rma-1" }, error: null };
    }
    if (op === "update") {
      m.rmaUpdate = ctx.payload as Record<string, unknown>;
      return { data: null, error: null };
    }
    if (op === "delete") return { data: null, error: null };
    if (terminal === "maybeSingle") return { data: m.rmaHeader, error: null };
    return {
      data: m.existingRmaNumber ? [{ rma_number: m.existingRmaNumber }] : [],
      error: null,
    };
  }
  if (table === "rma_lines") {
    if (op === "insert") {
      m.insertedLines = ctx.payload as Record<string, unknown>[];
      return { data: null, error: null };
    }
    return { data: m.rmaLines, error: null };
  }
  if (table === "stock_movements") {
    if (op === "insert") {
      m.movements = ctx.payload as Record<string, unknown>[];
      return { data: null, error: null };
    }
    return { data: [], error: null };
  }
  return { data: null, error: null };
}

function makeBuilder(ctx: Ctx) {
  const target: Record<string, unknown> = {
    insert: (p: unknown) => {
      ctx.op = "insert";
      ctx.payload = p;
      return proxy;
    },
    update: (p: unknown) => {
      ctx.op = "update";
      ctx.payload = p;
      return proxy;
    },
    delete: () => {
      ctx.op = "delete";
      return proxy;
    },
    like: () => {
      ctx.usedLike = true;
      return proxy;
    },
    single: () => {
      ctx.terminal = "single";
      return Promise.resolve(resolve(ctx));
    },
    maybeSingle: () => {
      ctx.terminal = "maybeSingle";
      return Promise.resolve(resolve(ctx));
    },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(resolve(ctx)).then(res, rej),
  };
  const proxy: Record<string, unknown> = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return () => proxy; // any other chainable filter → self
    },
  });
  return proxy;
}

function makeClient() {
  return {
    from(table: string) {
      const ctx: Ctx = { table, op: "select", terminal: "await", usedLike: false };
      return makeBuilder(ctx);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeClient() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => m.profile }));
vi.mock("@/lib/api/vendors", () => ({
  getVendors: async () => [],
  getVendorById: async () => m.vendorRecord,
}));
vi.mock("@/lib/pdf/render-rma", () => ({
  renderRmaPdf: vi.fn(async () => Buffer.from("%PDF-1.4 fake")),
}));
vi.mock("@/lib/storage/rma-pdfs", () => ({
  uploadRmaPdf: vi.fn(async () => ({ path: "rma-1/x.pdf", signedUrl: "https://signed/rma" })),
}));
vi.mock("@/lib/auth/email", () => ({ sendRmaEmail: vi.fn(async () => ({ id: "email_1" })) }));
vi.mock("@/lib/settings/po-sender", () => ({ getPoSenderFrom: async () => "N <n@x.com>" }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(), computeChanges: vi.fn(() => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createRma, cancelRma, markRmaCredited, buildRmaPdfProps } from "@/lib/api/rmas";
import { sendRmaToVendorAction } from "@/app/(app)/rmas/actions";

function stockRow() {
  return {
    id: "s1",
    product_id: "p1",
    serial_number: "SN-1",
    unit_cost: 50,
    quantity: 1,
    status: "in_stock",
    rma_id: null,
    product: { name: "Axis Cam", sku: "CAM-1" },
  };
}

beforeEach(() => {
  m.vendor = null;
  m.vendorRecord = null;
  m.stockRows = [];
  m.existingRmaNumber = null;
  m.rmaHeader = null;
  m.rmaLines = [];
  m.profile = { id: "u1", role: "Admin", display_name: "Admin", first_name: null, last_name: null, email: "a@b.com" };
  m.insertedHeader = null;
  m.insertedLines = null;
  m.rmaUpdate = null;
  m.stockUpdate = null;
  m.movements = null;
});

describe("createRma", () => {
  it("snapshots lines, stamps stock rma_pending, and totals expected credit", async () => {
    m.vendor = { id: "v1", name: "Acme Supply" };
    m.stockRows = [stockRow()];
    const res = await createRma({
      vendorId: "v1",
      reason: "defective",
      stockLines: [{ stockId: "s1", quantity: 1 }],
    });
    expect(res.rmaId).toBe("rma-1");
    expect(res.rmaNumber).toMatch(/^RMA-\d{4}-0001$/);
    expect(m.insertedHeader).toMatchObject({
      vendor_id: "v1",
      vendor_name: "Acme Supply",
      reason: "defective",
      status: "draft",
      credit_expected_amount: 50,
    });
    expect(m.insertedLines).toHaveLength(1);
    expect(m.insertedLines![0]).toMatchObject({
      stock_id: "s1",
      product_sku: "CAM-1",
      serial_number: "SN-1",
      unit_cost: 50,
      quantity: 1,
      line_no: 1,
    });
    expect(m.stockUpdate).toMatchObject({ rma_status: "rma_pending", rma_id: "rma-1" });
  });

  it("increments the RMA number off the latest this year", async () => {
    const year = new Date().getFullYear();
    m.vendor = { id: "v1", name: "Acme" };
    m.existingRmaNumber = `RMA-${year}-0007`;
    m.stockRows = [stockRow()];
    const res = await createRma({
      vendorId: "v1",
      reason: "warranty",
      stockLines: [{ stockId: "s1", quantity: 1 }],
    });
    expect(res.rmaNumber).toBe(`RMA-${year}-0008`);
  });

  it("rejects a unit already on an RMA", async () => {
    m.vendor = { id: "v1", name: "Acme" };
    m.stockRows = [{ ...stockRow(), rma_id: "other-rma" }];
    await expect(
      createRma({ vendorId: "v1", reason: "defective", stockLines: [{ stockId: "s1", quantity: 1 }] })
    ).rejects.toThrow(/already on an RMA/i);
  });
});

describe("status transitions", () => {
  it("blocks cancel from a shipped RMA", async () => {
    m.rmaHeader = { id: "rma-1", status: "shipped" };
    await expect(cancelRma("rma-1")).rejects.toThrow(/can only cancel/i);
  });

  it("cancelRma reverts stock rma fields for a draft", async () => {
    m.rmaHeader = { id: "rma-1", status: "draft" };
    m.rmaLines = [{ stock_id: "s1", product_id: "p1", quantity: 1 }];
    await cancelRma("rma-1");
    expect(m.rmaUpdate).toMatchObject({ status: "cancelled" });
    expect(m.stockUpdate).toMatchObject({ rma_status: null, rma_id: null });
  });

  it("markRmaCredited retires the returned stock", async () => {
    m.rmaHeader = { id: "rma-1", status: "shipped" };
    m.rmaLines = [{ stock_id: "s1", product_id: "p1", quantity: 1 }];
    await markRmaCredited({ rmaId: "rma-1", creditReceivedAmount: 42 });
    expect(m.rmaUpdate).toMatchObject({
      status: "received_credit",
      credit_received_amount: 42,
    });
    expect(m.stockUpdate).toMatchObject({ rma_status: "rma_credited", status: "retired" });
  });

  it("blocks credit on a non-shipped RMA", async () => {
    m.rmaHeader = { id: "rma-1", status: "draft" };
    await expect(
      markRmaCredited({ rmaId: "rma-1", creditReceivedAmount: 10 })
    ).rejects.toThrow(/only credit a shipped/i);
  });
});

describe("buildRmaPdfProps", () => {
  it("maps header + vendor + lines into document props", async () => {
    m.rmaHeader = {
      id: "rma-1",
      rma_number: "RMA-2026-0001",
      created_at: "2026-07-04T00:00:00Z",
      created_by_name: "Admin",
      vendor_id: "v1",
      vendor_name: "Acme Supply",
      status: "draft",
      reason: "defective",
      reason_detail: "DOA",
      tracking_carrier: null,
      tracking_number: null,
      notes: null,
    };
    m.rmaLines = [
      { line_no: 1, product_sku: "CAM-1", product_name: "Axis Cam", serial_number: "SN-1", quantity: 2, unit_cost: 50 },
    ];
    m.vendor = {
      name: "Acme Supply",
      address_line1: "1 Rd",
      address_line2: null,
      city: "Toronto",
      province: "ON",
      postal_code: "M1M1M1",
      sales_rep_name: "Rep",
    };
    const props = await buildRmaPdfProps("rma-1");
    expect(props.vendor.name).toBe("Acme Supply");
    expect(props.lines).toHaveLength(1);
    expect(props.subtotal).toBe(100); // 2 × 50
    expect(props.opco.legal_name).toBeTruthy();
  });
});

describe("sendRmaToVendorAction", () => {
  it("denies a role without inventory:edit", async () => {
    m.profile = { id: "u1", role: "ViewOnly" };
    const res = await sendRmaToVendorAction("rma-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
  });

  it("errors when the vendor has no email", async () => {
    m.profile = { id: "u1", role: "Admin" };
    m.rmaHeader = { id: "rma-1", status: "draft", vendor_id: "v1", vendor_name: "Acme" };
    m.rmaLines = [];
    m.vendorRecord = { id: "v1", name: "Acme", sales_rep_email: null, email: null, sales_rep_name: null };
    const res = await sendRmaToVendorAction("rma-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/email/i);
  });

  it("sends + transitions to 'sent' when the vendor has an email", async () => {
    m.profile = { id: "u1", role: "Admin" };
    m.rmaHeader = {
      id: "rma-1",
      rma_number: "RMA-2026-0001",
      status: "draft",
      vendor_id: "v1",
      vendor_name: "Acme",
      created_at: "2026-07-04T00:00:00Z",
      created_by_name: "Admin",
      reason: "defective",
      reason_detail: null,
      tracking_carrier: null,
      tracking_number: null,
      notes: null,
    };
    m.rmaLines = [];
    m.vendor = { name: "Acme", address_line1: null, address_line2: null, city: null, province: null, postal_code: null, sales_rep_name: null };
    m.vendorRecord = { id: "v1", name: "Acme", sales_rep_email: "rep@acme.com", email: null, sales_rep_name: "Rep" };
    const res = await sendRmaToVendorAction("rma-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.signedUrl).toBe("https://signed/rma");
    expect(m.rmaUpdate).toMatchObject({ status: "sent", sent_to_email: "rep@acme.com" });
  });
});
