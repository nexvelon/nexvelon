// SUB-5 — the work-order API. The point of the chunk: issueAgreement enforces
// the compliance hard-block SERVER-SIDE (even called directly, not via the UI),
// the happy path renders + uploads a PDF and flips to issued, a failed email
// does NOT roll back the issue (§2.8), and an issued work order is a snapshot
// (no more edits). Plus number minting + status-transition guards.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  agreement: null as Record<string, unknown> | null,
  project: { opco: "integrated_solutions" } as Record<string, unknown> | null,
  rpcValue: "WO-10000",
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  sub: {
    id: "sub1",
    name: "Ace Electric",
    status: "active",
    email: "ace@example.com",
    contact_name: "Al",
    address_line1: null,
    address_line2: null,
    city: null,
    province: null,
    postal_code: null,
    country: null,
  } as Record<string, unknown> | null,
  docs: [
    { doc_type: "wsib_clearance", expiry_date: "2099-01-01" },
    { doc_type: "liability_insurance", expiry_date: "2099-01-01" },
  ] as { doc_type: string; expiry_date: string | null }[],
  renderPdf: vi.fn(async () => Buffer.from("PDF")),
  uploadPdf: vi.fn(async () => ({ path: "wo1/WO-10000_1.pdf", signedUrl: null })),
  signPdf: vi.fn(async () => "https://signed/wo"),
  sendEmail: vi.fn(async () => ({ id: "email-1" })),
  logActivity: vi.fn(async () => {}),
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "sub_agreements") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      h.inserts.push(p);
      return { data: { id: "wo1", ...p }, error: null };
    }
    if (ctx.op === "update") {
      const p = ctx.payload as Record<string, unknown>;
      h.updates.push(p);
      h.agreement = { ...(h.agreement ?? {}), ...p };
      return { data: h.agreement, error: null };
    }
    return { data: h.agreement, error: null };
  }
  if (ctx.table === "projects") return { data: h.project, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    ...makeSupabaseMock(resolve),
    rpc: async () => ({ data: h.rpcValue, error: null }),
  }),
}));
vi.mock("@/lib/api/subcontractors", () => ({
  getSubcontractorById: async () => h.sub,
}));
vi.mock("@/lib/api/subcontractor-compliance", () => ({
  listComplianceDocs: async () => h.docs,
}));
vi.mock("@/lib/pdf/render-work-order", () => ({ renderWorkOrderPdf: h.renderPdf }));
vi.mock("@/lib/storage/work-order-pdfs", () => ({
  uploadWorkOrderPdf: h.uploadPdf,
  signWorkOrderPdf: h.signPdf,
}));
vi.mock("@/lib/auth/email", () => ({ sendWorkOrderEmail: h.sendEmail }));
vi.mock("@/lib/settings/po-sender", () => ({ getPoSenderFrom: async () => "po@nexvelon.com" }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));

import {
  createAgreement,
  updateAgreement,
  issueAgreement,
  setAgreementStatus,
} from "@/lib/api/sub-agreements";

// A joined agreement row as getAgreementById would see it.
function seedAgreement(over: Record<string, unknown> = {}) {
  h.agreement = {
    id: "wo1",
    agreement_number: "WO-10000",
    subcontractor_id: "sub1",
    project_id: "p1",
    job_id: null,
    title: "Rough-in",
    scope_of_work: "Do the rough-in",
    agreed_value: 5000,
    start_date: null,
    target_completion: null,
    status: "draft",
    issued_at: null,
    issued_by: null,
    sent_to_email: null,
    pdf_path: null,
    notes: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    subcontractor: { name: "Ace Electric" },
    project: { project_number: "P-001", title: "Tower", opco: "integrated_solutions" },
    job: null,
    ...over,
  };
}

beforeEach(() => {
  h.updates = [];
  h.inserts = [];
  h.rpcValue = "WO-10000";
  h.sub = {
    id: "sub1", name: "Ace Electric", status: "active", email: "ace@example.com",
    contact_name: "Al", address_line1: null, address_line2: null, city: null,
    province: null, postal_code: null, country: null,
  };
  h.docs = [
    { doc_type: "wsib_clearance", expiry_date: "2099-01-01" },
    { doc_type: "liability_insurance", expiry_date: "2099-01-01" },
  ];
  h.renderPdf.mockClear();
  h.uploadPdf.mockClear();
  h.sendEmail.mockClear();
  h.logActivity.mockClear();
  h.sendEmail.mockImplementation(async () => ({ id: "email-1" }));
  seedAgreement();
});

describe("createAgreement", () => {
  it("mints a WO number via the RPC and starts as draft", async () => {
    h.rpcValue = "WO-10007";
    const row = await createAgreement({ subcontractorId: "sub1", title: "Install" });
    expect(h.inserts[0]).toMatchObject({
      agreement_number: "WO-10007",
      status: "draft",
      subcontractor_id: "sub1",
      title: "Install",
    });
    expect(row.agreement_number).toBe("WO-10007");
  });
});

describe("issueAgreement — the compliance hard block (server-side)", () => {
  it("blocks issue when a required doc is missing, even called directly", async () => {
    h.docs = [{ doc_type: "liability_insurance", expiry_date: "2099-01-01" }]; // no WSIB
    const res = await issueAgreement({ id: "wo1", sendEmail: false });
    expect(res.ok).toBe(false);
    if (!res.ok && "reasons" in res) {
      expect(res.error).toBe("compliance_block");
      expect(res.reasons.join(" ")).toMatch(/WSIB/i);
    } else {
      throw new Error("expected a compliance_block result");
    }
    // status was NOT flipped
    expect(h.updates).toHaveLength(0);
    expect(h.agreement?.status).toBe("draft");
  });

  it("blocks issue when the sub is inactive", async () => {
    h.sub = { ...(h.sub as object), status: "do_not_use" };
    const res = await issueAgreement({ id: "wo1", sendEmail: false });
    expect(res.ok).toBe(false);
    expect(h.updates).toHaveLength(0);
  });

  it("happy path: renders + uploads the PDF, flips to issued with issued_at", async () => {
    const res = await issueAgreement({ id: "wo1", sendEmail: true, actorId: "u9" });
    expect(res.ok).toBe(true);
    expect(h.renderPdf).toHaveBeenCalledTimes(1);
    expect(h.uploadPdf).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const patch = h.updates.at(-1)!;
    expect(patch).toMatchObject({
      status: "issued",
      issued_by: "u9",
      pdf_path: "wo1/WO-10000_1.pdf",
      sent_to_email: "ace@example.com",
    });
    expect(patch.issued_at).toBeTruthy();
    if (res.ok) expect(res.warning).toBeUndefined();
  });

  it("email failure does NOT roll back the issue (§2.8) — status still issued, warning returned", async () => {
    h.sendEmail.mockImplementationOnce(async () => {
      throw new Error("Resend 500");
    });
    const res = await issueAgreement({ id: "wo1", sendEmail: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warning).toMatch(/Email send failed/i);
    const patch = h.updates.at(-1)!;
    expect(patch.status).toBe("issued");
    // email failed → we do not claim it was sent
    expect(patch.sent_to_email).toBeNull();
  });

  it("refuses to issue a non-draft work order", async () => {
    seedAgreement({ status: "issued" });
    const res = await issueAgreement({ id: "wo1", sendEmail: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/draft/i);
  });
});

describe("updateAgreement — snapshot once issued", () => {
  it("edits a draft", async () => {
    await updateAgreement("wo1", { title: "New title" }, "u1");
    expect(h.updates.at(-1)).toMatchObject({ title: "New title", updated_by: "u1" });
  });

  it("refuses to edit an issued work order ('not_editable')", async () => {
    seedAgreement({ status: "issued" });
    await expect(updateAgreement("wo1", { title: "x" }, "u1")).rejects.toMatchObject({
      code: "not_editable",
    });
  });
});

describe("setAgreementStatus — transition guards", () => {
  it("allows issued → in_progress → completed", async () => {
    seedAgreement({ status: "issued" });
    await setAgreementStatus({ id: "wo1", status: "in_progress" });
    expect(h.updates.at(-1)).toMatchObject({ status: "in_progress" });
    seedAgreement({ status: "in_progress" });
    await setAgreementStatus({ id: "wo1", status: "completed" });
    expect(h.updates.at(-1)).toMatchObject({ status: "completed" });
  });

  it("rejects an invalid jump (completed → in_progress)", async () => {
    seedAgreement({ status: "completed" });
    await expect(
      setAgreementStatus({ id: "wo1", status: "in_progress" })
    ).rejects.toMatchObject({ code: "invalid_status" });
  });

  it("rejects issuing a draft through setAgreementStatus (must use issueAgreement)", async () => {
    seedAgreement({ status: "draft" });
    await expect(
      setAgreementStatus({ id: "wo1", status: "issued" })
    ).rejects.toMatchObject({ code: "invalid_status" });
  });
});
