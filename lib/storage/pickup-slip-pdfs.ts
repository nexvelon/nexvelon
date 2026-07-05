import "server-only";

// INV-3 — durable storage for pickup-slip PDFs, mirroring lib/storage/po-pdfs.ts
// (service-role admin client → private bucket). Bucket + RLS are created by
// migration 0078.

import { createAdminClient } from "@/lib/supabase/admin";

export const PICKUP_SLIP_PDF_BUCKET = "pickup-slip-pdfs";

function admin() {
  return createAdminClient();
}

/**
 * Upload a pickup slip's PDF and return its storage path + a 7-day signed URL.
 * Path is namespaced by slip id: `<slipId>/<sanitized-number>_<ts>.pdf`.
 */
export async function uploadPickupSlipPdf(
  slipId: string,
  slipNumber: string,
  pdfBuffer: Buffer
): Promise<{ path: string; signedUrl: string | null }> {
  const supabase = admin();
  const safeNumber = slipNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const path = `${slipId}/${safeNumber}_${Date.now()}.pdf`;

  const { error } = await supabase.storage
    .from(PICKUP_SLIP_PDF_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true, // re-render after signing overwrites the prior copy
    });
  if (error) throw error;

  const { data: signed } = await supabase.storage
    .from(PICKUP_SLIP_PDF_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days

  return { path, signedUrl: signed?.signedUrl ?? null };
}
