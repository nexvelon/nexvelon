import "server-only";

// QUOTE-PORTAL-2 item 8 — store generated quote PDFs as attachments on the quote.
// The unsigned PDF as sent goes to the "Proposals" folder at send time; the
// countersigned PDF goes to the "Signed" folder on acceptance. Filenames carry
// date + time. Uses the service-role client so it works in the unauthenticated
// portal context (signature happens with no signed-in operator); it uploads the
// bytes AND inserts the attachments row directly (createAttachment's edit-gate
// would fail in that context). The AttachmentsSection on the quote surfaces these
// folders automatically (free-text `folder` column, allowCustomFolders).

import { createAdminClient } from "@/lib/supabase/admin";
import type { DbAttachment } from "@/lib/types/database";

export const PROPOSALS_FOLDER = "Proposals";
export const SIGNED_FOLDER = "Signed";
const BUCKET = "attachments";

/** A filesystem-safe timestamp for filenames, e.g. 2026-09-28_1435. */
export function fileStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Store a PDF buffer against a quote in the given folder. Returns the row.
 *  Best-effort caller decides fatality; this throws on a hard storage failure. */
export async function storeQuoteDocument(input: {
  quoteId: string;
  folder: string;
  filename: string;
  buffer: Buffer;
  uploadedBy?: string | null;
}): Promise<DbAttachment> {
  const admin = createAdminClient();
  const safeName = input.filename.replace(/[^\w.\-]+/g, "_");
  const path = `quote/${input.quoteId}/${Date.now()}-${safeName}`;

  const up = await admin.storage.from(BUCKET).upload(path, input.buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (up.error) throw new Error(`storeQuoteDocument/upload: ${up.error.message}`);

  const { data, error } = await admin
    .from("attachments")
    .insert({
      entity_type: "quote",
      entity_id: input.quoteId,
      folder: input.folder.trim() || "General",
      bucket: BUCKET,
      path,
      filename: safeName,
      content_type: "application/pdf",
      size_bytes: input.buffer.byteLength,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`storeQuoteDocument/insert: ${error.message}`);
  return data as DbAttachment;
}

/** The storage bucket + a helper to fetch bytes back (used to serve the portal
 *  PDF and to attach it to emails). Service-role download. */
export async function downloadQuoteDocument(path: string): Promise<Buffer> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`downloadQuoteDocument: ${error?.message ?? "not found"}`);
  const arr = await data.arrayBuffer();
  return Buffer.from(arr);
}
