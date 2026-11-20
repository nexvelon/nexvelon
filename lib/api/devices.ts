import "server-only";

// DEVREG-1 — Device Register data access (cookie-aware server client, RLS). The
// actions in app/(app)/devices/actions.ts gate every call (projects:view to read,
// projects:edit to write, projects:delete to remove).
//
// SEC-1: a device carries NO cost, price or margin today. The register is a
// technical record. If a cost is ever attached (e.g. a BOM → product mapping in
// DEVREG-3), it must be redacted here, server-side, through
// lib/permissions/field-redaction.ts, exactly like quote cost. It is not to be
// hidden in the UI only.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logActivity, computeChanges } from "@/lib/api/activity-log";
import { resolveDeviceOpco, type OpcoResolution } from "@/lib/devices/opco";
import { normalizeNetwork, type DeviceFields, type DeviceRecord, type DeviceSource } from "@/lib/devices/model";
import {
  planImport,
  type ExistingDeviceForPlan,
  type FloorForPlan,
  type ImportPlan,
} from "@/lib/devices/csv-import";
import type { FloorScale } from "@/lib/devices/position";

async function db() {
  return createSupabaseServerClient();
}

export interface DeviceFloor extends FloorScale {
  id: string;
  site_id: string;
  building_key: string | null;
  building_name: string | null;
  floor_key: string | null;
  level_key: string | null;
  label: string | null;
  sort_order: number;
  floor_height_m: number | null;
  plan_attachment_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DeviceType {
  id: string;
  name: string;
  system: string | null;
  label_prefix: string | null;
}

export interface DeviceRow extends DeviceRecord {
  site_name: string | null;
  client_name: string | null;
  project_number: string | null;
  floor_label: string | null;
  building_name: string | null;
  type_name: string | null;
  /** true = type id found in device_types; false = unmatched; null = no type. */
  type_matched: boolean | null;
  /** The system to filter/show: the device's own, else its type's. */
  effective_system: string | null;
  opco: OpcoResolution;
}

export interface DeviceListFilters {
  siteId?: string;
  projectId?: string;
  buildingKey?: string;
  floorId?: string;
  typeId?: string;
  system?: string;
  search?: string;
}

type DeviceJoin = DeviceRecord & {
  site: { name: string; client: { name: string; allowed_opcos: string[] | null } | null } | null;
  project: { project_number: string; opco: string } | null;
  floor: { label: string | null; building_name: string | null } | null;
};

const DEVICE_SELECT =
  "*, site:sites(name, client:clients(name, allowed_opcos)), project:projects(project_number, opco), floor:device_floors(label, building_name)";

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Postgres numerics arrive as strings; coerce once at the edge. */
function coerce(r: DeviceRecord): DeviceRecord {
  return {
    ...r,
    pos_x_m: numOrNull(r.pos_x_m),
    pos_z_m: numOrNull(r.pos_z_m),
    pos_u: numOrNull(r.pos_u),
    pos_v: numOrNull(r.pos_v),
    rotation_deg: numOrNull(r.rotation_deg),
    mount_height_m: numOrNull(r.mount_height_m),
  };
}

function coerceFloor(f: DeviceFloor): DeviceFloor {
  return {
    ...f,
    floor_height_m: numOrNull(f.floor_height_m),
    plan_aspect: numOrNull(f.plan_aspect),
    plan_origin_x_m: numOrNull(f.plan_origin_x_m),
    plan_origin_z_m: numOrNull(f.plan_origin_z_m),
    plan_width_m: numOrNull(f.plan_width_m),
    plan_depth_m: numOrNull(f.plan_depth_m),
  };
}

async function typeMap(supabase: Awaited<ReturnType<typeof db>>, ids: (string | null)[]): Promise<Map<string, DeviceType>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, DeviceType>();
  if (want.length === 0) return out;
  const { data, error } = await supabase.from("device_types").select("id, name, system, label_prefix").in("id", want);
  if (error) throw new Error(`device types: ${error.message}`);
  for (const t of (data ?? []) as DeviceType[]) out.set(t.id, t);
  return out;
}

function toRow(j: DeviceJoin, types: Map<string, DeviceType>): DeviceRow {
  const { site, project, floor, ...rest } = j;
  const rec = coerce(rest as DeviceRecord);
  const t = rec.type_id ? types.get(rec.type_id) : undefined;
  return {
    ...rec,
    site_name: site?.name ?? null,
    client_name: site?.client?.name ?? null,
    project_number: project?.project_number ?? null,
    floor_label: floor?.label ?? null,
    building_name: floor?.building_name ?? null,
    type_name: t?.name ?? null,
    type_matched: rec.type_id ? !!t : null,
    effective_system: rec.system ?? t?.system ?? null,
    opco: resolveDeviceOpco({ projectOpco: project?.opco, clientAllowedOpcos: site?.client?.allowed_opcos }),
  };
}

/** PostgREST `or()` search terms must not carry its own syntax characters. */
function safeTerm(s: string): string {
  return s.replace(/[,()*%\\]/g, " ").trim();
}

export async function listDevices(filters: DeviceListFilters = {}): Promise<DeviceRow[]> {
  const supabase = await db();
  let q = supabase.from("devices").select(DEVICE_SELECT).is("deleted_at", null);
  if (filters.siteId) q = q.eq("site_id", filters.siteId);
  if (filters.projectId) q = q.eq("project_id", filters.projectId);
  if (filters.buildingKey) q = q.eq("building_key", filters.buildingKey);
  if (filters.floorId) q = q.eq("floor_id", filters.floorId);
  if (filters.typeId) q = q.eq("type_id", filters.typeId);
  const term = filters.search ? safeTerm(filters.search) : "";
  if (term) {
    q = q.or(`label.ilike.*${term}*,model.ilike.*${term}*,network->>ip.ilike.*${term}*`);
  }
  const { data, error } = await q.order("label", { ascending: true }).limit(2000);
  if (error) throw new Error(`listDevices: ${error.message}`);
  const rows = (data ?? []) as unknown as DeviceJoin[];
  const types = await typeMap(supabase, rows.map((r) => r.type_id));
  let out = rows.map((r) => toRow(r, types));
  // System may come from the device or from its type, so it's filtered after the join.
  if (filters.system) out = out.filter((r) => r.effective_system === filters.system);
  return out;
}

export interface DeviceDetail {
  device: DeviceRow;
  floor: DeviceFloor | null;
  type: (DeviceType & { default_mount_height_m: number | null; default_cable_type: string | null; homes_to: string | null; accessories: unknown }) | null;
}

export async function getDevice(id: string): Promise<DeviceDetail | null> {
  const supabase = await db();
  const { data, error } = await supabase.from("devices").select(DEVICE_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`getDevice: ${error.message}`);
  if (!data) return null;
  const j = data as unknown as DeviceJoin;
  const types = await typeMap(supabase, [j.type_id]);
  const device = toRow(j, types);
  let floor: DeviceFloor | null = null;
  if (device.floor_id) {
    const { data: f } = await supabase.from("device_floors").select("*").eq("id", device.floor_id).maybeSingle();
    floor = f ? coerceFloor(f as DeviceFloor) : null;
  }
  let type: DeviceDetail["type"] = null;
  if (device.type_id && device.type_matched) {
    const { data: t } = await supabase.from("device_types").select("*").eq("id", device.type_id).maybeSingle();
    type = (t as DeviceDetail["type"]) ?? null;
  }
  return { device, floor, type };
}

export async function listFloorsForSite(siteId: string): Promise<DeviceFloor[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("device_floors")
    .select("*")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`listFloorsForSite: ${error.message}`);
  return ((data ?? []) as DeviceFloor[]).map(coerceFloor);
}

export async function listAllFloors(): Promise<DeviceFloor[]> {
  const supabase = await db();
  const { data, error } = await supabase.from("device_floors").select("*").is("deleted_at", null).order("sort_order");
  if (error) throw new Error(`listAllFloors: ${error.message}`);
  return ((data ?? []) as DeviceFloor[]).map(coerceFloor);
}

export async function listDeviceTypes(): Promise<DeviceType[]> {
  const supabase = await db();
  const { data, error } = await supabase.from("device_types").select("id, name, system, label_prefix").order("system").order("name");
  if (error) throw new Error(`listDeviceTypes: ${error.message}`);
  return (data ?? []) as DeviceType[];
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export interface CreateDeviceInput {
  siteId: string;
  projectId: string | null;
  fields: Partial<DeviceFields>;
  source: DeviceSource;
  externalId?: string | null;
  design?: Record<string, unknown> | null;
  asBuilt?: Record<string, unknown> | null;
}

/** The project, if given, must be at the same site; a device can't straddle sites. */
async function assertProjectAtSite(supabase: Awaited<ReturnType<typeof db>>, projectId: string | null, siteId: string) {
  if (!projectId) return;
  const { data, error } = await supabase.from("projects").select("site_id").eq("id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That project doesn't exist.");
  const p = data as { site_id: string | null };
  if (p.site_id !== siteId) throw new Error("That project isn't at this site, so its devices can't be recorded here.");
}

async function assertFloorAtSite(supabase: Awaited<ReturnType<typeof db>>, floorId: string | null | undefined, siteId: string) {
  if (!floorId) return;
  const { data } = await supabase.from("device_floors").select("site_id").eq("id", floorId).maybeSingle();
  if (!data || (data as { site_id: string }).site_id !== siteId) throw new Error("That floor isn't on this site.");
}

function friendlyDbError(message: string): string {
  if (message.includes("devices_site_building_label_uniq")) {
    return "Another device in this building already has that label. Labels are unique per building on a site.";
  }
  if (message.includes("devices_pos_norm_range_chk")) return "Plan position (u, v) must be between 0 and 1.";
  return message;
}

function cleanFields(f: Partial<DeviceFields>): Partial<DeviceFields> {
  const out: Partial<DeviceFields> = { ...f };
  if ("network" in out) out.network = normalizeNetwork(out.network);
  for (const k of Object.keys(out) as (keyof DeviceFields)[]) {
    const v = out[k];
    if (typeof v === "string") (out as Record<string, unknown>)[k] = v.trim() === "" ? null : v.trim();
  }
  return out;
}

async function siteName(supabase: Awaited<ReturnType<typeof db>>, siteId: string): Promise<string | null> {
  const { data } = await supabase.from("sites").select("name").eq("id", siteId).maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

export async function createDevice(input: CreateDeviceInput, actorId: string): Promise<DeviceRecord> {
  const supabase = await db();
  await assertProjectAtSite(supabase, input.projectId, input.siteId);
  const fields = cleanFields(input.fields);
  await assertFloorAtSite(supabase, fields.floor_id, input.siteId);
  const { data, error } = await supabase
    .from("devices")
    .insert({
      ...fields,
      site_id: input.siteId,
      project_id: input.projectId,
      source: input.source,
      external_id: input.externalId ?? null,
      design: input.design ?? null,
      as_built: input.asBuilt ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select("*")
    .single();
  if (error) throw new Error(friendlyDbError(error.message));
  const rec = coerce(data as DeviceRecord);
  await logActivity("device", rec.id, "create", {}, {
    parentType: "site",
    parentId: input.siteId,
    entityLabel: rec.label,
    parentLabel: await siteName(supabase, input.siteId),
  });
  return rec;
}

export async function updateDevice(
  id: string,
  patch: { fields?: Partial<DeviceFields>; projectId?: string | null },
  actorId: string,
  opts: { importSource?: DeviceSource } = {}
): Promise<DeviceRecord> {
  const supabase = await db();
  const { data: beforeData, error: beforeErr } = await supabase.from("devices").select("*").eq("id", id).maybeSingle();
  if (beforeErr) throw new Error(beforeErr.message);
  if (!beforeData) throw new Error("Device not found.");
  const before = coerce(beforeData as DeviceRecord);
  if (before.deleted_at) throw new Error("This device has been removed.");

  const fields = cleanFields(patch.fields ?? {});
  // §2.2 — `design` and `as_built` are source snapshots and are never written by an
  // edit. Strip them defensively in case a caller passed them through.
  delete (fields as Record<string, unknown>).design;
  delete (fields as Record<string, unknown>).as_built;
  await assertFloorAtSite(supabase, fields.floor_id, before.site_id);
  const next: Record<string, unknown> = { ...fields };
  if (patch.projectId !== undefined) {
    await assertProjectAtSite(supabase, patch.projectId, before.site_id);
    next.project_id = patch.projectId;
  }
  const changes = computeChanges(before as unknown as Record<string, unknown>, next);
  if (Object.keys(changes).length === 0) return before;

  const { data, error } = await supabase
    .from("devices")
    .update({ ...next, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(friendlyDbError(error.message));
  const rec = coerce(data as DeviceRecord);
  await logActivity(
    "device",
    id,
    "update",
    opts.importSource ? { ...changes, via: { from: null, to: opts.importSource } } : changes,
    { parentType: "site", parentId: rec.site_id, entityLabel: rec.label, parentLabel: await siteName(supabase, rec.site_id) }
  );
  return rec;
}

/** Soft delete (§1). The row and its history stay; it leaves every list. */
export async function removeDevice(id: string, actorId: string): Promise<void> {
  const supabase = await db();
  const { data: before } = await supabase.from("devices").select("id, site_id, label, deleted_at").eq("id", id).maybeSingle();
  if (!before) throw new Error("Device not found.");
  const b = before as { site_id: string; label: string | null; deleted_at: string | null };
  if (b.deleted_at) return;
  const { error } = await supabase
    .from("devices")
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity("device", id, "delete", {}, {
    parentType: "site",
    parentId: b.site_id,
    entityLabel: b.label,
    parentLabel: await siteName(supabase, b.site_id),
  });
}

// ─── Floors ──────────────────────────────────────────────────────────────────

export type FloorInput = Partial<
  Pick<
    DeviceFloor,
    | "building_key"
    | "building_name"
    | "floor_key"
    | "level_key"
    | "label"
    | "sort_order"
    | "floor_height_m"
    | "plan_aspect"
    | "plan_origin_x_m"
    | "plan_origin_z_m"
    | "plan_width_m"
    | "plan_depth_m"
    | "notes"
  >
>;

export async function createFloor(siteId: string, input: FloorInput, actorId: string): Promise<DeviceFloor> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("device_floors")
    .insert({ ...input, site_id: siteId, created_by: actorId, updated_by: actorId })
    .select("*")
    .single();
  if (error) {
    if (error.message.includes("device_floors_site_keys_uniq")) throw new Error("This site already has a floor with those building and floor keys.");
    throw new Error(error.message);
  }
  const f = coerceFloor(data as DeviceFloor);
  await logActivity("device_floor", f.id, "create", {}, {
    parentType: "site",
    parentId: siteId,
    entityLabel: f.label,
    parentLabel: await siteName(supabase, siteId),
  });
  return f;
}

export async function updateFloor(id: string, input: FloorInput, actorId: string): Promise<DeviceFloor> {
  const supabase = await db();
  const { data: beforeData } = await supabase.from("device_floors").select("*").eq("id", id).maybeSingle();
  if (!beforeData) throw new Error("Floor not found.");
  const before = coerceFloor(beforeData as DeviceFloor);
  const changes = computeChanges(before as unknown as Record<string, unknown>, input as Record<string, unknown>);
  if (Object.keys(changes).length === 0) return before;
  const { data, error } = await supabase
    .from("device_floors")
    .update({ ...input, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const f = coerceFloor(data as DeviceFloor);
  await logActivity("device_floor", id, "update", changes, {
    parentType: "site",
    parentId: f.site_id,
    entityLabel: f.label,
    parentLabel: await siteName(supabase, f.site_id),
  });
  return f;
}

// ─── Import ──────────────────────────────────────────────────────────────────

async function planContext(siteId: string) {
  const supabase = await db();
  const [{ data: devs, error: dErr }, floors, types] = await Promise.all([
    supabase.from("devices").select("*").eq("site_id", siteId).is("deleted_at", null),
    listFloorsForSite(siteId),
    listDeviceTypes(),
  ]);
  if (dErr) throw new Error(dErr.message);
  const existing: ExistingDeviceForPlan[] = ((devs ?? []) as DeviceRecord[]).map((raw) => {
    const d = coerce(raw);
    return { id: d.id, building_key: d.building_key, label: d.label, fields: d };
  });
  const floorPlan: FloorForPlan[] = floors.map((f) => ({
    id: f.id,
    building_key: f.building_key,
    building_name: f.building_name,
    floor_key: f.floor_key,
    level_key: f.level_key,
    label: f.label,
  }));
  return { existing, floors: floorPlan, knownTypeIds: new Set(types.map((t) => t.id)) };
}

/** Dry run: the plan, nothing written. */
export async function previewDeviceImport(siteId: string, rows: string[][]): Promise<ImportPlan> {
  const ctx = await planContext(siteId);
  return planImport({ rows, siteId, ...ctx });
}

export interface ImportOutcome {
  plan: ImportPlan;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  /** Rows the plan accepted but the database then refused. */
  failed: { rowNumber: number; error: string }[];
}

/**
 * Commit an import. Re-plans against the database NOW (never trusts a stale
 * client preview), then writes row by row so one bad row can't sink the rest.
 */
export async function commitDeviceImport(
  siteId: string,
  projectId: string | null,
  rows: string[][],
  actorId: string,
  fileName: string | null
): Promise<ImportOutcome> {
  const supabase = await db();
  await assertProjectAtSite(supabase, projectId, siteId);
  const plan = await previewDeviceImport(siteId, rows);
  const outcome: ImportOutcome = { plan, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: [] };
  if (plan.fileErrors.length && plan.rows.length === 0) return outcome;

  for (const r of plan.rows) {
    try {
      if (r.action === "error") outcome.skipped++;
      else if (r.action === "unchanged") outcome.unchanged++;
      else if (r.action === "create") {
        await createDevice({ siteId, projectId, fields: r.changes, source: "csv_import" }, actorId);
        outcome.created++;
      } else if (r.action === "update" && r.deviceId) {
        await updateDevice(r.deviceId, { fields: r.changes }, actorId, { importSource: "csv_import" });
        outcome.updated++;
      }
    } catch (e) {
      outcome.failed.push({ rowNumber: r.rowNumber, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // One summary row on the site's timeline for the import as a whole (§5).
  await logActivity(
    "site",
    siteId,
    "update",
    {
      device_import: {
        from: null,
        to: {
          file: fileName,
          created: outcome.created,
          updated: outcome.updated,
          unchanged: outcome.unchanged,
          skipped: outcome.skipped,
          failed: outcome.failed.length,
        },
      },
    },
    { entityLabel: await siteName(supabase, siteId) }
  );
  return outcome;
}
