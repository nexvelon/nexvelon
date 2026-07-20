"use client";

// PROJ2-8 — the C.O "Move" menu: move to another same-client same-opco project
// (renumbered there), or promote to a brand-new standalone project on the same
// site. Only ever rendered for change_order jobs with canEdit; the server
// actions re-validate everything (main_job / same-project / cross-client /
// cross-opco all rejected server-side).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, FolderOutput, Rocket } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  moveChangeOrderAction,
  promoteChangeOrderAction,
  listJobMoveTargetsAction,
} from "@/app/(app)/projects/actions";
import type { JobMoveTarget } from "@/lib/api/job-move";

const ERROR_LABELS: Record<string, string> = {
  cannot_move_main_job: "The Main Job can't be moved.",
  same_project: "The job is already in that project.",
  cross_client: "The target project belongs to a different client.",
  cross_opco: "The target project belongs to a different operating entity.",
  not_found: "Job or project not found.",
};

export function JobMoveMenu({
  jobId,
  coNumber,
  siteName,
}: {
  jobId: string;
  coNumber: number | null;
  siteName: string | null;
}) {
  const router = useRouter();
  const [moveOpen, setMoveOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [targets, setTargets] = useState<JobMoveTarget[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = targets?.find((t) => t.id === targetId) ?? null;

  async function openMoveDialog() {
    setTargetId("");
    setTargets(null);
    setMoveOpen(true);
    const res = await listJobMoveTargetsAction(jobId);
    if (!res.ok) {
      toast.error(res.error);
      setMoveOpen(false);
      return;
    }
    setTargets(res.data);
  }

  async function confirmMove() {
    if (!selected || saving) return;
    setSaving(true);
    const res = await moveChangeOrderAction({ jobId, targetProjectId: selected.id });
    setSaving(false);
    if (!res.ok) {
      toast.error(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success(
      `Moved — now C.O #${res.data.newCoNumber} on ${selected.project_number}`
    );
    setMoveOpen(false);
    router.push(`/projects/${res.data.targetProjectId}/jobs/${jobId}`);
  }

  async function confirmPromote() {
    if (saving) return;
    setSaving(true);
    const res = await promoteChangeOrderAction({ jobId });
    setSaving(false);
    if (!res.ok) {
      toast.error(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success("Promoted to its own project");
    setPromoteOpen(false);
    router.push(`/projects/${res.data.newProjectId}`);
  }

  const targetLabel = (t: JobMoveTarget) =>
    `${t.project_number}${t.title ? ` — ${t.title}` : ""}${
      t.site_name ? ` (${t.site_name})` : ""
    }`;

  return (
    <>
      <DropdownMenu>
        {/* Styled to match Button variant="outline" size="sm" — the base-ui
            Trigger has no asChild, so the classes live on the trigger itself. */}
        <DropdownMenuTrigger className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium shadow-xs transition-colors">
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Move
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => void openMoveDialog()}>
            <FolderOutput className="mr-2 h-3.5 w-3.5" />
            Move to another project…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPromoteOpen(true)}>
            <Rocket className="mr-2 h-3.5 w-3.5" />
            Promote to its own project…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Move to another project */}
      <Dialog open={moveOpen} onOpenChange={(o) => !saving && setMoveOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move C.O #{coNumber} to another project</DialogTitle>
            <DialogDescription>
              Same-client, same-entity projects only. Everything attached moves
              with it and financial rollups recompute automatically.
            </DialogDescription>
          </DialogHeader>

          {targets == null ? (
            <p className="text-muted-foreground text-sm">Loading projects…</p>
          ) : targets.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              No other projects for this client and entity.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Target project</Label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Select a project…</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {targetLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected ? (
            <p className="text-brand-charcoal text-sm">
              Move C.O #{coNumber} and all its cost centers, invoices, POs, and
              folders to{" "}
              <span className="font-semibold">{selected.project_number}</span>?
              It will become C.O #{selected.next_co_number} there.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoveOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmMove}
              disabled={!selected || saving}
            >
              {saving ? "Moving…" : "Move Change Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote to its own project */}
      <Dialog
        open={promoteOpen}
        onOpenChange={(o) => !saving && setPromoteOpen(o)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Promote C.O #{coNumber} to its own project?</DialogTitle>
            <DialogDescription>
              This change order becomes a new standalone Project
              {siteName ? ` on ${siteName}` : ""} with this job as its Main Job.
              All financials and folders move with it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPromoteOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={confirmPromote} disabled={saving}>
              {saving ? "Promoting…" : "Promote to Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
