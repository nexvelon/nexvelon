// DEVREG-1 — the Device Register's shared model. Pure + client-safe, so the data
// layer, the server actions, the UI and the tests share one definition.
//
// The register aligns to Jay's two external tools (both outside this repo); it
// does NOT invent a third shape:
//   • Riser Studio (design authoring): a device is
//       { id, t, b, f, x, z, rot, lab, mdl, to, ct, mh, notes, fov?, door? }
//     with x/z in METRES on an authored floor.
//   • 3D System Design View (as-built presentation): a device is
//       { id, p:[x,y], t, ip, model, type, sw, swip, port, vlan, mask, gw,
//         mbps, ch, nvr:[…], det, inj, acc, r:[[x,y],…] }
//     with p and r NORMALISED 0–1 on the floor plan image.
//
// Lossless round-trip: the verbatim source record is kept (`design` for Riser,
// `as_built` for the viewer). Export rebuilds the record from that snapshot and
// overlays only the canonical fields someone has since changed, so an untouched
// device comes back byte-for-byte, unknown keys included.

/** The device's own fields as the register stores them (one row of `devices`). */
export interface DeviceRecord {
  id: string;
  site_id: string;
  project_id: string | null;
  floor_id: string | null;
  building_key: string | null;
  floor_key: string | null;
  label: string | null;
  type_id: string | null;
  system: string | null;
  model: string | null;
  pos_x_m: number | null;
  pos_z_m: number | null;
  pos_u: number | null;
  pos_v: number | null;
  rotation_deg: number | null;
  mount_height_m: number | null;
  cable_type: string | null;
  homes_to: string | null;
  door_group: string | null;
  network: DeviceNetwork | null;
  route: [number, number][] | null;
  install_detail: string | null;
  notes: string | null;
  design: Record<string, unknown> | null;
  as_built: Record<string, unknown> | null;
  source: DeviceSource;
  external_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Where a device record came from. Free text in the DB (no CHECK, §1). */
export type DeviceSource = "manual" | "csv_import" | "riser_studio" | "as_built_viewer";

export const DEVICE_SOURCE_LABEL: Record<DeviceSource, string> = {
  manual: "Added by hand",
  csv_import: "Imported from a device schedule",
  riser_studio: "From Riser Studio",
  as_built_viewer: "From the 3D System Design View",
};

/**
 * Network fields (decision 3d) — one jsonb, because they apply to network devices
 * only. Keys mirror the 3D viewer's names so they round-trip unchanged. A door
 * contact stores `network = null`, not a block of empty strings.
 */
export interface DeviceNetwork {
  ip?: string | null;
  mask?: string | null;
  gw?: string | null;
  vlan?: string | number | null;
  sw?: string | null;
  swip?: string | null;
  port?: string | number | null;
  mbps?: number | null;
  ch?: number | null;
  nvr?: string[] | null;
  inj?: string | null;
}

export const NETWORK_KEYS = ["ip", "mask", "gw", "vlan", "sw", "swip", "port", "mbps", "ch", "nvr", "inj"] as const;

/** The editable canonical fields, as an input to create/update. */
export type DeviceFields = Pick<
  DeviceRecord,
  | "floor_id"
  | "building_key"
  | "floor_key"
  | "label"
  | "type_id"
  | "system"
  | "model"
  | "pos_x_m"
  | "pos_z_m"
  | "pos_u"
  | "pos_v"
  | "rotation_deg"
  | "mount_height_m"
  | "cable_type"
  | "homes_to"
  | "door_group"
  | "network"
  | "route"
  | "install_detail"
  | "notes"
>;

export function emptyDeviceFields(): DeviceFields {
  return {
    floor_id: null,
    building_key: null,
    floor_key: null,
    label: null,
    type_id: null,
    system: null,
    model: null,
    pos_x_m: null,
    pos_z_m: null,
    pos_u: null,
    pos_v: null,
    rotation_deg: null,
    mount_height_m: null,
    cable_type: null,
    homes_to: null,
    door_group: null,
    network: null,
    route: null,
    install_detail: null,
    notes: null,
  };
}

/** A network block with no values is no network block (§2.8). */
export function normalizeNetwork(n: DeviceNetwork | null | undefined): DeviceNetwork | null {
  if (!n) return null;
  const out: DeviceNetwork = {};
  for (const k of NETWORK_KEYS) {
    const v = (n as Record<string, unknown>)[k];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ─── Riser Studio ────────────────────────────────────────────────────────────

/** A Riser Studio device record. Unknown keys are allowed and preserved. */
export interface RiserDevice {
  id: string;
  t: string;
  b?: string;
  f?: string;
  x?: number;
  z?: number;
  rot?: number;
  lab?: string;
  mdl?: string;
  to?: string;
  ct?: string;
  mh?: number;
  notes?: string;
  fov?: [number, number];
  door?: string;
  [extra: string]: unknown;
}

const str = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : String(v);
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The canonical fields a Riser Studio record implies. */
export function fieldsFromRiser(d: RiserDevice): DeviceFields {
  return {
    ...emptyDeviceFields(),
    building_key: str(d.b),
    floor_key: str(d.f),
    label: str(d.lab),
    type_id: str(d.t),
    model: str(d.mdl),
    pos_x_m: num(d.x),
    pos_z_m: num(d.z),
    rotation_deg: num(d.rot),
    mount_height_m: num(d.mh),
    cable_type: str(d.ct),
    homes_to: str(d.to),
    door_group: str(d.door),
    notes: str(d.notes),
  };
}

/** Riser key ↔ canonical field, for the export overlay. */
const RISER_FIELD_MAP: [keyof RiserDevice, keyof DeviceFields][] = [
  ["b", "building_key"],
  ["f", "floor_key"],
  ["lab", "label"],
  ["t", "type_id"],
  ["mdl", "model"],
  ["x", "pos_x_m"],
  ["z", "pos_z_m"],
  ["rot", "rotation_deg"],
  ["mh", "mount_height_m"],
  ["ct", "cable_type"],
  ["to", "homes_to"],
  ["door", "door_group"],
  ["notes", "notes"],
];

const NUMERIC_FIELDS = new Set<keyof DeviceFields>([
  "pos_x_m",
  "pos_z_m",
  "pos_u",
  "pos_v",
  "rotation_deg",
  "mount_height_m",
]);

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Rebuild a Riser Studio record. Starts from the stored design snapshot, so an
 * untouched device round-trips byte-for-byte (unknown keys, empty `mdl: ""`, key
 * order). A canonical field someone edited since is written over its Riser key.
 */
export function toRiserDevice(device: Pick<DeviceRecord, "design" | "external_id"> & DeviceFields): RiserDevice {
  const design = (device.design ?? {}) as RiserDevice;
  const implied = fieldsFromRiser(design);
  const out: Record<string, unknown> = { ...design };
  if (out.id === undefined && device.external_id) out.id = device.external_id;
  for (const [rk, fk] of RISER_FIELD_MAP) {
    const current = device[fk];
    if (sameValue(current, implied[fk])) continue; // unchanged — keep the original token
    if (current === null || current === undefined) {
      delete out[rk as string];
    } else {
      out[rk as string] = NUMERIC_FIELDS.has(fk) ? Number(current) : current;
    }
  }
  return out as RiserDevice;
}

// ─── 3D System Design View (as-built) ────────────────────────────────────────

/** A 3D System Design View device record. Unknown keys are allowed and preserved. */
export interface ViewerDevice {
  id: string;
  p?: [number, number];
  t?: string;
  ip?: string;
  model?: string;
  type?: string;
  sw?: string;
  swip?: string;
  port?: string | number;
  vlan?: string | number;
  mask?: string;
  gw?: string;
  mbps?: number;
  ch?: number;
  nvr?: string[];
  det?: string;
  inj?: string;
  acc?: unknown;
  r?: [number, number][];
  [extra: string]: unknown;
}

/**
 * The canonical fields a viewer record implies. The viewer has no `lab`; its `id`
 * is the schedule's device id (e.g. CAM-01) and becomes the label. Its `t` / `type`
 * are kept verbatim in `as_built` and NOT mapped onto the Riser type id: the two
 * tools' type vocabularies are not known to be the same, so mapping one onto the
 * other would be a guess (§2.8).
 */
export function fieldsFromViewer(d: ViewerDevice): DeviceFields {
  const p = Array.isArray(d.p) ? d.p : null;
  return {
    ...emptyDeviceFields(),
    label: str(d.id),
    model: str(d.model),
    pos_u: p ? num(p[0]) : null,
    pos_v: p ? num(p[1]) : null,
    network: normalizeNetwork({
      ip: d.ip,
      mask: d.mask,
      gw: d.gw,
      vlan: d.vlan,
      sw: d.sw,
      swip: d.swip,
      port: d.port,
      mbps: d.mbps,
      ch: d.ch,
      nvr: d.nvr,
      inj: d.inj,
    }),
    route: Array.isArray(d.r) ? (d.r as [number, number][]) : null,
    install_detail: str(d.det),
  };
}

/**
 * Rebuild a viewer record from the as-built snapshot plus any canonical field
 * edited since. An untouched device round-trips byte-for-byte.
 */
export function toViewerDevice(device: Pick<DeviceRecord, "as_built" | "external_id"> & DeviceFields): ViewerDevice {
  const snap = (device.as_built ?? {}) as ViewerDevice;
  const implied = fieldsFromViewer(snap);
  const out: Record<string, unknown> = { ...snap };
  if (out.id === undefined) out.id = device.external_id ?? device.label ?? undefined;

  if (!sameValue(device.label, implied.label) && device.label) out.id = device.label;
  if (!sameValue(device.model, implied.model)) {
    if (device.model == null) delete out.model;
    else out.model = device.model;
  }
  if (!sameValue(device.pos_u, implied.pos_u) || !sameValue(device.pos_v, implied.pos_v)) {
    if (device.pos_u == null || device.pos_v == null) delete out.p;
    else out.p = [Number(device.pos_u), Number(device.pos_v)];
  }
  if (!sameValue(device.route, implied.route)) {
    if (device.route == null) delete out.r;
    else out.r = device.route;
  }
  if (!sameValue(device.install_detail, implied.install_detail)) {
    if (device.install_detail == null) delete out.det;
    else out.det = device.install_detail;
  }
  if (!sameValue(device.network, implied.network)) {
    const net = device.network ?? {};
    for (const k of NETWORK_KEYS) {
      const v = (net as Record<string, unknown>)[k];
      if (v === undefined || v === null) delete out[k];
      else out[k] = v;
    }
  }
  return out as ViewerDevice;
}
