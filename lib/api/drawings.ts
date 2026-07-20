"use client";

// QD-2 Phase 5b, rewired for SAFARI-FIX (#310/#311 residual) — quote-drawings
// helpers with ZERO browser supabase-js involvement. The old implementation's
// first await was supabase.auth.getUser(), which deadlocks on Safari's
// navigator.locks (PR #309 investigation): spinner forever, no network, no
// error. Now: the server signs (service role, quotes:edit / quotes:view gates
// + 20 MB / application/pdf bucket constraints mirrored server-side), the
// browser moves bytes with plain fetch via the shared uploadViaSignedUrl
// helper ([upload] logging + 60s abort ceiling come with it).
//
// Path namespace is unchanged: {user_id}/{timestamp}-{safe-filename}.pdf —
// derived SERVER-side from the authenticated profile (the entityId passed
// below is ignored for this surface).

import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import {
  deleteUploadedObjectAction,
  getSignedQuoteDrawingUrlAction,
} from "@/app/(app)/attachments/actions";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — mirrors the bucket constraint

export interface UploadedDrawing {
  path: string; // {user_id}/{timestamp}-{filename}.pdf
  filename: string;
  size: number;
  uploadedAt: string;
}

export async function uploadDrawingsPdf(file: File): Promise<UploadedDrawing> {
  // Client-side validation (defense in depth — the server action re-enforces).
  if (file.type !== "application/pdf") {
    throw new Error("File must be a PDF.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large. Max ${MAX_BYTES / 1024 / 1024} MB.`);
  }

  // entityId is server-derived for quote_drawing; "self" is a placeholder.
  const up = await uploadViaSignedUrl({
    entityType: "quote_drawing",
    entityId: "self",
    file,
  });
  if (!up.ok) throw new Error(up.error);

  return {
    path: up.path,
    filename: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteDrawingsPdf(path: string): Promise<void> {
  const res = await deleteUploadedObjectAction({
    entityType: "quote_drawing",
    entityId: "self",
    path,
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.error}`);
}

export async function getSignedDrawingsUrl(path: string): Promise<string> {
  const res = await getSignedQuoteDrawingUrlAction({ path });
  if (!res.ok) {
    throw new Error(`Failed to create signed URL: ${res.error}`);
  }
  return res.signedUrl;
}
