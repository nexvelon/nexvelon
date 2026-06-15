// PROJ-1 — server component for a single project. Loads the real project +
// client/site names + cost centers + linked quotes, then hands off to the
// interactive ProjectDetailView. The elaborate Tasks/Schedule/Materials/etc.
// tabs are NOT wired here — they belong to later projects-domain slices.

import Link from "next/link";
import { getProjectById } from "@/lib/api/projects";
import { ProjectDetailView } from "@/components/modules/projects/ProjectDetailView";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getProjectById(id);

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
      <ProjectDetailView detail={detail} />
    </div>
  );
}
