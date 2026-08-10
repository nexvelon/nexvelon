// AUD-2 — the per-entity Activity tab pages its timeline instead of loading the
// whole history. listActivityPage fetches limit+1 rows to report `hasMore`, then
// hands back exactly `limit` enriched rows; `offset` drives the DB range window.

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  rangeArgs: vi.fn(),
  rows: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "actor-1" } } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      }
      // activity_log
      return {
        select: () => ({
          or: () => ({
            order: () => ({
              range: async (from: number, to: number) => {
                h.rangeArgs(from, to);
                return { data: h.rows, error: null };
              },
            }),
          }),
        }),
      };
    },
  })),
}));

import { listActivityPage } from "@/lib/api/activity-log";

// Rows with actor_id: null so enrichActors skips the profiles lookup.
function makeRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    entity_type: "client",
    entity_id: "c1",
    action: "update",
    changes: {},
    actor_id: null,
    created_at: "2026-04-30T12:00:00Z",
    parent_type: null,
    parent_id: null,
    entity_label: null,
    parent_label: null,
  }));
}

beforeEach(() => {
  h.rangeArgs.mockClear();
  h.rows = [];
});

describe("listActivityPage — lazy pagination", () => {
  it("reports hasMore and trims the sentinel row when limit+1 come back", async () => {
    h.rows = makeRows(26); // limit 25 + 1 sentinel
    const page = await listActivityPage("client", "c1", { limit: 25, offset: 0 });
    expect(page.hasMore).toBe(true);
    expect(page.entries).toHaveLength(25);
  });

  it("reports no more page when fewer than limit+1 come back", async () => {
    h.rows = makeRows(10);
    const page = await listActivityPage("client", "c1", { limit: 25, offset: 0 });
    expect(page.hasMore).toBe(false);
    expect(page.entries).toHaveLength(10);
  });

  it("windows the query by offset (fetching limit+1)", async () => {
    h.rows = makeRows(3);
    await listActivityPage("client", "c1", { limit: 25, offset: 50 });
    expect(h.rangeArgs).toHaveBeenCalledWith(50, 75);
  });
});
