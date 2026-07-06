// PROJ2-2 — the real, DB-backed project header. Replaces the dead mock
// ProjectDetailHeader and absorbs the PROJ2-1 status strip (ProjectStatusControl
// renders inline). Server component: fetches getProjectHeaderData and renders.
// Financials-sensitive tiles (Contract Value) are gated by canViewFinancials;
// the caller computes it (financials:edit — same gate the rollup uses).

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getProjectHeaderData, listJobsForProject } from "@/lib/api/projects";
import { ProjectStatusControl } from "@/components/modules/projects/ProjectStatusControl";
import { ProjectEditForm } from "@/components/modules/projects/ProjectEditForm";

const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated",
  guardian: "Guardian",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  // date columns are YYYY-MM-DD; render without TZ drift.
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function ProjectHeader({
  projectId,
  canEdit,
  canViewFinancials,
}: {
  projectId: string;
  canEdit: boolean;
  canViewFinancials: boolean;
}) {
  const [data, jobs] = await Promise.all([
    getProjectHeaderData(projectId),
    listJobsForProject(projectId),
  ]);
  if (!data) return null;
  const { project, client_name, site_name, rollup, change_order_count } = data;
  // PROJ2-4a — job counts from the real Job rows.
  const mainCount = jobs.filter((j) => j.job_type === "main_job").length;
  const coCount = jobs.filter((j) => j.job_type === "change_order").length;

  return (
    <Card
      className="p-5 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left — identity */}
        <div className="space-y-2 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-brand-navy font-mono text-xs font-semibold tracking-wider">
              {project.project_number}
            </span>
            <span className="bg-muted rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
              {OPCO_LABEL[project.opco] ?? project.opco}
            </span>
          </div>

          <h1 className="text-brand-navy font-serif text-2xl font-semibold leading-tight">
            {project.title || "Untitled project"}
          </h1>

          <ProjectStatusControl
            projectId={project.id}
            currentStatus={project.status}
            canEdit={canEdit}
          />

          <p className="text-muted-foreground text-sm">
            <Link
              href={`/clients/${project.client_id}`}
              className="hover:text-brand-charcoal hover:underline"
            >
              {client_name}
            </Link>
            {site_name && project.site_id ? (
              <>
                {" · "}
                <Link
                  href={`/sites/${project.site_id}`}
                  className="hover:text-brand-charcoal hover:underline"
                >
                  {site_name}
                </Link>
              </>
            ) : site_name ? (
              <> · {site_name}</>
            ) : null}
          </p>

          {project.description ? (
            <p className="text-muted-foreground max-w-prose whitespace-pre-wrap text-xs leading-relaxed">
              {project.description}
            </p>
          ) : null}
        </div>

        {/* Right — stats + edit */}
        <div className="lg:col-span-5">
          <div className="flex items-start justify-end">
            {canEdit ? <ProjectEditForm project={project} /> : null}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <Stat
              label="Contract value"
              value={canViewFinancials ? formatCurrency(rollup.contract) : "—"}
            />
            <Stat label="Billed" value={formatPercent(rollup.billedPct)} />
            <Stat label="Change orders" value={String(change_order_count)} />
          </div>
          <dl className="text-brand-charcoal/80 mt-3 grid grid-cols-3 gap-x-4 text-[11px]">
            <DateMeta label="Start" value={fmtDate(project.start_date)} />
            <DateMeta label="Target" value={fmtDate(project.target_completion)} />
            <DateMeta label="Completed" value={fmtDate(project.actual_completion)} />
          </dl>
          {/* PROJ2-4a — Jobs summary. */}
          <p className="text-muted-foreground mt-3 text-[11px]">
            <span className="uppercase tracking-wider">Jobs</span>{" "}
            <span className="text-brand-charcoal font-medium">
              {mainCount} Main Job · {coCount} Change Order
              {coCount === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] px-3 py-2">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </p>
      <p className="text-brand-navy font-serif text-lg tabular-nums leading-tight">
        {value}
      </p>
    </div>
  );
}

function DateMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-brand-charcoal font-medium tabular-nums">{value}</dd>
    </div>
  );
}
