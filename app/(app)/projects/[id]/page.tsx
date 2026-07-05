// PROJ-1 — server component for a single project. Loads the real project +
// client/site names + cost centers + linked quotes, then hands off to the
// interactive ProjectDetailView. The elaborate Tasks/Schedule/Materials/etc.
// tabs are NOT wired here — they belong to later projects-domain slices.

import Link from "next/link";
import { getProjectById } from "@/lib/api/projects";
import { ProjectDetailView } from "@/components/modules/projects/ProjectDetailView";
import { ProjectStatusControl } from "@/components/modules/projects/ProjectStatusControl";
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
  const canEditStatus =
    !!me && hasPermission(adaptRole(me.role), "projects", "edit");

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
      {/* PROJ2-1 — slim lifecycle strip above the detail view. PROJ2-2 folds
          this into the real project header (which replaces the mock one). */}
      <div className="bg-card flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <span className="text-brand-navy font-mono text-xs font-semibold">
            {detail.project.project_number}
          </span>
          {detail.project.title ? (
            <span className="text-muted-foreground ml-2 truncate text-xs">
              {detail.project.title}
            </span>
          ) : null}
        </div>
        <ProjectStatusControl
          projectId={detail.project.id}
          currentStatus={detail.project.status}
          canEdit={canEditStatus}
        />
      </div>
      <ProjectDetailView detail={detail} />
    </div>
  );
}
