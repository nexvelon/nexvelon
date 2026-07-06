"use client";

// PROJ2-4d — status badge + change control for a Job. A near-exact mirror of
// ProjectStatusControl (PROJ2-1), but routes through updateJobStatusAction and
// carries a jobId. Jobs and Projects share the SAME lifecycle state machine
// (JobStatus === ProjectStatus per PROJ2-4a), so the shared status-transitions
// helpers apply unchanged. Convenience UI only — the server re-checks the
// transition, so this isn't the security boundary.

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectLifecycleBadge } from "@/components/modules/projects/ProjectLifecycleBadge";
import {
  PROJECT_STATUS_LABELS,
  listAllowedNextStatuses,
} from "@/lib/projects/status-transitions";
import { updateJobStatusAction } from "@/app/(app)/projects/actions";
import type { JobStatus } from "@/lib/types/database";

const ERROR_LABELS: Record<string, string> = {
  not_found: "Job not found.",
  invalid_transition: "That status change isn't allowed.",
};

export function JobStatusControl({
  jobId,
  currentStatus,
  canEdit,
}: {
  jobId: string;
  currentStatus: JobStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<JobStatus | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const nextStatuses = listAllowedNextStatuses(currentStatus);

  if (!canEdit) {
    return <ProjectLifecycleBadge status={currentStatus} size="md" />;
  }

  function openDialog() {
    setTarget("");
    setNote("");
    setOpen(true);
  }

  async function confirm() {
    if (!target) {
      toast.error("Pick a status to change to.");
      return;
    }
    setSaving(true);
    const res = await updateJobStatusAction({
      jobId,
      newStatus: target,
      note: note.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success(`Status changed to ${PROJECT_STATUS_LABELS[target]}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 rounded-md transition-opacity hover:opacity-80"
        title="Change job status"
      >
        <ProjectLifecycleBadge status={currentStatus} size="md" />
        <span className="text-muted-foreground text-[11px] underline-offset-2 hover:underline">
          Change
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change job status</DialogTitle>
            <DialogDescription>
              Currently {PROJECT_STATUS_LABELS[currentStatus]}. Pick a new status.
            </DialogDescription>
          </DialogHeader>

          {nextStatuses.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No status changes are available from{" "}
              {PROJECT_STATUS_LABELS[currentStatus]}.
            </p>
          ) : (
            <div className="space-y-3">
              <fieldset className="space-y-1.5">
                {nextStatuses.map((s) => (
                  <label
                    key={s}
                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name="job-status"
                      value={s}
                      checked={target === s}
                      onChange={() => setTarget(s)}
                      className="accent-brand-navy"
                    />
                    <span className="text-brand-charcoal">
                      {PROJECT_STATUS_LABELS[s]}
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason (optional)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why the change…"
                  className="text-sm"
                />
              </div>
            </div>
          )}

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
              disabled={saving || !target || nextStatuses.length === 0}
            >
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
