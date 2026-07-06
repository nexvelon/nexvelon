import "server-only";

// PROJ2-4b — folder-tree data layer. Pure DB helpers (the actions layer gates).
// A folder is site-rooted; project_id / job_id narrow the Site/Project/Job
// lenses; parent_id builds the hierarchy. All descendants of a Job folder carry
// that job_id (the scaffold + createUserFolder both inherit it), so the Job lens
// is a flat `WHERE job_id = X` filter.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_SUBFOLDERS } from "@/lib/attachments/default-subfolders";
import type {
  DbAttachmentFolder,
  DbAttachment,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

const SELECT = "*";

export async function listFoldersForSite(
  siteId: string
): Promise<DbAttachmentFolder[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("attachment_folders")
    .select(SELECT)
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`listFoldersForSite: ${error.message}`);
  return (data ?? []) as DbAttachmentFolder[];
}

export async function listFoldersForProject(
  projectId: string
): Promise<DbAttachmentFolder[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("attachment_folders")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`listFoldersForProject: ${error.message}`);
  return (data ?? []) as DbAttachmentFolder[];
}

export async function listFoldersForJob(
  jobId: string
): Promise<DbAttachmentFolder[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("attachment_folders")
    .select(SELECT)
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`listFoldersForJob: ${error.message}`);
  return (data ?? []) as DbAttachmentFolder[];
}

export async function getFolderById(
  folderId: string
): Promise<DbAttachmentFolder | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("attachment_folders")
    .select(SELECT)
    .eq("id", folderId)
    .maybeSingle();
  if (error) throw new Error(`getFolderById: ${error.message}`);
  return (data as DbAttachmentFolder | null) ?? null;
}

function isDuplicate(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

export async function createUserFolder(input: {
  parentId: string;
  name: string;
  actorId: string | null;
}): Promise<DbAttachmentFolder> {
  const supabase = await db();
  const parent = await getFolderById(input.parentId);
  if (!parent) throw new Error("Parent folder not found.");

  // sort_order = max sibling + 1.
  const { data: sibs } = await supabase
    .from("attachment_folders")
    .select("sort_order")
    .eq("parent_id", input.parentId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = ((sibs ?? [])[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("attachment_folders")
    .insert({
      site_id: parent.site_id,
      project_id: parent.project_id,
      job_id: parent.job_id,
      parent_id: parent.id,
      name: input.name.trim(),
      slug: null,
      kind: "user_folder",
      is_system: false,
      sort_order: nextSort,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select(SELECT)
    .single();
  if (error) {
    if (isDuplicate(error)) throw new Error("duplicate_name");
    throw new Error(`createUserFolder: ${error.message}`);
  }
  return data as DbAttachmentFolder;
}

export async function renameFolder(input: {
  folderId: string;
  newName: string;
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("attachment_folders")
    .update({ name: input.newName.trim(), updated_by: input.actorId })
    .eq("id", input.folderId);
  if (error) {
    if (isDuplicate(error)) throw new Error("duplicate_name");
    throw new Error(`renameFolder: ${error.message}`);
  }
}

export async function reorderFolder(input: {
  folderId: string;
  newSortOrder: number;
  actorId: string | null;
}): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("attachment_folders")
    .update({ sort_order: input.newSortOrder, updated_by: input.actorId })
    .eq("id", input.folderId);
  if (error) throw new Error(`reorderFolder: ${error.message}`);
}

export async function deleteFolder(folderId: string): Promise<void> {
  const supabase = await db();
  // Children folders cascade (FK ON DELETE CASCADE); attachments in this folder
  // and descendants get folder_id → NULL (FK ON DELETE SET NULL) and surface as
  // "Unfiled".
  const { error } = await supabase
    .from("attachment_folders")
    .delete()
    .eq("id", folderId);
  if (error) throw new Error(`deleteFolder: ${error.message}`);
}

/**
 * Recursive content count for the delete-confirm dialog. The supabase JS client
 * can't run a WITH RECURSIVE query, so we load the folder's project (or site)
 * folder set and walk it in code — correct and cheap for these small trees.
 */
export async function countFolderContents(
  folderId: string
): Promise<{ fileCount: number; subfolderCount: number }> {
  const supabase = await db();
  const folder = await getFolderById(folderId);
  if (!folder) return { fileCount: 0, subfolderCount: 0 };

  const all = folder.project_id
    ? await listFoldersForProject(folder.project_id)
    : await listFoldersForSite(folder.site_id);

  const childrenOf = new Map<string, string[]>();
  for (const f of all) {
    if (f.parent_id) {
      const arr = childrenOf.get(f.parent_id) ?? [];
      arr.push(f.id);
      childrenOf.set(f.parent_id, arr);
    }
  }
  // Descendant folder ids (excluding self).
  const descendants: string[] = [];
  const stack = [...(childrenOf.get(folderId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    descendants.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  const folderSet = [folderId, ...descendants];

  const { count } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .in("folder_id", folderSet);

  return { fileCount: count ?? 0, subfolderCount: descendants.length };
}

/** Files that live in any of the given folders (for the tree's right pane). */
export async function listAttachmentsForFolders(
  folderIds: string[]
): Promise<DbAttachment[]> {
  if (folderIds.length === 0) return [];
  const supabase = await db();
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .in("folder_id", folderIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAttachmentsForFolders: ${error.message}`);
  return (data ?? []) as DbAttachment[];
}

/**
 * Orphaned folder-uploads (folder_id NULL) — files whose folder was deleted.
 * Surfaced in the tree's synthetic "Unfiled" node. Scoped to entity_type
 * 'folder' (only tree uploads); precise per-tree scoping is a future refinement
 * — acceptable while a single site is live.
 */
export async function listUnfiledFolderAttachments(): Promise<DbAttachment[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("entity_type", "folder")
    .is("folder_id", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listUnfiledFolderAttachments: ${error.message}`);
  return (data ?? []) as DbAttachment[];
}

// ── Scaffolding (for NEW projects / change orders; backfill is in 0083) ───────

async function insertDefaults(
  supabase: Awaited<ReturnType<typeof db>>,
  base: {
    site_id: string;
    project_id: string;
    job_id: string;
    parent_id: string;
    actorId: string | null;
  }
): Promise<void> {
  const rows = DEFAULT_SUBFOLDERS.map((s, i) => ({
    site_id: base.site_id,
    project_id: base.project_id,
    job_id: base.job_id,
    parent_id: base.parent_id,
    name: s.name,
    slug: s.slug,
    kind: "default_subfolder" as const,
    is_system: true,
    sort_order: i,
    created_by: base.actorId,
    updated_by: base.actorId,
  }));
  const { error } = await supabase.from("attachment_folders").insert(rows);
  if (error) throw new Error(`insertDefaults: ${error.message}`);
}

export async function scaffoldFoldersForNewProject(input: {
  projectId: string;
  siteId: string;
  mainJobId: string;
  actorId: string | null;
}): Promise<{
  projectContainerId: string;
  mainJobFolderId: string;
  changeOrdersFolderId: string;
}> {
  const supabase = await db();

  // Project ordinal on the site.
  const { count } = await supabase
    .from("attachment_folders")
    .select("id", { count: "exact", head: true })
    .eq("site_id", input.siteId)
    .eq("kind", "project_container");
  const ordinal = (count ?? 0) + 1;

  const mk = async (row: Record<string, unknown>): Promise<string> => {
    const { data, error } = await supabase
      .from("attachment_folders")
      .insert({ created_by: input.actorId, updated_by: input.actorId, ...row })
      .select("id")
      .single();
    if (error) throw new Error(`scaffoldFoldersForNewProject: ${error.message}`);
    return (data as { id: string }).id;
  };

  const projectContainerId = await mk({
    site_id: input.siteId,
    project_id: input.projectId,
    job_id: null,
    parent_id: null,
    name: `Project ${ordinal}`,
    slug: "project_container",
    kind: "project_container",
    is_system: true,
    sort_order: 0,
  });

  const mainJobFolderId = await mk({
    site_id: input.siteId,
    project_id: input.projectId,
    job_id: input.mainJobId,
    parent_id: projectContainerId,
    name: "Main Job",
    slug: "main_job",
    kind: "main_job",
    is_system: true,
    sort_order: 0,
  });

  const changeOrdersFolderId = await mk({
    site_id: input.siteId,
    project_id: input.projectId,
    job_id: null,
    parent_id: projectContainerId,
    name: "Change Orders",
    slug: "change_orders",
    kind: "change_orders",
    is_system: true,
    sort_order: 1,
  });

  await insertDefaults(supabase, {
    site_id: input.siteId,
    project_id: input.projectId,
    job_id: input.mainJobId,
    parent_id: mainJobFolderId,
    actorId: input.actorId,
  });

  return { projectContainerId, mainJobFolderId, changeOrdersFolderId };
}

export async function scaffoldFoldersForNewChangeOrder(input: {
  projectId: string;
  jobId: string;
  coNumber: number;
  siteId: string;
  actorId: string | null;
}): Promise<{ changeOrderFolderId: string }> {
  const supabase = await db();

  // The project's Change Orders wrapper.
  const { data: wrap, error: wErr } = await supabase
    .from("attachment_folders")
    .select("id, site_id")
    .eq("project_id", input.projectId)
    .eq("kind", "change_orders")
    .maybeSingle();
  if (wErr) throw new Error(`scaffoldFoldersForNewChangeOrder: ${wErr.message}`);
  if (!wrap) throw new Error("Change Orders wrapper not found for project.");
  const wrapper = wrap as { id: string; site_id: string };

  const { data: co, error } = await supabase
    .from("attachment_folders")
    .insert({
      site_id: wrapper.site_id,
      project_id: input.projectId,
      job_id: input.jobId,
      parent_id: wrapper.id,
      name: `C.O #${input.coNumber}`,
      slug: `co_${input.coNumber}`,
      kind: "change_order",
      is_system: true,
      sort_order: input.coNumber,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`scaffoldFoldersForNewChangeOrder: ${error.message}`);
  const changeOrderFolderId = (co as { id: string }).id;

  await insertDefaults(supabase, {
    site_id: wrapper.site_id,
    project_id: input.projectId,
    job_id: input.jobId,
    parent_id: changeOrderFolderId,
    actorId: input.actorId,
  });

  return { changeOrderFolderId };
}
