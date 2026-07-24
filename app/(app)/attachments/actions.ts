"use server";

// ATTACH-1 — attachments server actions. Reads open to authenticated callers;
// writes gated on hasPermission(role, <entity resource>, "edit"). DB rows are
// written here; storage objects are uploaded client-side and removed here on
// delete (server client) so a row never outlives its object.
//
// BUGFIX (product attachments never upload): the write gate used to require the
// entity resource's *create* action. But the modules these attachments hang off
// gate their own writes on *edit* (inventory:edit, clients:edit, quotes:edit),
// and NO role except Admin is granted inventory:create / clients:create — so
// every non-Admin operator who could otherwise edit a product (e.g. a
// ProjectManager with inventory:edit) was silently denied: the client uploaded
// the object, this action refused the row, the client rolled the object back,
// and nothing persisted. Attaching/detaching a file IS an edit of the parent
// entity, so writes now gate on "edit" — the action every relevant resource
// grants its editors.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  // CUSTODY-1: delivery-proof attachments land on the project → gate on projects.
  project: "projects",
  // PROJ2-4b: folder-tree uploads (entity_type='folder') gate on projects.
  folder: "projects",
  // SAFARI-FIX: the product image (product-images bucket) shares the signed-URL
  // flow; it edits the product, so it gates on inventory like `product`.
  product_image: "inventory",
  // SAFARI-FIX residual (#311): quote drawings (quote-drawings bucket) — the
  // drawings schedule edits the quote, so uploads/removals gate on quotes.
  quote_drawing: "quotes",
  // SUB-2: subcontractor compliance docs (WSIB, insurance, licences) ride the
  // default `attachments` bucket; managing them edits the subcontractor.
  subcontractor_doc: "subcontractors",
  // PROJ2-12: deficiency photos ride the default `attachments` bucket; adding
  // one edits the project's punch list, so it gates on projects.
  deficiency: "projects",
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
    // A file attach is an EDIT of the parent entity (see header note).
    const denied = await requireEntityPermission(entityType, "edit");
    if (denied) {
      console.error(
        `[attachments] createAttachment DENIED entity=${entityType}/${entityId} folder="${folder}" file="${file.filename}" resource=${resourceFor(
          entityType
        )} action=edit`
      );
      return denied;
    }

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
    // §4c — log the failure path with enough context to reproduce.
    console.error(
      `[attachments] createAttachment FAILED entity=${entityType}/${entityId} folder="${folder}" file="${file.filename}" path="${file.path}":`,
      e
    );
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
    // Detaching a file is an edit of the parent entity — same gate as attach.
    const denied = await requireEntityPermission(att.entity_type, "edit");
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
    // Bulk detach (from an entity hard-delete) — gated on entity edit like the
    // single-file writes; the calling hard-delete flow has its own stricter gate.
    const denied = await requireEntityPermission(entityType, "edit");
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

// ── SAFARI-FIX — signed-URL upload flow ──────────────────────────────────────
// The old flow uploaded from the browser via supabase-js, whose FIRST await
// (auth.getUser()) contends on the navigator.locks auth lock — a known Safari
// deadlock: spinner forever, no network request, no error (diagnosed in the
// PR #309 investigation). The new flow keeps supabase-js OFF the client upload
// path entirely: this action (service role) issues a pre-authorized signed
// upload URL; the client PUTs the bytes with plain fetch; the DB row still goes
// through createAttachment. Authorization lives HERE (same <resource>:edit gate
// as createAttachment) — the service role only executes after the gate passes.

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
// quote-drawings bucket constraint (Dashboard: 20 MB, application/pdf only).
const QUOTE_DRAWING_MAX_BYTES = 20 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// The bucket + object path for an upload, per entity type. product_image keeps
// the product-images bucket + its existing `products/{id}/{ts}.jpg` convention;
// everything else lands in the attachments bucket at
// {entityType}/{entityId}/{timestamp}-{safeFilename} (unchanged from the old
// client-side uploader).
function uploadDestination(
  entityType: string,
  entityId: string,
  filename: string
): { bucket: string; path: string; prefix: string } {
  if (entityType === "product_image") {
    return {
      bucket: "product-images",
      path: `products/${entityId}/${Date.now()}.jpg`,
      prefix: `products/${entityId}/`,
    };
  }
  // Quote drawings keep the QD-2 convention: {user_id}/{ts}-{safeFilename}.
  // entityId here is the AUTHENTICATED user's id, derived server-side by the
  // action (never trusted from the client).
  if (entityType === "quote_drawing") {
    return {
      bucket: "quote-drawings",
      path: `${entityId}/${Date.now()}-${sanitizeFilename(filename)}`,
      prefix: `${entityId}/`,
    };
  }
  return {
    bucket: "attachments",
    path: `${entityType}/${entityId}/${Date.now()}-${sanitizeFilename(filename)}`,
    prefix: `${entityType}/${entityId}/`,
  };
}

export async function getSignedUploadUrlAction(input: {
  entityType: string;
  entityId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<
  | { ok: true; path: string; token: string; signedUrl: string; bucket: string }
  | { ok: false; error: string }
> {
  try {
    const denied = await requireEntityPermission(input.entityType, "edit");
    if (denied) {
      console.error(
        `[upload] signed-url DENIED entity=${input.entityType}/${input.entityId} file="${input.filename}"`
      );
      return denied;
    }

    if (!input.filename.trim()) return { ok: false, error: "Missing filename." };
    if (!input.contentType) return { ok: false, error: "Missing content type." };
    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      return { ok: false, error: "Missing file size." };
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      return { ok: false, error: "File too large. Max 50 MB." };
    }

    // quote_drawing mirrors the quote-drawings bucket constraints (20 MB,
    // application/pdf) and is namespaced by the AUTHENTICATED user — the
    // client-supplied entityId is ignored for this surface.
    // SUB-2: compliance docs cap at 20 MB (mirrors quote drawings); the
    // client allow-list already limits to PDF + images.
    if (input.entityType === "subcontractor_doc") {
      if (input.sizeBytes > QUOTE_DRAWING_MAX_BYTES) {
        return { ok: false, error: "File too large. Max 20 MB." };
      }
    }

    let entityId = input.entityId;
    if (input.entityType === "quote_drawing") {
      if (input.contentType !== "application/pdf") {
        return { ok: false, error: "Quote drawings must be a PDF." };
      }
      if (input.sizeBytes > QUOTE_DRAWING_MAX_BYTES) {
        return { ok: false, error: "File too large. Max 20 MB." };
      }
      const me = await getCurrentProfile();
      if (!me) return { ok: false, error: "You're not signed in." };
      entityId = me.id;
    }

    const { bucket, path } = uploadDestination(
      input.entityType,
      entityId,
      input.filename
    );

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error(
        `[upload] createSignedUploadUrl FAILED (bucket=${bucket}, path="${path}")`,
        error
      );
      return { ok: false, error: error?.message ?? "Could not sign upload." };
    }

    console.info(
      `[upload] signed URL issued (bucket=${bucket}, path="${path}", entity=${input.entityType}/${input.entityId})`
    );
    return {
      ok: true,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      bucket,
    };
  } catch (e) {
    console.error("[upload] getSignedUploadUrlAction threw:", e);
    return fail(e);
  }
}

// Server-side removal of an uploaded object that never got its DB row (rollback
// after a failed createAttachment) or a replaced/cleared product image. The old
// client-side remover ran through supabase-js and could hit the same Safari
// auth-lock hang ON THE ERROR PATH. Gated like the other writes; the path must
// sit under the entity type's own namespace so a caller can't gate-shop one
// resource to delete another's objects.
export async function deleteUploadedObjectAction(input: {
  entityType: string;
  entityId: string;
  path: string;
}): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const denied = await requireEntityPermission(input.entityType, "edit");
    if (denied) return denied;

    let bucket: string;
    if (input.entityType === "quote_drawing") {
      // Drawings are namespaced per UPLOADER ({user_id}/…), but removal is a
      // quote edit — any quotes:edit holder may remove a drawing regardless of
      // who uploaded it. The bucket is fixed server-side, so the only checks
      // needed are path-shape sanity (no traversal, inside a user namespace).
      bucket = "quote-drawings";
      if (
        input.path.includes("..") ||
        input.path.startsWith("/") ||
        !/^[^/]+\/.+$/.test(input.path)
      ) {
        return { ok: false, error: "Invalid drawings path." };
      }
    } else {
      const dest = uploadDestination(input.entityType, input.entityId, "x");
      bucket = dest.bucket;
      if (!input.path.startsWith(dest.prefix)) {
        return { ok: false, error: "Path does not belong to this entity." };
      }
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from(bucket).remove([input.path]);
    if (error) {
      console.error(
        `[upload] object delete FAILED (bucket=${bucket}, path="${input.path}")`,
        error
      );
      return { ok: false, error: error.message };
    }
    console.info(
      `[upload] object deleted (bucket=${bucket}, path="${input.path}")`
    );
    return { ok: true, data: { removed: true } };
  } catch (e) {
    return fail(e);
  }
}

// ── SAFARI-FIX follow-up (#310) — signed DOWNLOAD URLs ───────────────────────
// Downloads used to sign client-side via browser supabase-js
// (getSignedAttachmentUrl), which rides the same navigator.locks auth lock that
// deadlocked uploads in Safari. Same cure: sign server-side (service role),
// hand the browser a plain URL. Downloads are READS, so the gate is the entity
// resource's :view (not :edit like the upload/delete writes). The row is loaded
// first so the gate keys off the attachment's own entity_type, and the signed
// URL carries `download=<filename>` so the response's Content-Disposition
// forces a save (cross-origin <a download> attributes are ignored by browsers).
export async function getSignedDownloadUrlAction(input: {
  attachmentId: string;
}): Promise<
  | { ok: true; signedUrl: string; filename: string }
  | { ok: false; error: string }
> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: row, error: loadErr } = await supabase
      .from("attachments")
      .select("*")
      .eq("id", input.attachmentId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!row) return { ok: false, error: "not_found" };
    const att = row as DbAttachment;

    const denied = await requireEntityPermission(att.entity_type, "view");
    if (denied) {
      console.error(
        `[download] signed-url DENIED entity=${att.entity_type}/${att.entity_id} file="${att.filename}"`
      );
      return denied;
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(att.bucket)
      .createSignedUrl(att.path, 300, { download: att.filename });
    if (error || !data) {
      console.error(
        `[download] createSignedUrl FAILED (bucket=${att.bucket}, path="${att.path}")`,
        error
      );
      return { ok: false, error: error?.message ?? "Could not sign download." };
    }

    console.info(
      `[download] signed URL issued (bucket=${att.bucket}, path="${att.path}", entity=${att.entity_type}/${att.entity_id})`
    );
    return { ok: true, signedUrl: data.signedUrl, filename: att.filename };
  } catch (e) {
    console.error("[download] getSignedDownloadUrlAction threw:", e);
    return fail(e);
  }
}

// SAFARI-FIX residual (#311) — quote drawings have no attachments row (the
// path lives inside the quote's jsonb schedule), so they can't ride
// getSignedDownloadUrlAction. Same cure, keyed by path: server-side signing
// (service role) gated on quotes:view; the browser gets a plain URL for the
// PDF-to-images render. 300s expiry — the render fetches immediately.
export async function getSignedQuoteDrawingUrlAction(input: {
  path: string;
}): Promise<
  { ok: true; signedUrl: string } | { ok: false; error: string }
> {
  try {
    const denied = await requireEntityPermission("quote_drawing", "view");
    if (denied) {
      console.error(`[download] drawings signed-url DENIED path="${input.path}"`);
      return denied;
    }
    if (
      !input.path.trim() ||
      input.path.includes("..") ||
      input.path.startsWith("/")
    ) {
      return { ok: false, error: "Invalid drawings path." };
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("quote-drawings")
      .createSignedUrl(input.path, 300);
    if (error || !data) {
      console.error(
        `[download] drawings createSignedUrl FAILED (path="${input.path}")`,
        error
      );
      return { ok: false, error: error?.message ?? "Could not sign download." };
    }
    console.info(`[download] drawings signed URL issued (path="${input.path}")`);
    return { ok: true, signedUrl: data.signedUrl };
  } catch (e) {
    console.error("[download] getSignedQuoteDrawingUrlAction threw:", e);
    return fail(e);
  }
}
