// SEC-2 — vendor banking (account_number) is encrypted at rest and never leaves
// the server except via a permission-gated, audited single-record reveal.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const KEY = Buffer.alloc(32, 5).toString("base64");

const h = vi.hoisted(() => ({
  canFinancialsView: false,
  vendorRow: {} as Record<string, unknown>,
  vendorList: [] as Record<string, unknown>[],
  captured: null as unknown, // insert/update payload capture
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/permissions/resolve", () => ({
  adaptDbRole: (r: string) => r,
  can: async (resource: string, action: string) =>
    resource === "financials" && action === "view" ? h.canFinancialsView : false,
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Accountant", status: "Active" }),
}));
vi.mock("@/lib/api/activity-log", () => ({
  logActivity: h.logActivity,
  computeChanges: (before: Record<string, unknown>, after: Record<string, unknown>) => {
    const out: Record<string, { from: unknown; to: unknown }> = {};
    for (const k in after) {
      if (after[k] === undefined) continue;
      if (JSON.stringify(after[k]) !== JSON.stringify(before[k]))
        out[k] = { from: before[k] ?? null, to: after[k] ?? null };
    }
    return out;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table !== "vendors") return { data: null, error: null };
  if (ctx.op === "insert" || ctx.op === "update") {
    h.captured = ctx.payload;
    return { data: h.vendorRow, error: null };
  }
  if (ctx.terminal === "await") return { data: h.vendorList, error: null };
  return { data: h.vendorRow, error: null }; // maybeSingle / single
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeSupabaseMock(resolve, { user: { id: "u1" } }),
}));

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = KEY;
  h.canFinancialsView = false;
  h.captured = null;
  h.logActivity.mockClear();
});
afterEach(() => {
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
});

describe("SEC-2 vendor banking — reads never carry the account number", () => {
  it("getVendors strips both credential columns, exposes only has_account_number", async () => {
    const { aesGcmEncrypt, decodeKey } = await import("@/lib/crypto/aes-gcm");
    const enc = aesGcmEncrypt("000987654", decodeKey(KEY));
    h.vendorList = [
      { id: "v1", name: "ADI", account_number: null, account_number_encrypted: enc, is_active: true },
      { id: "v2", name: "Anixter", account_number: null, account_number_encrypted: null, is_active: true },
    ];
    const { getVendors } = await import("@/lib/api/vendors");
    const rows = await getVendors();
    expect(rows[0].has_account_number).toBe(true);
    expect(rows[1].has_account_number).toBe(false);
    // Neither the plaintext nor the ciphertext leaves the server.
    expect("account_number" in rows[0]).toBe(false);
    expect("account_number_encrypted" in rows[0]).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("000987654");
    expect(JSON.stringify(rows)).not.toContain(enc);
  });
});

describe("SEC-2 vendor banking — encrypt on write", () => {
  it("createVendor encrypts account_number and never writes plaintext", async () => {
    h.vendorRow = { id: "v1", name: "ADI", account_number: null, account_number_encrypted: "x" };
    const { createVendor } = await import("@/lib/api/vendors");
    const { aesGcmDecrypt, decodeKey, looksEncrypted } = await import("@/lib/crypto/aes-gcm");
    await createVendor({ name: "ADI", account_number: "000987654" } as never);
    const payload = h.captured as { account_number: unknown; account_number_encrypted: string };
    expect(payload.account_number).toBeNull(); // plaintext column never populated
    expect(looksEncrypted(payload.account_number_encrypted)).toBe(true);
    // …and the ciphertext round-trips to the original.
    expect(aesGcmDecrypt(payload.account_number_encrypted, decodeKey(KEY))).toBe("000987654");
  });
});

describe("SEC-2 vendor banking — reveal is gated, audited, fail-closed", () => {
  it("denies the reveal without financials:view", async () => {
    h.canFinancialsView = false;
    const { revealVendorAccountNumberAction } = await import("@/app/(app)/vendors/actions");
    const res = await revealVendorAccountNumberAction("v1");
    expect(res.ok).toBe(false);
    expect(h.logActivity).not.toHaveBeenCalled();
  });

  it("reveals to a permitted caller and audits WITHOUT the value", async () => {
    h.canFinancialsView = true;
    const { aesGcmEncrypt, decodeKey } = await import("@/lib/crypto/aes-gcm");
    const enc = aesGcmEncrypt("000987654", decodeKey(KEY));
    h.vendorRow = { id: "v1", name: "ADI", account_number: null, account_number_encrypted: enc };
    const { revealVendorAccountNumberAction } = await import("@/app/(app)/vendors/actions");
    const res = await revealVendorAccountNumberAction("v1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.value).toBe("000987654");
    // Audit row written, naming the vendor, NEVER the value.
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const [type, , action, changes] = h.logActivity.mock.calls[0] as unknown as [
      string, string, string, Record<string, unknown>
    ];
    expect(type).toBe("vendor");
    expect(action).toBe("update");
    expect(JSON.stringify(changes)).not.toContain("000987654");
  });

  it("fails closed when the key is missing — masked, never plaintext", async () => {
    h.canFinancialsView = true;
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const { revealVendorAccountNumberAction } = await import("@/app/(app)/vendors/actions");
    const res = await revealVendorAccountNumberAction("v1");
    expect(res.ok).toBe(false); // isEncryptionConfigured() is false → refuse
  });
});
