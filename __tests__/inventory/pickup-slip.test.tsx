import { describe, it, expect, beforeEach, vi } from "vitest";

// INV-3 — unit tests for the pickup-slip data layer + the render action gate.
// No live DB/storage: @/lib/supabase/server is mocked with a chainable client
// whose terminal result is produced by a per-test resolve() routed on
// (table, op, terminal). The PDF render + upload are stubbed; getQuoteTemplate
// stays real (pure company-profile data). server-only is aliased to a stub in
// vitest.config.ts, so the real helpers load here.

const m = vi.hoisted(() => ({
  stockRows: [] as unknown[],
  existingSlipNumber: null as string | null,
  slipHeader: null as Record<string, unknown> | null,
  slipLines: [] as unknown[],
  profile: null as { id: string; role: string } | null,
  // captured payloads
  insertedHeader: null as Record<string, unknown> | null,
  insertedLines: null as Record<string, unknown>[] | null,
  updatePayload: null as Record<string, unknown> | null,
  pdfPathUpdate: null as Record<string, unknown> | null,
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
  if (table === "inventory_stock" && op === "select") {
    return { data: m.stockRows, error: null };
  }
  if (table === "pickup_slips") {
    if (op === "insert") {
      m.insertedHeader = ctx.payload as Record<string, unknown>;
      return { data: { id: "slip-1" }, error: null };
    }
    if (op === "update") {
      const p = ctx.payload as Record<string, unknown>;
      if ("pdf_path" in p) m.pdfPathUpdate = p;
      else m.updatePayload = p;
      return { data: null, error: null };
    }
    if (op === "delete") return { data: null, error: null };
    // select: maybeSingle → header (getPickupSlipById); await+like → number list
    if (terminal === "maybeSingle") return { data: m.slipHeader, error: null };
    return {
      data: m.existingSlipNumber ? [{ slip_number: m.existingSlipNumber }] : [],
      error: null,
    };
  }
  if (table === "pickup_slip_lines") {
    if (op === "insert") {
      m.insertedLines = ctx.payload as Record<string, unknown>[];
      return { data: null, error: null };
    }
    return { data: m.slipLines, error: null }; // select (getPickupSlipById lines)
  }
  return { data: null, error: null };
}

function makeClient() {
  return {
    from(table: string) {
      const ctx: Ctx = { table, op: "select", terminal: "await", usedLike: false };
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (payload: unknown) => {
          ctx.op = "insert";
          ctx.payload = payload;
          return b;
        },
        update: (payload: unknown) => {
          ctx.op = "update";
          ctx.payload = payload;
          return b;
        },
        delete: () => {
          ctx.op = "delete";
          return b;
        },
        eq: () => b,
        in: () => b,
        like: () => {
          ctx.usedLike = true;
          return b;
        },
        order: () => b,
        limit: () => b,
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
      return b;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeClient() }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => m.profile,
}));

// PDF render + storage — stubbed (the action's heavy tail).
vi.mock("@/lib/pdf/render-pickup-slip", () => ({
  renderPickupSlipPdf: vi.fn(async () => Buffer.from("%PDF-1.4 fake")),
}));
vi.mock("@/lib/storage/pickup-slip-pdfs", () => ({
  uploadPickupSlipPdf: vi.fn(async () => ({
    path: "slip-1/PS_x.pdf",
    signedUrl: "https://signed/slip",
  })),
}));

// actions.ts sibling imports — stubbed (not exercised here).
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/products", () => ({}));
vi.mock("@/lib/api/purchase-orders", () => ({}));
vi.mock("@/lib/api/inventory-serial-lookup", () => ({ lookupBySerial: vi.fn() }));
vi.mock("@/lib/api/activity-log", () => ({
  computeChanges: vi.fn(() => ({})),
  logActivity: vi.fn(),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({
  deleteAttachmentsForEntity: vi.fn(),
}));
vi.mock("@/lib/auth/email", () => ({ sendLowStockAlert: vi.fn() }));

import {
  createPickupSlip,
  attachSignatureToPickupSlip,
  buildPickupSlipPdfProps,
} from "@/lib/api/pickup-slips";
import { renderPickupSlipPdfAction } from "@/app/(app)/inventory/actions";

function stockRow(id: string, serial: string | null) {
  return {
    id,
    product_id: "prod-1",
    serial_number: serial,
    product: { name: "Axis P3245", sku: "CAM-001" },
  };
}

beforeEach(() => {
  m.stockRows = [];
  m.existingSlipNumber = null;
  m.slipHeader = null;
  m.slipLines = [];
  m.profile = null;
  m.insertedHeader = null;
  m.insertedLines = null;
  m.updatePayload = null;
  m.pdfPathUpdate = null;
});

describe("createPickupSlip", () => {
  it("creates a slip + snapshotted lines from stock", async () => {
    m.stockRows = [stockRow("stock-1", "SN-abc")];
    const res = await createPickupSlip({
      recipientType: "truck",
      recipientId: "loc-1",
      recipientName: "Truck 3 — Ravi",
      stockAssignments: [{ stockId: "stock-1", quantity: 1 }],
    });
    expect(res.slipId).toBe("slip-1");
    expect(m.insertedHeader).toMatchObject({
      recipient_type: "truck",
      recipient_id: "loc-1",
      recipient_name: "Truck 3 — Ravi",
    });
    expect(m.insertedLines).toHaveLength(1);
    expect(m.insertedLines![0]).toMatchObject({
      pickup_slip_id: "slip-1",
      stock_id: "stock-1",
      product_id: "prod-1",
      product_name: "Axis P3245",
      product_sku: "CAM-001",
      serial_number: "SN-abc",
      quantity: 1,
      line_no: 1,
    });
  });

  it("mints the first slip number of the year as PS-YYYY-0001", async () => {
    m.stockRows = [stockRow("stock-1", null)];
    const res = await createPickupSlip({
      recipientType: "truck",
      recipientName: "Truck 3",
      stockAssignments: [{ stockId: "stock-1", quantity: 2 }],
    });
    expect(res.slipNumber).toMatch(/^PS-\d{4}-0001$/);
  });

  it("increments the slip number off the latest this year", async () => {
    const year = new Date().getFullYear();
    m.existingSlipNumber = `PS-${year}-0042`;
    m.stockRows = [stockRow("stock-1", null)];
    const res = await createPickupSlip({
      recipientType: "truck",
      recipientName: "Truck 3",
      stockAssignments: [{ stockId: "stock-1", quantity: 1 }],
    });
    expect(res.slipNumber).toBe(`PS-${year}-0043`);
  });

  it("rejects an empty assignment list", async () => {
    await expect(
      createPickupSlip({
        recipientType: "truck",
        recipientName: "Truck 3",
        stockAssignments: [],
      })
    ).rejects.toThrow(/at least one/i);
  });
});

describe("attachSignatureToPickupSlip", () => {
  it("writes the signature data URL + captured timestamp", async () => {
    await attachSignatureToPickupSlip({
      slipId: "slip-1",
      signatureDataUrl: "data:image/png;base64,AAAA",
    });
    expect(m.updatePayload).toMatchObject({
      signature_data_url: "data:image/png;base64,AAAA",
    });
    expect(m.updatePayload?.signature_captured_at).toBeTruthy();
  });
});

describe("buildPickupSlipPdfProps", () => {
  const baseHeader = {
    slip_number: "PS-2026-0001",
    issued_at: "2026-07-04T00:00:00Z",
    issued_by_name: "Admin User",
    recipient_type: "truck",
    recipient_name: "Truck 3",
    signature_data_url: null,
    signature_captured_at: null,
    notes: null,
  };

  it("maps an unsigned slip (no signature) to props", async () => {
    m.slipHeader = { ...baseHeader };
    m.slipLines = [
      {
        line_no: 1,
        product_sku: "CAM-001",
        product_name: "Axis P3245",
        serial_number: "SN-abc",
        quantity: 1,
      },
    ];
    const props = await buildPickupSlipPdfProps("slip-1");
    expect(props.slip.signature_data_url).toBeNull();
    expect(props.lines).toHaveLength(1);
    expect(props.opco.legal_name).toBeTruthy();
  });

  it("maps a signed slip (signature present) to props", async () => {
    m.slipHeader = {
      ...baseHeader,
      signature_data_url: "data:image/png;base64,AAAA",
      signature_captured_at: "2026-07-04T01:00:00Z",
    };
    m.slipLines = [];
    const props = await buildPickupSlipPdfProps("slip-1");
    expect(props.slip.signature_data_url).toBe("data:image/png;base64,AAAA");
    expect(props.slip.signature_captured_at).toBe("2026-07-04T01:00:00Z");
  });
});

describe("renderPickupSlipPdfAction", () => {
  it("denies a role without inventory:view", async () => {
    m.profile = { id: "u1", role: "Subcontractor" };
    const res = await renderPickupSlipPdfAction("slip-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
  });

  it("renders + returns a signed URL for an inventory-permitted role", async () => {
    m.profile = { id: "u1", role: "Admin" };
    m.slipHeader = {
      slip_number: "PS-2026-0001",
      issued_at: "2026-07-04T00:00:00Z",
      issued_by_name: "Admin User",
      recipient_type: "truck",
      recipient_name: "Truck 3",
      signature_data_url: null,
      signature_captured_at: null,
      notes: null,
    };
    m.slipLines = [];
    const res = await renderPickupSlipPdfAction("slip-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.signedUrl).toBe("https://signed/slip");
      expect(m.pdfPathUpdate).toMatchObject({ pdf_path: "slip-1/PS_x.pdf" });
    }
  });
});
