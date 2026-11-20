// DEVREG-1 — device-schedule import: rows map to devices, errors are reported per
// row (not whole-file), unknown types are flagged unmatched, and re-importing the
// same schedule updates rather than duplicates. Label identity follows 3g.

import { describe, it, expect } from "vitest";
import { parseCsv, planImport, mapHeaders, type ExistingDeviceForPlan, type FloorForPlan } from "@/lib/devices/csv-import";
import { labelKey, displayLabel } from "@/lib/devices/identity";

const SITE = "site-1";
const floors: FloorForPlan[] = [
  { id: "fl-a2", building_key: "bA", building_name: "Tower A", floor_key: "fL2", level_key: "2", label: "Level 2" },
  { id: "fl-b2", building_key: "bB", building_name: "Tower B", floor_key: "fL2", level_key: "2", label: "Level 2" },
];
const known = new Set(["cctv_dome_ip", "acc_door_contact"]);

const CSV = [
  "Label,Type,Building,Floor,Model,X (m),Z (m),IP Address,Switch,Port,NVR,Notes",
  'CAM-01,cctv_dome_ip,Tower A,Level 2,P3265-LVE,12.5,3.25,10.20.1.31,SW-1,14,NVR-01;NVR-02,"Lobby, east doors"',
  "D-003,acc_door_contact,Tower A,Level 2,,4,0,,,,,",
  "CAM-02,some_new_type,Tower A,Level 2,,,,,,,,",
].join("\r\n");

/** Turn a plan's creates into the "existing" set, as if they had been saved. */
function asExisting(plan: ReturnType<typeof planImport>): ExistingDeviceForPlan[] {
  return plan.rows
    .filter((r) => r.action === "create")
    .map((r, i) => ({
      id: `dev-${i}`,
      building_key: r.changes.building_key ?? null,
      label: r.changes.label ?? null,
      fields: { ...r.changes },
    }));
}

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, embedded commas and newlines, and a BOM", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n"multi\nline",z\n\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["multi\nline", "z"],
    ]);
  });
});

describe("headers", () => {
  it("matches common aliases case- and punctuation-insensitively", () => {
    const h = mapHeaders(["Device ID", "TYPE", "IP Address", "Mount Height", "random thing"]);
    expect(h.columns).toEqual(["label", "type", "ip", "mount_height_m", null]);
    expect(h.unknownHeaders).toEqual(["random thing"]);
    expect(h.missingRequired).toEqual([]);
  });

  it("a file without the required columns is refused with a clear reason", () => {
    const plan = planImport({ rows: parseCsv("Model,IP\nX,1.1.1.1"), siteId: SITE, existing: [], floors, knownTypeIds: known });
    expect(plan.fileErrors[0]).toMatch(/Missing required columns: label, type/);
    expect(plan.rows).toEqual([]);
  });
});

describe("planImport — mapping", () => {
  const plan = planImport({ rows: parseCsv(CSV), siteId: SITE, existing: [], floors, knownTypeIds: known });

  it("maps a row to a device, resolving building + floor to the floor row", () => {
    const cam = plan.rows.find((r) => r.label === "CAM-01")!;
    expect(cam.action).toBe("create");
    expect(cam.changes).toMatchObject({
      label: "CAM-01",
      type_id: "cctv_dome_ip",
      model: "P3265-LVE",
      floor_id: "fl-a2",
      building_key: "bA",
      floor_key: "fL2",
      pos_x_m: 12.5,
      pos_z_m: 3.25,
      notes: "Lobby, east doors",
      network: { ip: "10.20.1.31", sw: "SW-1", port: "14", nvr: ["NVR-01", "NVR-02"] },
    });
  });

  it("a door contact gets no network block (blank network cells are not a network)", () => {
    const dc = plan.rows.find((r) => r.label === "D-003")!;
    expect(dc.changes.network).toBeUndefined();
    expect(dc.changes.model).toBeUndefined(); // blank cell ≠ a value
  });

  it("an unknown type is imported exactly as written and marked unmatched, never guessed", () => {
    const c2 = plan.rows.find((r) => r.label === "CAM-02")!;
    expect(c2.action).toBe("create");
    expect(c2.changes.type_id).toBe("some_new_type");
    expect(c2.typeMatched).toBe(false);
    expect(c2.warnings.join(" ")).toMatch(/unmatched/);
  });

  it("counts every outcome", () => {
    expect(plan.counts).toEqual({ create: 3, update: 0, unchanged: 0, error: 0 });
  });
});

describe("planImport — per-row errors", () => {
  const bad = [
    "label,type,floor,x_m,z_m,u,v,mbps",
    ",cctv_dome_ip,,,,,,", // missing label
    "CAM-09,,,,,,,", // missing type
    "CAM-10,cctv_dome_ip,,abc,1,,,", // bad number
    "CAM-11,cctv_dome_ip,,,,1.4,0.2,", // u out of range
    "CAM-12,cctv_dome_ip,,5,,,,", // x without z
    "CAM-13,cctv_dome_ip,Level 2,,,,,", // floor matches two buildings
    "CAM-14,cctv_dome_ip,,,,,,8", // fine
  ].join("\n");
  const plan = planImport({ rows: parseCsv(bad), siteId: SITE, existing: [], floors, knownTypeIds: known });

  it("reports each bad row with its row number and reason, and still plans the good rows", () => {
    const errs = plan.rows.filter((r) => r.action === "error");
    expect(errs.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(errs[0].errors).toContain("Missing label.");
    expect(errs[1].errors).toContain("Missing type.");
    expect(errs[2].errors.join(" ")).toMatch(/isn't a number/);
    expect(errs[3].errors.join(" ")).toMatch(/between 0 and 1/);
    expect(errs[4].errors.join(" ")).toMatch(/together/);
    expect(errs[5].errors.join(" ")).toMatch(/more than one floor/);
    const ok = plan.rows.find((r) => r.label === "CAM-14")!;
    expect(ok.action).toBe("create");
    expect(ok.changes.network).toEqual({ mbps: 8 });
    expect(plan.counts).toEqual({ create: 1, update: 0, unchanged: 0, error: 6 });
  });

  it("an unknown floor is kept as written with a warning, not an error", () => {
    const p = planImport({ rows: parseCsv("label,type,floor\nCAM-1,cctv_dome_ip,Mezzanine"), siteId: SITE, existing: [], floors, knownTypeIds: known });
    expect(p.rows[0].action).toBe("create");
    expect(p.rows[0].changes.floor_key).toBe("Mezzanine");
    expect(p.rows[0].changes.floor_id).toBeUndefined();
    expect(p.rows[0].warnings.join(" ")).toMatch(/isn't set up/);
  });
});

describe("re-import updates rather than duplicates", () => {
  const first = planImport({ rows: parseCsv(CSV), siteId: SITE, existing: [], floors, knownTypeIds: known });
  const existing = asExisting(first);

  it("the same schedule again is all 'unchanged': no new devices", () => {
    const again = planImport({ rows: parseCsv(CSV), siteId: SITE, existing, floors, knownTypeIds: known });
    expect(again.counts).toEqual({ create: 0, update: 0, unchanged: 3, error: 0 });
    expect(again.rows.every((r) => r.deviceId)).toBe(true);
  });

  it("a changed cell updates that device in place, and only the changed field", () => {
    const edited = CSV.replace("10.20.1.31", "10.20.1.99");
    const again = planImport({ rows: parseCsv(edited), siteId: SITE, existing, floors, knownTypeIds: known });
    const cam = again.rows.find((r) => r.label === "CAM-01")!;
    expect(cam.action).toBe("update");
    expect(cam.deviceId).toBe("dev-0");
    expect(Object.keys(cam.changes)).toEqual(["network"]);
    // merged, so the switch/port/recorders already recorded are kept
    expect(cam.changes.network).toEqual({ ip: "10.20.1.99", sw: "SW-1", port: "14", nvr: ["NVR-01", "NVR-02"] });
    expect(again.counts.create).toBe(0);
  });

  it("matching is case-insensitive on the label", () => {
    const lower = CSV.replace("CAM-01,", "cam-01,");
    const again = planImport({ rows: parseCsv(lower), siteId: SITE, existing, floors, knownTypeIds: known });
    expect(again.counts.create).toBe(0);
  });
});

describe("label identity (3g)", () => {
  it("two buildings may each have a CAM-01, so both are created", () => {
    const csv = "label,type,building,floor\nCAM-01,cctv_dome_ip,Tower A,Level 2\nCAM-01,cctv_dome_ip,Tower B,Level 2";
    const p = planImport({ rows: parseCsv(csv), siteId: SITE, existing: [], floors, knownTypeIds: known });
    expect(p.counts).toEqual({ create: 2, update: 0, unchanged: 0, error: 0 });
    expect(p.rows.map((r) => r.changes.building_key)).toEqual(["bA", "bB"]);
  });

  it("the same label twice in one building in one file is an error on the second row", () => {
    const csv = "label,type,building,floor\nCAM-01,cctv_dome_ip,Tower A,Level 2\nCAM-01,cctv_dome_ip,Tower A,Level 2";
    const p = planImport({ rows: parseCsv(csv), siteId: SITE, existing: [], floors, knownTypeIds: known });
    expect(p.rows[1].action).toBe("error");
    expect(p.rows[1].errors.join(" ")).toMatch(/row 2/);
  });

  it("labelKey separates buildings and sites, ignores case and surrounding space", () => {
    expect(labelKey("s1", "bA", "CAM-01")).toBe(labelKey("s1", "bA", " cam-01 "));
    expect(labelKey("s1", "bA", "CAM-01")).not.toBe(labelKey("s1", "bB", "CAM-01"));
    expect(labelKey("s1", "bA", "CAM-01")).not.toBe(labelKey("s2", "bA", "CAM-01"));
    expect(labelKey("s1", "bA", "")).toBeNull();
  });

  it("displays the building with the label so two CAM-01s are distinguishable", () => {
    expect(displayLabel("CAM-01", "Tower A")).toBe("Tower A · CAM-01");
    expect(displayLabel("CAM-01", null)).toBe("CAM-01");
  });
});
