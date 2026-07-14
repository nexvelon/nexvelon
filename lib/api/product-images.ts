"use client";

// IMG-1 — client-side helpers for the public "product-images" Storage bucket.
// Images are compressed to JPEG client-side (canvas) before upload. Path
// namespace: products/{productId}/{timestamp}.jpg (built server-side).
//
// SAFARI-FIX — upload/delete now ride the signed-URL flow (entityType
// 'product_image'): the server action signs/removes with the service role and
// the bytes go up via plain fetch. supabase-js is OFF this module entirely —
// its auth lock (navigator.locks) deadlocks in Safari, which froze the old
// client-side upload at its first await. Signatures are unchanged, so
// ProductImageField / ProductForm callers didn't move.

import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import { deleteUploadedObjectAction } from "@/app/(app)/attachments/actions";

const ACCEPTED_TYPES = ["image/png", "image/jpeg"];
const MAX_EDGE = 1200; // px — longest edge after resize
const JPEG_QUALITY = 0.8;

/**
 * Resize (longest edge ≤ MAX_EDGE) and re-encode an image File to a JPEG Blob
 * via a canvas. Keeps uploads small; PNG transparency is flattened onto white.
 */
async function compressToJpeg(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode the image."));
    el.src = dataUrl;
  });

  const longest = Math.max(img.width, img.height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");
  // White background so a transparent PNG doesn't go black when flattened.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Could not compress the image.");
  return blob;
}

/**
 * Compress + upload a product image. Returns the storage path to persist on
 * inventory_products.image_path. Each upload uses a fresh timestamped path, so
 * replacing never collides; the caller deletes the old object afterward.
 */
export async function uploadProductImage(
  productId: string,
  file: File
): Promise<string> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Image must be a PNG or JPEG.");
  }
  console.info(
    `[upload] image compress start (product=${productId}, name="${file.name}", size=${file.size})`
  );
  const blob = await compressToJpeg(file);
  console.info(`[upload] image compress done (jpegBytes=${blob.size})`);

  // SAFARI-FIX — signed-URL flow. The server builds the products/{id}/{ts}.jpg
  // path and signs it; the JPEG goes up with plain fetch (60s abort ceiling).
  const jpeg = new File([blob], "image.jpg", { type: "image/jpeg" });
  const up = await uploadViaSignedUrl({
    entityType: "product_image",
    entityId: productId,
    file: jpeg,
  });
  if (!up.ok) throw new Error(up.error);
  return up.path;
}

/** Remove a product-image object. Best-effort — a missing object is not fatal.
 *  Server-side removal (path: products/{productId}/{ts}.jpg → id segment). */
export async function deleteProductImage(path: string): Promise<void> {
  if (!path) return;
  const productId = path.split("/")[1] ?? "";
  const res = await deleteUploadedObjectAction({
    entityType: "product_image",
    entityId: productId,
    path,
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.error}`);
}
