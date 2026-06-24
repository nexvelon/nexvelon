"use client";

// POLISH-61 — admin bulk client importer. Download a wide xlsx template (one row
// per client), fill it, upload → parsed in-browser (exceljs, like the single-
// client onboarding template), then bulkImportClientsAction creates each row's
// client + contacts best-effort and returns a summary. Render only for admins.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
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
import { bulkImportClientsAction, type BulkImportResult } from "../actions";
import type { ParsedBulkClient } from "@/lib/client-bulk-template";

export function BulkImportClientsDialog() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedBulkClient[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [importing, startImport] = useTransition();

  const reset = () => {
    setParsed(null);
    setFileName("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const download = async () => {
    setBusy(true);
    try {
      const { generateClientBulkTemplate } = await import("@/lib/client-bulk-template");
      const buf = await generateClientBulkTemplate();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nexvelon-client-bulk-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate template.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const { parseClientBulkTemplate } = await import("@/lib/client-bulk-template");
      const rows = await parseClientBulkTemplate(file);
      setParsed(rows);
      setFileName(file.name);
    } catch (err) {
      setParsed(null);
      toast.error(err instanceof Error ? err.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  };

  const runImport = () => {
    if (!parsed || parsed.length === 0) return;
    startImport(async () => {
      const r = await bulkImportClientsAction(parsed);
      setResult(r);
      if (r.ok && r.createdCount > 0) {
        toast.success(`Imported ${r.createdCount} client${r.createdCount === 1 ? "" : "s"}.`);
        router.refresh();
      } else if (!r.ok) {
        toast.error(r.errors[0]?.error ?? "Import failed.");
      }
    });
  };

  const validCount = parsed?.filter((r) => r.valid).length ?? 0;
  const invalidCount = (parsed?.length ?? 0) - validCount;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
        style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
      >
        <Upload className="h-3.5 w-3.5" />
        Bulk import
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !importing && !busy) {
            setOpen(false);
            reset();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Bulk import clients</DialogTitle>
            <DialogDescription>
              Download the template, fill one row per client, then upload it back.
              Blank Billing inherits the Company Address; set “Mailing Same As” to
              Billing or Company. Each row creates a client plus its Primary / AP
              contacts.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            // ── Step 4: results ──
            <div className="space-y-3">
              <p className="text-sm">
                <span className="font-semibold text-emerald-700">
                  Imported {result.createdCount}
                </span>{" "}
                · <span className="text-muted-foreground">Skipped {result.skippedCount}</span>
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2" style={{ borderColor: "var(--brand-border)" }}>
                  {result.errors.map((er, i) => (
                    <p key={i} className="text-[11px] text-red-600">
                      Row {er.rowNumber}
                      {er.legal_name ? ` (${er.legal_name})` : ""}: {er.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // ── Steps 1–3: download / upload / import ──
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-md border p-3" style={{ borderColor: "var(--brand-border)" }}>
                <div className="text-xs">
                  <p className="font-medium text-brand-text">1 · Download template</p>
                  <p className="text-muted-foreground">An Excel file with one row per client.</p>
                </div>
                <Button variant="outline" size="sm" onClick={download} disabled={busy}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              </div>

              <div className="rounded-md border p-3" style={{ borderColor: "var(--brand-border)" }}>
                <p className="text-xs font-medium text-brand-text">2 · Upload filled template</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  onChange={onFile}
                  disabled={busy}
                  className="mt-2 block w-full text-xs file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-xs"
                />
                {fileName && parsed && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <FileSpreadsheet className="h-3 w-3" />
                    {fileName} — {validCount} ready
                    {invalidCount > 0 ? `, ${invalidCount} with errors` : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  disabled={importing || busy}
                >
                  Cancel
                </Button>
                <Button onClick={runImport} disabled={importing || busy || validCount === 0}>
                  {importing ? "Importing…" : `Import ${validCount || ""}`.trim()}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
