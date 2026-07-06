// PROJ2-5 — listProjectsForSite: projects on a site for the quote target chooser.
// Pins the query shape (filter by site_id, exclude cancelled, order created_at
// ASC) and the row → MergeCandidate passthrough, via a capturing Supabase mock.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  select: "",
  eq: [] as Array<[string, unknown]>,
  neq: [] as Array<[string, unknown]>,
  order: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: (a: string) => {
          h.select = a;
          return chain;
        },
        eq: (c: string, v: unknown) => {
          h.eq.push([c, v]);
          return chain;
        },
        neq: (c: string, v: unknown) => {
          h.neq.push([c, v]);
          return chain;
        },
        // .order() is terminal here — the action awaits the builder after it.
        order: (c: string, o: unknown) => {
          h.order.push([c, o]);
          return Promise.resolve({ data: h.rows, error: null });
        },
      };
      return chain;
    },
  }),
}));

import { listProjectsForSite } from "@/lib/api/projects";

beforeEach(() => {
  h.rows = [];
  h.select = "";
  h.eq = [];
  h.neq = [];
  h.order = [];
});

describe("listProjectsForSite", () => {
  it("filters by site_id, excludes cancelled, orders by created_at ASC", async () => {
    h.rows = [
      { id: "p1", project_number: "P-1", title: "First", status: "active" },
      { id: "p2", project_number: "P-2", title: "Second", status: "on_hold" },
    ];
    const result = await listProjectsForSite("site-1");

    expect(h.eq).toContainEqual(["site_id", "site-1"]);
    expect(h.neq).toContainEqual(["status", "cancelled"]);
    expect(h.order).toContainEqual(["created_at", { ascending: true }]);
    expect(h.select).toContain("project_number");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "p1", project_number: "P-1" });
  });

  it("returns [] when the site has no projects", async () => {
    h.rows = [];
    const result = await listProjectsForSite("empty-site");
    expect(result).toEqual([]);
    // still filtered correctly
    expect(h.neq).toContainEqual(["status", "cancelled"]);
  });
});
