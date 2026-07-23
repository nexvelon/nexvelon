// FIN-9 — gates on the holdback actions. Status reads sit at financials:view
// (retained holdback is money owed to us); create / release / void generate
// billable invoices → financials:edit.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  getProjectHoldbackStatus: vi.fn(async () => ({ project_id: "p1", retained: 150, is_eligible: true })),
  getHoldbackWorklist: vi.fn(async () => [{ project_id: "p1", retained: 150 }]),
  createHoldbackRelease: vi.fn(async () => ({ id: "rel-1", status: "eligible" })),
  releaseHoldback: vi.fn(async () => ({ release: { id: "rel-1", status: "released" }, invoice_id: "inv-1" })),
  voidHoldbackRelease: vi.fn(async () => ({ id: "rel-1", status: "void" })),
}));

vi.mock("@/lib/api/holdback", () => ({
  getProjectHoldbackStatus: h.getProjectHoldbackStatus,
  getHoldbackWorklist: h.getHoldbackWorklist,
  createHoldbackRelease: h.createHoldbackRelease,
  releaseHoldback: h.releaseHoldback,
  voidHoldbackRelease: h.voidHoldbackRelease,
}));
// Everything else the actions module imports — stubbed so it loads. The guard
// on `then`/symbol/__esModule keys is essential: a Proxy that returns a function
// for `then` looks like a thenable and hangs ESM interop on import.
const stub = vi.hoisted(
  () => () =>
    new Proxy(
      {},
      {
        get: (_t: object, prop: string | symbol) =>
          typeof prop === "symbol" || prop === "then" || prop === "__esModule"
            ? undefined
            : vi.fn(),
      }
    )
);
vi.mock("@/lib/api/financials", stub);
vi.mock("@/lib/api/ar-aging", stub);
vi.mock("@/lib/api/ap-aging", stub);
vi.mock("@/lib/api/deposits", stub);
vi.mock("@/lib/api/vendor-bills", stub);
vi.mock("@/lib/api/project-pnl", stub);
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getProjectHoldbackStatusAction,
  getHoldbackWorklistAction,
  createHoldbackReleaseAction,
  releaseHoldbackAction,
  voidHoldbackReleaseAction,
} from "@/app/(app)/financials/actions";

const READS = [
  () => getProjectHoldbackStatusAction("p1"),
  () => getHoldbackWorklistAction(),
];
const MUTATIONS = [
  () => createHoldbackReleaseAction("p1"),
  () => releaseHoldbackAction("rel-1", "p1"),
  () => voidHoldbackReleaseAction("rel-1", "p1"),
];
const MUTATION_FNS = [h.createHoldbackRelease, h.releaseHoldback, h.voidHoldbackRelease];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.getProjectHoldbackStatus, h.getHoldbackWorklist]) fn.mockClear();
});

describe("holdback reads (financials:view)", () => {
  it("pass for a view-tier role (ProjectManager)", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of READS) expect((await call()).ok).toBe(true);
  });

  it("reject a role with no financials access (SalesRep)", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.getProjectHoldbackStatus).not.toHaveBeenCalled();
  });
});

describe("holdback mutations (financials:edit)", () => {
  it("reject a view-only role (ProjectManager)", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of MUTATIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("reject an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of MUTATIONS) expect((await call()).ok).toBe(false);
  });

  it("pass for Accountant", async () => {
    for (const call of MUTATIONS) expect((await call()).ok).toBe(true);
    for (const fn of MUTATION_FNS) expect(fn).toHaveBeenCalledTimes(1);
  });
});
