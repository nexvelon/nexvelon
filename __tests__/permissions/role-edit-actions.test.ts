// DES-1 — the role-baseline actions are Admin-gated (non-admin rejected).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "admin1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/role-permissions", () => ({
  getAllRoleMatrix: vi.fn(async () => ({ Admin: ["users:manage"], Warehouse: ["inventory:edit"] })),
  setRoleBaseline: vi.fn(async () => undefined),
}));

import {
  getRoleMatrixAction,
  setRoleBaselineAction,
} from "@/app/(app)/users/role-permission-actions";

beforeEach(() => {
  h.profile = { id: "admin1", role: "Admin", status: "Active" };
});

describe("role-baseline actions are admin-gated", () => {
  it("non-admin is rejected", async () => {
    h.profile = { id: "u2", role: "ProjectManager", status: "Active" };
    expect((await getRoleMatrixAction()).ok).toBe(false);
    expect((await setRoleBaselineAction({ role: "Warehouse", resource: "inventory", action: "delete", granted: true })).ok).toBe(false);
  });

  it("signed-out is rejected", async () => {
    h.profile = null;
    expect((await setRoleBaselineAction({ role: "Warehouse", resource: "inventory", action: "delete", granted: true })).ok).toBe(false);
  });

  it("admin is allowed", async () => {
    expect((await getRoleMatrixAction()).ok).toBe(true);
    expect((await setRoleBaselineAction({ role: "Warehouse", resource: "inventory", action: "delete", granted: true })).ok).toBe(true);
  });
});
