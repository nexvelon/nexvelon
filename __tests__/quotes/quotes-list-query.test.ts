// BUGFIX (quotes) A4 — the Site/Client detail "Quotes" sections read from
// listQuotesForSite / listQuotesForClient, which attribute a quote to a site or
// client via the queryable MIRROR COLUMNS (quotes.site_id / quotes.client_id),
// not by cracking the jsonb blob. These tests pin the filter column + value and
// the row → view-model mapping (number/name/status/total/siteId/updatedAt).
//
// (A1 — the quotes LIST showing the site name — is resolved client-side in
// QuotesTable via a pre-fetched listSites() lookup, so it is not a query
// concern; the fix there was passing real DB sites into the table, already in
// place from QUOTES-4.)

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  eqCalls: [] as Array<[string, unknown]>,
  selectArg: "",
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: (arg: string) => {
          h.selectArg = arg;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          h.eqCalls.push([col, val]);
          return chain;
        },
        order: () => chain,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: h.rows, error: null }).then(res, rej),
      };
      return chain;
    },
  }),
}));

import { listQuotesForSite, listQuotesForClient } from "@/lib/api/quotes";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  h.rows = [];
  h.eqCalls = [];
  h.selectArg = "";
});

describe("listQuotesForSite / listQuotesForClient", () => {
  it("filters quotes by site_id and selects the mirror + updated_at columns", async () => {
    h.rows = [];
    await listQuotesForSite(UUID_A);
    expect(h.eqCalls).toContainEqual(["site_id", UUID_A]);
    expect(h.selectArg).toContain("updated_at");
    expect(h.selectArg).toContain("data");
  });

  it("filters quotes by client_id", async () => {
    h.rows = [];
    await listQuotesForClient(UUID_B);
    expect(h.eqCalls).toContainEqual(["client_id", UUID_B]);
  });

  it("maps a row to the lean view-model (blob fields + row updated_at)", async () => {
    h.rows = [
      {
        id: "q-1",
        updated_at: "2026-07-01T10:00:00Z",
        data: {
          id: "q-1",
          number: "2607011200",
          name: "Front lobby cameras",
          status: "Sent",
          total: 14448.93,
          clientId: UUID_B,
          siteId: UUID_A,
        },
      },
    ];
    const [item] = await listQuotesForSite(UUID_A);
    expect(item).toEqual({
      id: "q-1",
      number: "2607011200",
      name: "Front lobby cameras",
      status: "Sent",
      total: 14448.93,
      clientId: UUID_B,
      siteId: UUID_A,
      updatedAt: "2026-07-01T10:00:00Z",
    });
  });

  it("short-circuits to [] for a non-uuid id WITHOUT hitting the DB", async () => {
    const result = await listQuotesForSite("");
    expect(result).toEqual([]);
    expect(h.eqCalls).toHaveLength(0); // never queried
  });

  it("tolerates missing optional blob fields (nulls, not undefined-crash)", async () => {
    h.rows = [
      {
        id: "q-2",
        updated_at: null,
        data: { id: "q-2", status: "Draft" },
      },
    ];
    const [item] = await listQuotesForClient(UUID_B);
    expect(item.number).toBeNull();
    expect(item.name).toBeNull();
    expect(item.total).toBeNull();
    expect(item.updatedAt).toBeNull();
    expect(item.status).toBe("Draft");
  });
});
