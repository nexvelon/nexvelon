"use client";

// SAFARI-FIX follow-up (#310) — the client half of the signed-URL DOWNLOAD
// flow. Zero supabase-js involvement: the server action signs the URL (service
// role, <resource>:view gated) and the browser follows it via a synthetic
// anchor click — the most Safari-reliable trigger (window.open gets
// popup-blocked for async-created windows). The signed URL carries a
// Content-Disposition download param server-side, so the file saves even
// though cross-origin <a download> attributes are ignored.

import { getSignedDownloadUrlAction } from "@/app/(app)/attachments/actions";

export async function downloadAttachment(input: {
  attachmentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  console.info(
    `[download] requesting signed URL (attachment=${input.attachmentId})`
  );
  const res = await getSignedDownloadUrlAction(input);
  if (!res.ok) {
    console.error("[download] signed URL request FAILED", res.error);
    return res;
  }

  console.info(
    `[download] signed URL received, opening (filename="${res.filename}")`
  );
  const a = document.createElement("a");
  a.href = res.signedUrl;
  a.download = res.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { ok: true };
}
