// AUD-3 — the central feed query construction (permission scope + filters +
// pagination), the orphan existence check, and the action layer (gating +
// export scoping).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: {
    or: [] as string[],
    eq: [] as [string, unknown][],
    gte: null as [string, string] | null,
    lte: null as [string, string] | null,
    range: null as [number, number] | null,
  },
  rows: [] as unknown[],
  liveRows: {} as Record<string, { id: string }[]>,
  profile: { id: "u1", role: "Admin", status: "Active" } as
    | { id: string; role: string; status: string }
    | null,
}));

function resetCalls() {
  h.calls.or = [];
  h.calls.eq = [];
  h.calls.gte = null;
  h.calls.lte = null;
  h.calls.range = null;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      }
      if (table === "activity_log") {
        const q: Record<string, unknown> = {
          select: () => q,
          or: (c: string) => {
            h.calls.or.push(c);
            return q;
          },
          eq: (k: string, v: unknown) => {
            h.calls.eq.push([k, v]);
            return q;
          },
          gte: (k: string, v: string) => {
            h.calls.gte = [k, v];
            return q;
          },
          lte: (k: string, v: string) => {
            h.calls.lte = [k, v];
            return q;
          },
          order: () => q,
          range: async (a: number, b: number) => {
            h.calls.range = [a, b];
            return { data: h.rows, error: null };
          },
        };
        return q;
      }
      // liveRecordKeys existence lookups (clients/sites/…)
      return {
        select: () => ({
          in: async () => ({ data: h.liveRows[table] ?? [], error: null }),
        }),
      };
    },
  })),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import {
  listActivityFeed,
  liveRecordKeys,
  type ActivityFeedFilters,
} from "@/lib/api/activity-log";
import {
  loadActivityFeedAction,
  exportActivityFeedAction,
} from "@/app/(app)/activity/actions";
import type { DbActivityLogWithActor } from "@/lib/types/database";

const WINDOW = { from: "2026-08-01T00:00:00.000Z", to: "2026-08-15T23:59:59.999Z" };

function feedRow(over: Partial<DbActivityLogWithActor>): DbActivityLogWithActor {
  return {
    id: "1", entity_type: "client", entity_id: "c1", action: "update",
    changes: {}, actor_id: "u1", created_at: "2026-08-10T12:00:00Z",
    parent_type: null, parent_id: null, entity_label: "Acme", parent_label: null,
    actor: null, ...over,
  } as DbActivityLogWithActor;
}

beforeEach(() => {
  resetCalls();
  h.rows = [];
  h.liveRows = {};
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("listActivityFeed — query construction", () => {
  const base: ActivityFeedFilters = { ...WINDOW, limit: 25, offset: 0 };

  it("scopes by the role's permitted entity types (Admin sees financials)", async () => {
    await listActivityFeed("Admin", base);
    expect(h.calls.or[0]).toContain("entity_type.in.(");
    expect(h.calls.or[0]).toContain("invoice"); // Admin can view financials
    expect(h.calls.gte).toEqual(["created_at", WINDOW.from]);
    expect(h.calls.lte).toEqual(["created_at", WINDOW.to]);
  });

  it("a permission-limited role's clause omits types it cannot view", async () => {
    await listActivityFeed("Technician", base);
    // Technician cannot view financials → 'invoice' must not appear in the scope.
    expect(h.calls.or[0] ?? "").not.toContain("invoice");
  });

  it("applies actor, action, date and free-text filters", async () => {
    await listActivityFeed("Admin", {
      ...base,
      actorId: "u9",
      action: "delete",
      q: "widget",
    });
    expect(h.calls.eq).toContainEqual(["actor_id", "u9"]);
    expect(h.calls.eq).toContainEqual(["action", "delete"]);
    // second .or() is the free-text group
    expect(h.calls.or.some((c) => c.includes("entity_label.ilike.%widget%"))).toBe(true);
  });

  it("windows by offset and reports hasMore by fetching limit+1", async () => {
    h.rows = Array.from({ length: 26 }, (_, i) => feedRow({ id: String(i) }));
    const page = await listActivityFeed("Admin", { ...base, offset: 50 });
    expect(h.calls.range).toEqual([50, 75]);
    expect(page.hasMore).toBe(true);
    expect(page.entries).toHaveLength(25);
  });
});

describe("liveRecordKeys — orphan detection", () => {
  it("returns keys only for records that still exist", async () => {
    h.liveRows = { clients: [{ id: "c1" }] }; // c1 lives; c2 was hard-deleted
    const keys = await liveRecordKeys([
      feedRow({ id: "a", entity_type: "client", entity_id: "c1" }),
      feedRow({ id: "b", entity_type: "client", entity_id: "c2" }),
      feedRow({ id: "c", entity_type: "job_task", entity_id: "t1" }), // no detail page → ignored
    ]);
    expect(keys.has("client:c1")).toBe(true);
    expect(keys.has("client:c2")).toBe(false);
    expect(keys.has("job_task:t1")).toBe(false);
  });
});

describe("loadActivityFeedAction — gating", () => {
  it("denies with no session", async () => {
    h.profile = null;
    const res = await loadActivityFeedAction({ range: "mtd" });
    expect(res.ok).toBe(false);
  });

  it("returns a page + live keys for a signed-in user", async () => {
    h.rows = [feedRow({ entity_type: "client", entity_id: "c1" })];
    h.liveRows = { clients: [{ id: "c1" }] };
    const res = await loadActivityFeedAction({ range: "mtd" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.page.entries).toHaveLength(1);
      expect(res.page.liveKeys).toContain("client:c1");
    }
  });
});

describe("exportActivityFeedAction — same scope, CSV", () => {
  it("produces a CSV of the filtered rows", async () => {
    h.rows = [feedRow({ entity_label: "Acme Corp", action: "create" })];
    const res = await exportActivityFeedAction({ range: "mtd" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.export.filename).toMatch(/\.csv$/);
      expect(res.export.data).toContain("Acme Corp");
      // scope guard ran (the same permission .or clause was built)
      expect(h.calls.or[0]).toContain("entity_type.in.(");
    }
  });

  it("denies export with no session", async () => {
    h.profile = null;
    const res = await exportActivityFeedAction({ range: "mtd" });
    expect(res.ok).toBe(false);
  });
});
