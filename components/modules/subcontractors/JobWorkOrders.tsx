"use client";

// SUB-5 — the work orders attached to a Job, shown on the job detail page so
// you can see who's subbed on it. Read-only: each row links out to the
// subcontractor (where the agreement is managed). Gated by the action
// (subcontractors:view); renders nothing for a role without it or when empty.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { listAgreementsAction } from "@/app/(app)/subcontractors/actions";
import type { AgreementListRow } from "@/lib/api/sub-agreements";
import type { DbSubAgreementStatus } from "@/lib/types/database";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<DbSubAgreementStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Issued", cls: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy" },
  in_progress: { label: "In progress", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  completed: { label: "Completed", cls: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]" },
  cancelled: { label: "Cancelled", cls: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive" },
};

export function JobWorkOrders({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<AgreementListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listAgreementsAction({ jobId }).then((res) => {
      setLoaded(true);
      if (res.ok) setRows(res.data);
    });
  }, [jobId]);

  // Keep the job page uncluttered: render nothing until there's something to show.
  if (!loaded || rows.length === 0) return null;

  return (
    <Card className="space-y-2 p-4 shadow-sm">
      <h3 className="text-brand-navy font-serif text-base">Subcontractor work orders</h3>
      {rows.map((r) => {
        const badge = STATUS_BADGE[r.status];
        return (
          <Link
            key={r.id}
            href={`/subcontractors/${r.subcontractor_id}`}
            className="hover:bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs"
          >
            <span className="font-mono">{r.agreement_number}</span>
            <span className="text-brand-charcoal font-medium">{r.subcontractor_name ?? "—"}</span>
            <span className="text-muted-foreground">{r.title}</span>
            <span className="ml-auto tabular-nums">{formatCurrency(Number(r.agreed_value))}</span>
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>
              {badge.label}
            </span>
          </Link>
        );
      })}
    </Card>
  );
}
