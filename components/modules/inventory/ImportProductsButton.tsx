"use client";

// INV-2c — bulk product import UI. Mirrors the clients import UX:
//   • "Download template" → generateInventoryTemplate → browser download
//   • "Import" → hidden file picker → parseInventoryTemplate → preview dialog
//     (rows ready + warnings + dup-skip note) → confirm → importProductsAction
//     → result toast.
// exceljs + the template module are dynamic-imported so they stay out of the
// main bundle (same posture as ClientForm).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { importProductsAction } from "@/app/(app)/inventory/actions";
import { listInventoryVocabAction } from "@/app/(app)/settings/inventory-vocab-actions";
import { VENDOR_OPTIONS } from "@/components/modules/inventory/ProductForm";
import type { DbInventoryProductInsert } from "@/lib/types/database";

interface Preview {
  rows: DbInventoryProductInsert[];
  warnings: string[];
}

export function ImportProductsButton() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, startImport] = useTransition();

  async function handleDownload() {
    try {
      const { generateInventoryTemplate, INVENTORY_TEMPLATE_FILENAME } =
        await import("@/lib/inventory-import-template");
      // C-6: source the template dropdowns from the live managed vocab.
      const [cat, man, uom] = await Promise.all([
        listInventoryVocabAction("category"),
        listInventoryVocabAction("manufacturer"),
        listInventoryVocabAction("unit_of_measure"),
      ]);
      const blob = await generateInventoryTemplate({
        categories: cat.ok ? cat.data.map((r) => r.name) : [],
        manufacturers: man.ok ? man.data.map((r) => r.name) : [],
        units: uom.ok ? uom.data.map((r) => r.name) : [],
        vendors: VENDOR_OPTIONS,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = INVENTORY_TEMPLATE_FILENAME;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (e) {
      console.error("[INV-2c] template generation failed:", e);
      toast.error("Failed to generate template");
    }
  }

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const { parseInventoryTemplate } = await import(
        "@/lib/inventory-import-template"
      );
      const parsed = await parseInventoryTemplate(file);
      if (parsed.rows.length === 0) {
        toast.error(
          parsed.warnings.length > 0
            ? `No importable rows. ${parsed.warnings[0]}`
            : "No products found in that file."
        );
        return;
      }
      setPreview(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read file");
    } finally {
      setParsing(false);
    }
  }

  function confirmImport() {
    if (!preview) return;
    startImport(async () => {
      const result = await importProductsAction(preview.rows);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // C-4: `skipped` is the list of duplicate Part #s that already existed
      // (not a count). Report how many were created + which were skipped.
      const { created, skipped } = result.data;
      let msg = `${created} part${created === 1 ? "" : "s"} imported.`;
      if (skipped.length > 0) {
        const shown = skipped.slice(0, 15).join(", ");
        const more =
          skipped.length > 15 ? ` …and ${skipped.length - 15} more` : "";
        msg += ` ${skipped.length} already existed and ${
          skipped.length === 1 ? "was" : "were"
        } skipped: ${shown}${more}.`;
      }
      toast.success(msg);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
        style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
      >
        <Download className="h-3.5 w-3.5" />
        Download template
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={parsing}
        className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40 disabled:opacity-50"
        style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
      >
        {parsing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // reset so re-picking the same file fires onChange again
          e.target.value = "";
        }}
      />

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import products</DialogTitle>
            <DialogDescription>
              Review before importing. Products with a Part # that already exists
              are skipped automatically.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-3 text-sm">
              <p className="text-brand-charcoal">
                <span className="font-semibold tabular-nums">
                  {preview.rows.length}
                </span>{" "}
                product{preview.rows.length === 1 ? "" : "s"} ready to import.
              </p>

              {preview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                  <p className="mb-1 text-xs font-semibold text-amber-800">
                    {preview.warnings.length} warning
                    {preview.warnings.length === 1 ? "" : "s"} (rows skipped or
                    adjusted):
                  </p>
                  <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-amber-900">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button onClick={confirmImport} disabled={importing}>
              {importing
                ? "Importing…"
                : `Import ${preview?.rows.length ?? 0}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
