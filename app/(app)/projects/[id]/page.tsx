"use client";

import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { ProjectDetailHeader } from "@/components/modules/projects/ProjectDetailHeader";
import {
  ProjectTabsNav,
  isProjectTab,
} from "@/components/modules/projects/ProjectTabsNav";
import { OverviewTab } from "@/components/modules/projects/tabs/OverviewTab";
import { TasksTab } from "@/components/modules/projects/tabs/TasksTab";
import { ScheduleTab } from "@/components/modules/projects/tabs/ScheduleTab";
import { MaterialsTab } from "@/components/modules/projects/tabs/MaterialsTab";
import { CommissioningTab } from "@/components/modules/projects/tabs/CommissioningTab";
import { ZoneListTab } from "@/components/modules/projects/tabs/ZoneListTab";
import { DocumentsTab } from "@/components/modules/projects/tabs/DocumentsTab";
import { FinancialsTab } from "@/components/modules/projects/tabs/FinancialsTab";
import { TimeLaborTab } from "@/components/modules/projects/tabs/TimeLaborTab";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { getProject } from "@/lib/project-data";
import { clients } from "@/lib/mock-data/clients";
import { sites as ALL_SITES } from "@/lib/mock-data/sites";
import { users } from "@/lib/mock-data/users";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const project = getProject(id);
  const search = useSearchParams();
  const tabParam = search.get("tab");
  const tab = isProjectTab(tabParam) ? tabParam : "overview";
  const { role } = useRole();

  if (!project) {
    return (
      <div className="bg-card mx-auto max-w-md rounded-lg border border-[var(--border)] p-8 text-center shadow-sm">
        <h1 className="text-brand-navy font-serif text-2xl">Project not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          The project &quot;{id}&quot; couldn&apos;t be located.
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

  const client = clients.find((c) => c.id === project.clientId);
  const site = project.siteId ? ALL_SITES.find((s) => s.id === project.siteId) : undefined;
  const manager = users.find((u) => u.id === project.managerId);

  const isClosedOrCompleted =
    project.status === "Completed" || project.status === "Closed";
  const readOnly = isClosedOrCompleted;
  const financialsLocked = !hasPermission(role, "financials", "view");
  const highlightCommissioning = project.status === "Commissioning";

  return (
    <div className="space-y-4 pb-12">
      <ProjectDetailHeader
        project={project}
        client={client}
        site={site}
        manager={manager}
      />

      {readOnly && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm shadow-sm">
          <Lock className="mt-0.5 h-4 w-4 text-amber-600" />
          <div className="space-y-0.5">
            <p className="font-medium text-amber-900">
              {project.status === "Closed"
                ? "This project is closed and read-only."
                : "This project is completed and read-only."}
            </p>
            <p className="text-xs leading-relaxed text-amber-900/80">
              All tabs render historical data. Edits are disabled across the
              detail view.
            </p>
          </div>
        </div>
      )}

      <ProjectTabsNav
        projectId={project.id}
        current={tab}
        highlightCommissioning={highlightCommissioning}
        financialsLocked={financialsLocked}
      />

      <div className="pt-4">
        {tab === "overview" && <OverviewTab project={project} />}
        {tab === "tasks" && <TasksTab project={project} readOnly={readOnly} />}
        {tab === "schedule" && (
          <ScheduleTab project={project} readOnly={readOnly} />
        )}
        {tab === "materials" && (
          <MaterialsTab project={project} readOnly={readOnly} />
        )}
        {tab === "commissioning" && (
          <CommissioningTab project={project} readOnly={readOnly} />
        )}
        {tab === "zones" && <ZoneListTab project={project} readOnly={readOnly} />}
        {tab === "documents" && <DocumentsTab project={project} readOnly={readOnly} />}
        {tab === "financials" && <FinancialsTab project={project} />}
        {tab === "time" && <TimeLaborTab project={project} readOnly={readOnly} />}
      </div>
    </div>
  );
}
