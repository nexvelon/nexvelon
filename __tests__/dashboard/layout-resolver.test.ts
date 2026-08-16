// UIDG-8 — the server resolver precedence (user → org → built-in), NULL-inherit,
// permission filtering on resolve, and the org-default action's gating + audit +
// non-destructive clear.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  userRow: null as { dashboard_layout: unknown } | null,
  orgRaw: null as string | null,
  profile: { id: "u1", role: "Admin", email: "a@x.co", display_name: "Ada", first_name: null, last_name: null } as
    | { id: string; role: string; email: string; display_name: string | null; first_name: string | null; last_name: string | null }
    | null,
  // spies for the write layer
  setOrgDefault: vi.fn(async () => {}),
  clearAll: vi.fn(async () => 3),
  clearUser: vi.fn(async () => {}),
  insertAudit: vi.fn(async () => ({})),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.userRow, error: null }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/api/company-settings", () => ({
  getSetting: async () => h.orgRaw,
  setSetting: vi.fn(async () => {}),
}));

import {
  resolveDashboardLayout,
  getUserLayout,
} from "@/lib/api/dashboard-layout";
import { BUILT_IN_LAYOUT } from "@/lib/dashboard/widgets";

beforeEach(() => {
  h.userRow = null;
  h.orgRaw = null;
});

describe("resolveDashboardLayout — precedence + inherit", () => {
  it("uses the user's saved layout when present", async () => {
    h.userRow = { dashboard_layout: { widgets: [{ id: "activityFeed", colSpan: 6 }, { id: "alerts", colSpan: 12 }] } };
    h.orgRaw = JSON.stringify({ widgets: [{ id: "kpiOverview", colSpan: 12 }] });
    const out = await resolveDashboardLayout("u1", "Admin");
    expect(out.widgets.map((w) => w.id)).toEqual(["activityFeed", "alerts"]);
  });

  it("falls through to the org default when the user has no layout (NULL = inherit)", async () => {
    h.userRow = { dashboard_layout: null }; // NULL, not copied
    h.orgRaw = JSON.stringify({ widgets: [{ id: "kpiOverview", colSpan: 12 }, { id: "activityFeed", colSpan: 6 }] });
    const out = await resolveDashboardLayout("u1", "Admin");
    expect(out.widgets.map((w) => w.id)).toEqual(["kpiOverview", "activityFeed"]);
  });

  it("falls through to the built-in default when neither is set", async () => {
    const out = await resolveDashboardLayout("u1", "Admin");
    expect(out.widgets).toEqual(BUILT_IN_LAYOUT.widgets);
  });

  it("permission-filters the resolved layout (a role that can't see a widget never gets it)", async () => {
    h.orgRaw = JSON.stringify(BUILT_IN_LAYOUT);
    const out = await resolveDashboardLayout("u1", "Technician");
    // Technician cannot view financials → revenueTrend/topClients are gone.
    expect(out.widgets.map((w) => w.id)).not.toContain("revenueTrend");
    expect(out.widgets.map((w) => w.id)).not.toContain("topClients");
    // …but the always-visible ones remain.
    expect(out.widgets.map((w) => w.id)).toContain("kpiOverview");
    expect(out.widgets.map((w) => w.id)).toContain("activityFeed");
  });

  it("getUserLayout drops unknown widget ids from a stored layout", async () => {
    h.userRow = { dashboard_layout: { widgets: [{ id: "alerts", colSpan: 12 }, { id: "goneWidget", colSpan: 6 }] } };
    const out = await getUserLayout("u1");
    expect(out?.widgets.map((w) => w.id)).toEqual(["alerts"]);
  });
});

// ── org-default action: gating + audit + non-destructive clear ────────────────
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/dashboard-layout", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/dashboard-layout")>()),
  setOrgDefaultLayout: h.setOrgDefault,
  clearAllLayoutOverrides: h.clearAll,
  clearUserLayout: h.clearUser,
  getOrgDefaultLayout: async () => null,
  countLayoutOverrides: async () => 3,
}));
vi.mock("@/lib/api/settings-audit", () => ({ insertAuditRow: h.insertAudit }));

import {
  setOrgDefaultLayoutAction,
  resetUserLayoutAction,
} from "@/app/(app)/dashboard/layout-actions";

describe("setOrgDefaultLayoutAction — gating, audit, non-destructive", () => {
  beforeEach(() => {
    h.profile = { id: "u1", role: "Admin", email: "a@x.co", display_name: "Ada", first_name: null, last_name: null };
    h.setOrgDefault.mockClear();
    h.clearAll.mockClear();
    h.insertAudit.mockClear();
  });

  const LAYOUT = { widgets: [{ id: "kpiOverview" as const, colSpan: 12 }] };

  it("denies a role without settings:manage and writes nothing", async () => {
    h.profile = { id: "u2", role: "Technician", email: "t@x.co", display_name: "Tim", first_name: null, last_name: null };
    const res = await setOrgDefaultLayoutAction(LAYOUT, true);
    expect(res.ok).toBe(false);
    expect(h.setOrgDefault).not.toHaveBeenCalled();
    expect(h.clearAll).not.toHaveBeenCalled();
  });

  it("apply-to-everyone clears overrides and audits the blast radius", async () => {
    const res = await setOrgDefaultLayoutAction(LAYOUT, true);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.affected).toBe(3);
    expect(h.clearAll).toHaveBeenCalledTimes(1);
    expect(h.insertAudit).toHaveBeenCalledTimes(1);
    const row = h.insertAudit.mock.calls[0][0] as { change_summary?: string };
    expect(row.change_summary).toMatch(/reset 3 personal/);
  });

  it("keep-their-choices sets the default WITHOUT clearing any override", async () => {
    const res = await setOrgDefaultLayoutAction(LAYOUT, false);
    expect(res.ok).toBe(true);
    expect(h.clearAll).not.toHaveBeenCalled(); // nothing destroyed
    const row = h.insertAudit.mock.calls[0][0] as { change_summary?: string };
    expect(row.change_summary).toMatch(/kept users/);
  });
});

describe("resetUserLayoutAction — clears the override (a NULL write, not a delete)", () => {
  it("calls clearUserLayout for the signed-in user", async () => {
    h.profile = { id: "u9", role: "ViewOnly", email: "v@x.co", display_name: "Vi", first_name: null, last_name: null };
    h.clearUser.mockClear();
    const res = await resetUserLayoutAction();
    expect(res.ok).toBe(true);
    expect(h.clearUser).toHaveBeenCalledWith("u9");
  });
});
