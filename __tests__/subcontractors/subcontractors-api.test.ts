// SUB-1 — subcontractors API. Duplicate-name is surfaced as a typed error;
// updates guard the same; the list applies filters + the vendor join.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  // when set, the next insert/update resolves with this error (unique violation)
  nextError: null as { message: string } | null,
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    if (f.method === "eq") out = out.filter((r) => r[col] === val);
    if (f.method === "in") out = out.filter((r) => (val as unknown[]).includes(r[col]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "subcontractors") {
    if (ctx.op === "insert") {
      if (s.nextError) return { data: null, error: s.nextError };
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `sub-${s.inserted.length + 1}`, ...p };
      s.inserted.push(p);
      s.rows = [...s.rows, row];
      return { data: row, error: null };
    }
    if (ctx.op === "update") {
      if (s.nextError) return { data: null, error: s.nextError };
      const p = ctx.payload as Record<string, unknown>;
      s.updated.push(p);
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      s.rows = s.rows.map((r) => (r.id === id ? { ...r, ...p } : r));
      return { data: s.rows.find((r) => r.id === id) ?? null, error: null };
    }
    const rows = filt(s.rows, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  listSubcontractors,
  getSubcontractorById,
  createSubcontractor,
  updateSubcontractor,
  linkVendor,
  SubcontractorError,
} from "@/lib/api/subcontractors";

beforeEach(() => {
  s.rows = [];
  s.inserted = [];
  s.updated = [];
  s.nextError = null;
});

describe("createSubcontractor", () => {
  it("inserts and stamps the actor", async () => {
    const row = await createSubcontractor({ name: "ADI Labour" }, "u1");
    expect(s.inserted[0]).toMatchObject({ name: "ADI Labour", created_by: "u1", updated_by: "u1" });
    expect(row.id).toBe("sub-1");
  });

  it("surfaces a unique violation as a typed duplicate_name error", async () => {
    s.nextError = { message: 'duplicate key value violates unique constraint "subcontractors_name_unique"' };
    await expect(createSubcontractor({ name: "acme" }, "u1")).rejects.toMatchObject({
      code: "duplicate_name",
    });
    await expect(createSubcontractor({ name: "acme" }, "u1")).rejects.toBeInstanceOf(SubcontractorError);
  });
});

describe("updateSubcontractor", () => {
  it("guards duplicate name on rename", async () => {
    s.nextError = { message: "duplicate key value ... subcontractors_name_unique" };
    await expect(updateSubcontractor("sub-1", { name: "taken" }, "u1")).rejects.toMatchObject({
      code: "duplicate_name",
    });
  });

  it("writes the patch + actor when the name is unique", async () => {
    s.rows = [{ id: "sub-1", name: "Old" }];
    await updateSubcontractor("sub-1", { trade: "Monitoring" }, "u2");
    expect(s.updated[0]).toMatchObject({ trade: "Monitoring", updated_by: "u2" });
  });
});

describe("listSubcontractors", () => {
  beforeEach(() => {
    s.rows = [
      { id: "s1", name: "Acme Cabling", trade: "Cabling", contact_name: "Al", email: "al@a.co", status: "active", vendor: { name: "Acme Supply" } },
      { id: "s2", name: "Beta Monitoring", trade: "Monitoring", contact_name: "Bo", email: "bo@b.co", status: "inactive", vendor: null },
      { id: "s3", name: "Gamma Fire", trade: "Fire Alarm", contact_name: "Gil", email: "g@g.co", status: "active", vendor: null },
    ];
  });

  it("filters by status and splits out the vendor join name", async () => {
    const rows = await listSubcontractors({ status: "active" });
    expect(rows.map((r) => r.id)).toEqual(["s1", "s3"]);
    expect(rows[0].vendor_name).toBe("Acme Supply");
    expect(rows[1].vendor_name).toBeNull();
    // the joined `vendor` object is not leaked onto the row
    expect((rows[0] as unknown as { vendor?: unknown }).vendor).toBeUndefined();
  });

  it("filters by trade", async () => {
    const rows = await listSubcontractors({ trade: "Monitoring" });
    expect(rows.map((r) => r.id)).toEqual(["s2"]);
  });

  it("applies a text search across name / trade / contact", async () => {
    const rows = await listSubcontractors({ search: "monitor" });
    expect(rows.map((r) => r.id)).toEqual(["s2"]);
    const byContact = await listSubcontractors({ search: "gil" });
    expect(byContact.map((r) => r.id)).toEqual(["s3"]);
  });
});

describe("linkVendor", () => {
  it("sets and clears the vendor link", async () => {
    s.rows = [{ id: "s1", name: "Acme", vendor_id: null }];
    await linkVendor("s1", "v9", "u1");
    expect(s.updated[0]).toMatchObject({ vendor_id: "v9", updated_by: "u1" });
    await linkVendor("s1", null, "u1");
    expect(s.updated[1]).toMatchObject({ vendor_id: null });
  });
});

describe("getSubcontractorById", () => {
  it("returns null when absent, the row (vendor split) when present", async () => {
    expect(await getSubcontractorById("nope")).toBeNull();
    s.rows = [{ id: "s1", name: "Acme", vendor: { name: "Acme Supply" } }];
    const got = await getSubcontractorById("s1");
    expect(got?.vendor_name).toBe("Acme Supply");
  });
});
