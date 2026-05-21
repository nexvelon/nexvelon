"use client";

// QD-2 Phase 5b — client-side helpers for the quote-drawings Storage bucket.
// Uploads run from the user's browser (not server-side) so the per-user RLS
// folder isolation is enforced by the authenticated session. Path namespace:
//   {user_id}/{timestamp}-{safe-filename}.pdf

import { createClient } from "@/lib/supabase/client";

const BUCKET = "quote-drawings";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export interface UploadedDrawing {
  path: string; // {user_id}/{timestamp}-{filename}.pdf
  filename: string;
  size: number;
  uploadedAt: string;
}

export async function uploadDrawingsPdf(file: File): Promise<UploadedDrawing> {
  // Client-side validation (defense in depth — server enforces via bucket config).
  if (file.type !== "application/pdf") {
    throw new Error("File must be a PDF.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large. Max ${MAX_BYTES / 1024 / 1024} MB.`);
  }

  const supabase = createClient();

  // Get current user id (path namespace).
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated.");

  // Build path: {user_id}/{timestamp}-{filename}.pdf
  const timestamp = Date.now();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${timestamp}-${safeFilename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  return {
    path,
    filename: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteDrawingsPdf(path: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

export async function getSignedDrawingsUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data)
    throw new Error(
      `Failed to create signed URL: ${error?.message ?? "unknown"}`
    );
  return data.signedUrl;
}
