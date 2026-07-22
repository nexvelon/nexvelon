// PROJ-1 — server component for a single project. Loads the real project +
// client/site names + cost centers + linked quotes, then hands off to the
// interactive ProjectDetailView. The elaborate Tasks/Schedule/Materials/etc.
// tabs are NOT wired here — they belong to later projects-domain slices.

import Link from "next/link";
import { getProjectById } from "@/lib/api/projects";
import { ProjectDetailView } from "@/components/modules/projects/ProjectDetailView";
import { ProjectHeader } from "@/components/modules/projects/ProjectHeader";
import { ProjectJobsTable } from "@/components/modules/projects/ProjectJobsTable";
import { ProjectDeposits } from "@/components/modules/projects/ProjectDeposits";
import { ProjectPnl } from "@/components/modules/projects/ProjectPnl";
import { AddChangeOrderButton } from "@/components/modules/projects/AddChangeOrderButton";
import { FolderTreeAttachments } from "@/components/modules/attachments/FolderTreeAttachments";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

// DbRole (11) → app Role (7); mirrors the projects action helper.
function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, me] = await Promise.all([
    getProjectById(id),
    getCurrentProfile(),
  ]);
  const role = me ? adaptRole(me.role) : null;
  const canEdit = !!role && hasPermission(role, "projects", "edit");
  // Mirror the rollup's financials gate (financials:edit).
  const canViewFinancials = !!role && hasPermission(role, "financials", "edit");
  // FIN-4 — the deposits card is AR-side money: visible at financials:view,
  // mutable only at financials:edit (same split the actions enforce).
  const canSeeDeposits = !!role && hasPermission(role, "financials", "view");

  if (!detail) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">Project not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          It may have been deleted or you may not have access.
        </p>
        <Link
          href="/projects"
          className="text-brand-gold mt-4 inline-block text-sm hover:underline"
        >
          ← Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <Link
        href="/projects"
        className="text-muted-foreground hover:text-brand-charcoal text-xs"
      >
        ← Back to Projects
      </Link>
      {/* PROJ2-2 — the real header (absorbs the PROJ2-1 status strip). The
          detail view's own legacy header is suppressed via hideHeader. */}
      <ProjectHeader
        projectId={id}
        canEdit={canEdit}
        canViewFinancials={canViewFinancials}
      />
      {/* PROJ2-4a — Jobs table (Main Job + Change Orders); rows link to the Job
          detail page (PROJ2-4d). Add Change Order (manual, no source quote) is
          canEdit-only and sits above the table. */}
      {canEdit ? (
        <div className="flex justify-end">
          <AddChangeOrderButton projectId={id} />
        </div>
      ) : null}
      <ProjectJobsTable projectId={id} canViewFinancials={canViewFinancials} />
      {/* FIN-4 — deposits held against this project + their draw-down. */}
      {canSeeDeposits ? (
        <ProjectDeposits projectId={id} canEdit={canViewFinancials} />
      ) : null}
      {/* FIN-8 — per-project P&L. Reachable at financials:view; the component's
          own action redacts cost/GP/margin unless the caller has
          financials:edit. */}
      {canSeeDeposits ? <ProjectPnl projectId={id} /> : null}
      {/* PROJ2-4b — folder tree (Project lens). Needs a site to root the tree. */}
      {detail.project.site_id ? (
        <FolderTreeAttachments
          rootSiteId={detail.project.site_id}
          lens="project"
          rootProjectId={id}
          canEdit={canEdit}
        />
      ) : null}
      <ProjectDetailView detail={detail} hideHeader />
    </div>
  );
}
