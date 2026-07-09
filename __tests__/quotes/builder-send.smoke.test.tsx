// QUOTES-5 — smoke coverage for the builder Send-for-Approval hardening.
//
// Two layers, tested where each actually lives:
//  • Fix B (UI gate): the BuilderHeader "Send for Approval" button is disabled
//    unless the quote is a Draft WITH a client AND a site — so handleSend can't
//    fire without them. (handleSend itself lives inside the ~1500-line
//    QuoteBuilder and pulls in the whole builder tree; the button-disabled state
//    is the user-facing guarantee and the right seam to test.)
//  • Fix C (server guard): upsertQuoteAction rejects a Draft→Sent write when the
//    client or site is missing — the belt-and-suspenders boundary that catches
//    any path (old builder button, future callers, crafted payloads).

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Fix C: server-guard mocks (must be declared before importing actions) ─────
const h = vi.hoisted(() => ({
  prior: null as { status: string } | null,
  upsertQuote: vi.fn(async (q: unknown) => q),
}));

vi.mock("@/lib/api/quotes", () => ({
  getQuoteById: async () => h.prior,
  upsertQuote: h.upsertQuote,
  listQuotes: vi.fn(),
  deleteQuote: vi.fn(),
  listProjectsReferencingQuote: vi.fn(async () => []),
}));
vi.mock("@/lib/api/quote-audit", () => ({
  getQuoteAuditEvents: vi.fn(),
  logQuoteAuditEvent: vi.fn(async () => {}),
  deleteQuoteAuditById: vi.fn(),
  deleteAllQuoteAuditForQuote: vi.fn(),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({
  deleteAttachmentsForEntity: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Admin", status: "Active" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));
vi.mock("@/lib/quote-audit-diff", () => ({ diffQuote: () => [] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── Fix B: BuilderHeader role-context mock ────────────────────────────────────
let mockRole = "Admin";
vi.mock("@/lib/role-context", () => ({
  useRole: () => ({ role: mockRole, grants: [] }),
}));

import { upsertQuoteAction } from "@/app/(app)/quotes/actions";
import { BuilderHeader } from "@/components/modules/quotes/builder/BuilderHeader";
import type { Quote } from "@/lib/types";

beforeEach(() => {
  h.prior = null;
  h.upsertQuote.mockClear();
  mockRole = "Admin";
  Element.prototype.scrollIntoView ??= () => {};
});

function makeQuote(overrides: Partial<Quote>): Quote {
  return {
    id: "q-smoke",
    number: "Q-SMOKE-1",
    status: "Sent",
    clientId: "c1",
    siteId: "s1",
    sections: [],
    ...overrides,
  } as unknown as Quote;
}

function renderHeader(props: { hasClient: boolean; hasSite: boolean; onSend?: () => void }) {
  const onSend = props.onSend ?? vi.fn();
  render(
    <BuilderHeader
      number="Q-SMOKE-1"
      status="Draft"
      saving={false}
      disabled={false}
      hasClient={props.hasClient}
      hasSite={props.hasSite}
      quoteDate="2026-07-09"
      onNumberChange={vi.fn()}
      onDateChange={vi.fn()}
      isSaved={false}
      duplicating={false}
      onDuplicate={vi.fn()}
      onSaveDraft={vi.fn()}
      onSend={onSend}
      onApprove={vi.fn()}
      onPreview={vi.fn()}
      onConvert={vi.fn()}
      onCommitStock={vi.fn()}
      onReopen={vi.fn()}
      canReopen={false}
      onRevise={vi.fn()}
      onClose={vi.fn()}
    />
  );
  return { onSend };
}

describe("QUOTES-5 Fix B — Send for Approval button gating", () => {
  it("disables Send when the Draft has no client", () => {
    renderHeader({ hasClient: false, hasSite: true });
    expect(screen.getByRole("button", { name: /send for approval/i })).toBeDisabled();
  });

  it("disables Send when the Draft has no site", () => {
    renderHeader({ hasClient: true, hasSite: false });
    expect(screen.getByRole("button", { name: /send for approval/i })).toBeDisabled();
  });

  it("enables Send and fires onSend when a Draft has both client and site", async () => {
    const { onSend } = renderHeader({ hasClient: true, hasSite: true });
    const btn = screen.getByRole("button", { name: /send for approval/i });
    expect(btn).not.toBeDisabled();
    await userEvent.setup().click(btn);
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

describe("QUOTES-5 Fix C — upsertQuoteAction Draft→Sent guard", () => {
  it("rejects a Draft→Sent write with no client", async () => {
    h.prior = { status: "Draft" };
    const res = await upsertQuoteAction(makeQuote({ status: "Sent", clientId: "", siteId: "s1" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/client and site/i);
    expect(h.upsertQuote).not.toHaveBeenCalled();
  });

  it("rejects a Draft→Sent write with no site", async () => {
    h.prior = { status: "Draft" };
    const res = await upsertQuoteAction(
      makeQuote({ status: "Sent", clientId: "c1", siteId: undefined })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/client and site/i);
    expect(h.upsertQuote).not.toHaveBeenCalled();
  });

  it("allows a Draft→Sent write when client + site are present", async () => {
    h.prior = { status: "Draft" };
    const res = await upsertQuoteAction(makeQuote({ status: "Sent", clientId: "c1", siteId: "s1" }));
    expect(res.ok).toBe(true);
    expect(h.upsertQuote).toHaveBeenCalledTimes(1);
  });

  it("does not block a plain Draft save (no escalation)", async () => {
    h.prior = { status: "Draft" };
    const res = await upsertQuoteAction(makeQuote({ status: "Draft", clientId: "", siteId: undefined }));
    expect(res.ok).toBe(true);
    expect(h.upsertQuote).toHaveBeenCalledTimes(1);
  });
});
