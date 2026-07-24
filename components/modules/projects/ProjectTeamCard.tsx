"use client";

// PROJ2-15 — the "Project team" card on the project detail page. Extends SUB-6's
// assignment summary into the FULL crew: in-house techs AND subcontractors,
// DEDUPED to one row per person (a tech on three jobs shows once with all three
// jobs), lead surfaced first with a distinct badge. Read-only — assignment
// happens on each job's Assigned card. Self-hides when nobody is assigned.

import { useEffect, useState } from "react";
import Link from "next/link";
import { User, Building2, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getProjectTeamAction } from "@/app/(app)/projects/assignment-actions";
import type { TeamMember } from "@/lib/api/job-assignments";
import type { DbAssignmentRole } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<DbAssignmentRole, string> = {
  lead: "Lead", crew: "Crew", supervisor: "Supervisor", specialist: "Specialist", other: "Other",
};

export function ProjectTeamCard({ projectId }: { projectId: string }) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getProjectTeamAction(projectId).then((res) => {
      setLoaded(true);
      if (res.ok) setTeam(res.data);
    });
  }, [projectId]);

  if (!loaded || team.length === 0) return null;

  const techs = team.filter((m) => m.kind === "tech").length;
  const subs = team.length - techs;

  return (
    <div>
      <p className="nx-eyebrow-soft mb-2">
        Project team{" "}
        <span className="text-muted-foreground font-normal normal-case">
          · {techs} in-house · {subs} sub{subs === 1 ? "" : "s"}
        </span>
      </p>
      <Card className="bg-card p-0 shadow-sm">
        <ul className="divide-y divide-[var(--border)]">
          {team.map((m) => (
            <li key={`${m.kind}:${m.party_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              {m.kind === "tech" ? (
                <User className="text-brand-navy h-3.5 w-3.5 shrink-0" aria-label="In-house technician" />
              ) : (
                <Building2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-label="Subcontractor" />
              )}
              {m.kind === "subcontractor" ? (
                <Link href={`/subcontractors/${m.party_id}`} className="text-brand-charcoal font-medium hover:underline">
                  {m.name}
                </Link>
              ) : (
                <span className="text-brand-charcoal font-medium">{m.name}</span>
              )}
              {m.is_lead && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--brand-accent)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-accent)]">
                  <Star className="h-2.5 w-2.5" /> Lead
                </span>
              )}
              {/* Non-lead roles (lead already shown as its own badge). */}
              {m.roles.filter((r) => r !== "lead").map((r) => (
                <span key={r} className="text-muted-foreground rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px]">
                  {ROLE_LABEL[r]}
                </span>
              ))}
              <span className={cn("text-muted-foreground ml-auto text-[11px]")}>
                {m.jobs
                  .map((j) => (j.job_id ? j.job_label ?? "Job" : "Project-wide"))
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
