"use client";

// CUSTODY-1 — Mark Delivered dialog for a serialized unit on a job. An OPTIONAL
// signed-proof file uploads to the unit's PROJECT (Delivery Proofs folder) via
// the attachments system; the new attachment id is passed to markDelivered.
// Proof NEVER blocks delivery — leaving the file empty marks delivered with a
// "missing proof" flag.

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import { createAttachment } from "@/app/(app)/attachments/actions";
import {
  getStockProjectAction,
  markDeliveredAction,
} from "@/app/(app)/inventory/movement-actions";

const PROOF_FOLDER = "Delivery Proofs";

export function MarkDeliveredDialog({
  productId,
  stockId,
  open,
  onOpenChange,
  onDone,
}: {
  productId: string;
  stockId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [project, setProject] = useState<{
    project_id: string;
    project_number: string;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !stockId) return;
    setFile(null);
    setProject(null);
    let active = true;
    getStockProjectAction(stockId)
      .then((p) => {
        if (active) setProject(p);
      })
      .catch(() => {
        /* leave null */
      });
    return () => {
      active = false;
    };
  }, [open, stockId]);

  async function handleConfirm() {
    if (!stockId) return;
    setBusy(true);
    try {
      let proofAttachmentId: string | null = null;

      // OPTIONAL proof: upload to the unit's project, then record the row.
      if (file) {
        if (!project) {
          toast.error("Couldn't resolve the unit's project for the proof.");
          setBusy(false);
          return;
        }
        // SAFARI-FIX — signed-URL flow (no supabase-js on the client path).
        const uploaded = await uploadViaSignedUrl({
          entityType: "project",
          entityId: project.project_id,
          file,
        });
        if (!uploaded.ok) {
          toast.error(uploaded.error);
          setBusy(false);
          return;
        }
        const att = await createAttachment(
          "project",
          project.project_id,
          PROOF_FOLDER,
          {
            path: uploaded.path,
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }
        );
        if (!att.ok) {
          toast.error(att.error);
          setBusy(false);
          return;
        }
        proofAttachmentId = att.data.id;
      }

      const res = await markDeliveredAction(productId, stockId, {
        proofAttachmentId,
      });
      if (!res.ok) {
        toast.error(res.error);
        setBusy(false);
        return;
      }
      toast.success(
        proofAttachmentId ? "Delivered — proof attached" : "Delivered (no proof)"
      );
      setBusy(false);
      startTransition(onDone);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark delivered.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark delivered</DialogTitle>
          <DialogDescription>
            Confirm this unit was delivered to the job
            {project ? ` (${project.project_number})` : ""}. Attaching a signed
            proof is optional — without one the delivery is flagged as missing
            proof.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs">Signed proof (optional)</Label>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
          <p className="text-muted-foreground text-[11px] leading-snug">
            PDF or image. Uploads to the project&rsquo;s Delivery Proofs folder.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={busy}>
            {busy ? "Marking…" : "Mark delivered"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
