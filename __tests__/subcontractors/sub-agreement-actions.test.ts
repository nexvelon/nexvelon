// SUB-5 — gates on the work-order actions. Reads at subcontractors:view;
// create / issue / status at subcontractors:edit. A Technician (view-only for
// subcontractors) is denied the mutations; a ProjectManager is allowed.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listAgreements: vi.fn(async () => []),
  getAgreementById: vi.fn(async () => null),
  createAgreement: vi.fn(async () => ({ id: "wo1" })),
  updateAgreement: vi.fn(async () => ({ id: "wo1" })),
  issueAgreement: vi.fn(async () => ({ ok: true, agreement: { id: "wo1" }, pdfPath: null })),
  setAgreementStatus: vi.fn(async () => ({ id: "wo1" })),
  getAgreementPdfUrl: vi.fn(async () => null),
}));

vi.mock("@/lib/api/sub-agreements", () => ({
  listAgreements: h.listAgreements,
  getAgreementById: h.getAgreementById,
  createAgreement: h.createAgreement,
  updateAgreement: h.updateAgreement,
  issueAgreement: h.issueAgreement,
  setAgreementStatus: h.setAgreementStatus,
  getAgreementPdfUrl: h.getAgreementPdfUrl,
  jobLabel: () => "Main Job",
}));
// The actions module imports many sibling APIs; stub the ones it pulls in.
vi.mock("@/lib/api/subcontractors", () => new Proxy({}, {
  get: (_t, p) => (typeof p === "symbol" || p === "then" || p === "__esModule" ? undefined : vi.fn()),
}));
vi.mock("@/lib/api/subcontractor-compliance", () => new Proxy({}, {
  get: (_t, p) => (typeof p === "symbol" || p === "then" || p === "__esModule" ? undefined : vi.fn()),
}));
vi.mock("@/lib/api/projects", () => ({ listProjects: vi.fn(async () => []), listJobsForProject: vi.fn(async () => []) }));
vi.mock("@/lib/api/vendors", () => ({ getVendors: vi.fn(async () => []) }));
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachment: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listAgreementsAction,
  getAgreementByIdAction,
  createAgreementAction,
  issueAgreementAction,
  setAgreementStatusAction,
} from "@/app/(app)/subcontractors/actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READS = [
  () => listAgreementsAction({ subcontractorId: "sub1" }),
  () => getAgreementByIdAction("wo1"),
];
const MUTATIONS = [
  () => createAgreementAction({ subcontractorId: "sub1", title: "x" }),
  () => issueAgreementAction("wo1", "sub1", false),
  () => setAgreementStatusAction("wo1", "sub1", "in_progress"),
];
const MUTATION_FNS = [h.createAgreement, h.issueAgreement, h.setAgreementStatus];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listAgreements, h.getAgreementById]) fn.mockClear();
});

describe("work-order read gates (view)", () => {
  it("pass for a view-tier role (Technician)", async () => {
    setRole("Technician");
    for (const call of READS) expect((await call()).ok).toBe(true);
  });
  it("reject a role with no subcontractors access (Subcontractor login role)", async () => {
    setRole("Subcontractor");
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.listAgreements).not.toHaveBeenCalled();
  });
});

describe("work-order mutation gates (edit)", () => {
  it("reject a view-only role (Technician) for create / issue / status", async () => {
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
});
