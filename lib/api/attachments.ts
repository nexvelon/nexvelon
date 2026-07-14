"use client";

// ATTACH-1 — client-side READ helper for the PRIVATE "attachments" Storage
// bucket (signed download URLs; the bucket is never public).
//
// SAFARI-FIX — the upload/rollback helpers that used to live here
// (uploadAttachmentObject / deleteAttachmentObject) are GONE: their first await
// (supabase.auth.getUser()) deadlocked on Safari's navigator.locks auth lock —
// spinner forever, no network request, no error (PR #309 investigation). All
// upload surfaces now use the signed-URL flow instead:
//   lib/attachments/upload-client.ts  (plain-fetch PUT, 60s abort ceiling)
//   getSignedUploadUrlAction / deleteUploadedObjectAction (service role,
//   same <resource>:edit gates as createAttachment).

import { createClient } from "@/lib/supabase/client";

const BUCKET = "attachments";

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
