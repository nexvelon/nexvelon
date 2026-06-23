import "server-only";

// POLISH-6 — private Storage helpers for invite drawn-signature PNGs and the
// generated signed-T&C PDFs. Service-role only (the public /invite pages are
// unauthenticated; the buckets are never public). Admins read via short-lived
// signed URLs from the Submission Detail page.

import { createAdminClient } from "@/lib/supabase/admin";

export const INVITATION_SIG_BUCKET = "invitation-signatures";
export const INVITATION_PDF_BUCKET = "invitation-pdfs";
// POLISH-38 — generated client/site application-form PDFs (private; create the
// "invitation-form-pdfs" bucket in the Supabase Dashboard, service-role only).
export const INVITATION_FORM_PDF_BUCKET = "invitation-form-pdfs";

function admin() {
  return createAdminClient();
}

/** Decode a `data:image/png;base64,...` URL (or a bare base64 string) to a Buffer. */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const idx = dataUrl.indexOf("base64,");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 7) : dataUrl;
  return Buffer.from(b64, "base64");
}

/** Upload a drawn-signature PNG; returns the storage path. Keyed by token + which. */
export async function uploadSignaturePng(
  token: string,
  which: "tc1" | "tc2",
  dataUrl: string
): Promise<string> {
  const path = `${token}/${which}.png`;
  const { error } = await admin()
    .storage.from(INVITATION_SIG_BUCKET)
    .upload(path, dataUrlToBuffer(dataUrl), {
      contentType: "image/png",
      upsert: true,
    });
  if (error) throw new Error(`uploadSignaturePng: ${error.message}`);
  return path;
}

/** Upload a generated signed-T&C PDF; returns the storage path. */
export async function uploadSignedPdf(
  token: string,
  which: "tc1" | "tc2",
  buffer: Buffer
): Promise<string> {
  const path = `${token}/${which}_signed.pdf`;
  const { error } = await admin()
    .storage.from(INVITATION_PDF_BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`uploadSignedPdf: ${error.message}`);
  return path;
}

/** POLISH-38 — upload a generated application-form PDF; returns the storage path. */
export async function uploadFormPdf(
  token: string,
  which: "client" | "site",
  buffer: Buffer
): Promise<string> {
  const path = `${token}/${which}_form.pdf`;
  const { error } = await admin()
    .storage.from(INVITATION_FORM_PDF_BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`uploadFormPdf: ${error.message}`);
  return path;
}

/** POLISH-38 — best-effort delete of every stored object for an invitation
 *  (signatures, signed-T&C PDFs, form PDFs). Used by the admin pending-delete. */
export async function deleteInvitationStorage(token: string): Promise<void> {
  const supabase = admin();
  await Promise.allSettled([
    supabase.storage
      .from(INVITATION_SIG_BUCKET)
      .remove([`${token}/tc1.png`, `${token}/tc2.png`]),
    supabase.storage
      .from(INVITATION_PDF_BUCKET)
      .remove([`${token}/tc1_signed.pdf`, `${token}/tc2_signed.pdf`]),
    supabase.storage
      .from(INVITATION_FORM_PDF_BUCKET)
      .remove([`${token}/client_form.pdf`, `${token}/site_form.pdf`]),
  ]);
}

/** Download any private object to a Buffer. */
export async function downloadObject(
  bucket: string,
  path: string
): Promise<Buffer> {
  const { data, error } = await admin().storage.from(bucket).download(path);
  if (error || !data) throw new Error(`downloadObject: ${error?.message ?? "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

/** A drawn signature as a data URL, for embedding in a PDF. Null on miss. */
export async function signatureDataUrl(path: string): Promise<string | null> {
  try {
    const buf = await downloadObject(INVITATION_SIG_BUCKET, path);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Short-lived signed URL for an admin to view/download a private object. */
export async function invitationSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await admin()
    .storage.from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Copy a signed-T&C PDF from the invitation-pdfs bucket into the shared
 * "attachments" bucket + create the attachments DB row (folder "Signed
 * Onboarding") for an approved client. Service-role throughout.
 */
export async function copySignedPdfToClientAttachments(input: {
  pdfPath: string; // path within `sourceBucket`
  clientId: string;
  filename: string;
  uploadedBy?: string | null;
  // POLISH-38 — source bucket (defaults to the signed-T&C bucket; pass the
  // form-PDF bucket for the application-form PDFs).
  sourceBucket?: string;
}): Promise<void> {
  const supabase = admin();
  const buf = await downloadObject(
    input.sourceBucket ?? INVITATION_PDF_BUCKET,
    input.pdfPath
  );
  const destPath = `client/${input.clientId}/signed-onboarding/${input.filename}`;
  const { error: upErr } = await supabase.storage
    .from("attachments")
    .upload(destPath, buf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`copySignedPdf/upload: ${upErr.message}`);
  const { error: rowErr } = await supabase.from("attachments").insert({
    entity_type: "client",
    entity_id: input.clientId,
    folder: "Signed Onboarding",
    bucket: "attachments",
    path: destPath,
    filename: input.filename,
    content_type: "application/pdf",
    size_bytes: buf.length,
    uploaded_by: input.uploadedBy ?? null,
  });
  if (rowErr) throw new Error(`copySignedPdf/row: ${rowErr.message}`);
}
