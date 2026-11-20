"use server";

// DEVREG-1 — Device Register server actions.
//
// Gating reuses EXISTING keys (no new permission dimension, PERM-1..4 pattern):
// a device is a project/site technical record, the same family as commissioning,
// so:
//   • reads   → projects:view
//   • create, edit, floors, import → projects:edit
//   • remove (soft delete) → projects:delete
// Every gate resolves server-side through can() (the DB matrix plus per-user
// overrides). The pages repeat the view gate so the URL itself doesn't leak data.

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/resolve";
import { getCurrentProfile } from "@/lib/auth/profile";
import type { Action } from "@/lib/permissions";
import {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  removeDevice,
  listFloorsForSite,
  createFloor,
  updateFloor,
  previewDeviceImport,
  commitDeviceImport,
  type DeviceRow,
  type DeviceDetail,
  type DeviceListFilters,
  type DeviceFloor,
  type FloorInput,
  type ImportOutcome,
} from "@/lib/api/devices";
import type { DeviceFields } from "@/lib/devices/model";
import type { ImportPlan } from "@/lib/devices/csv-import";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

const DENIED: Record<string, string> = {
  view: "You don't have permission to view the device register.",
  edit: "You don't have permission to change devices.",
  delete: "You don't have permission to remove devices.",
};

async function requireDevices(
  action: Extract<Action, "view" | "edit" | "delete">
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!(await can("projects", action))) return { ok: false, error: DENIED[action] };
  return { ok: true, actorId: me.id };
}

/** Import size guard: a schedule is hundreds of rows, not hundreds of thousands. */
const MAX_IMPORT_ROWS = 5000;

function revalidateDevices(id?: string) {
  revalidatePath("/devices");
  if (id) revalidatePath(`/devices/${id}`);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listDevicesAction(filters: DeviceListFilters = {}): Promise<ActionResult<DeviceRow[]>> {
  try {
    const g = await requireDevices("view");
    if (!g.ok) return g;
    return { ok: true, data: await listDevices(filters) };
  } catch (e) {
    return fail(e);
  }
}

export async function getDeviceAction(id: string): Promise<ActionResult<DeviceDetail | null>> {
  try {
    const g = await requireDevices("view");
    if (!g.ok) return g;
    return { ok: true, data: await getDevice(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function listFloorsForSiteAction(siteId: string): Promise<ActionResult<DeviceFloor[]>> {
  try {
    const g = await requireDevices("view");
    if (!g.ok) return g;
    if (!siteId) return { ok: true, data: [] };
    return { ok: true, data: await listFloorsForSite(siteId) };
  } catch (e) {
    return fail(e);
  }
}

// ─── Devices ─────────────────────────────────────────────────────────────────

export async function createDeviceAction(input: {
  siteId: string;
  projectId: string | null;
  fields: Partial<DeviceFields>;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const g = await requireDevices("edit");
    if (!g.ok) return g;
    if (!input.siteId) return { ok: false, error: "Choose the site this device is at." };
    if (!input.fields.label?.trim()) return { ok: false, error: "A device needs a label (e.g. CAM-01)." };
    const rec = await createDevice(
      { siteId: input.siteId, projectId: input.projectId || null, fields: input.fields, source: "manual" },
      g.actorId
    );
    revalidateDevices(rec.id);
    return { ok: true, data: { id: rec.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDeviceAction(
  id: string,
  patch: { fields?: Partial<DeviceFields>; projectId?: string | null }
): Promise<ActionResult<{ id: string }>> {
  try {
    const g = await requireDevices("edit");
    if (!g.ok) return g;
    if (patch.fields && "label" in patch.fields && !patch.fields.label?.trim()) {
      return { ok: false, error: "A device needs a label." };
    }
    await updateDevice(id, patch, g.actorId);
    revalidateDevices(id);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function removeDeviceAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const g = await requireDevices("delete");
    if (!g.ok) return g;
    await removeDevice(id, g.actorId);
    revalidateDevices(id);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Floors ──────────────────────────────────────────────────────────────────

function validateFloor(input: FloorInput): string | null {
  if (!input.label?.trim() && !input.floor_key?.trim() && !input.level_key?.trim()) {
    return "A floor needs a name or a floor key.";
  }
  for (const k of ["plan_width_m", "plan_depth_m", "plan_aspect"] as const) {
    const v = input[k];
    if (v != null && !(Number(v) > 0)) return "Plan width, depth and aspect must be greater than zero.";
  }
  return null;
}

export async function saveFloorAction(input: {
  id?: string;
  siteId: string;
  floor: FloorInput;
}): Promise<ActionResult<DeviceFloor>> {
  try {
    const g = await requireDevices("edit");
    if (!g.ok) return g;
    const err = validateFloor(input.floor);
    if (err) return { ok: false, error: err };
    const f = input.id
      ? await updateFloor(input.id, input.floor, g.actorId)
      : await createFloor(input.siteId, input.floor, g.actorId);
    revalidateDevices();
    return { ok: true, data: f };
  } catch (e) {
    return fail(e);
  }
}

// ─── Import ──────────────────────────────────────────────────────────────────

function checkRows(rows: unknown): string | null {
  if (!Array.isArray(rows) || rows.some((r) => !Array.isArray(r))) return "The file couldn't be read as a table.";
  if (rows.length > MAX_IMPORT_ROWS + 1) return `That file has more than ${MAX_IMPORT_ROWS} rows; split it and import in parts.`;
  return null;
}

/** Dry run: returns exactly what an import would do; writes nothing. */
export async function previewDeviceImportAction(input: {
  siteId: string;
  rows: string[][];
}): Promise<ActionResult<ImportPlan>> {
  try {
    const g = await requireDevices("edit");
    if (!g.ok) return g;
    if (!input.siteId) return { ok: false, error: "Choose the site to import into." };
    const bad = checkRows(input.rows);
    if (bad) return { ok: false, error: bad };
    return { ok: true, data: await previewDeviceImport(input.siteId, input.rows) };
  } catch (e) {
    return fail(e);
  }
}

export async function commitDeviceImportAction(input: {
  siteId: string;
  projectId: string | null;
  rows: string[][];
  fileName: string | null;
}): Promise<ActionResult<ImportOutcome>> {
  try {
    const g = await requireDevices("edit");
    if (!g.ok) return g;
    if (!input.siteId) return { ok: false, error: "Choose the site to import into." };
    const bad = checkRows(input.rows);
    if (bad) return { ok: false, error: bad };
    const out = await commitDeviceImport(input.siteId, input.projectId || null, input.rows, g.actorId, input.fileName);
    revalidateDevices();
    return { ok: true, data: out };
  } catch (e) {
    return fail(e);
  }
}
