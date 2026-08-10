// UIDG-3/4 — gates + guards on the theme actions. Uses the REAL permission
// matrix; mocks the data layer.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as
    | { id: string; role: string; status: string }
    | null,
  // ui-theme
  getThemeSettings: vi.fn(async () => ({ orgDefaultKey: "royal-navy", userOverrideKey: null as string | null })),
  setUserThemeKey: vi.fn(async () => undefined),
  setOrgDefaultThemeKey: vi.fn(async () => undefined),
  countUsersWithThemeOverride: vi.fn(async () => 3),
  clearAllUserThemeOverrides: vi.fn(async () => 3),
  logThemeChange: vi.fn(async () => undefined),
  logThemeAudit: vi.fn(async () => undefined),
  // custom-themes
  listVisibleCustomThemes: vi.fn(async () => []),
  getCustomThemeForResolve: vi.fn(async () => null as null | { name: string; tokens: unknown }),
  getCustomThemeRow: vi.fn(async () => null as null | { id: string; created_by: string; is_published: boolean; name: string }),
  createCustomTheme: vi.fn(async () => "new-id"),
  updateCustomTheme: vi.fn(async () => undefined),
  softDeleteCustomTheme: vi.fn(async () => undefined),
  setCustomThemePublished: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/api/ui-theme", () => ({
  getThemeSettings: h.getThemeSettings,
  setUserThemeKey: h.setUserThemeKey,
  setUserThemeMode: vi.fn(),
  setOrgDefaultThemeKey: h.setOrgDefaultThemeKey,
  setOrgDefaultThemeMode: vi.fn(),
  countUsersWithThemeOverride: h.countUsersWithThemeOverride,
  clearAllUserThemeOverrides: h.clearAllUserThemeOverrides,
  logThemeChange: h.logThemeChange,
  logThemeAudit: h.logThemeAudit,
}));
vi.mock("@/lib/api/custom-themes", () => ({
  listVisibleCustomThemes: h.listVisibleCustomThemes,
  getCustomThemeForResolve: h.getCustomThemeForResolve,
  getCustomThemeRow: h.getCustomThemeRow,
  createCustomTheme: h.createCustomTheme,
  updateCustomTheme: h.updateCustomTheme,
  softDeleteCustomTheme: h.softDeleteCustomTheme,
  setCustomThemePublished: h.setCustomThemePublished,
}));

import {
  setMyThemeAction,
  setOrgDefaultThemeAction,
  countThemeOverridesAction,
  duplicateThemeAction,
  publishCustomThemeAction,
  deleteCustomThemeAction,
} from "@/app/(app)/settings/theme-actions";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [
    h.getThemeSettings, h.setUserThemeKey, h.setOrgDefaultThemeKey, h.logThemeChange,
    h.logThemeAudit, h.getCustomThemeForResolve, h.getCustomThemeRow, h.createCustomTheme,
    h.updateCustomTheme, h.softDeleteCustomTheme, h.setCustomThemePublished,
    h.countUsersWithThemeOverride, h.clearAllUserThemeOverrides,
  ]) fn.mockClear();
  h.getThemeSettings.mockResolvedValue({ orgDefaultKey: "royal-navy", userOverrideKey: null });
});

describe("AUD-1 — org default apply-scope", () => {
  it("apply-to-everyone clears personal overrides and reports the count", async () => {
    const res = await setOrgDefaultThemeAction("onyx-brass", true);
    expect(res.ok).toBe(true);
    expect(h.clearAllUserThemeOverrides).toHaveBeenCalledTimes(1);
    if (res.ok) expect(res.data.affected).toBe(3);
  });

  it("keep-their-choices sets the default WITHOUT clearing overrides", async () => {
    const res = await setOrgDefaultThemeAction("onyx-brass", false);
    expect(res.ok).toBe(true);
    expect(h.clearAllUserThemeOverrides).not.toHaveBeenCalled();
    if (res.ok) expect(res.data.affected).toBe(0);
  });

  it("countThemeOverridesAction is Admin-gated", async () => {
    setRole("Technician");
    expect((await countThemeOverridesAction()).ok).toBe(false);
    setRole("Admin");
    const r = await countThemeOverridesAction();
    expect(r.ok && r.data.count).toBe(3);
  });
});

describe("setMyThemeAction", () => {
  it("applies a built-in for any authenticated user", async () => {
    setRole("Technician");
    const res = await setMyThemeAction("onyx-brass");
    expect(res.ok).toBe(true);
    expect(h.setUserThemeKey).toHaveBeenCalledWith("u1", "onyx-brass");
  });

  it("clears the override with null", async () => {
    const res = await setMyThemeAction(null);
    expect(res.ok).toBe(true);
    expect(h.setUserThemeKey).toHaveBeenCalledWith("u1", null);
  });

  it("rejects a custom theme the user can't see", async () => {
    h.getCustomThemeForResolve.mockResolvedValue(null);
    const res = await setMyThemeAction(UUID);
    expect(res.ok).toBe(false);
    expect(h.setUserThemeKey).not.toHaveBeenCalled();
  });

  it("applies a visible custom theme", async () => {
    h.getCustomThemeForResolve.mockResolvedValue({ name: "Mine", tokens: {} });
    const res = await setMyThemeAction(UUID);
    expect(res.ok).toBe(true);
    expect(h.setUserThemeKey).toHaveBeenCalledWith("u1", UUID);
  });
});

describe("setOrgDefaultThemeAction — Admin only, published-custom only", () => {
  it("a non-admin is rejected", async () => {
    setRole("Technician");
    const res = await setOrgDefaultThemeAction("onyx-brass");
    expect(res.ok).toBe(false);
    expect(h.setOrgDefaultThemeKey).not.toHaveBeenCalled();
  });

  it("Admin can set a built-in", async () => {
    const res = await setOrgDefaultThemeAction("onyx-brass");
    expect(res.ok).toBe(true);
    expect(h.setOrgDefaultThemeKey).toHaveBeenCalledWith("onyx-brass");
  });

  it("a PRIVATE custom theme can never be the org default", async () => {
    h.getCustomThemeRow.mockResolvedValue({ id: UUID, created_by: "u1", is_published: false, name: "Priv" });
    const res = await setOrgDefaultThemeAction(UUID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/publish/i);
    expect(h.setOrgDefaultThemeKey).not.toHaveBeenCalled();
  });

  it("a PUBLISHED custom theme is allowed", async () => {
    h.getCustomThemeRow.mockResolvedValue({ id: UUID, created_by: "u1", is_published: true, name: "Pub" });
    const res = await setOrgDefaultThemeAction(UUID);
    expect(res.ok).toBe(true);
    expect(h.setOrgDefaultThemeKey).toHaveBeenCalledWith(UUID);
  });
});

describe("publish gate", () => {
  it("a non-admin cannot publish", async () => {
    setRole("ProjectManager"); // settings:view but not manage
    h.getCustomThemeRow.mockResolvedValue({ id: UUID, created_by: "u1", is_published: false, name: "x" });
    const res = await publishCustomThemeAction(UUID);
    expect(res.ok).toBe(false);
    expect(h.setCustomThemePublished).not.toHaveBeenCalled();
  });

  it("an admin can publish", async () => {
    h.getCustomThemeRow.mockResolvedValue({ id: UUID, created_by: "u2", is_published: false, name: "x" });
    const res = await publishCustomThemeAction(UUID);
    expect(res.ok).toBe(true);
    expect(h.setCustomThemePublished).toHaveBeenCalledWith(UUID, true);
  });
});

describe("duplicateThemeAction produces an independent copy", () => {
  it("clones a built-in's tokens into a new private theme (base recorded)", async () => {
    const res = await duplicateThemeAction("royal-navy");
    expect(res.ok).toBe(true);
    expect(h.createCustomTheme).toHaveBeenCalledTimes(1);
    const [userId, input] = h.createCustomTheme.mock.calls[0] as unknown as [
      string,
      { name: string; tokens: Record<string, unknown>; baseThemeKey?: string | null },
    ];
    expect(userId).toBe("u1");
    expect(input.baseThemeKey).toBe("royal-navy");
    expect(input.name).toMatch(/copy/i);
    // real token values are copied (independent of the source going forward)
    expect(input.tokens.primary).toBe("#0A1226");
  });
});

describe("deleteCustomThemeAction", () => {
  it("a non-owner non-admin cannot delete", async () => {
    setRole("Technician");
    h.getCustomThemeRow.mockResolvedValue({ id: UUID, created_by: "someone-else", is_published: false, name: "x" });
    const res = await deleteCustomThemeAction(UUID);
    expect(res.ok).toBe(false);
    expect(h.softDeleteCustomTheme).not.toHaveBeenCalled();
  });

  it("the owner can delete (soft)", async () => {
    setRole("Technician");
    h.getCustomThemeRow.mockResolvedValue({ id: UUID, created_by: "u1", is_published: false, name: "x" });
    const res = await deleteCustomThemeAction(UUID);
    expect(res.ok).toBe(true);
    expect(h.softDeleteCustomTheme).toHaveBeenCalledWith(UUID);
  });
});
