// DEVREG-1 — every Device Register action is gated server-side: reads need
// projects:view, writes and import need projects:edit, removal needs
// projects:delete. A denied call never reaches the data layer.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  grants: new Set<string>(),
  signedIn: true,
  api: {
    listDevices: vi.fn(async () => []),
    getDevice: vi.fn(async () => null),
    createDevice: vi.fn(async () => ({ id: "d1" })),
    updateDevice: vi.fn(async () => ({ id: "d1" })),
    removeDevice: vi.fn(async () => {}),
    listFloorsForSite: vi.fn(async () => []),
    createFloor: vi.fn(async () => ({ id: "f1" })),
    updateFloor: vi.fn(async () => ({ id: "f1" })),
    previewDeviceImport: vi.fn(async () => ({ fileErrors: [], unknownHeaders: [], rows: [], counts: {} })),
    commitDeviceImport: vi.fn(async () => ({ created: 0 })),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => (h.signedIn ? { id: "u1", role: "ProjectManager" } : null) }));
vi.mock("@/lib/permissions/resolve", () => ({ can: async (r: string, a: string) => h.grants.has(`${r}:${a}`) }));
vi.mock("@/lib/api/devices", () => h.api);

import {
  listDevicesAction,
  getDeviceAction,
  createDeviceAction,
  updateDeviceAction,
  removeDeviceAction,
  saveFloorAction,
  previewDeviceImportAction,
  commitDeviceImportAction,
} from "@/app/(app)/devices/actions";

function callAll() {
  return {
    list: () => listDevicesAction({}),
    get: () => getDeviceAction("d1"),
    create: () => createDeviceAction({ siteId: "s1", projectId: null, fields: { label: "CAM-01" } }),
    update: () => updateDeviceAction("d1", { fields: { model: "x" } }),
    remove: () => removeDeviceAction("d1"),
    floor: () => saveFloorAction({ siteId: "s1", floor: { label: "L2" } }),
    preview: () => previewDeviceImportAction({ siteId: "s1", rows: [["label", "type"]] }),
    commit: () => commitDeviceImportAction({ siteId: "s1", projectId: null, rows: [["label", "type"]], fileName: null }),
  };
}

beforeEach(() => {
  h.grants = new Set();
  h.signedIn = true;
  for (const fn of Object.values(h.api)) fn.mockClear();
});

describe("Device Register gating", () => {
  it("with no grants, every action is refused and nothing touches the data layer", async () => {
    for (const call of Object.values(callAll())) {
      const r = await call();
      expect(r.ok).toBe(false);
    }
    for (const fn of Object.values(h.api)) expect(fn).not.toHaveBeenCalled();
  });

  it("signed out is refused", async () => {
    h.signedIn = false;
    h.grants = new Set(["projects:view", "projects:edit", "projects:delete"]);
    expect(await listDevicesAction({})).toEqual({ ok: false, error: "You're not signed in." });
  });

  it("projects:view allows reads only", async () => {
    h.grants = new Set(["projects:view"]);
    const c = callAll();
    expect((await c.list()).ok).toBe(true);
    expect((await c.get()).ok).toBe(true);
    for (const k of ["create", "update", "remove", "floor", "preview", "commit"] as const) {
      expect((await c[k]()).ok).toBe(false);
    }
    expect(h.api.createDevice).not.toHaveBeenCalled();
    expect(h.api.commitDeviceImport).not.toHaveBeenCalled();
  });

  it("projects:edit allows create, edit, floors and import, but not removal", async () => {
    h.grants = new Set(["projects:view", "projects:edit"]);
    const c = callAll();
    for (const k of ["create", "update", "floor", "preview", "commit"] as const) {
      expect((await c[k]()).ok).toBe(true);
    }
    const r = await c.remove();
    expect(r).toEqual({ ok: false, error: "You don't have permission to remove devices." });
    expect(h.api.removeDevice).not.toHaveBeenCalled();
  });

  it("projects:delete allows removal", async () => {
    h.grants = new Set(["projects:delete"]);
    expect((await removeDeviceAction("d1")).ok).toBe(true);
    expect(h.api.removeDevice).toHaveBeenCalledWith("d1", "u1");
  });

  it("validates before writing: a device needs a label and a site", async () => {
    h.grants = new Set(["projects:edit"]);
    expect((await createDeviceAction({ siteId: "", projectId: null, fields: { label: "X" } })).ok).toBe(false);
    expect((await createDeviceAction({ siteId: "s1", projectId: null, fields: { label: "  " } })).ok).toBe(false);
    expect(h.api.createDevice).not.toHaveBeenCalled();
  });

  it("refuses an oversized import file before planning it", async () => {
    h.grants = new Set(["projects:edit"]);
    const rows = Array.from({ length: 5002 }, () => ["a", "b"]);
    const r = await previewDeviceImportAction({ siteId: "s1", rows });
    expect(r.ok).toBe(false);
    expect(h.api.previewDeviceImport).not.toHaveBeenCalled();
  });
});
