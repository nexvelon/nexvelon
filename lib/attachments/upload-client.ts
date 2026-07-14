"use client";

// SAFARI-FIX — the client half of the signed-URL upload flow. Zero supabase-js
// involvement: the server action (service role) signs the upload, and the file
// bytes go up with a plain fetch PUT. The old path's first await
// (supabase.auth.getUser()) deadlocked on Safari's navigator.locks — spinner
// forever, no network request, no error (PR #309 investigation). A hard 60s
// AbortController timeout guarantees no upload can ever spin forever again.
//
// storage-js v2 mechanics (verified against the installed package):
// createSignedUploadUrl returns an absolute signedUrl with the token in its
// query string; the upload endpoint accepts a raw-body PUT with a content-type
// header — exactly what uploadToSignedUrl does internally, minus the client.

import { getSignedUploadUrlAction } from "@/app/(app)/attachments/actions";

const ALLOWED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — matches the server action
const PUT_TIMEOUT_MS = 60_000;

export type SignedUploadResult =
  | { ok: true; path: string; bucket: string }
  | { ok: false; error: string };

export async function uploadViaSignedUrl(input: {
  entityType: string;
  entityId: string;
  file: File;
}): Promise<SignedUploadResult> {
  const { entityType, entityId, file } = input;

  if (!ALLOWED.includes(file.type)) {
    return { ok: false, error: "File must be a PDF, PNG, JPEG, or WebP." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "File too large. Max 50 MB." };
  }

  console.info(
    `[upload] requesting signed URL (entity=${entityType}/${entityId}, name="${file.name}", size=${file.size})`
  );
  const signed = await getSignedUploadUrlAction({
    entityType,
    entityId,
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!signed.ok) {
    console.error("[upload] signed URL request FAILED", signed.error);
    return signed;
  }

  console.info(
    `[upload] signed URL received, PUTting file (bucket=${signed.bucket}, path="${signed.path}")`
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUT_TIMEOUT_MS);
  try {
    const put = await fetch(signed.signedUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
      signal: controller.signal,
    });
    if (!put.ok) {
      const text = await put.text().catch(() => "");
      console.error(`[upload] PUT failed (status=${put.status})`, text);
      return { ok: false, error: `Upload failed (${put.status}): ${text}` };
    }
    console.info(`[upload] PUT complete (path="${signed.path}")`);
    return { ok: true, path: signed.path, bucket: signed.bucket };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      console.error("[upload] PUT timed out after 60s — aborted");
      return { ok: false, error: "upload_timeout" };
    }
    console.error("[upload] PUT threw", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
