// UIDG-3 — the server-side theme resolver. Precedence: user override > org
// default > DEFAULT_THEME. Must never throw (fail-safe like PERM-2).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  prefRow: null as { theme_key: string | null } | null,
  orgValue: null as string | null,
  throwClient: false,
  throwGetSetting: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (h.throwClient) throw new Error("db unreachable");
    return {
      auth: { getUser: async () => ({ data: { user: h.user } }) },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: h.prefRow, error: null }),
          }),
        }),
      }),
    };
  }),
}));

vi.mock("@/lib/api/company-settings", () => ({
  getSetting: vi.fn(async () => {
    if (h.throwGetSetting) throw new Error("settings read failed");
    return h.orgValue;
  }),
  setSetting: vi.fn(),
}));

// createAdminClient is imported by the module but only called in logThemeChange.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { resolveServerThemeKey } from "@/lib/api/ui-theme";
import { DEFAULT_THEME } from "@/lib/theme";

beforeEach(() => {
  h.user = null;
  h.prefRow = null;
  h.orgValue = null;
  h.throwClient = false;
  h.throwGetSetting = false;
});

describe("resolveServerThemeKey precedence", () => {
  it("user override wins over the org default", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: "emerald-dynasty" };
    h.orgValue = "onyx-brass";
    expect(await resolveServerThemeKey()).toBe("emerald-dynasty");
  });

  it("a NULL override means inherit → falls to the org default", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: null };
    h.orgValue = "onyx-brass";
    expect(await resolveServerThemeKey()).toBe("onyx-brass");
  });

  it("no signed-in user → org default", async () => {
    h.user = null;
    h.orgValue = "sapphire-noir";
    expect(await resolveServerThemeKey()).toBe("sapphire-noir");
  });

  it("no override and no org default → DEFAULT_THEME", async () => {
    h.user = { id: "u1" };
    h.prefRow = null;
    h.orgValue = null;
    expect(await resolveServerThemeKey()).toBe(DEFAULT_THEME);
  });
});

describe("resolveServerThemeKey safety", () => {
  it("an unknown override key is ignored (falls through to org)", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: "not-a-real-theme" };
    h.orgValue = "midnight-teal";
    expect(await resolveServerThemeKey()).toBe("midnight-teal");
  });

  it("an unknown org value falls back to DEFAULT_THEME", async () => {
    h.orgValue = "bogus";
    expect(await resolveServerThemeKey()).toBe(DEFAULT_THEME);
  });

  it("DB unavailable → DEFAULT_THEME, never throws", async () => {
    h.throwClient = true;
    await expect(resolveServerThemeKey()).resolves.toBe(DEFAULT_THEME);
  });

  it("a settings-read failure → DEFAULT_THEME, never throws", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: null };
    h.throwGetSetting = true;
    await expect(resolveServerThemeKey()).resolves.toBe(DEFAULT_THEME);
  });
});
