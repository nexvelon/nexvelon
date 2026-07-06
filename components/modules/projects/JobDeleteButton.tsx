"use client";

// PROJ2-4d — delete a Change Order Job. High-friction on purpose: the action
// reassigns financial records (cost centers, invoices, POs) to the Main Job
// rather than deleting them, so it must not be a one-click mistake. Two
// confirmations: an "I understand" checkbox AND a typed "DELETE C.O #N" match.
// Only ever rendered for change_order jobs with canEdit (the server also rejects
// main_job deletes with 'cannot_delete_main_job').

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { deleteChangeOrderJobAction } from "@/app/(app)/projects/actions";

const ERROR_LABELS: Record<string, string> = {
  cannot_delete_main_job: "The Main Job can't be deleted.",
  not_found: "Job not found.",
};

export function JobDeleteButton({
  jobId,
  projectId,
  coNumber,
  contractValue,
  costCenterCount,
  invoiceCount,
  purchaseOrderCount,
}: {
  jobId: string;
  projectId: string;
  coNumber: number | null;
  contractValue: number;
  costCenterCount: number;
  invoiceCount: number;
  purchaseOrderCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState(false);

  const confirmPhrase = `DELETE C.O #${coNumber ?? ""}`;
  const canConfirm = ack && typed.trim() === confirmPhrase && !saving;

  function openDialog() {
    setAck(false);
    setTyped("");
    setOpen(true);
  }

  async function confirm() {
    if (!canConfirm) return;
    setSaving(true);
    const res = await deleteChangeOrderJobAction({ jobId });
    setSaving(false);
    if (!res.ok) {
      toast.error(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success(`Change Order #${coNumber} deleted — records moved to Main Job`);
    setOpen(false);
    router.push(`/projects/${projectId}`);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openDialog}
        className="text-red-600 hover:text-red-700"
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete C.O #{coNumber}?</DialogTitle>
            <DialogDescription>
              This job carries {formatCurrency(contractValue)} in contract value
              and is linked to {costCenterCount} cost center
              {costCenterCount === 1 ? "" : "s"}, {invoiceCount} invoice
              {invoiceCount === 1 ? "" : "s"}, and {purchaseOrderCount} purchase
              order{purchaseOrderCount === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>

          <p className="text-brand-charcoal text-sm">
            Cost centers, invoices, and POs will{" "}
            <span className="font-semibold">not</span> be deleted — they will be
            reassigned to the project&apos;s Main Job.
          </p>

          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="accent-brand-navy mt-0.5"
              />
              <span className="text-brand-charcoal">
                I understand this action reassigns financial records to Main Job.
              </span>
            </label>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Type <span className="font-mono font-semibold">{confirmPhrase}</span>{" "}
                to confirm
              </Label>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={confirmPhrase}
                className="font-mono text-sm"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {saving ? "Deleting…" : "Delete Change Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
