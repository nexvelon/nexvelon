// PROJ2-5 Part 2 — upsertQuoteAction validates the intended conversion target
// BEFORE persisting. A change_order must reference a real project on the quote's
// OWN site and client; new_project / null must carry no project id.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  // getProjectRow returns this (or null). Shape: enough for the cross-check.
  project: { id: "p1", site_id: "s1", client_id: "c1" } as
    | { id: string; site_id: string | null; client_id: string }
    | null,
  upsertQuote: vi.fn(async (q: unknown) => q),
}));

vi.mock("@/lib/api/quotes", () => ({
  getQuoteById: async () => null, // no prior → treated as a first create
  upsertQuote: h.upsertQuote,
  listQuotes: vi.fn(),
  listProjectsReferencingQuote: vi.fn(),
  deleteQuote: vi.fn(),
}));
vi.mock("@/lib/api/projects", () => ({ getProjectRow: async () => h.project }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({
    id: "u1",
    role: "Admin",
    status: "Active",
    email: "u1@x.co",
  }),
}));
vi.mock("@/lib/api/quote-audit", () => ({
  logQuoteAuditEvent: vi.fn(async () => {}),
  getQuoteAuditEvents: vi.fn(),
  deleteQuoteAuditById: vi.fn(),
  deleteAllQuoteAuditForQuote: vi.fn(),
}));
vi.mock("@/lib/api/clients", () => ({
  getClients: vi.fn(),
  getSitesByClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "u1@x.co" } } }) },
  }),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({
  deleteAttachmentsForEntity: vi.fn(),
}));
vi.mock("@/lib/quote-audit-diff", () => ({ diffQuote: () => [] }));
vi.mock("@/lib/quotes/picker-adapters", () => ({
  adaptClient: vi.fn(),
  adaptSite: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { upsertQuoteAction } from "@/app/(app)/quotes/actions";
import type { Quote } from "@/lib/types";

function quote(overrides: Partial<Quote>): Quote {
  return {
    id: "q1",
    number: "2607051200",
    clientId: "c1",
    siteId: "s1",
    status: "Draft",
    total: 0,
    ...overrides,
  } as unknown as Quote;
}

beforeEach(() => {
  h.project = { id: "p1", site_id: "s1", client_id: "c1" };
  h.upsertQuote.mockClear();
});

describe("upsertQuoteAction — intended conversion target", () => {
  it("new_project with no project id → success", async () => {
    const res = await upsertQuoteAction(quote({ intendedTargetKind: "new_project" }));
    expect(res.ok).toBe(true);
    expect(h.upsertQuote).toHaveBeenCalledTimes(1);
  });

  it("kind null (legacy) → success", async () => {
    const res = await upsertQuoteAction(quote({}));
    expect(res.ok).toBe(true);
    expect(h.upsertQuote).toHaveBeenCalled();
  });

  it("change_order with NULL project id → invalid_convert_target", async () => {
    const res = await upsertQuoteAction(
      quote({ intendedTargetKind: "change_order" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_convert_target");
    expect(h.upsertQuote).not.toHaveBeenCalled();
  });

  it("change_order with a project on the WRONG site → invalid_convert_target", async () => {
    h.project = { id: "p1", site_id: "other-site", client_id: "c1" };
    const res = await upsertQuoteAction(
      quote({ intendedTargetKind: "change_order", intendedTargetProjectId: "p1" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_convert_target");
    expect(h.upsertQuote).not.toHaveBeenCalled();
  });

  it("change_order with a project on the WRONG client → invalid_convert_target", async () => {
    h.project = { id: "p1", site_id: "s1", client_id: "other-client" };
    const res = await upsertQuoteAction(
      quote({ intendedTargetKind: "change_order", intendedTargetProjectId: "p1" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_convert_target");
  });

  it("change_order pointing at a missing project → invalid_convert_target", async () => {
    h.project = null;
    const res = await upsertQuoteAction(
      quote({ intendedTargetKind: "change_order", intendedTargetProjectId: "ghost" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_convert_target");
  });

  it("kind null but a project id is set → invalid_convert_target", async () => {
    const res = await upsertQuoteAction(
      quote({ intendedTargetProjectId: "p1" })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_convert_target");
    expect(h.upsertQuote).not.toHaveBeenCalled();
  });

  it("valid change_order (right site + client) → success", async () => {
    const res = await upsertQuoteAction(
      quote({ intendedTargetKind: "change_order", intendedTargetProjectId: "p1" })
    );
    expect(res.ok).toBe(true);
    expect(h.upsertQuote).toHaveBeenCalledTimes(1);
  });
});
