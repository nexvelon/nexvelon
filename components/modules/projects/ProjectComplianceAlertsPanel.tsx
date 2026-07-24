"use client";

// PROJ2-19 (7d) + PROJ2-14 (7e) — the cross-project risk panel on the Projects
// list page. Mirrors SUB-3's ComplianceRiskPanel shape. Two signals:
//   • BONDS expiring/expired while status='active' — an ALARM (red expired,
//     amber expiring): a lapsed performance bond on a live project is exposure.
//   • WARRANTIES expiring/expired — INFORMATIONAL (blue/neutral): a lapsing
//     warranty on a completed project is a renewal / monitoring sales lead, not
//     a problem.
// Self-hides when there's nothing to show.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getComplianceAlertsAction } from "@/app/(app)/projects/warranty-bond-actions";
import type { BondAlert } from "@/lib/api/project-bonds";
import type { WarrantyAlert } from "@/lib/api/warranties";
import { cn } from "@/lib/utils";

const BOND_TYPE_LABEL: Record<string, string> = {
  performance: "Performance bond",
  labour_material: "Labour & material bond",
  bid: "Bid bond",
  maintenance: "Maintenance bond",
  liability_insurance: "Liability insurance",
  builders_risk: "Builders' risk",
  other: "Bond",
};
const SCOPE_LABEL: Record<string, string> = {
  workmanship: "Workmanship warranty",
  equipment: "Equipment warranty",
  manufacturer: "Manufacturer warranty",
  extended: "Extended warranty",
  other: "Warranty",
};

export function ProjectComplianceAlertsPanel() {
  const router = useRouter();
  const [bonds, setBonds] = useState<BondAlert[]>([]);
  const [warranties, setWarranties] = useState<WarrantyAlert[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getComplianceAlertsAction().then((res) => {
      setLoaded(true);
      if (res.ok) {
        setBonds(res.data.bonds);
        setWarranties(res.data.warranties);
      }
    });
  }, []);

  if (!loaded || (bonds.length === 0 && warranties.length === 0)) return null;

  const expiredBonds = bonds.filter((b) => b.state === "expired").length;

  return (
    <Card className="space-y-3 p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-brand-navy inline-flex items-center gap-1.5 font-serif text-base">
          <ShieldCheck className="h-4 w-4" /> Bonds &amp; warranties
        </h3>
        {expiredBonds > 0 && (
          <span className="text-destructive border-destructive/40 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium">
            <AlertTriangle className="h-3 w-3" /> {expiredBonds} bond{expiredBonds === 1 ? "" : "s"} expired while active
          </span>
        )}
      </div>

      {bonds.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {bonds.map((b) => (
            <li
              key={b.bond_id}
              className="hover:bg-muted/40 flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded px-1 py-2 text-xs"
              onClick={() => router.push(`/projects/${b.project_id}`)}
            >
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  b.state === "expired"
                    ? "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive"
                    : "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]"
                )}
              >
                {b.state === "expired" ? "Expired" : "Expiring"}
              </span>
              <span className="text-brand-charcoal font-medium">{BOND_TYPE_LABEL[b.bond_type] ?? "Bond"}</span>
              <span className="text-muted-foreground">{b.project_number ?? "—"}{b.project_title ? ` · ${b.project_title}` : ""}</span>
              <span className="text-muted-foreground ml-auto tabular-nums">expires {b.expiry_date}</span>
            </li>
          ))}
        </ul>
      )}

      {warranties.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--border)] pt-2">
          <p className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            <Sparkles className="h-3 w-3" /> Warranties nearing expiry — renewal / monitoring opportunities
          </p>
          <ul className="divide-y divide-[var(--border)]">
            {warranties.map((w) => (
              <li
                key={w.warranty_id}
                className="hover:bg-muted/40 flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded px-1 py-1.5 text-xs"
                onClick={() => router.push(`/projects/${w.project_id}`)}
              >
                <span className="inline-flex shrink-0 rounded-full bg-[color-mix(in_oklab,var(--brand-navy)_12%,transparent)] px-2 py-0.5 text-[10px] font-medium text-brand-navy">
                  {w.state === "expired" ? "Expired" : "Expiring"}
                </span>
                <span className="text-brand-charcoal">{SCOPE_LABEL[w.scope] ?? "Warranty"}</span>
                <span className="text-muted-foreground">{w.project_number ?? "—"}</span>
                <span className="text-muted-foreground ml-auto tabular-nums">ends {w.end_date}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
