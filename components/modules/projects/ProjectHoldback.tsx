"use client";

// FIN-9 — the holdback card on the project page. Shows retained holdback, the
// substantial-completion date, the 60-day countdown to release eligibility, and
// the action ladder: set up a release once the project is substantially
// complete, then release it (generating a tax-exempt invoice) once the clock is
// up. financials:edit gates the actions; the figures are visible at
// financials:view (retained is money owed to us).

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  getProjectHoldbackStatusAction,
  createHoldbackReleaseAction,
  releaseHoldbackAction,
} from "@/app/(app)/financials/actions";
import type { ProjectHoldbackStatus } from "@/lib/api/holdback";
import { formatCurrency } from "@/lib/format";

export function ProjectHoldback({ projectId }: { projectId: string }) {
  const { role } = useRole();
  const canEdit = hasPermission(role, "financials", "edit");

  const [status, setStatus] = useState<ProjectHoldbackStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = () => {
    getProjectHoldbackStatusAction(projectId).then((res) => {
      setLoaded(true);
      if (res.ok) setStatus(res.data);
    });
  };
  useEffect(load, [projectId]);

  const handleSetup = () =>
    startTransition(async () => {
      const res = await createHoldbackReleaseAction(projectId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      load();
      toast.success("Holdback release set up");
    });

  const handleRelease = () =>
    startTransition(async () => {
      if (!status?.release) return;
      const res = await releaseHoldbackAction(status.release.id, projectId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirmRelease(false);
      load();
      toast.success("Holdback released — invoice generated");
    });

  // Nothing retained and no release record → nothing to show.
  if (!loaded || !status || (status.retained <= 0 && !status.release)) return null;

  const release = status.release;
  const scDate = status.substantial_completion_date;
  const eligibleDate = status.eligible_release_date;
  const daysUntil = status.days_until_eligible;

  return (
    <Card className="bg-card space-y-3 p-4 shadow-sm">
      <h3 className="text-brand-navy font-serif text-lg">Statutory holdback</h3>

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Figure label="Retained" value={formatCurrency(status.retained)} strong />
        <Figure
          label="Substantial completion"
          value={
            scDate ??
            "Not yet — project must reach Substantially Complete"
          }
        />
        <Figure
          label="Eligible for release"
          value={
            eligibleDate
              ? status.is_eligible
                ? `${eligibleDate} · eligible now`
                : `${eligibleDate} · ${daysUntil}d to go`
              : "—"
          }
          tone={status.is_eligible ? "text-[var(--brand-status-green)]" : undefined}
        />
      </div>

      {/* Action ladder */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {!release && scDate && status.retained > 0 && (
            <Button type="button" size="sm" onClick={handleSetup} disabled={pending}>
              Set up holdback release
            </Button>
          )}
          {release && release.status !== "released" && status.is_eligible && (
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmRelease(true)}
              disabled={pending}
            >
              Release holdback (creates invoice)
            </Button>
          )}
          {release && release.status === "pending" && !status.is_eligible && (
            <span className="text-muted-foreground text-[11px]">
              Release scheduled — eligible {eligibleDate}.
            </span>
          )}
          {release && release.status === "released" && release.release_invoice_id && (
            <Link
              href={`/invoices/${release.release_invoice_id}`}
              className="text-brand-navy text-xs hover:underline"
            >
              View release invoice →
            </Link>
          )}
        </div>
      )}

      <p className="text-muted-foreground text-[11px]">
        Release timing follows Ontario&rsquo;s Construction Act 60-day lien
        period from substantial completion. The release invoice charges no
        further HST — tax was already billed on the original invoices. Confirm
        certification / publication requirements with your accountant or lawyer
        before releasing. Bookkeeping aid, not legal advice.
      </p>

      <Dialog open={confirmRelease} onOpenChange={setConfirmRelease}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release holdback?</DialogTitle>
            <DialogDescription>
              This generates a tax-exempt invoice to the client for the retained{" "}
              {release ? formatCurrency(Number(release.amount)) : ""} and marks the
              holdback released. The invoice flows through AR like any other.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRelease(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleRelease} disabled={pending}>
              Release &amp; invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Figure({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] px-3 py-2">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p
        className={
          strong
            ? `text-sm font-semibold tabular-nums ${tone ?? "text-brand-navy"}`
            : `text-xs ${tone ?? "text-brand-charcoal"}`
        }
      >
        {value}
      </p>
    </div>
  );
}
