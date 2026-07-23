// SUB-1 — permission gates on the subcontractors actions. The grant matrix:
//   Admin        — everything
//   ProjectManager — view/create/edit, NOT delete
//   Accountant   — view only (for T5018/AP later)
//   SalesRep / Technician / ViewOnly — view only
//   Subcontractor (login role) — NOTHING (a sub must not browse the roster)

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listSubcontractors: vi.fn(async () => []),
  listSubcontractorTrades: vi.fn(async () => []),
  getSubcontractorById: vi.fn(async () => ({ id: "s1", name: "Acme" })),
  createSubcontractor: vi.fn(async () => ({ id: "s1" })),
  updateSubcontractor: vi.fn(async () => ({ id: "s1" })),
  deleteSubcontractor: vi.fn(async () => true),
  linkVendor: vi.fn(async () => ({ id: "s1" })),
}));

vi.mock("@/lib/api/subcontractors", () => ({
  listSubcontractors: h.listSubcontractors,
  listSubcontractorTrades: h.listSubcontractorTrades,
  getSubcontractorById: h.getSubcontractorById,
  createSubcontractor: h.createSubcontractor,
  updateSubcontractor: h.updateSubcontractor,
  deleteSubcontractor: h.deleteSubcontractor,
  linkVendor: h.linkVendor,
}));
vi.mock("@/lib/api/vendors", () => ({ getVendors: vi.fn(async () => []) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listSubcontractorsAction,
  getSubcontractorAction,
  createSubcontractorAction,
  updateSubcontractorAction,
  deleteSubcontractorAction,
  linkVendorAction,
} from "@/app/(app)/subcontractors/actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READS = [
  () => listSubcontractorsAction({}),
  () => getSubcontractorAction("s1"),
];
const CREATE = () => createSubcontractorAction({ name: "New Sub" });
const EDIT = () => updateSubcontractorAction("s1", { trade: "X" });
const DELETE = () => deleteSubcontractorAction("s1");
const LINK = () => linkVendorAction("s1", "v1");

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of Object.values(h)) if (typeof fn === "function") (fn as ReturnType<typeof vi.fn>).mockClear?.();
});

async function allOk(calls: (() => Promise<{ ok: boolean }>)[]) {
  for (const c of calls) expect((await c()).ok).toBe(true);
}
async function allDenied(calls: (() => Promise<{ ok: boolean }>)[]) {
  for (const c of calls) expect((await c()).ok).toBe(false);
}

describe("Admin", () => {
  it("can do everything", async () => {
    setRole("Admin");
    await allOk([...READS, CREATE, EDIT, DELETE, LINK]);
  });
});

describe("ProjectManager", () => {
  it("view/create/edit/link yes, delete NO", async () => {
    setRole("ProjectManager");
    await allOk([...READS, CREATE, EDIT, LINK]);
    expect((await DELETE()).ok).toBe(false);
    expect(h.deleteSubcontractor).not.toHaveBeenCalled();
  });
});

describe("Accountant", () => {
  it("view only — no create/edit/delete", async () => {
    setRole("Accountant");
    await allOk(READS);
    await allDenied([CREATE, EDIT, DELETE, LINK]);
  });
});

describe("Technician & SalesRep & ViewOnly", () => {
  it("view only", async () => {
    for (const role of ["Technician", "SalesRep", "ViewOnly"]) {
      setRole(role);
      await allOk(READS);
      await allDenied([CREATE, EDIT, DELETE]);
    }
  });
});

describe("Subcontractor login role", () => {
  it("is denied even view — a sub must not browse the roster", async () => {
    setRole("Subcontractor");
    await allDenied([...READS, CREATE, EDIT, DELETE, LINK]);
    expect(h.listSubcontractors).not.toHaveBeenCalled();
  });
});

describe("unauthenticated", () => {
  it("is denied everything", async () => {
    h.profile = null;
    await allDenied([...READS, CREATE, EDIT, DELETE, LINK]);
  });
});
