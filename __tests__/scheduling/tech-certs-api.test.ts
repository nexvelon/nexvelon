// DES-2 — getExpiringTechCerts surfaces every dated cert expired/expiring within
// the window, with the derived state + tech name; and the action is gated
// scheduling:view.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";
import { businessDateISO } from "@/lib/format";

const today = businessDateISO();
function shift(days: number): string {
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  profile: { id: "u1", role: "Admin", status: "Active" } as { id: string; role: string; status: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () =>
    makeSupabaseMock((ctx: ChainCtx) =>
      ctx.table === "tech_certifications" ? { data: h.rows, error: null } : { data: [], error: null }
    )
  ),
}));

import { getExpiringTechCerts } from "@/lib/api/tech-certifications";

beforeEach(() => {
  h.rows = [
    { id: "c1", tech_id: "t1", cert_type: "esa", expiry_date: shift(-5), tech: { name: "Ana" } }, // expired
    { id: "c2", tech_id: "t2", cert_type: "kantech", expiry_date: shift(10), tech: { name: "Bob" } }, // expiring_soon
  ];
});

describe("getExpiringTechCerts", () => {
  it("derives per-cert state and carries the tech name", async () => {
    const rows = await getExpiringTechCerts({ days: 60 });
    expect(rows).toHaveLength(2);
    const ana = rows.find((r) => r.tech_id === "t1")!;
    expect(ana).toMatchObject({ tech_name: "Ana", cert_type: "esa", state: "expired" });
    const bob = rows.find((r) => r.tech_id === "t2")!;
    expect(bob).toMatchObject({ tech_name: "Bob", state: "expiring_soon" });
  });

  it("defaults the window to 60 days when unspecified", async () => {
    const rows = await getExpiringTechCerts();
    expect(rows).toHaveLength(2);
  });
});

// ── action gating ────────────────────────────────────────────────────────────
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import { getExpiringTechCertsAction } from "@/app/(app)/scheduling/actions";

describe("getExpiringTechCertsAction gate (scheduling:view)", () => {
  beforeEach(() => { h.profile = { id: "u1", role: "Admin", status: "Active" }; });

  it("denies a signed-out caller", async () => {
    h.profile = null;
    expect((await getExpiringTechCertsAction({})).ok).toBe(false);
  });

  it("allows a scheduling:view role (Admin)", async () => {
    const res = await getExpiringTechCertsAction({});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.length).toBe(2);
  });
});
