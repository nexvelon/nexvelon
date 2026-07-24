// PROJ2-16 — gates on the site-log actions. Reads at projects:view, mutations
// projects:edit. Technician (view-only) is denied mutations; the create action
// surfaces log_exists (with the existing id) rather than a raw error.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listLogsForJob: vi.fn(async () => []),
  getRecentLogsForProject: vi.fn(async () => []),
  createLog: vi.fn(async () => ({ id: "log1" })),
  submitLog: vi.fn(async () => ({ id: "log1" })),
  addCrew: vi.fn(async () => ({ id: "c1" })),
}));

// A hoisted SiteLogError stand-in so the action's `instanceof` check works.
const SiteLogErrorMock = vi.hoisted(() => {
  return class SiteLogError extends Error {
    code: string;
    existingId?: string;
    constructor(code: string, message: string, existingId?: string) {
      super(message);
      this.code = code;
      this.existingId = existingId;
    }
  };
});

vi.mock("@/lib/api/site-logs", () => ({
  SiteLogError: SiteLogErrorMock,
  listLogsForJob: h.listLogsForJob,
  getLogById: vi.fn(async () => null),
  getRecentLogsForProject: h.getRecentLogsForProject,
  createLog: h.createLog,
  updateLog: vi.fn(async () => ({ id: "log1" })),
  submitLog: h.submitLog,
  deleteLog: vi.fn(async () => true),
  addCrew: h.addCrew,
  updateCrew: vi.fn(async () => ({ id: "c1" })),
  removeCrew: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listLogsForJobAction,
  getRecentLogsForProjectAction,
  createLogAction,
  submitLogAction,
  addCrewAction,
} from "@/app/(app)/projects/site-log-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READS = [
  () => listLogsForJobAction("job1"),
  () => getRecentLogsForProjectAction("p1"),
];
const MUTATIONS = [
  () => createLogAction({ jobId: "job1" }, "p1"),
  () => submitLogAction("log1", "p1", "job1"),
  () => addCrewAction({ siteLogId: "log1", techId: "t1" }, "p1", "job1"),
];
const MUTATION_FNS = [h.createLog, h.submitLog, h.addCrew];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listLogsForJob]) fn.mockClear();
  h.createLog.mockImplementation(async () => ({ id: "log1" }));
});

describe("read gate (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    for (const call of READS) expect((await call()).ok).toBe(true);
  });
  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.listLogsForJob).not.toHaveBeenCalled();
  });
});

describe("mutation gate (projects:edit)", () => {
  it("rejects a projects:view-only role (Technician) for every mutation", async () => {
    setRole("Technician");
    for (const call of MUTATIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("passes for ProjectManager and Admin", async () => {
    for (const role of ["ProjectManager", "Admin"]) {
      setRole(role);
      for (const call of MUTATIONS) expect((await call()).ok).toBe(true);
    }
  });
});

describe("createLogAction — log_exists surfacing", () => {
  it("returns log_exists + the existing id when the day already has a log", async () => {
    h.createLog.mockImplementationOnce(async () => {
      throw new SiteLogErrorMock("log_exists", "exists", "log-existing");
    });
    const res = await createLogAction({ jobId: "job1" }, "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("log_exists");
      expect(res.existingId).toBe("log-existing");
    }
  });
});
