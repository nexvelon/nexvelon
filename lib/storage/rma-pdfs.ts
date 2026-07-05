import "server-only";

// INV-4 — durable storage for RMA PDFs, mirroring lib/storage/po-pdfs.ts
// (service-role admin client → private bucket). Bucket + RLS are created by
// migration 0079.

import { createAdminClient } from "@/lib/supabase/admin";

export const RMA_PDF_BUCKET = "rma-pdfs";

function admin() {
  return createAdminClient();
}

/**
 * Upload an RMA's PDF and return its storage path + a 7-day signed URL.
 * Path is namespaced by RMA id: `<rmaId>/<sanitized-number>_<ts>.pdf`.
 */
export async function uploadRmaPdf(
  rmaId: string,
  rmaNumber: string,
  pdfBuffer: Buffer
): Promise<{ path: string; signedUrl: string | null }> {
  const supabase = admin();
  const safeNumber = rmaNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const path = `${rmaId}/${safeNumber}_${Date.now()}.pdf`;

  const { error } = await supabase.storage
    .from(RMA_PDF_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true, // re-render (e.g. after shipping) overwrites
    });
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from(RMA_PDF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

  return { path, signedUrl: signed?.signedUrl ?? null };
}
