// UIDG-3/4 — server-side theme resolution. Precedence: user override → org
// default → DEFAULT_THEME. Custom themes resolve like built-ins; a reference
// that no longer resolves (deleted/unpublished/invalid) is skipped (degrade to
// the next). Never throws (fail-safe, PERM-2).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  prefRow: null as { theme_key: string | null; theme_mode?: string | null } | null,
  orgValue: null as string | null,
  orgMode: null as string | null,
  custom: null as { name: string; tokens: Record<string, unknown> } | null,
  throwClient: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (h.throwClient) throw new Error("db unreachable");
    return {
      auth: { getUser: async () => ({ data: { user: h.user } }) },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: h.prefRow, error: null }) }),
        }),
      }),
    };
  }),
}));
vi.mock("@/lib/api/company-settings", () => ({
  getSetting: vi.fn(async (key: string) => (key.includes("mode") ? h.orgMode : h.orgValue)),
  setSetting: vi.fn(),
}));
vi.mock("@/lib/api/custom-themes", () => ({
  getCustomThemeForResolve: vi.fn(async () => h.custom),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { resolveServerTheme } from "@/lib/api/ui-theme";
import { DEFAULT_THEME, resolveTheme } from "@/lib/theme";

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const validTokens = {
  primary: "#0A1226", accent: "#B8924B", accentSoft: "#9A7B3A", bg: "#F5F1E8",
  text: "#1A1F2E", card: "#FAF7F0", border: "#E0D9C8", muted: "#EBE5D6",
  sidebarAccent: "#131C36", sidebarBorder: "#1B2542", chartTertiary: "#5C6A8A",
  chartQuaternary: "#A8B0C4", statusGreen: "#5C7A4A", statusRed: "#A03B3B",
  fonts: { sans: "var(--font-inter)", serif: "var(--font-playfair)", mono: "var(--font-geist-mono)" },
  charts: ["#0A1226", "#B8924B", "#5C6A8A", "#A8B0C4", "#1A1F2E"],
};

beforeEach(() => {
  h.user = null;
  h.prefRow = null;
  h.orgValue = null;
  h.orgMode = null;
  h.custom = null;
  h.throwClient = false;
});

describe("resolveServerTheme mode axis (independent of palette)", () => {
  it("user mode override wins over org default mode", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: null, theme_mode: "dark" };
    h.orgMode = "light";
    expect((await resolveServerTheme()).mode).toBe("dark");
  });
  it("NULL mode inherits the org default mode", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: null, theme_mode: null };
    h.orgMode = "dark";
    expect((await resolveServerTheme()).mode).toBe("dark");
  });
  it("no mode set anywhere → light", async () => {
    h.user = { id: "u1" };
    expect((await resolveServerTheme()).mode).toBe("light");
  });
  it("mode is independent of palette (dark mode + built-in palette)", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: "onyx-brass", theme_mode: "dark" };
    const r = await resolveServerTheme();
    expect(r.key).toBe("onyx-brass");
    expect(r.mode).toBe("dark");
    // dark colours differ from light for the same palette
    expect(r.colors.bg).not.toBe(resolveTheme("onyx-brass", "light").bg);
  });
});

describe("resolveServerTheme precedence", () => {
  it("user override (built-in) wins over org default", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: "emerald-dynasty" };
    h.orgValue = "onyx-brass";
    const r = await resolveServerTheme();
    expect(r.key).toBe("emerald-dynasty");
    expect(r.isCustom).toBe(false);
  });

  it("NULL override falls to the org default", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: null };
    h.orgValue = "sapphire-noir";
    expect((await resolveServerTheme()).key).toBe("sapphire-noir");
  });

  it("nothing set → DEFAULT_THEME", async () => {
    h.user = { id: "u1" };
    expect((await resolveServerTheme()).key).toBe(DEFAULT_THEME);
  });
});

describe("resolveServerTheme custom themes", () => {
  it("resolves a custom override to its tokens (isCustom)", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: UUID };
    h.custom = { name: "My Theme", tokens: validTokens };
    const r = await resolveServerTheme();
    expect(r.key).toBe(UUID);
    expect(r.isCustom).toBe(true);
    expect(r.colors.primary).toBe("#0A1226");
    expect(r.colors.name).toBe("My Theme");
  });

  it("a deleted/unpublished custom (resolver returns null) degrades to the org default", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: UUID };
    h.custom = null; // not visible / deleted
    h.orgValue = "onyx-brass";
    const r = await resolveServerTheme();
    expect(r.key).toBe("onyx-brass");
    expect(r.isCustom).toBe(false);
  });

  it("a non-uuid, non-builtin override is ignored", async () => {
    h.user = { id: "u1" };
    h.prefRow = { theme_key: "garbage" };
    h.orgValue = "midnight-teal";
    expect((await resolveServerTheme()).key).toBe("midnight-teal");
  });
});

describe("resolveServerTheme safety", () => {
  it("DB unavailable → DEFAULT_THEME, never throws", async () => {
    h.throwClient = true;
    await expect(resolveServerTheme()).resolves.toMatchObject({ key: DEFAULT_THEME });
  });
});
