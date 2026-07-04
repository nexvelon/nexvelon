import { describe, it, expect, vi, beforeEach } from "vitest";

// PO-4 — unit tests for the issue flow. No live DB, Resend, or Storage: the
// lowest-level deps (@react-pdf/renderer, resend, supabase admin) plus the
// data-layer modules the action calls are all mocked. vi.hoisted exposes the
// mock fns to the hoisted vi.mock factories.
const m = vi.hoisted(() => ({
  renderToBuffer: vi.fn(async () => Buffer.from("%PDF-1.4 fake")),
  resendSend: vi.fn(async () => ({ data: { id: "email_123" }, error: null })),
  storageUpload: vi.fn(async () => ({ error: null })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/x" } })),
  // action data-layer deps
  getPurchaseOrderById: vi.fn(),
  setPurchaseOrderStatus: vi.fn(async () => ({})),
  stampPurchaseOrder: vi.fn(async () => {}),
  buildPurchaseOrderPdfProps: vi.fn(),
  getVendorById: vi.fn(),
  getCurrentProfile: vi.fn(async () => ({ id: "u1", role: "Admin", status: "Active" })),
  logActivity: vi.fn(async () => {}),
  getPoSenderFrom: vi.fn(async () => "Nexvelon Integrated Solutions <ceo@nexvelonglobal.com>"),
}));

// (server-only is aliased to an empty stub in vitest.config.ts so the real
// render-po / po-pdfs helpers load under vitest.)

// --- lowest-level deps used by the real helpers under test ---
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: m.renderToBuffer,
  Font: { register: vi.fn() },
  StyleSheet: { create: (s: unknown) => s },
  Document: (p: { children?: unknown }) => p.children,
  Page: (p: { children?: unknown }) => p.children,
  View: (p: { children?: unknown }) => p.children,
  Text: (p: { children?: unknown }) => p.children,
}));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: m.resendSend } })),
}));

// Isolate render-po from the actual document component (its render is exercised
// via the PO-2 preview pane, not here).
vi.mock("@/components/modules/purchase-orders/PurchaseOrderDocument", () => ({
  PurchaseOrderDocument: vi.fn(() => null),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({ upload: m.storageUpload, createSignedUrl: m.createSignedUrl }),
    },
  }),
}));

// --- data-layer deps the action calls ---
vi.mock("@/lib/api/purchase-orders", () => ({
  getPurchaseOrderById: m.getPurchaseOrderById,
  setPurchaseOrderStatus: m.setPurchaseOrderStatus,
  stampPurchaseOrder: m.stampPurchaseOrder,
  buildPurchaseOrderPdfProps: m.buildPurchaseOrderPdfProps,
  // Other named exports the action file imports (unused here).
  createPurchaseOrder: vi.fn(),
  deletePurchaseOrder: vi.fn(),
  getLastVendorIdForProduct: vi.fn(),
  getPurchaseOrders: vi.fn(),
  receivePurchaseOrderLines: vi.fn(),
  updatePurchaseOrder: vi.fn(),
}));
vi.mock("@/lib/api/vendors", () => ({ getVendorById: m.getVendorById }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: m.getCurrentProfile }));
vi.mock("@/lib/api/activity-log", () => ({
  logActivity: m.logActivity,
  computeChanges: vi.fn(() => ({})),
}));
vi.mock("@/lib/settings/po-sender", () => ({ getPoSenderFrom: m.getPoSenderFrom }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { renderPurchaseOrderPdf } from "@/lib/pdf/render-po";
import { sendPurchaseOrderEmail } from "@/lib/auth/email";
import { uploadPoPdf } from "@/lib/storage/po-pdfs";
import { issuePurchaseOrderAction } from "@/app/(app)/purchase-orders/actions";
import type { PurchaseOrderDocumentProps } from "@/components/modules/purchase-orders/PurchaseOrderDocument";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  m.getCurrentProfile.mockResolvedValue({ id: "u1", role: "Admin", status: "Active" });
  m.setPurchaseOrderStatus.mockResolvedValue({});
});

const draftPo = {
  header: { id: "po1", po_number: "PO-2026-0001", status: "draft", vendor_id: "v1" },
  lines: [{ line_no: 1, quantity: 2, unit_cost: 10 }],
};

describe("renderPurchaseOrderPdf", () => {
  it("returns a Buffer via @react-pdf/renderer", async () => {
    const buf = await renderPurchaseOrderPdf({} as unknown as PurchaseOrderDocumentProps);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(m.renderToBuffer).toHaveBeenCalledTimes(1);
  });
});

describe("sendPurchaseOrderEmail", () => {
  it("calls resend.emails.send with the right from/to/subject + PDF attachment", async () => {
    const res = await sendPurchaseOrderEmail({
      to: "rep@vendor.com",
      from: "Nexvelon <ceo@nexvelonglobal.com>",
      poNumber: "PO-2026-0001",
      vendorName: "Acme Supply",
      salesRepName: "Jane Rep",
      pdfBuffer: Buffer.from("pdf"),
      pdfFilename: "PO_PO-2026-0001.pdf",
    });
    expect(res.id).toBe("email_123");
    expect(m.resendSend).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arg = (m.resendSend.mock.calls[0] as unknown[])[0] as any;
    expect(arg.from).toBe("Nexvelon <ceo@nexvelonglobal.com>");
    expect(arg.to).toBe("rep@vendor.com");
    expect(arg.subject).toContain("PO-2026-0001");
    expect(arg.attachments[0].filename).toBe("PO_PO-2026-0001.pdf");
    expect(Buffer.isBuffer(arg.attachments[0].content)).toBe(true);
  });
});

describe("uploadPoPdf", () => {
  it("uploads to the purchase-order-pdfs bucket under the PO id, returns a signed URL", async () => {
    const out = await uploadPoPdf("po1", "PO 2026/0001", Buffer.from("pdf"));
    expect(m.storageUpload).toHaveBeenCalledTimes(1);
    const [path, buffer, opts] = m.storageUpload.mock.calls[0] as unknown as [
      string,
      Buffer,
      { contentType?: string; upsert?: boolean },
    ];
    expect(path).toMatch(/^po1\//); // namespaced by PO id
    expect(path).toMatch(/PO_2026_0001_\d+\.pdf$/); // sanitized number + ts
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(opts.contentType).toBe("application/pdf");
    expect(out.signedUrl).toBe("https://signed/x");
  });
});

describe("issuePurchaseOrderAction", () => {
  it("returns an error and makes NO state change when the vendor has no email", async () => {
    m.getPurchaseOrderById.mockResolvedValue(draftPo);
    m.getVendorById.mockResolvedValue({
      id: "v1",
      name: "Acme",
      email: null,
      sales_rep_email: null,
      sales_rep_name: null,
    });

    const res = await issuePurchaseOrderAction("po1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/email/i);
    expect(m.setPurchaseOrderStatus).not.toHaveBeenCalled(); // no side effects
  });

  it("still issues (with a warning) when the PDF pipeline fails", async () => {
    m.getPurchaseOrderById.mockResolvedValue(draftPo);
    m.getVendorById.mockResolvedValue({
      id: "v1",
      name: "Acme",
      email: "orders@acme.com",
      sales_rep_email: null,
      sales_rep_name: null,
    });
    // Force the best-effort artifact pipeline to fail.
    m.buildPurchaseOrderPdfProps.mockRejectedValue(new Error("boom"));

    const res = await issuePurchaseOrderAction("po1");
    expect(res.ok).toBe(true);
    // status flip is the atomic commit — it happened, with issued_at stamped.
    expect(m.setPurchaseOrderStatus).toHaveBeenCalledWith(
      "po1",
      "issued",
      expect.objectContaining({ issued_at: expect.any(String) })
    );
    if (res.ok) expect(res.warning).toMatch(/PDF render failed/);
    // audit event still written
    expect(m.logActivity).toHaveBeenCalledWith(
      "purchase_order",
      "po1",
      "update",
      expect.anything()
    );
  });
});
