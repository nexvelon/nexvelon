"use client";

// IMG-1 — product image control. Edit mode only (needs a saved product id).
// Upload compresses client-side then persists inventory_products.image_path via
// updateProductAction; replace swaps + deletes the old object; delete clears it.

import { useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  deleteProductImage,
  uploadProductImage,
} from "@/lib/api/product-images";
import { productImagePublicUrl } from "@/lib/product-image-url";
import { updateProductAction } from "@/app/(app)/inventory/actions";

interface Props {
  /** Saved product id, or null in create mode (pending picker). */
  productId: string | null;
  initialImagePath: string | null;
  /** PART-FIX-1: in create mode, report the picked file so the parent can
   *  upload it after the part is created. */
  onPendingChange?: (file: File | null) => void;
}

export function ProductImageField({
  productId,
  initialImagePath,
  onPendingChange,
}: Props) {
  const [imagePath, setImagePath] = useState<string | null>(initialImagePath);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const url = productImagePublicUrl(imagePath);

  // Create mode: no product id yet → hold the picked file as pending and report
  // it up; the parent uploads it after the part is created.
  if (!productId) {
    return (
      <CreateModeImagePicker onPendingChange={onPendingChange} />
    );
  }

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const previous = imagePath;
    try {
      const newPath = await uploadProductImage(productId, file);
      const res = await updateProductAction(productId, { image_path: newPath });
      if (!res.ok) {
        // Roll back the just-uploaded object so we don't orphan it.
        await deleteProductImage(newPath).catch(() => {});
        throw new Error(res.error);
      }
      // Persisted — now remove the old object (best-effort).
      if (previous && previous !== newPath) {
        await deleteProductImage(previous).catch(() => {});
      }
      setImagePath(newPath);
      toast.success("Image saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!imagePath) return;
    setBusy(true);
    try {
      const res = await updateProductAction(productId, { image_path: null });
      if (!res.ok) throw new Error(res.error);
      await deleteProductImage(imagePath).catch(() => {});
      setImagePath(null);
      toast.success("Image removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Image</Label>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          handleFile(f);
        }}
      />

      {url ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Product"
            className="h-24 w-24 rounded-md border border-[var(--border)] object-cover"
          />
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3.5 w-3.5" />
              )}
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => window.open(url, "_blank", "noopener")}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Download
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              disabled={busy}
              onClick={handleDelete}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="text-muted-foreground hover:bg-muted/40 flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-3 py-5 text-[11px] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <ImageIcon className="h-5 w-5" />
          )}
          {busy ? "Uploading…" : "Upload image (PNG or JPEG)"}
        </button>
      )}
    </div>
  );
}

// PART-FIX-1 — create-mode image picker. Holds the chosen file locally (preview
// via an object URL) and reports it to the parent, which uploads it after the
// part is created.
function CreateModeImagePicker({
  onPendingChange,
}: {
  onPendingChange?: (file: File | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pick = (f?: File) => {
    const next = f ?? null;
    if (next && !["image/png", "image/jpeg"].includes(next.type)) {
      toast.error("Image must be PNG or JPEG.");
      return;
    }
    setFile(next);
    onPendingChange?.(next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Image</Label>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          pick(f);
        }}
      />
      {previewUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected"
            className="h-24 w-24 rounded-md border border-[var(--border)] object-cover"
          />
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => pick(undefined)}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-muted-foreground hover:bg-muted/40 flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-3 py-5 text-[11px]"
        >
          <ImageIcon className="h-5 w-5" />
          Choose image (PNG or JPEG) — saved when you create the part
        </button>
      )}
    </div>
  );
}
