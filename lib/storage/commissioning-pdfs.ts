import "server-only";

// PROJ2-13 — durable storage for signed commissioning certificates, mirroring
// lib/storage/work-order-pdfs.ts (service-role admin client → private bucket).
//
// BUCKET: `commissioning-pdfs` — PRIVATE. Created in the Supabase Dashboard (a
// bucket can't be created in migration SQL), exactly like work-order-pdfs /
// purchase-order-pdfs. See the PROJ2-12/13 PR for the exact setup steps.

import { createAdminClient } from "@/lib/supabase/admin";

export const COMMISSIONING_PDF_BUCKET = "commissioning-pdfs";

function admin() {
  return createAdminClient();
}

/** Upload a signed certificate and return its path + a 7-day signed URL. */
export async function uploadCommissioningPdf(
  runId: string,
  pdfBuffer: Buffer
): Promise<{ path: string; signedUrl: string | null }> {
  const supabase = admin();
  const path = `${runId}/certificate_${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from(COMMISSIONING_PDF_BUCKET)
    .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from(COMMISSIONING_PDF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
  return { path, signedUrl: signed?.signedUrl ?? null };
}

/** A fresh signed URL for an already-stored certificate (on-demand download). */
export async function signCommissioningPdf(path: string): Promise<string | null> {
  const supabase = admin();
  const { data } = await supabase.storage
    .from(COMMISSIONING_PDF_BUCKET)
    .createSignedUrl(path, 60 * 60); // 1 hour
  return data?.signedUrl ?? null;
}
