// PERM-3 — setOverride / revokeOverride write append-only permission_audit rows.
// (The DB-level append-only guarantee — UPDATE/DELETE blocked by the trigger —
// is verified by smoke_0115; here we assert the API appends the right audit
// rows.)

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  existing: null as { id: string; state: string } | null,
  inserts: [] as { table: string; payload: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () =>
    makeSupabaseMock((ctx: ChainCtx) => {
      if (ctx.op === "insert") {
        h.inserts.push({ table: ctx.table, payload: ctx.payload as Record<string, unknown> });
        return { data: { id: "new-id", ...(ctx.payload as object) }, error: null };
      }
      if (ctx.table === "user_permission_overrides" && ctx.op === "select") {
        return { data: h.existing, error: null };
      }
      return { data: null, error: null };
    })
  ),
}));

import { setOverride, revokeOverride } from "@/lib/api/permission-overrides";

beforeEach(() => {
  h.existing = null;
  h.inserts = [];
});

describe("setOverride writes an audit row", () => {
  it("a grant → inserts the override AND a change_type='grant' audit row", async () => {
    await setOverride({ userId: "u1", resource: "financials", action: "edit", state: "granted", reason: "temp", actorId: "admin1" });
    const ovrIns = h.inserts.filter((i) => i.table === "user_permission_overrides");
    const auditIns = h.inserts.filter((i) => i.table === "permission_audit");
    expect(ovrIns).toHaveLength(1);
    expect(auditIns).toHaveLength(1);
    expect(auditIns[0].payload.change_type).toBe("grant");
    expect(auditIns[0].payload.new_state).toBe("granted");
    expect(auditIns[0].payload.target_user_id).toBe("u1");
    expect(auditIns[0].payload.actor_user_id).toBe("admin1");
  });

  it("a deny → change_type='deny'", async () => {
    await setOverride({ userId: "u1", resource: "inventory", action: "delete", state: "denied", actorId: "admin1" });
    const auditIns = h.inserts.filter((i) => i.table === "permission_audit");
    expect(auditIns[0].payload.change_type).toBe("deny");
  });
});

describe("revokeOverride writes a revoke audit row", () => {
  it("soft-revokes and appends change_type='revoke'", async () => {
    // The revoke reads the row (select maybeSingle) then updates + audits.
    vi.mocked((await import("@/lib/supabase/server")).createClient).mockResolvedValueOnce(
      makeSupabaseMock((ctx: ChainCtx) => {
        if (ctx.op === "insert") {
          h.inserts.push({ table: ctx.table, payload: ctx.payload as Record<string, unknown> });
          return { data: null, error: null };
        }
        if (ctx.table === "user_permission_overrides" && ctx.op === "select") {
          return { data: { id: "o1", user_id: "u1", resource: "financials", action: "edit", state: "granted", revoked_at: null }, error: null };
        }
        return { data: null, error: null };
      }) as never
    );
    await revokeOverride({ id: "o1", actorId: "admin1" });
    const auditIns = h.inserts.filter((i) => i.table === "permission_audit");
    expect(auditIns).toHaveLength(1);
    expect(auditIns[0].payload.change_type).toBe("revoke");
    expect(auditIns[0].payload.old_state).toBe("granted");
  });
});
