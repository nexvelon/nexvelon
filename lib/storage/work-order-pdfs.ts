import "server-only";

// SUB-5 — durable storage for issued work-order PDFs, mirroring
// lib/storage/po-pdfs.ts (service-role admin client → private bucket).
//
// BUCKET: `work-order-pdfs` — PRIVATE. It is created in the Supabase Dashboard
// (a bucket can't be created in migration SQL), exactly like purchase-order-pdfs
// / attachments. See the SUB-5 PR for the exact setup steps.

import { createAdminClient } from "@/lib/supabase/admin";

export const WORK_ORDER_PDF_BUCKET = "work-order-pdfs";

function admin() {
  return createAdminClient();
}

/**
 * Upload an issued work order's PDF and return its storage path + a 7-day signed
 * URL. Path is namespaced by agreement id: `<id>/<sanitized-number>_<ts>.pdf`.
 */
export async function uploadWorkOrderPdf(
  agreementId: string,
  agreementNumber: string,
  pdfBuffer: Buffer
): Promise<{ path: string; signedUrl: string | null }> {
  const supabase = admin();
  const safeNumber = agreementNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const path = `${agreementId}/${safeNumber}_${Date.now()}.pdf`;

  const { error } = await supabase.storage
    .from(WORK_ORDER_PDF_BUCKET)
    .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from(WORK_ORDER_PDF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

  return { path, signedUrl: signed?.signedUrl ?? null };
}

/** A fresh signed URL for an already-stored work-order PDF (on-demand download). */
export async function signWorkOrderPdf(path: string): Promise<string | null> {
  const supabase = admin();
  const { data } = await supabase.storage
    .from(WORK_ORDER_PDF_BUCKET)
    .createSignedUrl(path, 60 * 60); // 1 hour
  return data?.signedUrl ?? null;
}
