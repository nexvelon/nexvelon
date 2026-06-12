"use client";

// ATTACH-1 — client-side helpers for the PRIVATE "attachments" Storage bucket.
// Mirrors lib/api/drawings.ts: uploads run from the browser (the authenticated
// session + the storage.objects policies gate write access); reads use signed
// URLs (the bucket is never public). The DB row is written by a server action
// (app/(app)/attachments/actions.ts) — these helpers handle storage only.
// Path namespace: {entity_type}/{entity_id}/{timestamp}-{safe-filename}

import { createClient } from "@/lib/supabase/client";

const BUCKET = "attachments";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export interface UploadedAttachment {
  path: string;
  filename: string;
  contentType: string;
  size: number;
}

export async function uploadAttachmentObject(
  entityType: string,
  entityId: string,
  file: File
): Promise<UploadedAttachment> {
  if (!ALLOWED.includes(file.type)) {
    throw new Error("File must be a PDF, PNG, JPEG, or WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large. Max ${MAX_BYTES / 1024 / 1024} MB.`);
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${entityType}/${entityId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return {
    path,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  };
}

/** Remove an attachment object from storage (best-effort; missing is not fatal). */
export async function deleteAttachmentObject(path: string): Promise<void> {
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

/** Short-lived signed URL for a private attachment (download/preview). */
export async function getSignedAttachmentUrl(
  path: string,
  expiresIn = 3600
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(
      `Failed to create signed URL: ${error?.message ?? "unknown"}`
    );
  }
  return data.signedUrl;
}
