"use server";

// ATTACH-1 — attachments server actions. Reads open to authenticated callers;
// writes gated on hasPermission(role, "inventory", create|delete) — the same
// gate products use (a later chunk may broaden this per entity_type). DB rows
// are written here; storage objects are uploaded client-side and removed here
// on delete (server client) so a row never outlives its object.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbAttachment, DbRole } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return { ok: false, error: message };
}

// DbRole (11) → mock Role (7) for hasPermission; mirrors vendors/PO actions.
function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

// ATTACH-2: each entity_type gates on its own permission resource; anything
// unmapped falls back to "inventory".
const ENTITY_RESOURCE: Record<string, Resource> = {
  product: "inventory",
  client: "clients",
  // SITE-DETAIL: sites live in the clients domain → gate on the same resource.
  site: "clients",
  quote: "quotes",
};

function resourceFor(entityType: string): Resource {
  return ENTITY_RESOURCE[entityType] ?? "inventory";
}

async function requireEntityPermission(
  entityType: string,
  action: Action
): Promise<{ ok: false; error: string } | null> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), resourceFor(entityType), action)) {
    return { ok: false, error: "You don't have permission to manage these attachments." };
  }
  return null;
}

export async function listAttachments(
  entityType: string,
  entityId: string
): Promise<ActionResult<DbAttachment[]>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attachments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("folder", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as DbAttachment[] };
  } catch (e) {
    return fail(e);
  }
}

export async function createAttachment(
  entityType: string,
  entityId: string,
  folder: string,
  file: { path: string; filename: string; contentType?: string | null; size?: number | null }
): Promise<ActionResult<DbAttachment>> {
  try {
    const denied = await requireEntityPermission(entityType, "create");
    if (denied) return denied;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("attachments")
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        folder: folder.trim() || "General",
        bucket: "attachments",
        path: file.path,
        filename: file.filename,
        content_type: file.contentType ?? null,
        size_bytes: file.size ?? null,
        uploaded_by: user?.id ?? null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const row = data as DbAttachment;
    await logActivity("attachment", row.id, "create", {
      file: { from: null, to: `${entityType}/${folder}/${row.filename}` },
    });
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAttachment(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: row, error: loadErr } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!row) return { ok: false, error: "Attachment not found" };
    const att = row as DbAttachment;

    // Gate on the row's own entity resource (loaded above so we know the type).
    const denied = await requireEntityPermission(att.entity_type, "delete");
    if (denied) return denied;

    // Remove the storage object first, then the row (best-effort on the object
    // so a missing object never blocks clearing the row).
    await supabase.storage.from(att.bucket).remove([att.path]);

    const { error: delErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", id);
    if (delErr) throw new Error(delErr.message);

    await logActivity("attachment", id, "delete", {
      file: { from: `${att.entity_type}/${att.folder}/${att.filename}`, to: null },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Bulk-remove all attachments for an entity (objects + rows). Called from an
 * entity hard-delete so files/rows don't orphan. Gated like the other writes.
 */
export async function deleteAttachmentsForEntity(
  entityType: string,
  entityId: string
): Promise<ActionResult<{ removed: number }>> {
  try {
    const denied = await requireEntityPermission(entityType, "delete");
    if (denied) return denied;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attachments")
      .select("id, bucket, path")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Pick<DbAttachment, "id" | "bucket" | "path">[];
    if (rows.length === 0) return { ok: true, data: { removed: 0 } };

    // Remove objects (grouped by bucket — all 'attachments' in practice).
    const paths = rows.map((r) => r.path);
    await supabase.storage.from(rows[0].bucket).remove(paths);

    const { error: delErr } = await supabase
      .from("attachments")
      .delete()
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    if (delErr) throw new Error(delErr.message);

    return { ok: true, data: { removed: rows.length } };
  } catch (e) {
    return fail(e);
  }
}
