// PROJ2-4d — server component for a single Job (Main Job or Change Order). The
// single fetch orchestrator: loads the project, the job (validating it belongs
// to the project), the job's rollup entry, cost centers, invoices, POs, and the
// source quote, then hands everything to the client JobDetailView. The
// Attachments tab is rendered here as a server-component slot (RSC composition)
// so FolderTreeAttachments (async) can live inside the client tab tree.

import { notFound } from "next/navigation";
import {
  getProjectById,
  getJobById,
  listCostCentersForJob,
} from "@/lib/api/projects";
import { getProjectCostRollup } from "@/lib/api/project-cost-rollup";
import { listLineItemsForJob } from "@/lib/api/job-line-items";
import { listInvoicesForJob } from "@/lib/api/invoices";
import { getPurchaseOrdersForJob } from "@/lib/api/purchase-orders";
import { getQuoteById } from "@/lib/api/quotes";
import {
  JobDetailView,
  type JobSourceQuote,
} from "@/components/modules/projects/JobDetailView";
import { FolderTreeAttachments } from "@/components/modules/attachments/FolderTreeAttachments";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbJobRollup } from "@/lib/api/project-cost-rollup";
import type { DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

// DbRole (11) → app Role (7); mirrors the project detail page helper.
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

// Financial legs redacted for non-financials callers — mirrors redactRollup in
// rollup-actions.ts so numbers don't reach the client payload either.
function redactJob(entry: DbJobRollup): DbJobRollup {
  return {
    ...entry,
    labour: null,
    sub_labour: null,
    spent: null,
    margin: null,
    invoiced: null,
    billed_pct: null,
    po_committed: null,
    // FIN-5 — billed cost is spend; redact with the other cost legs.
    billed_cost: null,
    variance: null,
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { id, jobId } = await params;

  const [detail, job, me] = await Promise.all([
    getProjectById(id),
    getJobById(jobId),
    getCurrentProfile(),
  ]);

  // 404 on a missing project/job or a job that doesn't belong to this project
  // (guards a crafted /projects/A/jobs/<job-of-B> URL).
  if (!detail || !job || job.project_id !== id) notFound();

  const role = me ? adaptRole(me.role) : null;
  const canEdit = !!role && hasPermission(role, "projects", "edit");
  const canViewFinancials =
    !!role && hasPermission(role, "financials", "edit");

  // The single-job rollup entry (contract/materials/labour/spent/margin/
  // invoiced/billed_pct/po_committed). Redact the financial legs when the caller
  // can't see them, so they never reach the client.
  const { byJob } = await getProjectCostRollup(id);
  const rawEntry = byJob.find((j) => j.job_id === jobId);
  const baseEntry: DbJobRollup =
    rawEntry ?? {
      job_id: job.id,
      job_type: job.job_type,
      co_number: job.co_number,
      title: job.title,
      status: job.status,
      contract: Number(job.contract_value),
      materials: 0,
      labour: 0,
      sub_labour: 0,
      spent: 0,
      margin: Number(job.contract_value),
      invoiced: 0,
      billed_pct: 0,
      po_committed: 0,
      billed_cost: 0,
      variance: null,
    };
  const rollup = canViewFinancials ? baseEntry : redactJob(baseEntry);

  const [costCenters, invoices, purchaseOrders, lineItems] = await Promise.all([
    listCostCentersForJob(jobId),
    listInvoicesForJob(jobId),
    getPurchaseOrdersForJob(jobId),
    listLineItemsForJob(jobId),
  ]);

  // Source quote (defensive — manual C.Os legitimately have none).
  let sourceQuote: JobSourceQuote | null = null;
  if (job.source_quote_id) {
    try {
      const q = await getQuoteById(job.source_quote_id);
      if (q) {
        sourceQuote = {
          id: q.id,
          number: q.number ?? null,
          name: q.name ?? null,
          status: q.status,
          total: q.total ?? null,
        };
      }
    } catch {
      sourceQuote = null; // never block the page on a quote read
    }
  }

  // Attachments tab slot — the Job folder-tree lens. Needs the project's site to
  // root the tree; render nothing if the project has no site.
  const attachmentsSlot = detail.project.site_id ? (
    <FolderTreeAttachments
      lens="job"
      rootSiteId={detail.project.site_id}
      rootProjectId={detail.project.id}
      rootJobId={job.id}
      canEdit={canEdit}
    />
  ) : (
    <p className="text-muted-foreground text-xs italic">
      This project has no site, so there is no folder tree to show.
    </p>
  );

  return (
    <JobDetailView
      job={job}
      project={detail.project}
      clientName={detail.client_name}
      siteName={detail.site_name}
      rollup={rollup}
      canEdit={canEdit}
      canViewFinancials={canViewFinancials}
      costCenters={costCenters}
      invoices={invoices}
      purchaseOrders={purchaseOrders}
      lineItems={lineItems}
      sourceQuote={sourceQuote}
      attachmentsSlot={attachmentsSlot}
    />
  );
}
