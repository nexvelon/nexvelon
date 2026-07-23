// SUB-2 — permission gates on the compliance actions. Reads at
// subcontractors:view; mutations at subcontractors:edit — same tiers as SUB-1.
// The doc-delete also fires the shared attachment cleanup.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listComplianceDocs: vi.fn(async () => []),
  getComplianceSummary: vi.fn(async () => ({ expired: 0, expiring_soon: 0, valid: 0, worst: "ok", missing_required: [] })),
  getComplianceSummariesForSubs: vi.fn(async () => new Map()),
  createComplianceDoc: vi.fn(async () => ({ id: "doc1" })),
  updateComplianceDoc: vi.fn(async () => ({ id: "doc1" })),
  deleteComplianceDoc: vi.fn(async () => ({ removed: true, attachmentId: "att-1" })),
  deleteAttachment: vi.fn(async () => ({ ok: true, data: { id: "att-1" } })),
}));

vi.mock("@/lib/api/subcontractor-compliance", () => ({
  listComplianceDocs: h.listComplianceDocs,
  getComplianceSummary: h.getComplianceSummary,
  getComplianceSummariesForSubs: h.getComplianceSummariesForSubs,
  createComplianceDoc: h.createComplianceDoc,
  updateComplianceDoc: h.updateComplianceDoc,
  deleteComplianceDoc: h.deleteComplianceDoc,
}));
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachment: h.deleteAttachment }));
vi.mock("@/lib/api/subcontractors", () => new Proxy({}, {
  get: (_t, p) => (typeof p === "symbol" || p === "then" || p === "__esModule" ? undefined : vi.fn()),
}));
vi.mock("@/lib/api/vendors", () => ({ getVendors: vi.fn(async () => []) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listComplianceDocsAction,
  createComplianceDocAction,
  updateComplianceDocAction,
  deleteComplianceDocAction,
} from "@/app/(app)/subcontractors/actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READ = () => listComplianceDocsAction("sub1");
const CREATE = () => createComplianceDocAction({ subcontractorId: "sub1", docType: "wsib_clearance" });
const UPDATE = () => updateComplianceDocAction("doc1", "sub1", { issuer: "WSIB" });
const DELETE = () => deleteComplianceDocAction("doc1", "sub1");
const MUTATIONS = [CREATE, UPDATE, DELETE];
const MUTATION_FNS = [h.createComplianceDoc, h.updateComplianceDoc, h.deleteComplianceDoc];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listComplianceDocs, h.getComplianceSummary, h.deleteAttachment]) fn.mockClear();
});

describe("compliance reads (view)", () => {
  it("pass for a view-tier role (Technician)", async () => {
    setRole("Technician");
    expect((await READ()).ok).toBe(true);
  });
  it("reject a role with no subcontractors access (Subcontractor login role)", async () => {
    setRole("Subcontractor");
    expect((await READ()).ok).toBe(false);
    expect(h.listComplianceDocs).not.toHaveBeenCalled();
  });
});

describe("compliance mutations (edit)", () => {
  it("reject a view-only role (Technician)", async () => {
    setRole("Technician");
    for (const call of MUTATIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("pass for ProjectManager and Admin", async () => {
    for (const role of ["ProjectManager", "Admin"]) {
      setRole(role);
      for (const call of MUTATIONS) expect((await call()).ok).toBe(true);
    }
  });

  it("delete also cleans up the linked attachment", async () => {
    setRole("Admin");
    await DELETE();
    expect(h.deleteComplianceDoc).toHaveBeenCalledWith("doc1");
    expect(h.deleteAttachment).toHaveBeenCalledWith("att-1");
  });
});
