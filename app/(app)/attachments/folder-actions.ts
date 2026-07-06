"use server";

// PROJ2-4b — server actions for the folder tree. Folder + folder-scoped file
// operations are gated on projects:edit (project-write is the strongest existing
// proxy; reads on projects:view). Best-effort activity logging targets the
// folder's project (entity_type='project' — no 'folder'/'job' widening here).

import { revalidatePath } from "next/cache";
import {
  createUserFolder,
  renameFolder,
  reorderFolder,
  deleteFolder,
  countFolderContents,
  getFolderById,
} from "@/lib/api/attachment-folders";
import { logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbRole, DbAttachment } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

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

async function requireProjectsEdit(): Promise<
  { ok: true; actorId: string } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "projects", "edit")) {
    return { ok: false, error: "You don't have permission to manage folders." };
  }
  return { ok: true, actorId: me.id };
}

async function requireProjectsView(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me || !hasPermission(adaptRole(me.role), "projects", "view")) {
    return { ok: false, error: "You don't have permission to view folders." };
  }
  return { ok: true };
}

// Human error labels the client maps.
function folderError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg === "duplicate_name"
    ? "A folder with that name already exists here."
    : msg;
}

function revalidateFolderScope(projectId: string | null, siteId: string | null) {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (siteId) revalidatePath(`/sites/${siteId}`);
}

// ── Folder CRUD ───────────────────────────────────────────────────────────────

export async function createUserFolderAction(input: {
  parentId: string;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    if (!input.name.trim()) return { ok: false, error: "Folder name is required." };
    const folder = await createUserFolder({
      parentId: input.parentId,
      name: input.name,
      actorId: gate.actorId,
    });
    revalidateFolderScope(folder.project_id, folder.site_id);
    return { ok: true, data: { id: folder.id } };
  } catch (e) {
    return { ok: false, error: folderError(e) };
  }
}

export async function renameFolderAction(input: {
  folderId: string;
  newName: string;
}): Promise<ActionResult<null>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    if (!input.newName.trim()) return { ok: false, error: "Folder name is required." };
    const before = await getFolderById(input.folderId);
    await renameFolder({
      folderId: input.folderId,
      newName: input.newName,
      actorId: gate.actorId,
    });
    revalidateFolderScope(before?.project_id ?? null, before?.site_id ?? null);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: folderError(e) };
  }
}

export async function reorderFolderAction(input: {
  folderId: string;
  newSortOrder: number;
}): Promise<ActionResult<null>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    const before = await getFolderById(input.folderId);
    await reorderFolder({
      folderId: input.folderId,
      newSortOrder: input.newSortOrder,
      actorId: gate.actorId,
    });
    revalidateFolderScope(before?.project_id ?? null, before?.site_id ?? null);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFolderAction(
  folderId: string
): Promise<ActionResult<null>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    const before = await getFolderById(folderId);
    if (!before) return { ok: false, error: "Folder not found." };
    await deleteFolder(folderId);
    if (before.project_id) {
      try {
        await logActivity("project", before.project_id, "update", {
          folder_deleted: { from: before.name, to: null },
        });
      } catch (logErr) {
        console.error("[activity_log] folder delete log failed:", logErr);
      }
    }
    revalidateFolderScope(before.project_id, before.site_id);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function countFolderContentsAction(
  folderId: string
): Promise<ActionResult<{ fileCount: number; subfolderCount: number }>> {
  try {
    const gate = await requireProjectsView();
    if (!gate.ok) return { ok: false, error: gate.error };
    return { ok: true, data: await countFolderContents(folderId) };
  } catch (e) {
    return fail(e);
  }
}

// ── Folder-scoped file operations ─────────────────────────────────────────────

// The blob is uploaded client-side (uploadAttachmentObject) at path
// folder/{folderId}/..., then this stamps the DB row with folder_id.
export async function createFolderAttachmentAction(input: {
  folderId: string;
  file: { path: string; filename: string; contentType?: string | null; size?: number | null };
}): Promise<ActionResult<DbAttachment>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    const folder = await getFolderById(input.folderId);
    if (!folder) return { ok: false, error: "Folder not found." };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("attachments")
      .insert({
        entity_type: "folder",
        entity_id: input.folderId,
        folder: folder.name,
        folder_id: input.folderId,
        bucket: "attachments",
        path: input.file.path,
        filename: input.file.filename,
        content_type: input.file.contentType ?? null,
        size_bytes: input.file.size ?? null,
        uploaded_by: gate.actorId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    revalidateFolderScope(folder.project_id, folder.site_id);
    return { ok: true, data: data as DbAttachment };
  } catch (e) {
    return fail(e);
  }
}

export async function moveFileToFolderAction(input: {
  attachmentId: string;
  folderId: string;
}): Promise<ActionResult<null>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    const folder = await getFolderById(input.folderId);
    if (!folder) return { ok: false, error: "Destination folder not found." };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("attachments")
      .update({ folder_id: input.folderId, folder: folder.name })
      .eq("id", input.attachmentId);
    if (error) throw new Error(error.message);
    revalidateFolderScope(folder.project_id, folder.site_id);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function renameAttachmentAction(input: {
  attachmentId: string;
  filename: string;
}): Promise<ActionResult<null>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    if (!input.filename.trim()) return { ok: false, error: "Filename is required." };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("attachments")
      .update({ filename: input.filename.trim() })
      .eq("id", input.attachmentId);
    if (error) throw new Error(error.message);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// Mirrors the existing deleteAttachment: HARD delete (removes the storage object
// then the row). Gated on projects:edit for folder-tree files.
export async function deleteFolderAttachmentAction(
  attachmentId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireProjectsEdit();
    if (!gate.ok) return { ok: false, error: gate.error };
    const supabase = await createSupabaseServerClient();
    const { data: row, error: loadErr } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", attachmentId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!row) return { ok: false, error: "Attachment not found." };
    const att = row as DbAttachment;

    await supabase.storage.from(att.bucket).remove([att.path]);
    const { error: delErr } = await supabase
      .from("attachments")
      .delete()
      .eq("id", attachmentId);
    if (delErr) throw new Error(delErr.message);
    return { ok: true, data: { id: attachmentId } };
  } catch (e) {
    return fail(e);
  }
}
