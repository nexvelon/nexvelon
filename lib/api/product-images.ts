"use client";

// IMG-1 — client-side helpers for the public "product-images" Storage bucket.
// Uploads run from the browser (authenticated session → the storage.objects
// policies in migration 0034 gate write access). Images are compressed to JPEG
// client-side before upload to keep files small. Path namespace:
//   products/{productId}/{timestamp}.jpg

import { createClient } from "@/lib/supabase/client";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/product-image-url";

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
  const blob = await compressToJpeg(file);

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Not authenticated.");

  const path = `products/${productId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Remove a product-image object. Best-effort — a missing object is not fatal. */
export async function deleteProductImage(path: string): Promise<void> {
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}
