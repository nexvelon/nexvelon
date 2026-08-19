import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";
// UIDG-12 — the full interactive Gantt on its own route (it needs the width). The
// compact ProjectScheduleCard stays on the detail page and links here. Gated
// projects:view (read); drag persists through projects:edit actions, so canEdit is
// passed through and view-only users get a read-only Gantt.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById } from "@/lib/api/projects";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { InteractiveGantt } from "@/components/modules/projects/gantt/InteractiveGantt";

export const dynamic = "force-dynamic";

export default async function ProjectSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, me] = await Promise.all([getProjectById(id), getCurrentProfile()]);
  const role = me ? adaptRole(me.role) : null;

  // Reading the schedule requires projects:view — the same gate the action enforces.
  if (!role || !hasPermission(role, "projects", "view")) notFound();
  if (!detail) notFound();

  const canEdit = hasPermission(role, "projects", "edit");
  const name = detail.project.title || "Project";

  return (
    <div className="space-y-3 pb-8">
      <Link href={`/projects/${id}`} className="text-muted-foreground hover:text-brand-charcoal text-xs">
        ← Back to {name}
      </Link>
      <div className="flex items-baseline justify-between">
        <h1 className="text-brand-navy font-serif text-2xl">Schedule</h1>
        {!canEdit && <span className="text-muted-foreground text-xs">Read-only — you don’t have edit access</span>}
      </div>
      <InteractiveGantt projectId={id} canEdit={canEdit} />
    </div>
  );
}
