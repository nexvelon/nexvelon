// AUD-1 — "Apply to everyone" clears personal theme overrides (theme_key → NULL)
// and MUST NOT delete any saved custom_themes row.

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  fromCalls: [] as string[],
  updatePayload: null as Record<string, unknown> | null,
  deleteCalled: false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      h.fromCalls.push(table);
      return {
        update: (payload: Record<string, unknown>) => {
          h.updatePayload = payload;
          return { not: () => ({ select: async () => ({ data: [{ user_id: "a" }, { user_id: "b" }], error: null }) }) };
        },
        delete: () => {
          h.deleteCalled = true;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  }),
}));
// ui-theme's other imports — stub so the module loads.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/api/company-settings", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock("@/lib/api/custom-themes", () => ({ getCustomThemeForResolve: vi.fn() }));

import { clearAllUserThemeOverrides } from "@/lib/api/ui-theme";

beforeEach(() => {
  h.fromCalls = [];
  h.updatePayload = null;
  h.deleteCalled = false;
});

describe("clearAllUserThemeOverrides", () => {
  it("nulls theme_key on user_ui_prefs and returns the affected count", async () => {
    const affected = await clearAllUserThemeOverrides();
    expect(affected).toBe(2);
    expect(h.fromCalls).toContain("user_ui_prefs");
    expect(h.updatePayload).toEqual({ theme_key: null });
  });

  it("never touches custom_themes and never deletes anything", async () => {
    await clearAllUserThemeOverrides();
    expect(h.fromCalls).not.toContain("custom_themes");
    expect(h.deleteCalled).toBe(false);
  });
});
