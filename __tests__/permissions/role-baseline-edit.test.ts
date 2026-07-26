// DES-1 — editing a role baseline: setRoleBaseline upserts/deletes a
// role_permission_matrix row and appends a permission_audit row; the resolver
// reflects the edited DB matrix (not the static code), while a fresh seed still
// equals the static matrix (the redefined invariant lives in matrix-parity).

import { describe, it, expect, beforeEach, vi } from "vitest";

const calls: { table: string; op: string; payload?: unknown }[] = [];

function recordingClient() {
  return {
    from(table: string) {
      const chain = {
        upsert(payload: unknown) { calls.push({ table, op: "upsert", payload }); return Promise.resolve({ error: null }); },
        insert(payload: unknown) { calls.push({ table, op: "insert", payload }); return Promise.resolve({ error: null }); },
        delete() { calls.push({ table, op: "delete" }); return chain; },
        eq() { return chain; },
        then(res: (v: { error: null }) => unknown) { return Promise.resolve({ error: null }).then(res); },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => recordingClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => recordingClient() }));

import { setRoleBaseline } from "@/lib/api/role-permissions";

beforeEach(() => { calls.length = 0; });

describe("setRoleBaseline writes matrix + audit", () => {
  it("grant → upsert row + role_baseline_grant audit", async () => {
    await setRoleBaseline({ role: "Technician", resource: "financials", action: "edit", granted: true, actorId: "a1" });
    const upsert = calls.find((c) => c.table === "role_permission_matrix" && c.op === "upsert");
    expect(upsert?.payload).toMatchObject({ role: "Technician", resource: "financials", action: "edit", granted: true });
    const audit = calls.find((c) => c.table === "permission_audit" && c.op === "insert");
    expect(audit?.payload).toMatchObject({ change_type: "role_baseline_grant", target_role: "Technician", new_state: "granted" });
  });

  it("revoke → delete row + role_baseline_revoke audit", async () => {
    await setRoleBaseline({ role: "Technician", resource: "inventory", action: "view", granted: false, actorId: "a1" });
    expect(calls.some((c) => c.table === "role_permission_matrix" && c.op === "delete")).toBe(true);
    const audit = calls.find((c) => c.table === "permission_audit" && c.op === "insert");
    expect(audit?.payload).toMatchObject({ change_type: "role_baseline_revoke", old_state: "granted" });
  });
});

// The resolver reflects the DB matrix (edits take effect), proven by feeding an
// EDITED matrix into the resolver and asserting the change shows.
const h = vi.hoisted(() => ({ editedMatrix: new Map<string, Set<string>>() }));
vi.mock("react", async (o) => {
  const a = await o<typeof import("react")>();
  return { ...a, cache: (<A extends unknown[], R>(fn: (...x: A) => R) => fn) as typeof a.cache };
});
vi.mock("@/lib/permissions/db-matrix", async (o) => ({
  ...(await o<typeof import("@/lib/permissions/db-matrix")>()),
  loadRoleMatrix: async () => h.editedMatrix,
  loadUserOverrides: async () => ({ granted: new Set<string>(), denied: new Set<string>() }),
}));

import { resolveEffectiveForUser } from "@/lib/permissions/resolve";
import { hasPermission } from "@/lib/permissions";

describe("resolver reflects the edited DB baseline, not the static code", () => {
  it("a DB-added cell is granted even though the static role lacks it", async () => {
    // Static Technician does NOT have financials:edit…
    expect(hasPermission("Technician", "financials", "edit")).toBe(false);
    // …but if an admin edits the DB baseline to add it, the resolver honours it.
    h.editedMatrix = new Map([["Technician", new Set(["inventory:view", "financials:edit"])]]);
    const eff = await resolveEffectiveForUser("u1", "Technician");
    expect(eff.has("financials:edit")).toBe(true); // reflects the DB edit
    expect(eff.has("inventory:view")).toBe(true);
  });
});
