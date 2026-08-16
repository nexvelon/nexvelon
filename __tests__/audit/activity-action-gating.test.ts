// AUD-2 — the Activity tab's "load more" server action is permission-gated by
// the host entity's own view resource (no new key). No session, or an entity
// whose type has no resource mapping, is denied before any read runs.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listActivityPage: vi.fn(async () => ({ entries: [], hasMore: false })),
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/activity-log", () => ({ listActivityPage: h.listActivityPage }));

import { loadEntityActivityAction } from "@/app/(app)/activity-actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.listActivityPage.mockClear();
});

describe("loadEntityActivityAction — gating", () => {
  it("denies with no session and never reads", async () => {
    h.profile = null;
    const res = await loadEntityActivityAction("client", "c1", 0);
    expect(res.ok).toBe(false);
    expect(h.listActivityPage).not.toHaveBeenCalled();
  });

  it("denies an entity type that has no resource mapping", async () => {
    // ui_theme is a valid entity_type but not a host with an Activity tab.
    const res = await loadEntityActivityAction("ui_theme", "t1", 0);
    expect(res.ok).toBe(false);
    expect(h.listActivityPage).not.toHaveBeenCalled();
  });

  it("allows an Admin to read a mapped entity's page", async () => {
    const res = await loadEntityActivityAction("client", "c1", 0);
    expect(res.ok).toBe(true);
    expect(h.listActivityPage).toHaveBeenCalledWith("client", "c1", {
      limit: 25,
      offset: 0,
    });
  });

  // AUD-2B — the new host types (job, subcontractor) are gated + readable.
  it.each(["job", "subcontractor"] as const)(
    "allows an Admin to read the new %s tab",
    async (entity) => {
      const res = await loadEntityActivityAction(entity, "x1", 0);
      expect(res.ok).toBe(true);
      expect(h.listActivityPage).toHaveBeenCalledWith(entity, "x1", {
        limit: 25,
        offset: 0,
      });
    }
  );
});
