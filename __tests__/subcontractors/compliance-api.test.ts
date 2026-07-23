// SUB-2 — compliance API. Date-order guard, expiry-ordered list with the
// attachment join, and delete returning the attachment id for cleanup.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  docs: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  deleted: [] as string[],
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
  if (ctx.table === "subcontractor_compliance_docs") {
    if (ctx.op === "insert") {
      const p = ctx.payload as Record<string, unknown>;
      const row = { id: `doc-${s.inserted.length + 1}`, ...p };
      s.inserted.push(p);
      s.docs = [...s.docs, row];
      return { data: row, error: null };
    }
    if (ctx.op === "update") {
      s.updated.push(ctx.payload as Record<string, unknown>);
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      s.docs = s.docs.map((d) => (d.id === id ? { ...d, ...(ctx.payload as object) } : d));
      return { data: s.docs.find((d) => d.id === id) ?? null, error: null };
    }
    if (ctx.op === "delete") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1] as string;
      const removed = s.docs.find((d) => d.id === id);
      s.docs = s.docs.filter((d) => d.id !== id);
      s.deleted.push(id);
      return { data: removed ? [{ id, attachment_id: removed.attachment_id ?? null }] : [], error: null };
    }
    const rows = filt(s.docs, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  listComplianceDocs,
  createComplianceDoc,
  updateComplianceDoc,
  deleteComplianceDoc,
  ComplianceError,
} from "@/lib/api/subcontractor-compliance";

beforeEach(() => {
  s.docs = [];
  s.inserted = [];
  s.updated = [];
  s.deleted = [];
});

describe("createComplianceDoc", () => {
  it("rejects expiry before issue with a typed invalid_dates error", async () => {
    await expect(
      createComplianceDoc({
        subcontractorId: "sub1",
        docType: "wsib_clearance",
        issuedDate: "2026-07-01",
        expiryDate: "2026-06-01",
      })
    ).rejects.toMatchObject({ code: "invalid_dates" });
    await expect(
      createComplianceDoc({
        subcontractorId: "sub1",
        docType: "wsib_clearance",
        issuedDate: "2026-07-01",
        expiryDate: "2026-06-01",
      })
    ).rejects.toBeInstanceOf(ComplianceError);
    expect(s.inserted).toHaveLength(0);
  });

  it("inserts with the actor + attachment link", async () => {
    await createComplianceDoc({
      subcontractorId: "sub1",
      docType: "liability_insurance",
      issuer: "Intact",
      expiryDate: "2027-01-01",
      coverageAmount: 2_000_000,
      attachmentId: "att-9",
      actorId: "u1",
    });
    expect(s.inserted[0]).toMatchObject({
      subcontractor_id: "sub1",
      doc_type: "liability_insurance",
      issuer: "Intact",
      coverage_amount: 2_000_000,
      attachment_id: "att-9",
      created_by: "u1",
    });
  });

  it("allows a permanent doc (no expiry) and equal issue==expiry", async () => {
    await createComplianceDoc({ subcontractorId: "sub1", docType: "qualification" });
    await createComplianceDoc({
      subcontractorId: "sub1",
      docType: "license",
      issuedDate: "2026-07-01",
      expiryDate: "2026-07-01",
    });
    expect(s.inserted).toHaveLength(2);
  });
});

describe("listComplianceDocs", () => {
  it("orders by expiry ASC (nulls last) and splits the attachment filename", async () => {
    // the mock returns in insertion order; the real order() is a DB concern, so
    // here we assert the join split + shape rather than DB ordering.
    s.docs = [
      { id: "d1", subcontractor_id: "sub1", doc_type: "wsib_clearance", expiry_date: "2026-09-01", attachment: { filename: "wsib.pdf" } },
      { id: "d2", subcontractor_id: "sub1", doc_type: "license", expiry_date: null, attachment: null },
    ];
    const rows = await listComplianceDocs("sub1");
    expect(rows).toHaveLength(2);
    expect(rows[0].attachment_filename).toBe("wsib.pdf");
    expect(rows[1].attachment_filename).toBeNull();
    // the raw join object is not leaked
    expect((rows[0] as unknown as { attachment?: unknown }).attachment).toBeUndefined();
  });
});

describe("updateComplianceDoc", () => {
  it("no-ops nothing at the API level but validates the effective dates", async () => {
    s.docs = [{ id: "d1", issued_date: "2026-07-01", expiry_date: "2027-01-01" }];
    // moving expiry before the existing issue is rejected
    await expect(
      updateComplianceDoc("d1", { expiry_date: "2026-01-01" }, "u1")
    ).rejects.toMatchObject({ code: "invalid_dates" });
    // a valid patch writes + stamps
    await updateComplianceDoc("d1", { issuer: "WSIB" }, "u2");
    expect(s.updated.at(-1)).toMatchObject({ issuer: "WSIB", updated_by: "u2" });
  });
});

describe("deleteComplianceDoc", () => {
  it("returns the linked attachment id so the caller can clean the blob", async () => {
    s.docs = [{ id: "d1", attachment_id: "att-7" }];
    const res = await deleteComplianceDoc("d1");
    expect(res).toEqual({ removed: true, attachmentId: "att-7" });
    expect(s.deleted).toContain("d1");
  });
  it("reports removed:false + null attachment for an unknown id", async () => {
    const res = await deleteComplianceDoc("nope");
    expect(res).toEqual({ removed: false, attachmentId: null });
  });
});
