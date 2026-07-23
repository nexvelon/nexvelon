"use client";

// SUB-3 — the "Compliance at risk" worklist above the subcontractor roster.
// Makes expiring / missing compliance find the operator instead of them opening
// each subcontractor. Mirrors the FIN-9 HoldbackWorklist pattern (a Card with a
// gated load-on-mount action). Every problem string is derived from the SUB-2
// pure module — this panel invents no state logic of its own.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { getComplianceRiskAction } from "@/app/(app)/subcontractors/actions";
import type {
  ComplianceRisk,
  ComplianceRiskRow,
  ComplianceRiskWorst,
} from "@/lib/api/subcontractor-compliance";
import { DOC_TYPE_LABEL, daysUntilExpiry } from "@/lib/subcontractors/compliance-status";
import type { DbComplianceDocType } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const WORST_BADGE: Record<ComplianceRiskWorst, { label: string; cls: string }> = {
  expired: { label: "Expired", cls: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive" },
  missing: { label: "Missing required", cls: "border border-destructive/50 text-destructive" },
  expiring_soon: { label: "Expiring soon", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  ok: { label: "OK", cls: "bg-muted text-muted-foreground" },
};

function label(t: DbComplianceDocType): string {
  return DOC_TYPE_LABEL[t] ?? t;
}

/** Plain-language problems for one at-risk sub, worst first. */
function problems(row: ComplianceRiskRow, asOf: string): string[] {
  const out: string[] = [];
  for (const d of row.expired_docs) {
    const days = d.expiry_date ? daysUntilExpiry(d, asOf) : null;
    out.push(
      days != null
        ? `${label(d.doc_type)} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
        : `${label(d.doc_type)} expired`
    );
  }
  if (row.missing_required.length > 0) {
    out.push(`Missing: ${row.missing_required.map(label).join(", ")}`);
  }
  for (const d of row.expiring_docs) {
    out.push(
      `${label(d.doc_type)} expires in ${d.days_until} day${d.days_until === 1 ? "" : "s"}`
    );
  }
  return out;
}

function Chip({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", tone)}>
      <span className="tabular-nums">{n}</span> {label}
    </span>
  );
}

export function ComplianceRiskPanel() {
  const router = useRouter();
  const { role } = useRole();
  const canView = hasPermission(role, "subcontractors", "view");

  const [risk, setRisk] = useState<ComplianceRisk | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!canView) return;
    getComplianceRiskAction().then((res) => {
      if (res.ok) setRisk(res.data);
    });
  }, [canView]);

  if (!canView || !risk) return null;

  const { counts, rows, asOf } = risk;
  const hasRisk = rows.length > 0;

  // All-clear: a single muted-green line (collapsed by default).
  if (!hasRisk) {
    return (
      <Card className="flex items-center gap-2 p-3 shadow-sm">
        <CheckCircle2 className="h-4 w-4 text-[var(--brand-status-green)]" />
        <span className="text-brand-charcoal text-sm">All active subcontractors compliant.</span>
        <span className="text-muted-foreground ml-auto text-[11px]">As of {asOf}</span>
      </Card>
    );
  }

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-brand-navy inline-flex items-center gap-1.5 font-serif text-lg"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <AlertTriangle className="text-destructive h-4 w-4" />
          Compliance at risk
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {counts.expired > 0 && (
            <Chip label="Expired" n={counts.expired} tone="bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive" />
          )}
          {counts.missing_required > 0 && (
            <Chip label="Missing required" n={counts.missing_required} tone="border border-destructive/50 text-destructive" />
          )}
          {counts.expiring_soon > 0 && (
            <Chip label="Expiring in 30 days" n={counts.expiring_soon} tone="bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" />
          )}
        </div>
        <span className="text-muted-foreground ml-auto text-[11px]">As of {asOf}</span>
      </div>

      {open && (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {rows.map((row) => {
            const badge = WORST_BADGE[row.worst];
            return (
              <li
                key={row.subcontractor_id}
                className="hover:bg-muted/40 flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded px-1 py-2"
                onClick={() => router.push(`/subcontractors/${row.subcontractor_id}`)}
              >
                <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>
                  {badge.label}
                </span>
                <span className="text-brand-charcoal text-sm font-medium">
                  {row.subcontractor_name}
                </span>
                {row.trade && <span className="text-muted-foreground text-xs">{row.trade}</span>}
                {/* SUB-6 — a lapsed sub currently ON a job is the urgent case. */}
                {row.active_assignments > 0 && (
                  <span className="text-destructive inline-flex shrink-0 items-center rounded-full border border-destructive/40 px-1.5 py-0.5 text-[10px] font-medium">
                    On {row.active_assignments} job{row.active_assignments === 1 ? "" : "s"}
                  </span>
                )}
                <span className="text-muted-foreground w-full text-xs sm:ml-auto sm:w-auto sm:text-right">
                  {problems(row, asOf).join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
