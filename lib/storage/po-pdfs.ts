import "server-only";

// PO-4 — durable storage for issued purchase-order PDFs, mirroring
// lib/api/invitation-storage.ts (service-role admin client → private bucket).
// Bucket + RLS are created by migration 0077.

import { createAdminClient } from "@/lib/supabase/admin";

export const PO_PDF_BUCKET = "purchase-order-pdfs";

function admin() {
  return createAdminClient();
}

/**
 * Upload an issued PO's PDF and return its storage path + a 7-day signed URL.
 * Path is namespaced by PO id: `<poId>/<sanitized-number>_<ts>.pdf`.
 */
export async function uploadPoPdf(
  poId: string,
  poNumber: string,
  pdfBuffer: Buffer
): Promise<{ path: string; signedUrl: string | null }> {
  const supabase = admin();
  const safeNumber = poNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const path = `${poId}/${safeNumber}_${Date.now()}.pdf`;

  const { error } = await supabase.storage
    .from(PO_PDF_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from(PO_PDF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

  return { path, signedUrl: signed?.signedUrl ?? null };
}
