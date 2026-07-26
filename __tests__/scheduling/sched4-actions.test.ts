// SCHED-4 — gates: convert/unconvert to labour require financials:edit (it
// CREATES cost — Admin + Accountant, NOT PM/Technician); audit reads at
// scheduling:view.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/api/schedule-cost", () => ({
  convertBookingToLabour: vi.fn(async () => ({ ok: true, labourEntryId: "l1", hours: 2, amount: 160, costCenterId: "cc1" })),
  unconvertBooking: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/api/schedule-audit", () => ({
  listScheduleAudit: vi.fn(async () => []),
  recordScheduleAudit: vi.fn(async () => {}),
}));
// The rest of the imports the actions module pulls in.
vi.mock("@/lib/api/tech-certifications", () => ({
  listTechCertifications: vi.fn(), getCertsByTech: vi.fn(), createTechCertification: vi.fn(),
  updateTechCertification: vi.fn(), deleteTechCertification: vi.fn(),
}));
vi.mock("@/lib/api/tech-availability", () => ({
  getWorkingHours: vi.fn(), setWorkingHours: vi.fn(), listAbsences: vi.fn(),
  requestAbsence: vi.fn(), setAbsenceStatus: vi.fn(),
}));
vi.mock("@/lib/api/schedule-jobs", () => ({
  listScheduleJobs: vi.fn(), getScheduleJobById: vi.fn(), createScheduleJob: vi.fn(),
  createScheduleJobFromProjectJob: vi.fn(), updateScheduleJob: vi.fn(),
  setScheduleJobStatus: vi.fn(), deleteScheduleJob: vi.fn(),
}));
vi.mock("@/lib/api/schedule-assignments", () => ({
  createBooking: vi.fn(), moveBooking: vi.fn(), cancelBooking: vi.fn(), completeBooking: vi.fn(),
}));
vi.mock("@/lib/api/dispatch-board", () => ({ getDispatchBoard: vi.fn() }));
vi.mock("@/lib/api/techs", () => ({ listTechs: vi.fn(async () => []) }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  convertBookingToLabourAction,
  unconvertBookingAction,
  listScheduleAuditAction,
} from "@/app/(app)/scheduling/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("cost-seam gate (financials:edit)", () => {
  it("Admin and Accountant can convert / unconvert", async () => {
    for (const role of ["Admin", "Accountant"]) {
      h.profile = { id: "u1", role, status: "Active" };
      expect((await convertBookingToLabourAction({ assignmentId: "a1" })).ok).toBe(true);
      expect((await unconvertBookingAction("a1")).ok).toBe(true);
    }
  });

  it("Technician and ProjectManager (no financials:edit) cannot convert", async () => {
    for (const role of ["Technician", "ProjectManager"]) {
      h.profile = { id: "u1", role, status: "Active" };
      expect((await convertBookingToLabourAction({ assignmentId: "a1" })).ok).toBe(false);
      expect((await unconvertBookingAction("a1")).ok).toBe(false);
    }
  });
});

describe("audit read gate (scheduling:view)", () => {
  it("Technician can read the schedule history", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await listScheduleAuditAction({ scheduleJobId: "j1" })).ok).toBe(true);
  });
  it("unauthenticated denied", async () => {
    h.profile = null;
    expect((await listScheduleAuditAction({})).ok).toBe(false);
  });
});
