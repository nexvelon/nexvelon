// IMG-1 — public URL builder for the "product-images" Storage bucket. Pure (no
// Supabase client, no "use client"/"server-only") so it's importable from both
// the server rollup (lib/api/products.ts) and client components. The bucket is
// public, so the URL is deterministic from NEXT_PUBLIC_SUPABASE_URL.

export const PRODUCT_IMAGES_BUCKET = "product-images";

/** Public URL for a product-images path, or undefined when unset / no env. */
export function productImagePublicUrl(
  path: string | null | undefined
): string | undefined {
  if (!path) return undefined;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return undefined;
  // Encode each path segment (uuid / timestamp / filename are URL-safe, but be
  // defensive against any operator-entered characters).
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${encoded}`;
}
