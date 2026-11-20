// DEVREG-1 — the data layer against an in-memory database: every create, update,
// delete and import writes an activity row (§5), an edit never touches the source
// snapshots (§2.2), the label rule holds (3g), a re-import updates rather than
// duplicates, and a project at another site is refused.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeFakeDb } from "./fake-supabase";

const h = vi.hoisted(() => ({
  db: null as ReturnType<typeof import("./fake-supabase").makeFakeDb> | null,
  logActivity: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.db!.client }));
vi.mock("@/lib/api/activity-log", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  logActivity: h.logActivity,
}));

import {
  createDevice,
  updateDevice,
  removeDevice,
  commitDeviceImport,
  createFloor,
} from "@/lib/api/devices";

const riserDesign = { id: "dev_1", t: "cctv_dome_ip", lab: "CAM-01", x: 1, z: 2, mdl: "" };

beforeEach(() => {
  h.db = makeFakeDb({
    sites: [
      { id: "site-1", name: "200 King St" },
      { id: "site-2", name: "Other site" },
    ],
    projects: [
      { id: "proj-1", site_id: "site-1", opco: "guardian" },
      { id: "proj-x", site_id: "site-2", opco: "guardian" },
    ],
    device_types: [{ id: "cctv_dome_ip", name: "IP dome camera", system: "cctv" }],
  });
  h.logActivity.mockClear();
});

describe("create / update / delete write activity rows (§5)", () => {
  it("create logs 'create' on the device, rolled up to its site", async () => {
    const d = await createDevice({ siteId: "site-1", projectId: "proj-1", fields: { label: "CAM-01" }, source: "manual" }, "u1");
    expect(h.logActivity).toHaveBeenCalledWith("device", d.id, "create", {}, expect.objectContaining({ parentType: "site", parentId: "site-1", entityLabel: "CAM-01", parentLabel: "200 King St" }));
  });

  it("update logs only the fields that changed, from → to", async () => {
    const d = await createDevice({ siteId: "site-1", projectId: null, fields: { label: "CAM-01", model: "A" }, source: "manual" }, "u1");
    h.logActivity.mockClear();
    await updateDevice(d.id, { fields: { model: "B", label: "CAM-01" } }, "u1");
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const [, , action, changes] = h.logActivity.mock.calls[0] as unknown as [string, string, string, Record<string, unknown>];
    expect(action).toBe("update");
    expect(changes).toEqual({ model: { from: "A", to: "B" } });
  });

  it("a no-op save writes nothing", async () => {
    const d = await createDevice({ siteId: "site-1", projectId: null, fields: { label: "CAM-01" }, source: "manual" }, "u1");
    h.logActivity.mockClear();
    await updateDevice(d.id, { fields: { label: "CAM-01" } }, "u1");
    expect(h.logActivity).not.toHaveBeenCalled();
  });

  it("delete is a soft delete and logs 'delete'", async () => {
    const d = await createDevice({ siteId: "site-1", projectId: null, fields: { label: "CAM-01" }, source: "manual" }, "u1");
    await removeDevice(d.id, "u1");
    const row = h.db!.tables.devices.find((r) => r.id === d.id)!;
    expect(row.deleted_at).toBeTruthy(); // still there (§1)
    expect(h.logActivity).toHaveBeenLastCalledWith("device", d.id, "delete", {}, expect.objectContaining({ parentId: "site-1" }));
  });

  it("a floor create logs 'device_floor'", async () => {
    const f = await createFloor("site-1", { label: "Level 2", floor_key: "fL2" }, "u1");
    expect(h.logActivity).toHaveBeenCalledWith("device_floor", f.id, "create", {}, expect.objectContaining({ parentId: "site-1" }));
  });
});

describe("design vs as-built (§2.2)", () => {
  it("an edit never rewrites the design snapshot, even if a caller passes one", async () => {
    const d = await createDevice(
      { siteId: "site-1", projectId: null, fields: { label: "CAM-01" }, source: "riser_studio", externalId: "dev_1", design: riserDesign },
      "u1"
    );
    await updateDevice(
      d.id,
      { fields: { model: "P3265", design: { tampered: true }, as_built: { tampered: true } } as never },
      "u1"
    );
    const row = h.db!.tables.devices.find((r) => r.id === d.id)!;
    expect(row.design).toEqual(riserDesign);
    expect(row.as_built).toBeNull();
    expect(row.model).toBe("P3265");
  });
});

describe("rules enforced by the data layer", () => {
  it("a second CAM-01 in the same building is refused with a plain message", async () => {
    await createDevice({ siteId: "site-1", projectId: null, fields: { label: "CAM-01", building_key: "bA" }, source: "manual" }, "u1");
    await expect(
      createDevice({ siteId: "site-1", projectId: null, fields: { label: "cam-01", building_key: "bA" }, source: "manual" }, "u1")
    ).rejects.toThrow(/already has that label/);
  });

  it("CAM-01 in another building on the same site is allowed", async () => {
    await createDevice({ siteId: "site-1", projectId: null, fields: { label: "CAM-01", building_key: "bA" }, source: "manual" }, "u1");
    await expect(
      createDevice({ siteId: "site-1", projectId: null, fields: { label: "CAM-01", building_key: "bB" }, source: "manual" }, "u1")
    ).resolves.toBeTruthy();
  });

  it("a project at a different site is refused", async () => {
    await expect(
      createDevice({ siteId: "site-1", projectId: "proj-x", fields: { label: "CAM-01" }, source: "manual" }, "u1")
    ).rejects.toThrow(/isn't at this site/);
  });

  it("blank text is stored as empty (null), not as an empty string (§2.8)", async () => {
    const d = await createDevice({ siteId: "site-1", projectId: null, fields: { label: "CAM-01", model: "   " }, source: "manual" }, "u1");
    expect(h.db!.tables.devices.find((r) => r.id === d.id)!.model).toBeNull();
  });
});

describe("commitDeviceImport", () => {
  const csv: string[][] = [
    ["label", "type", "model", "ip"],
    ["CAM-01", "cctv_dome_ip", "P3265", "10.0.0.1"],
    ["CAM-02", "mystery_type", "", ""],
    ["", "cctv_dome_ip", "", ""],
  ];

  it("creates the good rows, skips the bad one, and logs a site-level import summary", async () => {
    const out = await commitDeviceImport("site-1", "proj-1", csv, "u1", "schedule.csv");
    expect(out.created).toBe(2);
    expect(out.skipped).toBe(1);
    expect(h.db!.tables.devices.filter((r) => !r.deleted_at)).toHaveLength(2);
    const unmatched = h.db!.tables.devices.find((r) => r.label === "CAM-02")!;
    expect(unmatched.type_id).toBe("mystery_type"); // as written, not guessed
    expect(unmatched.source).toBe("csv_import");
    expect(unmatched.project_id).toBe("proj-1");
    expect(h.logActivity).toHaveBeenCalledWith(
      "site",
      "site-1",
      "update",
      { device_import: { from: null, to: expect.objectContaining({ file: "schedule.csv", created: 2, skipped: 1 }) } },
      expect.anything()
    );
  });

  it("re-importing the same file creates nothing new", async () => {
    await commitDeviceImport("site-1", null, csv, "u1", "schedule.csv");
    const again = await commitDeviceImport("site-1", null, csv, "u1", "schedule.csv");
    expect(again.created).toBe(0);
    expect(again.unchanged).toBe(2);
    expect(h.db!.tables.devices.filter((r) => !r.deleted_at)).toHaveLength(2);
  });

  it("a changed cell on re-import updates the device in place", async () => {
    await commitDeviceImport("site-1", null, csv, "u1", "schedule.csv");
    const edited = csv.map((r) => [...r]);
    edited[1][3] = "10.0.0.9";
    const again = await commitDeviceImport("site-1", null, edited, "u1", "schedule-v2.csv");
    expect(again.updated).toBe(1);
    expect(again.created).toBe(0);
    const cam = h.db!.tables.devices.find((r) => r.label === "CAM-01")!;
    expect((cam.network as { ip: string }).ip).toBe("10.0.0.9");
  });

  it("refuses a project that isn't at the site before writing anything", async () => {
    await expect(commitDeviceImport("site-1", "proj-x", csv, "u1", null)).rejects.toThrow(/isn't at this site/);
    expect(h.db!.tables.devices ?? []).toHaveLength(0);
  });
});
