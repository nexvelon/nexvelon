"use client";

// PICKER-IMG — small aligned product thumbnail for the part pickers. Renders the
// image when present (reusing the public product-images URL on Product.imageUrl /
// ProductOption.imageUrl) or a neutral placeholder box. Visual only.

import { ImageIcon } from "lucide-react";

export function ProductThumb({
  imageUrl,
  size = 30,
}: {
  imageUrl?: string;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        style={style}
        className="shrink-0 rounded border border-[var(--border)] object-cover"
      />
    );
  }
  return (
    <span
      style={style}
      className="bg-muted/40 flex shrink-0 items-center justify-center rounded border border-[var(--border)]"
    >
      <ImageIcon className="text-muted-foreground h-3.5 w-3.5" />
    </span>
  );
}
