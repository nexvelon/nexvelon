// DEVREG-1 — both external device models round-trip through the register without
// loss, and an edit made in the register shows up on export.

import { describe, it, expect } from "vitest";
import {
  fieldsFromRiser,
  toRiserDevice,
  fieldsFromViewer,
  toViewerDevice,
  type RiserDevice,
  type ViewerDevice,
} from "@/lib/devices/model";

const riserCamera: RiserDevice = {
  id: "dev_8f2a",
  t: "cctv_dome_ip",
  b: "bA",
  f: "fL2",
  x: 12.5,
  z: 3.25,
  rot: 90,
  lab: "CAM-01",
  mdl: "",
  to: "idf_2",
  ct: "cat6",
  mh: 2.7,
  notes: "Lobby, above the east doors",
  fov: [92, 18],
  // a key the register doesn't model must survive untouched
  futureField: { nested: [1, 2, 3] },
};

const riserDoorContact: RiserDevice = {
  id: "dev_91c0",
  t: "acc_door_contact",
  b: "bA",
  f: "fL1",
  x: 4,
  z: 0,
  rot: 0,
  lab: "D-003",
  mdl: "GE 1078C",
  to: "acp_1",
  ct: "22-4",
  mh: 2.1,
  notes: "",
  door: "door_main",
};

const viewerCamera: ViewerDevice = {
  id: "CAM-01",
  p: [0.4123, 0.2871],
  t: "D",
  ip: "10.20.1.31",
  model: "P3265-LVE",
  type: "Dome",
  sw: "SW-IDF2-01",
  swip: "10.20.0.12",
  port: 14,
  vlan: 120,
  mask: "255.255.255.0",
  gw: "10.20.1.1",
  mbps: 6,
  ch: 1,
  nvr: ["NVR-01", "NVR-02"],
  det: "DET-04",
  inj: "",
  acc: ["wall mount"],
  r: [
    [0.4123, 0.2871],
    [0.45, 0.2871],
    [0.45, 0.1],
  ],
};

/** What the register would store for a record imported from a source. */
function riserStored(d: RiserDevice) {
  return { ...fieldsFromRiser(d), design: d as Record<string, unknown>, external_id: d.id };
}
function viewerStored(d: ViewerDevice) {
  return { ...fieldsFromViewer(d), as_built: d as Record<string, unknown>, external_id: d.id };
}

describe("Riser Studio device record round-trip", () => {
  it("a camera comes back byte-for-byte (fov, empty mdl, unknown keys, key order)", () => {
    const back = toRiserDevice(riserStored(riserCamera));
    expect(JSON.stringify(back)).toBe(JSON.stringify(riserCamera));
  });

  it("a door contact with a door group comes back unchanged", () => {
    expect(toRiserDevice(riserStored(riserDoorContact))).toEqual(riserDoorContact);
  });

  it("maps Riser fields onto the canonical columns, metres kept as metres", () => {
    const f = fieldsFromRiser(riserCamera);
    expect(f).toMatchObject({
      type_id: "cctv_dome_ip",
      building_key: "bA",
      floor_key: "fL2",
      label: "CAM-01",
      pos_x_m: 12.5,
      pos_z_m: 3.25,
      rotation_deg: 90,
      mount_height_m: 2.7,
      cable_type: "cat6",
      homes_to: "idf_2",
    });
    // empty mdl reads as empty, not as a made-up model (§2.8)
    expect(f.model).toBeNull();
    // a Riser record carries no plan coordinates; none are invented
    expect(f.pos_u).toBeNull();
    expect(f.pos_v).toBeNull();
  });

  it("an edit in the register overlays the Riser key and leaves the rest alone", () => {
    const stored = { ...riserStored(riserCamera), label: "CAM-01A", model: "P3265-LVE" };
    const back = toRiserDevice(stored);
    expect(back.lab).toBe("CAM-01A");
    expect(back.mdl).toBe("P3265-LVE");
    expect(back.fov).toEqual([92, 18]);
    expect(back.futureField).toEqual({ nested: [1, 2, 3] });
  });

  it("the type id is never rewritten, even when the register doesn't know it", () => {
    const odd: RiserDevice = { id: "x", t: "brand_new_type_v9", lab: "X-1" };
    expect(toRiserDevice(riserStored(odd)).t).toBe("brand_new_type_v9");
  });
});

describe("3D System Design View device record round-trip", () => {
  it("an as-built camera comes back byte-for-byte (route, recorders, unknown fields)", () => {
    const back = toViewerDevice(viewerStored(viewerCamera));
    expect(JSON.stringify(back)).toBe(JSON.stringify(viewerCamera));
  });

  it("maps the viewer's network fields into one network block and keeps p as plan coords", () => {
    const f = fieldsFromViewer(viewerCamera);
    expect(f.pos_u).toBe(0.4123);
    expect(f.pos_v).toBe(0.2871);
    expect(f.pos_x_m).toBeNull(); // no metres invented from plan coords
    expect(f.network).toEqual({
      ip: "10.20.1.31",
      mask: "255.255.255.0",
      gw: "10.20.1.1",
      vlan: 120,
      sw: "SW-IDF2-01",
      swip: "10.20.0.12",
      port: 14,
      mbps: 6,
      ch: 1,
      nvr: ["NVR-01", "NVR-02"],
      // inj "" is empty, so it's not stored
    });
    expect(f.route).toHaveLength(3);
    expect(f.label).toBe("CAM-01");
  });

  it("does not map the viewer's own type codes onto the Riser type id (no guessing)", () => {
    expect(fieldsFromViewer(viewerCamera).type_id).toBeNull();
  });

  it("a changed IP is written back; untouched network keys keep their original form", () => {
    const stored = viewerStored(viewerCamera);
    stored.network = { ...stored.network!, ip: "10.20.1.99" };
    const back = toViewerDevice(stored);
    expect(back.ip).toBe("10.20.1.99");
    expect(back.port).toBe(14);
    expect(back.nvr).toEqual(["NVR-01", "NVR-02"]);
    expect(back.t).toBe("D");
  });

  it("a non-network device has no network block at all", () => {
    expect(fieldsFromViewer({ id: "DC-1", p: [0.1, 0.1] }).network).toBeNull();
  });
});
