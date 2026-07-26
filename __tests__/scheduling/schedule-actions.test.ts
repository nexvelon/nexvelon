// SCHED-1 — scheduling action gates. Reads → scheduling:view (every signed-in
// role has it); mutations → scheduling:edit (Admin + ProjectManager/Dispatcher;
// Technician has view only).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/api/tech-certifications", () => ({
  listTechCertifications: vi.fn(async () => []),
  getCertsByTech: vi.fn(async () => ({})),
  createTechCertification: vi.fn(async () => ({ id: "c1" })),
  updateTechCertification: vi.fn(async () => {}),
  deleteTechCertification: vi.fn(async () => true),
}));
vi.mock("@/lib/api/schedule-jobs", () => ({
  listScheduleJobs: vi.fn(async () => []),
  getScheduleJobById: vi.fn(async () => null),
  createScheduleJob: vi.fn(async () => ({ id: "sj1", reference: "SVC-2026-0001", project_id: null })),
  createScheduleJobFromProjectJob: vi.fn(async () => ({ id: "sj1" })),
  updateScheduleJob: vi.fn(async () => {}),
  setScheduleJobStatus: vi.fn(async () => {}),
  deleteScheduleJob: vi.fn(async () => true),
}));
vi.mock("@/lib/api/schedule-assignments", () => ({
  createBooking: vi.fn(async () => ({ ok: true, booking: { id: "b1" } })),
  moveBooking: vi.fn(async () => ({ ok: true, booking: { id: "b1" } })),
  cancelBooking: vi.fn(async () => {}),
  completeBooking: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/dispatch-board", () => ({
  getDispatchBoard: vi.fn(async () => ({ techs: [], bookings: [], unscheduled: [], range: { from: "", to: "" } })),
}));
vi.mock("@/lib/api/techs", () => ({ listTechs: vi.fn(async () => []) }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listScheduleJobsAction,
  createScheduleJobAction,
  createBookingAction,
} from "@/app/(app)/scheduling/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("read gate (scheduling:view)", () => {
  it("Technician can read the backlog", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await listScheduleJobsAction()).ok).toBe(true);
  });
  it("unauthenticated is denied", async () => {
    h.profile = null;
    expect((await listScheduleJobsAction()).ok).toBe(false);
  });
});

describe("mutation gate (scheduling:edit)", () => {
  it("Technician (view-only) cannot create a job or a booking", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await createScheduleJobAction({ title: "x" })).ok).toBe(false);
    expect(
      (await createBookingAction({ scheduleJobId: "sj1", techId: "t1", startsAt: "a", endsAt: "b" })).ok
    ).toBe(false);
  });

  it("Dispatcher and Admin can create + book", async () => {
    for (const role of ["Dispatcher", "Admin"]) {
      h.profile = { id: "u1", role, status: "Active" };
      expect((await createScheduleJobAction({ title: "x" })).ok).toBe(true);
      expect(
        (await createBookingAction({ scheduleJobId: "sj1", techId: "t1", startsAt: "a", endsAt: "b" })).ok
      ).toBe(true);
    }
  });
});
