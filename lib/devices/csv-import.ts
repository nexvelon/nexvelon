// DEVREG-1 — device-schedule import (decision 3f). Pure + client-safe: the dry-run
// preview and the committed import run the SAME planner, so what the preview shows
// is exactly what gets written.
//
// THE CONTRACT
//   • One import targets ONE site (chosen in the UI), optionally one project.
//   • Required columns: label, type. Everything else is optional.
//   • Headers are matched case- and punctuation-insensitively, with a few common
//     aliases ("Device ID" → label, "IP Address" → ip, …).
//   • A row maps to one device. Its identity is site + building + label (3g):
//       – a live device with that identity exists → UPDATE in place (only the
//         columns present in the file are changed; blank cells change nothing);
//       – otherwise → CREATE.
//     So re-importing the same schedule updates, never duplicates. Devices that
//     are NOT in the file are left alone (an import never deletes).
//   • An unknown type is imported with its id exactly as written and flagged
//     "type unmatched". It is never mapped to the nearest known type (§2.8).
//   • Errors are PER ROW: a bad row is skipped and reported with its row number
//     and reason; the good rows still import.

import { labelKey } from "@/lib/devices/identity";
import { normalizeNetwork, type DeviceFields, type DeviceNetwork } from "@/lib/devices/model";

// ─── CSV parsing (RFC 4180: quotes, escaped quotes, CRLF, embedded newlines) ──

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty lines (trailing newline, blank spacer rows).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ─── Columns ──────────────────────────────────────────────────────────────────

export type ImportColumn =
  | "label"
  | "type"
  | "system"
  | "model"
  | "building"
  | "floor"
  | "x_m"
  | "z_m"
  | "u"
  | "v"
  | "rotation_deg"
  | "mount_height_m"
  | "cable_type"
  | "homes_to"
  | "door_group"
  | "ip"
  | "mask"
  | "gateway"
  | "vlan"
  | "switch"
  | "switch_ip"
  | "port"
  | "mbps"
  | "channels"
  | "nvr"
  | "poe_injector"
  | "install_detail"
  | "notes";

export const REQUIRED_COLUMNS: ImportColumn[] = ["label", "type"];

/** The template's header row, in order. */
export const TEMPLATE_COLUMNS: ImportColumn[] = [
  "label", "type", "system", "model", "building", "floor", "x_m", "z_m", "u", "v",
  "rotation_deg", "mount_height_m", "cable_type", "homes_to", "door_group",
  "ip", "mask", "gateway", "vlan", "switch", "switch_ip", "port", "mbps", "channels",
  "nvr", "poe_injector", "install_detail", "notes",
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, ImportColumn> = (() => {
  const m: Record<string, ImportColumn> = {};
  for (const c of TEMPLATE_COLUMNS) m[norm(c)] = c;
  const extra: [string, ImportColumn][] = [
    ["lab", "label"], ["deviceid", "label"], ["devicelabel", "label"], ["tag", "label"], ["name", "label"],
    ["typeid", "type"], ["devicetype", "type"], ["t", "type"],
    ["mdl", "model"], ["partnumber", "model"], ["part", "model"],
    ["bldg", "building"], ["buildingid", "building"],
    ["level", "floor"], ["floorid", "floor"], ["lvl", "floor"],
    ["x", "x_m"], ["xm", "x_m"], ["z", "z_m"], ["zm", "z_m"], ["y", "z_m"],
    ["rot", "rotation_deg"], ["rotation", "rotation_deg"],
    ["mh", "mount_height_m"], ["mountheight", "mount_height_m"],
    ["ct", "cable_type"], ["cable", "cable_type"],
    ["to", "homes_to"], ["homesto", "homes_to"],
    ["door", "door_group"],
    ["ipaddress", "ip"], ["subnetmask", "mask"], ["gw", "gateway"],
    ["sw", "switch"], ["swip", "switch_ip"], ["switchport", "port"],
    ["bitrate", "mbps"], ["ch", "channels"], ["recorder", "nvr"], ["recorders", "nvr"],
    ["inj", "poe_injector"], ["injector", "poe_injector"],
    ["det", "install_detail"], ["detail", "install_detail"],
  ];
  for (const [a, c] of extra) m[a] = c;
  return m;
})();

export interface HeaderMap {
  columns: (ImportColumn | null)[];
  unknownHeaders: string[];
  missingRequired: ImportColumn[];
  duplicateColumns: ImportColumn[];
}

export function mapHeaders(header: string[]): HeaderMap {
  const seen = new Set<ImportColumn>();
  const dup = new Set<ImportColumn>();
  const unknown: string[] = [];
  const columns = header.map((h) => {
    const c = ALIASES[norm(h)] ?? null;
    if (!c) {
      if (h.trim()) unknown.push(h.trim());
      return null;
    }
    if (seen.has(c)) {
      dup.add(c);
      return null; // first occurrence wins
    }
    seen.add(c);
    return c;
  });
  return {
    columns,
    unknownHeaders: unknown,
    missingRequired: REQUIRED_COLUMNS.filter((c) => !seen.has(c)),
    duplicateColumns: [...dup],
  };
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

/** The device fields a row sets. Absent key = column not in file or cell blank. */
export type RowFields = Partial<DeviceFields> & { building_name?: string | null; floor_label?: string | null };

export interface ParsedRow {
  rowNumber: number; // 1-based line in the file, header = 1
  fields: RowFields;
  errors: string[];
  warnings: string[];
}

function parseNum(raw: string, col: string, errors: string[]): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    errors.push(`${col} "${raw}" isn't a number.`);
    return undefined;
  }
  return n;
}

export function parseRow(cells: string[], header: HeaderMap, rowNumber: number): ParsedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const f: RowFields = {};
  const net: DeviceNetwork = {};
  let netTouched = false;
  const get = (c: ImportColumn): string | undefined => {
    const i = header.columns.indexOf(c);
    if (i < 0) return undefined;
    const v = (cells[i] ?? "").trim();
    return v === "" ? undefined : v;
  };

  const label = get("label");
  const type = get("type");
  if (!label) errors.push("Missing label.");
  if (!type) errors.push("Missing type.");
  if (label) f.label = label;
  if (type) f.type_id = type;

  const text: [ImportColumn, keyof RowFields][] = [
    ["system", "system"], ["model", "model"], ["cable_type", "cable_type"], ["homes_to", "homes_to"],
    ["door_group", "door_group"], ["install_detail", "install_detail"], ["notes", "notes"],
  ];
  for (const [c, k] of text) {
    const v = get(c);
    if (v !== undefined) (f as Record<string, unknown>)[k] = v;
  }
  const b = get("building");
  if (b !== undefined) f.building_name = b;
  const fl = get("floor");
  if (fl !== undefined) f.floor_label = fl;

  const nums: [ImportColumn, keyof RowFields][] = [
    ["x_m", "pos_x_m"], ["z_m", "pos_z_m"], ["u", "pos_u"], ["v", "pos_v"],
    ["rotation_deg", "rotation_deg"], ["mount_height_m", "mount_height_m"],
  ];
  for (const [c, k] of nums) {
    const v = get(c);
    if (v === undefined) continue;
    const n = parseNum(v, c, errors);
    if (n !== undefined) (f as Record<string, unknown>)[k] = n;
  }
  for (const k of ["pos_u", "pos_v"] as const) {
    const n = f[k];
    if (n != null && (n < 0 || n > 1)) errors.push(`${k === "pos_u" ? "u" : "v"} must be between 0 and 1 (plan position).`);
  }
  if ((f.pos_x_m == null) !== (f.pos_z_m == null)) errors.push("x_m and z_m must be given together.");
  if ((f.pos_u == null) !== (f.pos_v == null)) errors.push("u and v must be given together.");

  const netText: [ImportColumn, keyof DeviceNetwork][] = [
    ["ip", "ip"], ["mask", "mask"], ["gateway", "gw"], ["vlan", "vlan"], ["switch", "sw"],
    ["switch_ip", "swip"], ["port", "port"], ["poe_injector", "inj"],
  ];
  for (const [c, k] of netText) {
    const v = get(c);
    if (v !== undefined) {
      (net as Record<string, unknown>)[k] = v;
      netTouched = true;
    }
  }
  for (const [c, k] of [["mbps", "mbps"], ["channels", "ch"]] as [ImportColumn, keyof DeviceNetwork][]) {
    const v = get(c);
    if (v === undefined) continue;
    const n = parseNum(v, c, errors);
    if (n !== undefined) {
      (net as Record<string, unknown>)[k] = n;
      netTouched = true;
    }
  }
  const nvr = get("nvr");
  if (nvr !== undefined) {
    net.nvr = nvr.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    netTouched = true;
  }
  if (net.ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(String(net.ip))) warnings.push(`IP "${net.ip}" doesn't look like an IPv4 address; imported as written.`);
  if (netTouched) f.network = normalizeNetwork(net);

  return { rowNumber, fields: f, errors, warnings };
}

// ─── Planning (dry run) ───────────────────────────────────────────────────────

export interface ExistingDeviceForPlan {
  id: string;
  building_key: string | null;
  label: string | null;
  fields: Partial<DeviceFields>;
}

export interface FloorForPlan {
  id: string;
  building_key: string | null;
  building_name: string | null;
  floor_key: string | null;
  level_key: string | null;
  label: string | null;
}

export type PlannedAction = "create" | "update" | "unchanged" | "error";

export interface PlannedRow {
  rowNumber: number;
  action: PlannedAction;
  label: string | null;
  deviceId: string | null;
  /** Fields this row writes (create: all present; update: only those that change). */
  changes: Partial<DeviceFields>;
  typeMatched: boolean | null;
  errors: string[];
  warnings: string[];
}

export interface ImportPlan {
  fileErrors: string[];
  unknownHeaders: string[];
  rows: PlannedRow[];
  counts: Record<PlannedAction, number>;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function matchFloor(floors: FloorForPlan[], building: string | undefined | null, floor: string | undefined | null): FloorForPlan | null | "ambiguous" {
  if (!floor) return null;
  const n = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const fb = n(building);
  const ff = n(floor);
  const hits = floors.filter((x) => {
    const floorHit = [x.floor_key, x.level_key, x.label].some((k) => n(k) === ff && ff !== "");
    if (!floorHit) return false;
    if (!fb) return true;
    return [x.building_key, x.building_name].some((k) => n(k) === fb);
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return "ambiguous";
  return null;
}

/**
 * Plan an import: parse, validate, resolve floors, match existing devices by
 * identity, and decide create / update / unchanged / error for every row.
 */
export function planImport(input: {
  rows: string[][];
  siteId: string;
  existing: ExistingDeviceForPlan[];
  floors: FloorForPlan[];
  knownTypeIds: Set<string>;
}): ImportPlan {
  const counts: Record<PlannedAction, number> = { create: 0, update: 0, unchanged: 0, error: 0 };
  if (input.rows.length === 0) {
    return { fileErrors: ["The file is empty."], unknownHeaders: [], rows: [], counts };
  }
  const header = mapHeaders(input.rows[0]);
  const fileErrors: string[] = [];
  if (header.missingRequired.length) {
    fileErrors.push(`Missing required column${header.missingRequired.length > 1 ? "s" : ""}: ${header.missingRequired.join(", ")}.`);
  }
  if (header.duplicateColumns.length) {
    fileErrors.push(`Column given more than once (the first is used): ${header.duplicateColumns.join(", ")}.`);
  }
  if (header.missingRequired.length) return { fileErrors, unknownHeaders: header.unknownHeaders, rows: [], counts };

  const byKey = new Map<string, ExistingDeviceForPlan>();
  for (const d of input.existing) {
    const k = labelKey(input.siteId, d.building_key, d.label);
    if (k) byKey.set(k, d);
  }
  const seenInFile = new Map<string, number>();
  const rows: PlannedRow[] = [];

  input.rows.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2;
    const parsed = parseRow(cells, header, rowNumber);
    const { fields } = parsed;
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];

    // Floor + building resolution. The raw text is kept as the key either way.
    const changes: Partial<DeviceFields> = {};
    const { building_name, floor_label, ...rest } = fields;
    Object.assign(changes, rest);
    let buildingKey: string | null = building_name ?? null;
    if (floor_label !== undefined || building_name !== undefined) {
      const fm = matchFloor(input.floors, building_name, floor_label);
      if (fm === "ambiguous") {
        errors.push(`Floor "${floor_label}" matches more than one floor on this site; add a building column to tell them apart.`);
      } else if (fm) {
        changes.floor_id = fm.id;
        changes.floor_key = fm.floor_key ?? floor_label ?? null;
        buildingKey = fm.building_key ?? building_name ?? null;
      } else if (floor_label !== undefined) {
        changes.floor_key = floor_label;
        warnings.push(`Floor "${floor_label}" isn't set up on this site yet; kept as written, not placed on a floor.`);
      }
      if (buildingKey !== null) changes.building_key = buildingKey;
    }

    const typeMatched = fields.type_id ? input.knownTypeIds.has(fields.type_id) : null;
    if (fields.type_id && !typeMatched) warnings.push(`Type "${fields.type_id}" isn't in the type list; imported as written and marked unmatched.`);

    const key = labelKey(input.siteId, changes.building_key ?? null, fields.label ?? null);
    if (key && seenInFile.has(key)) {
      errors.push(`Same label and building as row ${seenInFile.get(key)}; a device appears once per building.`);
    } else if (key) seenInFile.set(key, rowNumber);

    if (errors.length) {
      counts.error++;
      rows.push({ rowNumber, action: "error", label: fields.label ?? null, deviceId: null, changes: {}, typeMatched, errors, warnings });
      return;
    }

    const existing = key ? byKey.get(key) : undefined;
    if (!existing) {
      counts.create++;
      rows.push({ rowNumber, action: "create", label: fields.label ?? null, deviceId: null, changes, typeMatched, errors, warnings });
      return;
    }
    const delta: Partial<DeviceFields> = {};
    for (const [k, v] of Object.entries(changes) as [keyof DeviceFields, unknown][]) {
      if (k === "network") {
        // Merge: a file that sets only the IP must not wipe the switch/port.
        const merged = normalizeNetwork({ ...(existing.fields.network ?? {}), ...((v as DeviceNetwork) ?? {}) });
        if (!eq(merged, existing.fields.network)) delta.network = merged;
        continue;
      }
      if (!eq(v, existing.fields[k])) (delta as Record<string, unknown>)[k] = v;
    }
    const action: PlannedAction = Object.keys(delta).length ? "update" : "unchanged";
    counts[action]++;
    rows.push({ rowNumber, action, label: fields.label ?? null, deviceId: existing.id, changes: delta, typeMatched, errors, warnings });
  });

  return { fileErrors, unknownHeaders: header.unknownHeaders, rows, counts };
}

export function templateCsv(): string {
  return TEMPLATE_COLUMNS.join(",") + "\n";
}
