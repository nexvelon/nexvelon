// SCHED-3 — availability action gates: working-hours + absence reads at
// scheduling:view; mutations (set hours, request/approve absence) at
// scheduling:edit. Technician has view only; Dispatcher/Admin can mutate.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/api/tech-availability", () => ({
  getWorkingHours: vi.fn(async () => []),
  setWorkingHours: vi.fn(async () => {}),
  listAbsences: vi.fn(async () => []),
  requestAbsence: vi.fn(async () => ({ id: "a1" })),
  setAbsenceStatus: vi.fn(async () => {}),
}));
// Silence the other lib imports the actions module pulls in.
vi.mock("@/lib/api/tech-certifications", () => ({
  listTechCertifications: vi.fn(), getCertsByTech: vi.fn(), createTechCertification: vi.fn(),
  updateTechCertification: vi.fn(), deleteTechCertification: vi.fn(),
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
  getWorkingHoursAction,
  setWorkingHoursAction,
  requestAbsenceAction,
  setAbsenceStatusAction,
} from "@/app/(app)/scheduling/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("read gate (scheduling:view)", () => {
  it("Technician can read working hours", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await getWorkingHoursAction("t1")).ok).toBe(true);
  });
  it("unauthenticated denied", async () => {
    h.profile = null;
    expect((await getWorkingHoursAction("t1")).ok).toBe(false);
  });
});

describe("mutation gate (scheduling:edit)", () => {
  it("Technician (view-only) cannot set hours, request, or approve", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await setWorkingHoursAction("t1", [])).ok).toBe(false);
    expect((await requestAbsenceAction({ techId: "t1", startsAt: "a", endsAt: "b" })).ok).toBe(false);
    expect((await setAbsenceStatusAction("a1", "approved")).ok).toBe(false);
  });
  it("Dispatcher and Admin can set hours + approve absences", async () => {
    for (const role of ["Dispatcher", "Admin"]) {
      h.profile = { id: "u1", role, status: "Active" };
      expect((await setWorkingHoursAction("t1", [])).ok).toBe(true);
      expect((await setAbsenceStatusAction("a1", "approved")).ok).toBe(true);
    }
  });
});
