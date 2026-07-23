// PROJ2-11 — gates on the task actions. Tasks are project data, so reads gate
// projects:view and mutations gate projects:edit (the same rationale SUB-6's
// assignment actions use). A Technician (projects view-only) is denied every
// mutation; a ProjectManager is allowed.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listTasksForJob: vi.fn(async () => []),
  listTasksForProject: vi.fn(async () => []),
  getTaskAssigneeOptions: vi.fn(async () => ({ techs: [], subcontractors: [] })),
  createTask: vi.fn(async () => ({ id: "t1" })),
  updateTask: vi.fn(async () => ({ id: "t1" })),
  setTaskStatus: vi.fn(async () => ({ id: "t1" })),
  reorderTasks: vi.fn(async () => 2),
  deleteTask: vi.fn(async () => true),
}));

vi.mock("@/lib/api/job-tasks", () => ({
  listTasksForJob: h.listTasksForJob,
  listTasksForProject: h.listTasksForProject,
  getTaskById: vi.fn(async () => null),
  getTaskAssigneeOptions: h.getTaskAssigneeOptions,
  createTask: h.createTask,
  updateTask: h.updateTask,
  setTaskStatus: h.setTaskStatus,
  reorderTasks: h.reorderTasks,
  deleteTask: h.deleteTask,
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listTasksForJobAction,
  listTasksForProjectAction,
  getTaskAssigneeOptionsAction,
  createTaskAction,
  updateTaskAction,
  setTaskStatusAction,
  reorderTasksAction,
  deleteTaskAction,
} from "@/app/(app)/projects/task-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READS = [
  () => listTasksForJobAction("job1"),
  () => listTasksForProjectAction("p1"),
  () => getTaskAssigneeOptionsAction(),
];

const MUTATIONS = [
  () => createTaskAction({ projectId: "p1", jobId: "job1", title: "t" }),
  () => updateTaskAction("t1", "p1", { title: "x" }, "job1"),
  () => setTaskStatusAction("t1", "p1", "done", "job1"),
  () => reorderTasksAction(["t1", "t2"], "todo", "p1", "job1"),
  () => deleteTaskAction("t1", "p1", "job1"),
];

const MUTATION_FNS = [
  h.createTask,
  h.updateTask,
  h.setTaskStatus,
  h.reorderTasks,
  h.deleteTask,
];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listTasksForJob, h.listTasksForProject]) {
    fn.mockClear();
  }
});

describe("task read gate (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    for (const call of READS) expect((await call()).ok).toBe(true);
  });

  it("rejects an unauthenticated caller (every app role has projects:view)", async () => {
    h.profile = null;
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.listTasksForJob).not.toHaveBeenCalled();
  });
});

describe("task mutation gate (projects:edit)", () => {
  it("rejects a projects:view-only role (Technician) for every mutation", async () => {
    setRole("Technician");
    for (const call of MUTATIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller for every mutation", async () => {
    h.profile = null;
    for (const call of MUTATIONS) expect((await call()).ok).toBe(false);
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("passes for ProjectManager and Admin", async () => {
    for (const role of ["ProjectManager", "Admin"]) {
      setRole(role);
      for (const call of MUTATIONS) expect((await call()).ok).toBe(true);
    }
  });
});
