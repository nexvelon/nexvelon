// QUOTE-PORTAL-1 — the client e-acceptance portal's load-bearing guarantees:
//   • the send snapshot NEVER carries an internal figure (cost/margin/notes/tech);
//   • the portal renders the FROZEN snapshot, not the live quote (editing the quote
//     after send can't change what was agreed to);
//   • an invalid / expired / revoked / already-responded token fails CLOSED;
//   • acceptance is append-only and a second response is rejected;
//   • accept → quote Approved, decline → Revision, each logged to the quote audit.

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";
import type { Quote, BuilderLineItem } from "@/lib/types";

const h = vi.hoisted(() => ({
  quoteData: {} as Record<string, unknown>,
  sendRow: null as Record<string, unknown> | null,
  acceptRow: null as Record<string, unknown> | null,
  acceptError: null as { code?: string; message?: string } | null,
  sendInsert: null as Record<string, unknown> | null,
  acceptInsert: null as Record<string, unknown> | null,
  sendUpdates: [] as Array<Record<string, unknown>>,
  quoteUpdate: null as Record<string, unknown> | null,
  log: vi.fn(async () => {}),
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "quotes":
      if (ctx.op === "update") {
        h.quoteUpdate = ctx.payload as Record<string, unknown>;
        return { data: null, error: null };
      }
      return { data: { data: h.quoteData }, error: null };
    case "clients":
      return { data: { name: "Acme Corp" }, error: null };
    case "sites":
      return { data: { name: "HQ Tower" }, error: null };
    case "quote_portal_sends":
      if (ctx.op === "insert") {
        h.sendInsert = ctx.payload as Record<string, unknown>;
        return { data: { id: "send-1" }, error: null };
      }
      if (ctx.op === "update") {
        h.sendUpdates.push(ctx.payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      return { data: h.sendRow, error: null };
    case "quote_acceptances":
      if (ctx.op === "insert") {
        h.acceptInsert = ctx.payload as Record<string, unknown>;
        return { data: h.acceptError ? null : { id: "acc-1" }, error: h.acceptError };
      }
      return { data: h.acceptRow, error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/quote-audit", () => ({ logQuoteAuditEvent: h.log }));
vi.mock("@/lib/company-profile", () => ({
  getQuoteTemplate: () => ({ legalName: "Nexvelon Global Inc." }),
}));

import {
  buildQuoteSnapshot,
  createQuotePortalSend,
  getPortalByToken,
  recordPortalDecision,
  type QuoteSnapshot,
} from "@/lib/api/quote-portal";

// A quote carrying internal figures that must NOT reach the client.
function internalLine(over: Partial<Record<string, unknown>> = {}): BuilderLineItem {
  return {
    id: "li1",
    description: "Axis P3268 dome camera",
    name: "Camera",
    classification: "hardware",
    qty: 4,
    unitPrice: 899,
    sku: "AX-P3268",
    upc: "0730882111",
    masterPartNumber: "MPN-99",
    vendor: "Anixter",
    serialNumber: "SN-1",
    // ── internal — must be absent from any snapshot ──
    unitCost: 512.34,
    margin: 0.43,
    marginPct: 43,
    techName: "Dwayne (internal)",
    stockUnitId: "stk-777",
    committedStockId: "commit-777",
    internalNotes: "buy from grey-market rep, do not tell client",
    ...over,
  } as unknown as BuilderLineItem;
}

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    number: "Q-1001",
    name: "Camera refresh",
    status: "Draft",
    clientId: "c1",
    siteId: "s1",
    quoteDate: "2026-09-25",
    expiresAt: "2026-12-24",
    preparedBy: "Jordan",
    paymentTerms: "Net 30",
    taxRate: 13,
    showUnitPrice: true,
    showSku: true,
    showName: true,
    showDescription: true,
    subtotal: 3596,
    discount: 0,
    discountType: "amount",
    tax: 467.48,
    total: 4063.48,
    terms: "Standard terms apply.",
    sections: [{ id: "sec1", name: "Cameras", items: [internalLine()] }],
    // internal quote-level junk
    internalNotes: "margin is thin here",
    ...over,
  } as unknown as Quote;
}

beforeEach(() => {
  h.quoteData = makeQuote() as unknown as Record<string, unknown>;
  h.sendRow = null;
  h.acceptRow = null;
  h.acceptError = null;
  h.sendInsert = null;
  h.acceptInsert = null;
  h.sendUpdates = [];
  h.quoteUpdate = null;
  h.log.mockClear();
});

// ── Migration schema contract (would have caught the 0129 FK type bug) ──────
// The mocked-DB unit tests below can't catch a wrong SQL column type (uuid vs
// text are both `string` in TS). quotes.id is TEXT (0027) and EVERY column that
// references it is text (project_quotes/projects/project_cost_centers/
// project_jobs; quote_audit_log widened uuid→text in 0040). Assert 0129 matches.
describe("migration 0129 — FK column types match quotes.id (text)", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/0129_quote_portal.sql"),
    "utf8"
  );
  it("both new tables declare quote_id as text referencing quotes(id)", () => {
    const fks = sql.match(/quote_id\s+\w+\s+NOT NULL[^,]*REFERENCES public\.quotes\(id\)/g) ?? [];
    expect(fks.length).toBe(2); // quote_portal_sends + quote_acceptances
    for (const fk of fks) expect(fk).toMatch(/quote_id\s+text\b/);
  });
  it("no column that references quotes(id) is typed uuid", () => {
    expect(sql).not.toMatch(/quote_id\s+uuid[^;]*REFERENCES public\.quotes\(id\)/);
  });
});

// ── The snapshot boundary (the strongest guarantee) ─────────────────────────
describe("buildQuoteSnapshot — no internal figure can cross to the client", () => {
  it("copies only client-safe fields; internal fields are ABSENT, not hidden", () => {
    const snap = buildQuoteSnapshot(makeQuote(), {
      clientName: "Acme Corp",
      siteName: "HQ Tower",
      companyLegalName: "Nexvelon Global Inc.",
    });
    const blob = JSON.stringify(snap).toLowerCase();
    for (const forbidden of [
      "unitcost",
      "margin",
      "marginpct",
      "techname",
      "stockunitid",
      "committedstockid",
      "internalnotes",
      "grey-market",
      "512.34",
    ]) {
      expect(blob).not.toContain(forbidden);
    }
    // …while the safe fields ARE present.
    const line = snap.sections[0].items[0];
    expect(line.unitPrice).toBe(899);
    expect(line.description).toBe("Axis P3268 dome camera");
    expect(snap.total).toBe(4063.48);
    expect(snap.companyLegalName).toBe("Nexvelon Global Inc.");
  });

  it("labour hours/rate only cross when the per-line show flags opt in", () => {
    const withLabour = internalLine({
      labour: { show: { hours: true, rate: false }, hours: 6, sellRate: 120 },
    });
    const snap = buildQuoteSnapshot(
      makeQuote({ sections: [{ id: "s", name: "Install", items: [withLabour] }] as unknown as Quote["sections"] })
    );
    expect(snap.sections[0].items[0].labourHours).toBe(6);
    expect(snap.sections[0].items[0].labourRate).toBeUndefined();
  });
});

// ── Send ────────────────────────────────────────────────────────────────────
describe("createQuotePortalSend", () => {
  it("mints a token, freezes the snapshot, revokes prior open sends, logs portal_sent", async () => {
    const res = await createQuotePortalSend({
      quoteId: "q1",
      recipientEmail: "buyer@acme.com",
      sentBy: "u1",
    });
    expect(res.token).toMatch(/[0-9a-f-]{36}/); // randomUUID
    expect(res.sendId).toBe("send-1");
    // prior open sends were flipped to revoked BEFORE the insert
    expect(h.sendUpdates.some((u) => u.status === "revoked")).toBe(true);
    // the inserted row froze a snapshot with no internal data + a real expiry
    expect(h.sendInsert).toBeTruthy();
    expect(h.sendInsert!.token).toBe(res.token);
    expect(h.sendInsert!.expires_at).toBeTruthy();
    expect(JSON.stringify(h.sendInsert!.snapshot).toLowerCase()).not.toContain("unitcost");
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "portal_sent", quoteId: "q1" })
    );
  });
});

// ── Portal read — fail closed + frozen snapshot ─────────────────────────────
describe("getPortalByToken — fail closed", () => {
  const base = {
    id: "send-1",
    quote_id: "q1",
    token: "tok-abcdefgh",
    snapshot: { number: "Q-1001", total: 4063.48 } as QuoteSnapshot,
    view_count: 0,
    first_viewed_at: null,
    expires_at: "2999-01-01T00:00:00Z",
    status: "sent",
  };

  it("garbage / short token → not_found (reveals nothing)", async () => {
    expect((await getPortalByToken("")).status).toBe("not_found");
    expect((await getPortalByToken("short")).status).toBe("not_found");
  });

  it("unknown token → not_found", async () => {
    h.sendRow = null;
    expect((await getPortalByToken("tok-doesnotexist")).status).toBe("not_found");
  });

  it("revoked token → revoked (not 404, but reveals no quote data)", async () => {
    h.sendRow = { ...base, status: "revoked" };
    const r = await getPortalByToken("tok-abcdefgh");
    expect(r.status).toBe("revoked");
  });

  it("expired-by-date token → expired and self-heals the status", async () => {
    h.sendRow = { ...base, status: "sent", expires_at: "2000-01-01T00:00:00Z" };
    const r = await getPortalByToken("tok-abcdefgh");
    expect(r.status).toBe("expired");
    expect(h.sendUpdates.some((u) => u.status === "expired")).toBe(true);
  });

  it("already accepted → responded (accepted) and does NOT re-count a view", async () => {
    h.sendRow = { ...base, status: "accepted" };
    const r = await getPortalByToken("tok-abcdefgh");
    expect(r.status).toBe("responded");
    if (r.status === "responded") expect(r.decision).toBe("accepted");
    expect(h.sendUpdates).toHaveLength(0);
  });

  it("valid token renders the FROZEN snapshot and records the first view", async () => {
    h.sendRow = { ...base, status: "sent", view_count: 0 };
    const r = await getPortalByToken("tok-abcdefgh");
    expect(r.status).toBe("valid");
    if (r.status === "valid") expect(r.snapshot.number).toBe("Q-1001");
    // view recorded (status → viewed, count incremented) + first-view logged
    expect(h.sendUpdates.some((u) => u.status === "viewed" && u.view_count === 1)).toBe(true);
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "portal_viewed" })
    );
  });

  it("editing the quote after send does not change what the portal shows", async () => {
    // The live quote now says $9,999 — but the frozen snapshot said $4,063.48.
    h.quoteData = makeQuote({ total: 9999, subtotal: 9999 }) as unknown as Record<string, unknown>;
    h.sendRow = { ...base, status: "viewed", view_count: 2 };
    const r = await getPortalByToken("tok-abcdefgh");
    expect(r.status).toBe("valid");
    if (r.status === "valid") expect(r.snapshot.total).toBe(4063.48); // the snapshot, not the live quote
  });
});

// ── Accept / decline — append-only + status transitions ─────────────────────
describe("recordPortalDecision", () => {
  const open = {
    id: "send-1",
    quote_id: "q1",
    token: "tok-abcdefgh",
    snapshot: { number: "Q-1001", total: 4063.48 },
    status: "viewed",
    expires_at: "2999-01-01T00:00:00Z",
  };

  it("accept: writes an append-only acceptance w/ hash, flips quote → Approved, logs", async () => {
    h.sendRow = { ...open };
    const r = await recordPortalDecision({
      token: "tok-abcdefgh",
      decision: "accepted",
      signerName: "Dana Buyer",
      signerTitle: "Facilities Manager",
      signerEmail: "dana@acme.com",
      ip: "203.0.113.5",
      userAgent: "Safari/iPhone",
    });
    expect(r.ok).toBe(true);
    expect(h.acceptInsert).toMatchObject({
      send_id: "send-1",
      quote_id: "q1",
      decision: "accepted",
      signer_name: "Dana Buyer",
      ip: "203.0.113.5",
    });
    expect(typeof h.acceptInsert!.record_hash).toBe("string");
    expect((h.acceptInsert!.record_hash as string).length).toBe(64); // sha256 hex
    expect(h.quoteUpdate).toMatchObject({ status: "Approved" });
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "portal_accepted" })
    );
  });

  it("accept requires a typed signer name", async () => {
    h.sendRow = { ...open };
    const r = await recordPortalDecision({ token: "tok-abcdefgh", decision: "accepted", signerName: "  " });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("name") });
    expect(h.acceptInsert).toBeNull();
  });

  it("decline: records the reason, flips quote → Revision, logs portal_declined", async () => {
    h.sendRow = { ...open };
    const r = await recordPortalDecision({
      token: "tok-abcdefgh",
      decision: "declined",
      declineReason: "Budget moved to next quarter",
    });
    expect(r.ok).toBe(true);
    expect(h.acceptInsert).toMatchObject({ decision: "declined", decline_reason: "Budget moved to next quarter" });
    expect(h.quoteUpdate).toMatchObject({ status: "Revision" });
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "portal_declined" })
    );
  });

  it("a second response on the same token is rejected (UNIQUE send_id → 23505)", async () => {
    h.sendRow = { ...open };
    h.acceptError = { code: "23505", message: "duplicate key" };
    const r = await recordPortalDecision({ token: "tok-abcdefgh", decision: "accepted", signerName: "Dana" });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("already been responded") });
    expect(h.quoteUpdate).toBeNull(); // no status flip on a rejected duplicate
  });

  it("a decision against a revoked token fails closed", async () => {
    h.sendRow = { ...open, status: "revoked" };
    const r = await recordPortalDecision({ token: "tok-abcdefgh", decision: "accepted", signerName: "Dana" });
    expect(r.ok).toBe(false);
    expect(h.acceptInsert).toBeNull();
  });

  it("a decision against an expired token fails closed", async () => {
    h.sendRow = { ...open, expires_at: "2000-01-01T00:00:00Z" };
    const r = await recordPortalDecision({ token: "tok-abcdefgh", decision: "accepted", signerName: "Dana" });
    expect(r.ok).toBe(false);
    expect(h.acceptInsert).toBeNull();
  });
});
