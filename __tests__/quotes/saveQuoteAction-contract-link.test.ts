// RECUR-2 — the quote → contract link is SERVER-OWNED. A builder save can't forge
// or erase it, a converted quote stays Converted, and no path other than the
// conversion action can mark a service-contract quote Converted (which would lock
// it with no contract behind it — monitored, never billed). Also: an incomplete
// service-contract quote can't be sent for signature.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  prior: null as Record<string, unknown> | null,
  upsertQuote: vi.fn(async (q: unknown) => q),
}));

vi.mock("@/lib/api/quotes", () => ({
  getQuoteById: async () => h.prior,
  upsertQuote: h.upsertQuote,
  listQuotes: vi.fn(),
  listProjectsReferencingQuote: vi.fn(),
  deleteQuote: vi.fn(),
}));
vi.mock("@/lib/api/projects", () => ({ getProjectRow: async () => null }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Admin", status: "Active", email: "u1@x.co" }),
}));
vi.mock("@/lib/api/quote-audit", () => ({
  logQuoteAuditEvent: vi.fn(async () => {}),
  getQuoteAuditEvents: vi.fn(),
  deleteQuoteAuditById: vi.fn(),
  deleteAllQuoteAuditForQuote: vi.fn(),
}));
vi.mock("@/lib/api/clients", () => ({ getClients: vi.fn(), getSitesByClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "u1@x.co" } } }) },
  }),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachmentsForEntity: vi.fn() }));
vi.mock("@/lib/quote-audit-diff", () => ({ diffQuote: () => [] }));
vi.mock("@/lib/quotes/picker-adapters", () => ({ adaptClient: vi.fn(), adaptSite: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { upsertQuoteAction, sendQuotePortalAction } from "@/app/(app)/quotes/actions";
import type { Quote } from "@/lib/types";

const quote = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    number: "Q-10500",
    clientId: "c1",
    siteId: "s1",
    status: "Approved",
    total: 0,
    intendedTargetKind: "service_contract",
    ...over,
  }) as unknown as Quote;

const saved = () => h.upsertQuote.mock.calls.at(-1)?.[0] as Quote;

beforeEach(() => {
  h.prior = null;
  h.upsertQuote.mockClear();
});

describe("contract link is server-owned", () => {
  it("a builder save can't forge a contract link", async () => {
    h.prior = quote() as unknown as Record<string, unknown>;
    const res = await upsertQuoteAction(quote({ contractId: "forged" }));
    expect(res.ok).toBe(true);
    expect(saved().contractId).toBeUndefined();
  });

  it("a stale save can't erase an existing link, and the quote stays Converted", async () => {
    h.prior = quote({ status: "Converted", contractId: "con-1" }) as unknown as Record<string, unknown>;
    const res = await upsertQuoteAction(quote({ status: "Approved", contractId: undefined }));
    expect(res.ok).toBe(true);
    expect(saved().contractId).toBe("con-1");
    expect(saved().status).toBe("Converted");
  });

  it("a service-contract quote can't be marked Converted without its contract", async () => {
    h.prior = quote() as unknown as Record<string, unknown>;
    const res = await upsertQuoteAction(quote({ status: "Converted", projectId: "NX-2026-101" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Convert to Contract/);
    expect(h.upsertQuote).not.toHaveBeenCalled();
  });

  it("a service-contract intent never carries a project id", async () => {
    const res = await upsertQuoteAction(quote({ status: "Draft", intendedTargetProjectId: "p1" }));
    expect(res).toEqual({ ok: false, error: "invalid_convert_target" });
  });
});

describe("send gate", () => {
  it("an incomplete service-contract quote can't be sent for signature", async () => {
    h.prior = quote({ status: "Draft", templateSlug: "guardian", serviceContract: {} }) as unknown as Record<
      string,
      unknown
    >;
    const res = await sendQuotePortalAction({
      quoteId: "q1",
      deliveryMode: "link",
      recipients: [{ role: "to", email: "client@acme.co", name: "Client" }],
    } as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/isn't ready to sign.*billing cadence/);
  });
});
