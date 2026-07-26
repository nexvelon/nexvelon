// PERM-2 — the resolver cutover. getCurrentAuth resolves a user's permission set
// from the DB matrix and answers checks identical to the static hasPermission;
// it FAILS SAFE to the static matrix on a DB error (never deny-all, never
// allow-all); and it resolves ONCE per request (the loader is called once even
// across many checks).
//
// React `cache()` is mocked as a single-slot memoizer (the framework's
// request-scoped cache isn't present under vitest) so the once-per-request dedup
// is observable; vi.resetModules() gives each test a fresh memo.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  loadMatrix: vi.fn(),
}));

// cache(fn) → memoize on first call (per wrapped fn), matching how React dedupes
// a resolution within one request.
vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...a: A) => R) => {
      let ran = false;
      let val: R;
      return (...a: A): R => {
        if (!ran) { ran = true; val = fn(...a); }
        return val;
      };
    },
  };
});
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/permissions/db-matrix", async (orig) => ({
  ...(await orig<typeof import("@/lib/permissions/db-matrix")>()),
  loadRoleMatrix: h.loadMatrix,
}));

import { hasPermission } from "@/lib/permissions";
import { buildGrantedMatrix } from "@/lib/permissions/seed-matrix";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  // Default: the DB returns the faithful seeded matrix.
  h.loadMatrix.mockResolvedValue(buildGrantedMatrix());
});

describe("getCurrentAuth resolution", () => {
  it("can() matches the static matrix for sampled triples (Accountant)", async () => {
    const { getCurrentAuth } = await import("@/lib/permissions/resolve");
    const auth = await getCurrentAuth();
    const samples: [Parameters<typeof hasPermission>[1], Parameters<typeof hasPermission>[2]][] = [
      ["financials", "view"], ["financials", "edit"], ["quotes", "viewMargin"],
      ["users", "view"], ["settings", "manage"], ["inventory", "viewCost"],
    ];
    for (const [resource, action] of samples) {
      expect(auth.can(resource, action)).toBe(hasPermission("Accountant", resource, action));
    }
  });

  it("adapts Warehouse → Technician (preserving the server adapter's semantics)", async () => {
    h.profile = { id: "u2", role: "Warehouse", status: "Active" };
    const { getCurrentAuth } = await import("@/lib/permissions/resolve");
    const auth = await getCurrentAuth();
    expect(auth.role).toBe("Technician");
    // Technician can view inventory, cannot view financials.
    expect(auth.can("inventory", "view")).toBe(true);
    expect(auth.can("financials", "view")).toBe(false);
  });

  it("resolves ONCE per request — the loader runs a single query across many checks", async () => {
    const { getCurrentAuth } = await import("@/lib/permissions/resolve");
    const auth = await getCurrentAuth();
    auth.can("financials", "view");
    auth.can("quotes", "edit");
    await getCurrentAuth(); // repeat resolve in the same "request"
    expect(h.loadMatrix).toHaveBeenCalledTimes(1);
  });

  it("no profile → can() denies everything", async () => {
    h.profile = null;
    const { getCurrentAuth } = await import("@/lib/permissions/resolve");
    const auth = await getCurrentAuth();
    expect(auth.role).toBeNull();
    expect(auth.can("dashboard", "view")).toBe(false);
  });
});

describe("FAIL-SAFE: DB error → static matrix", () => {
  it("falls back to the static matrix (not deny-all, not allow-all)", async () => {
    h.loadMatrix.mockRejectedValue(new Error("db down"));
    const { getCurrentAuth } = await import("@/lib/permissions/resolve");
    const auth = await getCurrentAuth(); // Accountant
    // A granted triple stays granted…
    expect(auth.can("financials", "view")).toBe(true);
    expect(auth.can("financials", "view")).toBe(hasPermission("Accountant", "financials", "view"));
    // …and a denied triple stays denied (NOT allow-all).
    expect(auth.can("users", "view")).toBe(false);
    expect(auth.can("users", "view")).toBe(hasPermission("Accountant", "users", "view"));
    // NOT deny-all: at least one thing is still permitted.
    expect(auth.can("dashboard", "view")).toBe(true);
  });
});
