// PROJ2-4d — QoL redirect. /projects/[id]/main-job resolves the project's Main
// Job and forwards to its detail page, so links that only know the project id
// (not the job id) can point at "the Main Job" without a lookup. 404 if the
// project has no Main Job (shouldn't happen post-PROJ2-4a backfill).

import { notFound, redirect } from "next/navigation";
import { getMainJobForProject } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

export default async function MainJobRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mainJob = await getMainJobForProject(id);
  if (!mainJob) notFound();
  redirect(`/projects/${id}/jobs/${mainJob.id}`);
}
