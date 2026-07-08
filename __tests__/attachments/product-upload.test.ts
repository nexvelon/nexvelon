// BUGFIX (product attachments never upload) — createAttachment for a product
// must succeed for an inventory EDITOR (not just Admin). The bug: it gated on
// inventory:create, which no role except Admin holds, so every ProjectManager /
// operator was silently denied. Keeps the REAL permissions matrix; mocks the
// supabase server client + auth + activity log.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  insert: null as Record<string, unknown> | null,
  insertError: null as { message: string } | null,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "attachments" && ctx.op === "insert") {
    h.insert = ctx.payload as Record<string, unknown>;
    if (h.insertError) return { data: null, error: h.insertError };
    return { data: { id: "att-1", ...(ctx.payload as object) }, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve, { user: { id: "u1" } }),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAttachment } from "@/app/(app)/attachments/actions";

const FILE = {
  path: "product/prod-1/1700000000-datasheet.pdf",
  filename: "datasheet.pdf",
  contentType: "application/pdf",
  size: 12345,
};

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.insert = null;
  h.insertError = null;
});

describe("createAttachment — product write gate (bugfix)", () => {
  it("SUCCEEDS for an inventory editor (ProjectManager) — the reported bug", async () => {
    // ProjectManager has inventory:edit but NOT inventory:create. Before the fix
    // this was denied; after the fix (gate on edit) it must succeed.
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    const res = await createAttachment("product", "prod-1", "Shop Drawings", FILE);
    expect(res.ok).toBe(true);
    expect(h.insert).toMatchObject({
      entity_type: "product",
      entity_id: "prod-1",
      folder: "Shop Drawings",
      bucket: "attachments",
      path: FILE.path,
      filename: "datasheet.pdf",
    });
  });

  it("SUCCEEDS for Admin (full permissions)", async () => {
    const res = await createAttachment("product", "prod-1", "Data Sheets", FILE);
    expect(res.ok).toBe(true);
  });

  it("is FORBIDDEN for a role without inventory:edit (Technician — view only)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    const res = await createAttachment("product", "prod-1", "Manual", FILE);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.insert).toBeNull(); // gate rejected before any DB write
  });

  it("is FORBIDDEN for an unauthenticated caller", async () => {
    h.profile = null;
    const res = await createAttachment("product", "prod-1", "Misc", FILE);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/signed in/i);
    expect(h.insert).toBeNull();
  });

  it("surfaces a DB-insert error to the caller (no silent hang)", async () => {
    // Storage upload already succeeded client-side; the DB row insert fails.
    h.insertError = { message: "duplicate key value violates unique constraint" };
    const res = await createAttachment("product", "prod-1", "Shop Drawings", FILE);
    expect(res.ok).toBe(false);
    // The caller (AttachmentsSection) throws on !ok, rolls back the storage
    // object, and toasts THIS message — never leaving the spinner hanging.
    if (!res.ok) expect(res.error).toMatch(/duplicate key/i);
  });
});
