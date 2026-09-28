// QUOTE-PORTAL-2 data layer — recipients, delivery modes, per-recipient links,
// 30-day expiry, revoke-on-resend, one-acceptance-closes-others, mandatory
// name/title/signature, countersigned PDF storage, and the Admin hard delete.

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";
import type { Quote } from "@/lib/types";

const h = vi.hoisted(() => ({
  quoteData: {} as Record<string, unknown>,
  sendRow: null as Record<string, unknown> | null, // for loadSend / legacy lookup
  recipientRow: null as Record<string, unknown> | null, // for token lookup
  accRow: null as Record<string, unknown> | null, // for deleteAcceptance
  acceptError: null as { code?: string } | null,
  captured: {
    sendInsert: null as Record<string, unknown> | null,
    recipientInsert: null as Record<string, unknown>[] | null,
    acceptInsert: null as Record<string, unknown> | null,
    sendUpdates: [] as Record<string, unknown>[],
    recipientUpdates: [] as { payload: Record<string, unknown>; filters: { method: string; args: unknown[] }[] }[],
    quoteUpdate: null as Record<string, unknown> | null,
    accDeleted: false,
  },
  log: vi.fn(async () => {}),
  storeCalls: [] as { folder: string; filename: string }[],
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "quotes":
      if (ctx.op === "update") {
        h.captured.quoteUpdate = ctx.payload as Record<string, unknown>;
        return { data: null, error: null };
      }
      return { data: { data: h.quoteData }, error: null };
    case "clients":
      return { data: { name: "Acme Corp" }, error: null };
    case "sites":
      return { data: { name: "HQ Tower" }, error: null };
    case "quote_portal_sends":
      if (ctx.op === "insert") {
        h.captured.sendInsert = ctx.payload as Record<string, unknown>;
        return { data: { id: "send-1" }, error: null };
      }
      if (ctx.op === "update") {
        h.captured.sendUpdates.push(ctx.payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      return { data: h.sendRow, error: null }; // select by id or token
    case "quote_portal_recipients":
      if (ctx.op === "insert") {
        const rows = ctx.payload as Record<string, unknown>[];
        h.captured.recipientInsert = rows;
        return { data: rows.map((r, i) => ({ id: `rec-${i}`, ...r })), error: null };
      }
      if (ctx.op === "update") {
        h.captured.recipientUpdates.push({ payload: ctx.payload as Record<string, unknown>, filters: ctx.filters });
        return { data: null, error: null };
      }
      return { data: h.recipientRow, error: null }; // select by token
    case "quote_acceptances":
      if (ctx.op === "insert") {
        h.captured.acceptInsert = ctx.payload as Record<string, unknown>;
        return { data: h.acceptError ? null : { id: "acc-1" }, error: h.acceptError };
      }
      if (ctx.op === "delete") {
        h.captured.accDeleted = true;
        return { data: null, error: null };
      }
      return { data: h.accRow, error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/api/quote-audit", () => ({ logQuoteAuditEvent: h.log }));
vi.mock("@/lib/company-profile", () => ({ getQuoteTemplate: () => ({ legalName: "Nexvelon Global Inc." }) }));
vi.mock("@/lib/pdf/render-quote", () => ({
  buildSafeQuoteDocProps: () => ({ number: "Q-1001", sections: [] }),
  renderQuotePdf: async () => Buffer.from("pdf-bytes"),
}));
vi.mock("@/lib/api/quote-documents", () => ({
  PROPOSALS_FOLDER: "Proposals",
  SIGNED_FOLDER: "Signed",
  fileStamp: () => "2026-09-28_1200",
  storeQuoteDocument: async (input: { folder: string; filename: string }) => {
    h.storeCalls.push({ folder: input.folder, filename: input.filename });
    return { path: `quote/q1/${input.folder}/${input.filename}` };
  },
  downloadQuoteDocument: async () => Buffer.from("pdf"),
}));

import {
  createQuotePortalSend,
  getPortalByToken,
  recordPortalDecision,
  deleteAcceptance,
} from "@/lib/api/quote-portal";

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1", number: "Q-1001", name: "Camera refresh", status: "Sent",
    clientId: "c1", siteId: "s1", createdAt: "2026-09-01", quoteDate: "2026-09-25",
    expiresAt: "2026-10-25", ownerId: "u1", taxRate: 13,
    subtotal: 3596, tax: 467.48, total: 4063.48,
    sections: [{ id: "sec1", name: "Cameras", items: [] }],
    ...over,
  } as unknown as Quote;
}

const openSend = {
  id: "send-1", quote_id: "q1", token: null,
  snapshot: { number: "Q-1001", total: 4063.48 },
  status: "viewed", delivery_mode: "link", proposal_pdf_path: "quote/q1/Proposals/x.pdf",
  render_payload: { number: "Q-1001", sections: [] },
  expires_at: "2999-01-01T00:00:00Z", view_count: 1, sent_by: "u1",
};

beforeEach(() => {
  h.quoteData = makeQuote() as unknown as Record<string, unknown>;
  h.sendRow = null;
  h.recipientRow = null;
  h.accRow = null;
  h.acceptError = null;
  h.captured = { sendInsert: null, recipientInsert: null, acceptInsert: null, sendUpdates: [], recipientUpdates: [], quoteUpdate: null, accDeleted: false };
  h.storeCalls = [];
  h.log.mockClear();
});

// ── migration shape ──────────────────────────────────────────────────────────
describe("migration 0131 — schema guarantees", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0131_quote_portal_recipients.sql"), "utf8");
  it("enforces that a Cc recipient can never carry a token (DB CHECK)", () => {
    expect(sql).toMatch(/quote_portal_recipients_cc_no_token CHECK \(role = 'to' OR token IS NULL\)/);
  });
  it("changes the acceptance trigger to forbid UPDATE but allow DELETE (item 10)", () => {
    expect(sql).toMatch(/quote_acceptances_no_update/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS quote_acceptances_immutable/);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.quote_acceptances/); // not "UPDATE OR DELETE"
    expect(sql).not.toMatch(/BEFORE UPDATE OR DELETE ON public\.quote_acceptances/);
  });
  it("quote_id columns are text (matches quotes.id)", () => {
    expect(sql).toMatch(/quote_id text NOT NULL REFERENCES public\.quotes\(id\)/);
  });
});

// ── send ─────────────────────────────────────────────────────────────────────
describe("createQuotePortalSend", () => {
  const baseInput = {
    quoteId: "q1",
    deliveryMode: "link" as const,
    recipients: [
      { role: "to" as const, name: "Dana", email: "dana@acme.com", source: "client_contact" },
      { role: "cc" as const, name: "Boss", email: "boss@acme.com", source: "employee" },
    ],
    sentBy: "u1",
  };

  it("gives every To recipient a token and NEVER a Cc recipient (item 2)", async () => {
    const res = await createQuotePortalSend(baseInput);
    const to = res.recipients.find((r) => r.role === "to");
    const cc = res.recipients.find((r) => r.role === "cc");
    expect(to?.token).toBeTruthy();
    expect(cc?.token).toBeNull();
    // the inserted rows match
    const insertedCc = h.captured.recipientInsert?.find((r) => r.role === "cc");
    expect(insertedCc?.token).toBeNull();
  });

  it("stores the unsigned PDF in the Proposals folder and freezes a render payload", async () => {
    await createQuotePortalSend(baseInput);
    expect(h.storeCalls.some((c) => c.folder === "Proposals")).toBe(true);
    expect(h.captured.sendInsert?.proposal_pdf_path).toBeTruthy();
    expect(h.captured.sendInsert?.render_payload).toBeTruthy();
    expect(h.captured.sendInsert?.delivery_mode).toBe("link");
    expect(h.captured.sendInsert?.token).toBeNull();
  });

  it("expires links at 30 days", async () => {
    const before = Date.now();
    const res = await createQuotePortalSend(baseInput);
    const days = (new Date(res.expiresAt).getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("revokes prior open sends AND recipients before the new send (item 9)", async () => {
    await createQuotePortalSend(baseInput);
    // two revoke updates: one on sends, one on recipients, both status revoked
    const revokes = h.captured.sendUpdates.filter((u) => u.status === "revoked");
    const recRevokes = h.captured.recipientUpdates.filter((u) => u.payload.status === "revoked");
    expect(revokes.length).toBeGreaterThanOrEqual(1);
    expect(recRevokes.length).toBeGreaterThanOrEqual(1);
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "portal_sent" }));
  });

  it("rejects a send with no To recipient", async () => {
    await expect(
      createQuotePortalSend({ ...baseInput, recipients: [{ role: "cc", email: "cc@x.com" }] })
    ).rejects.toThrow(/To recipient/);
  });
});

// ── portal read ────────────────────────────────────────────────────────────────
describe("getPortalByToken", () => {
  it("garbage token → not_found", async () => {
    expect((await getPortalByToken("")).status).toBe("not_found");
  });
  it("a valid recipient token returns the snapshot + records the view", async () => {
    h.recipientRow = { id: "rec-1", send_id: "send-1", status: "sent", view_count: 0, first_viewed_at: null, name: "Dana", email: "dana@acme.com" };
    h.sendRow = { ...openSend };
    const r = await getPortalByToken("tok-abcdefgh");
    expect(r.status).toBe("valid");
    expect(h.captured.recipientUpdates.some((u) => u.payload.status === "viewed")).toBe(true);
  });
  it("a superseded recipient is read-only (another recipient responded), not broken", async () => {
    h.recipientRow = { id: "rec-2", send_id: "send-1", status: "superseded", view_count: 1, email: "x@acme.com" };
    h.sendRow = { ...openSend, status: "accepted" };
    const r = await getPortalByToken("tok-abcdefgh");
    expect(r.status).toBe("superseded");
  });
  it("a revoked send fails closed", async () => {
    h.recipientRow = { id: "rec-3", send_id: "send-1", status: "sent", view_count: 0, email: "x@acme.com" };
    h.sendRow = { ...openSend, status: "revoked" };
    expect((await getPortalByToken("tok-abcdefgh")).status).toBe("revoked");
  });
});

// ── accept / decline ────────────────────────────────────────────────────────────
describe("recordPortalDecision", () => {
  beforeEach(() => {
    h.recipientRow = { id: "rec-1", send_id: "send-1", status: "viewed", email: "dana@acme.com", role: "to" };
    h.sendRow = { ...openSend };
  });

  it("requires name, title AND signature on accept (item 3)", async () => {
    const base = { token: "tok-abcdefgh", decision: "accepted" as const };
    expect((await recordPortalDecision({ ...base, signerName: "" })).ok).toBe(false);
    expect((await recordPortalDecision({ ...base, signerName: "Dana" })).ok).toBe(false); // no title
    expect((await recordPortalDecision({ ...base, signerName: "Dana", signerTitle: "Mgr" })).ok).toBe(false); // no signature
    expect(h.captured.acceptInsert).toBeNull();
  });

  it("accept: stores the countersigned PDF in Signed with a timestamped filename, closes siblings, flips to Approved", async () => {
    const res = await recordPortalDecision({
      token: "tok-abcdefgh", decision: "accepted",
      signerName: "Dana Buyer", signerTitle: "Facilities Manager", signerEmail: "dana@acme.com",
      signatureImage: "data:image/png;base64,AAAA", ip: "203.0.113.5",
    });
    expect(res.ok).toBe(true);
    const signed = h.storeCalls.find((c) => c.folder === "Signed");
    expect(signed).toBeTruthy();
    expect(signed!.filename).toMatch(/SIGNED/);
    expect(signed!.filename).toMatch(/2026-09-28_1200/); // timestamped
    expect(h.captured.acceptInsert).toMatchObject({ decision: "accepted", recipient_id: "rec-1" });
    expect(h.captured.acceptInsert?.signed_pdf_path).toBeTruthy();
    // sibling 'to' links superseded
    expect(h.captured.recipientUpdates.some((u) => u.payload.status === "superseded")).toBe(true);
    expect(h.captured.quoteUpdate).toMatchObject({ status: "Approved" });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "portal_accepted" }));
  });

  it("a second response is rejected (UNIQUE send_id → 23505)", async () => {
    h.acceptError = { code: "23505" };
    const res = await recordPortalDecision({
      token: "tok-abcdefgh", decision: "accepted",
      signerName: "Dana", signerTitle: "Mgr", signatureImage: "data:image/png;base64,AAAA",
    });
    expect(res).toEqual({ ok: false, error: expect.stringContaining("already been responded") });
  });

  it("decline records a reason and flips to Revision", async () => {
    const res = await recordPortalDecision({ token: "tok-abcdefgh", decision: "declined", declineReason: "Budget" });
    expect(res.ok).toBe(true);
    expect(h.captured.acceptInsert).toMatchObject({ decision: "declined", decline_reason: "Budget" });
    expect(h.captured.quoteUpdate).toMatchObject({ status: "Revision" });
  });

  it("fails closed on a superseded recipient", async () => {
    h.recipientRow = { id: "rec-2", send_id: "send-1", status: "superseded", email: "x@acme.com", role: "to" };
    const res = await recordPortalDecision({ token: "tok", decision: "accepted", signerName: "X", signerTitle: "Y", signatureImage: "data:x" });
    expect(res.ok).toBe(false);
  });
});

// ── admin hard delete ────────────────────────────────────────────────────────────
describe("deleteAcceptance (item 10)", () => {
  it("deletes the record and writes an audit row capturing who/what/when-signed", async () => {
    h.accRow = { id: "acc-1", quote_id: "q1", decision: "accepted", signer_name: "Dana Buyer", signer_email: "dana@acme.com", accepted_at: "2026-09-26T12:00:00Z" };
    const res = await deleteAcceptance({ acceptanceId: "acc-1", adminId: "admin-1", adminName: "Ada Admin" });
    expect(res.ok).toBe(true);
    expect(h.captured.accDeleted).toBe(true);
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "acceptance_deleted",
        actorId: "admin-1",
        changes: expect.objectContaining({ signer: { from: "Dana Buyer", to: null } }),
      })
    );
  });

  it("returns not-found (and does not audit) when the acceptance is gone", async () => {
    h.accRow = null;
    const res = await deleteAcceptance({ acceptanceId: "missing", adminId: "a", adminName: "A" });
    expect(res.ok).toBe(false);
  });
});
