"use client";

// PROJ2-8 — move a project to another site. Sites are grouped by client in the
// picker; choosing a site that belongs to a DIFFERENT client is allowed but
// gated behind an inline warning + explicit "I understand" checkbox (which
// drives the action's confirmCrossClient flag). Quotes linked to the project
// are historical documents and are never rewritten.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
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
import {
  moveProjectToSiteAction,
  listSitesForProjectMoveAction,
} from "@/app/(app)/projects/actions";
import type { MoveTargetSite } from "@/lib/api/job-move";

const ERROR_LABELS: Record<string, string> = {
  same_site: "The project is already on that site.",
  not_found: "Site not found.",
  cross_client_confirm_required:
    "Confirm the client change to move this project.",
};

export function MoveProjectButton({
  projectId,
  clientId,
  currentSiteId,
}: {
  projectId: string;
  clientId: string;
  currentSiteId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<MoveTargetSite[] | null>(null);
  const [siteId, setSiteId] = useState("");
  const [ackCrossClient, setAckCrossClient] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = sites?.find((s) => s.id === siteId) ?? null;
  const crossClient = !!selected && selected.client_id !== clientId;
  const canConfirm = !!selected && (!crossClient || ackCrossClient) && !saving;

  // Group by client for labeled <optgroup> rendering.
  const grouped = useMemo(() => {
    const byClient = new Map<string, { label: string; sites: MoveTargetSite[] }>();
    for (const s of sites ?? []) {
      if (s.id === currentSiteId) continue; // current site isn't a move target
      const key = s.client_id;
      const g = byClient.get(key) ?? {
        label: s.client_name ?? "Unknown client",
        sites: [],
      };
      g.sites.push(s);
      byClient.set(key, g);
    }
    // Own client's sites first.
    return [...byClient.entries()].sort(([a], [b]) =>
      a === clientId ? -1 : b === clientId ? 1 : 0
    );
  }, [sites, currentSiteId, clientId]);

  async function openDialog() {
    setSiteId("");
    setAckCrossClient(false);
    setSites(null);
    setOpen(true);
    const res = await listSitesForProjectMoveAction();
    if (!res.ok) {
      toast.error(res.error);
      setOpen(false);
      return;
    }
    setSites(res.data);
  }

  async function confirm() {
    if (!canConfirm || !selected) return;
    setSaving(true);
    const res = await moveProjectToSiteAction({
      projectId,
      targetSiteId: selected.id,
      confirmCrossClient: crossClient ? ackCrossClient : undefined,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(ERROR_LABELS[res.error] ?? res.error);
      return;
    }
    toast.success(`Project moved to ${selected.name}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <MapPin className="mr-1.5 h-3.5 w-3.5" />
        Move site
      </Button>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move project to another site</DialogTitle>
            <DialogDescription>
              The whole project moves — jobs, cost centers, invoices, POs, and
              the folder tree. Quotes keep their original details as historical
              documents.
            </DialogDescription>
          </DialogHeader>

          {sites == null ? (
            <p className="text-muted-foreground text-sm">Loading sites…</p>
          ) : grouped.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              No other sites available.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Target site</Label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Select a site…</option>
                {grouped.map(([cid, g]) => (
                  <optgroup key={cid} label={g.label}>
                    {g.sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {crossClient && selected ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">
                {selected.name} belongs to{" "}
                {selected.client_name ?? "a different client"}. Moving there
                changes which client owns this project.
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ackCrossClient}
                  onChange={(e) => setAckCrossClient(e.target.checked)}
                  className="accent-brand-navy mt-0.5"
                />
                <span className="text-amber-900">
                  I understand this project will now belong to{" "}
                  {selected.client_name ?? "the new client"}.
                </span>
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={!canConfirm}>
              {saving ? "Moving…" : "Move Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
