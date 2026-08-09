// UIDG-3 — gates + validation on the theme actions. setOrgDefaultThemeAction is
// Admin-only (settings:manage); setMyThemeAction is any authenticated user and
// accepts null to clear. Uses the REAL permission matrix.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as
    | { id: string; role: string; status: string }
    | null,
  getThemeSettings: vi.fn(async () => ({
    orgDefaultKey: "royal-navy" as const,
    userOverrideKey: null as string | null,
  })),
  setUserThemeKey: vi.fn(async () => undefined),
  setOrgDefaultThemeKey: vi.fn(async () => undefined),
  logThemeChange: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/ui-theme", () => ({
  getThemeSettings: h.getThemeSettings,
  setUserThemeKey: h.setUserThemeKey,
  setOrgDefaultThemeKey: h.setOrgDefaultThemeKey,
  logThemeChange: h.logThemeChange,
}));

import {
  setMyThemeAction,
  setOrgDefaultThemeAction,
  getThemeSettingsAction,
} from "@/app/(app)/settings/theme-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.getThemeSettings.mockClear();
  h.setUserThemeKey.mockClear();
  h.setOrgDefaultThemeKey.mockClear();
  h.logThemeChange.mockClear();
});

describe("setOrgDefaultThemeAction — Admin-only (settings:manage)", () => {
  it("a non-admin (Technician) is rejected and nothing is written", async () => {
    setRole("Technician");
    const res = await setOrgDefaultThemeAction("onyx-brass");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.setOrgDefaultThemeKey).not.toHaveBeenCalled();
  });

  it("ProjectManager (settings:view but not manage) is rejected", async () => {
    setRole("ProjectManager");
    const res = await setOrgDefaultThemeAction("onyx-brass");
    expect(res.ok).toBe(false);
    expect(h.setOrgDefaultThemeKey).not.toHaveBeenCalled();
  });

  it("Admin with a valid key succeeds and audits", async () => {
    setRole("Admin");
    const res = await setOrgDefaultThemeAction("onyx-brass");
    expect(res.ok).toBe(true);
    expect(h.setOrgDefaultThemeKey).toHaveBeenCalledWith("onyx-brass");
    expect(h.logThemeChange).toHaveBeenCalledTimes(1);
  });

  it("Admin with an unknown key is rejected before any write", async () => {
    setRole("Admin");
    const res = await setOrgDefaultThemeAction("neon-blast" as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/unknown theme/i);
    expect(h.setOrgDefaultThemeKey).not.toHaveBeenCalled();
  });
});

describe("setMyThemeAction — any authenticated user", () => {
  it("persists a valid key for a non-admin", async () => {
    setRole("Technician");
    const res = await setMyThemeAction("emerald-dynasty");
    expect(res.ok).toBe(true);
    expect(h.setUserThemeKey).toHaveBeenCalledWith("u1", "emerald-dynasty");
    expect(h.logThemeChange).toHaveBeenCalledTimes(1);
  });

  it("passing null clears the override (inherit the org default)", async () => {
    const res = await setMyThemeAction(null);
    expect(res.ok).toBe(true);
    expect(h.setUserThemeKey).toHaveBeenCalledWith("u1", null);
    if (res.ok) expect(res.data.effectiveKey).toBe("royal-navy"); // org default
  });

  it("rejects an unknown key without writing", async () => {
    const res = await setMyThemeAction("bogus" as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/unknown theme/i);
    expect(h.setUserThemeKey).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    const res = await setMyThemeAction("onyx-brass");
    expect(res.ok).toBe(false);
    expect(h.setUserThemeKey).not.toHaveBeenCalled();
  });
});

describe("getThemeSettingsAction", () => {
  it("returns canManageOrg=true for Admin, false for Technician", async () => {
    setRole("Admin");
    const a = await getThemeSettingsAction();
    expect(a.ok && a.data.canManageOrg).toBe(true);
    setRole("Technician");
    const b = await getThemeSettingsAction();
    expect(b.ok && b.data.canManageOrg).toBe(false);
  });
});
