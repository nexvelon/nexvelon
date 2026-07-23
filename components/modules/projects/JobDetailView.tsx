"use client";

// PROJ2-4d — the Job detail surface. A Job (Main Job or Change Order) rendered
// as a first-class object: its own header (identity + status via JobStatusControl
// + financial stat tiles), its own tabs, its own folder-tree lens. Client
// component because the tab strip is local state; every data fetch happens in the
// route's server component and arrives as props (single fetch orchestrator). The
// Attachments tab is passed as a prebuilt server-component slot (RSC composition)
// so the async FolderTreeAttachments can render inside this client tree.
//
// Only Overview / Financials / Attachments are real this chunk. Line Items /
// Tasks / Deficiencies / Commissioning / Team are visible-but-disabled stubs
// that light up in PROJ2-5+.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { JobStatusControl } from "@/components/modules/projects/JobStatusControl";
import { JobEditForm } from "@/components/modules/projects/JobEditForm";
import { JobDeleteButton } from "@/components/modules/projects/JobDeleteButton";
import { JobMoveMenu } from "@/components/modules/projects/JobMoveMenu";
import { JobLineItemsTab } from "@/components/modules/projects/JobLineItemsTab";
import { PerformanceTable } from "@/components/modules/projects/PerformanceTable";
import { JobWorkOrders } from "@/components/modules/subcontractors/JobWorkOrders";
import { JobAssignments } from "@/components/modules/subcontractors/JobAssignments";
import { JobTasksTab } from "@/components/modules/projects/tabs/JobTasksTab";
import { listTasksForJobAction } from "@/app/(app)/projects/task-actions";
import { isOpen } from "@/lib/tasks/task-status";
import type { DbJobRollup } from "@/lib/api/project-cost-rollup";
import type { InvoiceListRow } from "@/lib/api/invoices";
import type { PurchaseOrderListRow } from "@/lib/api/purchase-orders";
import type {
  DbJob,
  DbJobLineItem,
  DbProject,
  DbProjectCostCenter,
} from "@/lib/types/database";

const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated",
  guardian: "Guardian",
};

export interface JobSourceQuote {
  id: string;
  number: string | null;
  name: string | null;
  status: string;
  total: number | null;
}

type TabKey =
  | "overview"
  | "financials"
  | "attachments"
  | "line_items"
  | "tasks"
  | "deficiencies"
  | "commissioning"
  | "team";

const TABS: Array<{ key: TabKey; label: string; soon?: string }> = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "line_items", label: "Line Items" }, // PROJ2-6a — unlocked
  { key: "attachments", label: "Attachments" },
  { key: "tasks", label: "Tasks" }, // PROJ2-11 — unlocked
  { key: "deficiencies", label: "Deficiencies", soon: "PROJ2-12" },
  { key: "commissioning", label: "Commissioning", soon: "PROJ2-13" },
  { key: "team", label: "Team", soon: "PROJ2-15" },
];

export function jobLabel(job: Pick<DbJob, "job_type" | "co_number" | "title">): string {
  if (job.job_type === "main_job") return "Main Job";
  const base = `C.O #${job.co_number ?? ""}`;
  return job.title ? `${base} — ${job.title}` : base;
}

export function JobDetailView({
  job,
  project,
  clientName,
  siteName,
  rollup,
  canEdit,
  canViewFinancials,
  costCenters,
  invoices,
  purchaseOrders,
  lineItems,
  sourceQuote,
  attachmentsSlot,
}: {
  job: DbJob;
  project: DbProject;
  clientName: string | null;
  siteName: string | null;
  rollup: DbJobRollup;
  canEdit: boolean;
  canViewFinancials: boolean;
  costCenters: DbProjectCostCenter[];
  invoices: InvoiceListRow[];
  purchaseOrders: PurchaseOrderListRow[];
  lineItems: DbJobLineItem[];
  sourceQuote: JobSourceQuote | null;
  attachmentsSlot: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  // PROJ2-11 — open-task count for the Tasks tab badge. Loaded once here so the
  // badge is right before the tab is ever opened; the tab itself owns the
  // full task state.
  const [openTaskCount, setOpenTaskCount] = useState(0);
  useEffect(() => {
    listTasksForJobAction(job.id).then((res) => {
      if (res.ok) setOpenTaskCount(res.data.filter(isOpen).length);
    });
  }, [job.id, tab]);

  // Financials gate: redacted (null) rollup legs already read as "—"; contract
  // is NOT redacted server-side, so gate it here too (matches project header).
  const money = (n: number | null | undefined) =>
    canViewFinancials && n != null ? formatCurrency(Number(n)) : "—";
  const pctv = (n: number | null | undefined) =>
    canViewFinancials && n != null ? formatPercent(Number(n)) : "—";

  const label = jobLabel(job);
  const isChangeOrder = job.job_type === "change_order";
  const ccSum =
    Math.round(
      costCenters.reduce((s, c) => s + Number(c.contract_value ?? 0), 0) * 100
    ) / 100;
  const contractMismatch =
    Math.round(Number(job.contract_value) * 100) / 100 !== ccSum;

  return (
    <div className="space-y-4 pb-12">
      {/* Top bar — back link + breadcrumb */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/projects/${project.id}`}
          className="text-muted-foreground hover:text-brand-charcoal text-xs"
        >
          ← Back to project
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          <Link
            href={`/projects/${project.id}`}
            className="hover:text-brand-charcoal hover:underline"
          >
            {project.title || project.project_number}
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-brand-charcoal font-medium">{label}</span>
        </p>
      </div>

      {/* Header — mirrors ProjectHeader spatial pattern */}
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
              <span className="bg-muted text-brand-primary rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                {OPCO_LABEL[project.opco] ?? project.opco}
              </span>
              <span className="rounded-sm border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-charcoal">
                {isChangeOrder ? "Change Order" : "Main Job"}
              </span>
            </div>

            <h1 className="text-brand-navy font-serif text-2xl font-semibold leading-tight">
              {job.title || label}
            </h1>

            <JobStatusControl
              jobId={job.id}
              currentStatus={job.status}
              canEdit={canEdit}
            />

            <p className="text-muted-foreground text-sm">
              <Link
                href={`/clients/${project.client_id}`}
                className="hover:text-brand-charcoal hover:underline"
              >
                {clientName ?? "—"}
              </Link>
              {siteName && project.site_id ? (
                <>
                  {" · "}
                  <Link
                    href={`/sites/${project.site_id}`}
                    className="hover:text-brand-charcoal hover:underline"
                  >
                    {siteName}
                  </Link>
                </>
              ) : siteName ? (
                <> · {siteName}</>
              ) : null}
            </p>

            {/* Source quote link — muted note when absent (shouldn't happen for
                quote-originated jobs, but manual C.Os legitimately have none). */}
            <p className="text-muted-foreground text-xs">
              {sourceQuote ? (
                <>
                  From quote{" "}
                  <Link
                    href={`/quotes/${sourceQuote.id}`}
                    className="text-brand-charcoal underline-offset-2 hover:underline"
                  >
                    {sourceQuote.number ?? sourceQuote.id}
                  </Link>
                </>
              ) : (
                <span className="italic">No source quote (manually added)</span>
              )}
            </p>
          </div>

          {/* Right — financial stat tiles + actions */}
          <div className="lg:col-span-5">
            {canEdit ? (
              <div className="flex items-start justify-end gap-2">
                <JobEditForm job={job} />
                {isChangeOrder ? (
                  <JobMoveMenu
                    jobId={job.id}
                    coNumber={job.co_number}
                    siteName={siteName}
                  />
                ) : null}
                {isChangeOrder ? (
                  <JobDeleteButton
                    jobId={job.id}
                    projectId={project.id}
                    coNumber={job.co_number}
                    contractValue={Number(job.contract_value)}
                    costCenterCount={costCenters.length}
                    invoiceCount={invoices.length}
                    purchaseOrderCount={purchaseOrders.length}
                  />
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stat label="Contract value" value={money(job.contract_value)} />
              <Stat label="Billed" value={pctv(rollup.billed_pct)} />
              <Stat label="PO committed" value={money(rollup.po_committed)} />
              <Stat label="Margin" value={money(rollup.margin)} />
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div
        className="flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--brand-border)" }}
      >
        {TABS.map((t) => {
          const disabled = !!t.soon;
          const active = tab === t.key;
          // PROJ2-6a — Line Items carries a live count badge.
          // PROJ2-11 — Tasks carries an OPEN-task count (done/cancelled excluded).
          const badge =
            t.key === "line_items" && lineItems.length > 0
              ? lineItems.length
              : t.key === "tasks" && openTaskCount > 0
                ? openTaskCount
                : null;
          return (
            <button
              key={t.key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setTab(t.key)}
              title={disabled ? `Coming in ${t.soon}` : undefined}
              className="relative px-3 py-2 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                color: active
                  ? "var(--brand-primary)"
                  : "color-mix(in oklab, var(--brand-text) 50%, transparent)",
              }}
            >
              {t.label}
              {badge != null && (
                <span className="bg-muted text-brand-charcoal ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums">
                  {badge}
                </span>
              )}
              {active && (
                <span
                  className="absolute bottom-[-1px] left-2 right-2 h-[2px]"
                  style={{ background: "var(--brand-accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {tab === "overview" && (
        <OverviewTab
          job={job}
          project={project}
          costCenters={costCenters}
          sourceQuote={sourceQuote}
          canViewFinancials={canViewFinancials}
          money={money}
          contractMismatch={contractMismatch}
          ccSum={ccSum}
        />
      )}

      {tab === "financials" && (
        <FinancialsTab
          job={job}
          rollup={rollup}
          invoices={invoices}
          purchaseOrders={purchaseOrders}
          canEdit={canEdit}
          canViewFinancials={canViewFinancials}
          money={money}
          pctv={pctv}
        />
      )}

      {tab === "line_items" && (
        <JobLineItemsTab
          jobId={job.id}
          initialItems={lineItems}
          costCenters={costCenters}
          canEdit={canEdit}
          canViewFinancials={canViewFinancials}
        />
      )}

      {tab === "tasks" && (
        <JobTasksTab jobId={job.id} projectId={job.project_id} canEdit={canEdit} />
      )}

      {tab === "attachments" && <div>{attachmentsSlot}</div>}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({
  job,
  project,
  costCenters,
  sourceQuote,
  canViewFinancials,
  money,
  contractMismatch,
  ccSum,
}: {
  job: DbJob;
  project: DbProject;
  costCenters: DbProjectCostCenter[];
  sourceQuote: JobSourceQuote | null;
  canViewFinancials: boolean;
  money: (n: number | null | undefined) => string;
  contractMismatch: boolean;
  ccSum: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Description — Job has no own description yet; inherits the project's. */}
      <Panel title="Description">
        <p className="text-brand-charcoal text-sm font-medium">{job.title}</p>
        {project.description ? (
          <>
            <p className="text-muted-foreground mt-2 whitespace-pre-wrap text-xs leading-relaxed">
              {project.description}
            </p>
            <p className="text-muted-foreground/70 mt-1 text-[11px] italic">
              This job inherits the project description.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs italic">
            No description.
          </p>
        )}
      </Panel>

      {/* Source quote */}
      <Panel title="Source quote">
        {sourceQuote ? (
          <div className="space-y-1 text-sm">
            <Link
              href={`/quotes/${sourceQuote.id}`}
              className="text-brand-charcoal font-medium underline-offset-2 hover:underline"
            >
              {sourceQuote.number ?? sourceQuote.id}
              {sourceQuote.name ? ` — ${sourceQuote.name}` : ""}
            </Link>
            <p className="text-muted-foreground text-xs">
              Status: {sourceQuote.status} · {money(sourceQuote.total)}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs italic">
            Manually added — no source quote.
          </p>
        )}
      </Panel>

      {/* Cost centers */}
      <Panel title="Cost centers" className="lg:col-span-2">
        {costCenters.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            No cost centers attached to this job.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-[var(--border)] text-left text-[11px] uppercase">
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 text-right font-medium">Contract</th>
                </tr>
              </thead>
              <tbody>
                {costCenters.map((cc) => (
                  <tr
                    key={cc.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="text-brand-navy px-2 py-1.5 font-mono text-xs">
                      {cc.cc_number}
                    </td>
                    <td className="text-brand-charcoal px-2 py-1.5">{cc.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {money(cc.contract_value)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border)]">
                  <td />
                  <td className="text-muted-foreground px-2 py-1.5 text-right text-xs uppercase">
                    <span className="inline-flex items-center gap-1">
                      {contractMismatch && canViewFinancials ? (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-amber-500"
                          aria-label="Contract value doesn't match cost center sum. Contact support."
                        />
                      ) : null}
                      Job contract
                    </span>
                  </td>
                  <td className="text-brand-charcoal px-2 py-1.5 text-right font-semibold tabular-nums">
                    {money(job.contract_value)}
                  </td>
                </tr>
                {contractMismatch && canViewFinancials ? (
                  <tr>
                    <td />
                    <td colSpan={2} className="px-2 pb-1 text-right text-[11px] text-amber-600">
                      Cost center sum {money(ccSum)} doesn&apos;t match the job
                      contract value. Contact support.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Financials ───────────────────────────────────────────────────────────────

function FinancialsTab({
  job,
  rollup,
  invoices,
  purchaseOrders,
  canEdit,
  canViewFinancials,
  money,
  pctv,
}: {
  job: DbJob;
  rollup: DbJobRollup;
  invoices: InvoiceListRow[];
  purchaseOrders: PurchaseOrderListRow[];
  canEdit: boolean;
  canViewFinancials: boolean;
  money: (n: number | null | undefined) => string;
  pctv: (n: number | null | undefined) => string;
}) {
  // FIN-8 + SUB-4 — Job gross profit on the project-P&L basis: pre-tax invoiced
  // revenue (issued invoices' subtotal) − (vendor-billed materials + labour +
  // subcontractor labour). Null when the cost legs are redacted, so `money()`
  // dashes it for view-only.
  const jobRevenuePretax = invoices
    .filter((i) => ["sent", "partially_paid", "paid"].includes(i.status))
    .reduce((sum, i) => sum + Number(i.subtotal ?? 0), 0);
  const jobGrossProfit =
    rollup.billed_cost == null || rollup.labour == null || rollup.sub_labour == null
      ? null
      : Math.round(
          (jobRevenuePretax -
            Number(rollup.billed_cost) -
            Number(rollup.labour) -
            Number(rollup.sub_labour)) *
            100
        ) / 100;

  return (
    <div className="space-y-4">
      {/* PROJ2-6b — Quoted vs Estimated vs Actual with variance. */}
      <Panel title="Performance">
        <PerformanceTable
          block={rollup.variance}
          canViewFinancials={canViewFinancials}
        />
      </Panel>

      <Panel title="Financial summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Contract value" value={money(job.contract_value)} />
          <Stat label="Materials spent" value={money(rollup.materials)} />
          <Stat label="Labour spent" value={money(rollup.labour)} />
          {/* SUB-4 — subcontractor labour is canonical cost, folded into spent. */}
          <Stat label="Subcontractors" value={money(rollup.sub_labour)} />
          <Stat label="Total spent" value={money(rollup.spent)} />
          <Stat label="Margin" value={money(rollup.margin)} />
          <Stat label="Invoiced" value={money(rollup.invoiced)} />
          <Stat label="Billed" value={pctv(rollup.billed_pct)} />
          <Stat label="PO committed" value={money(rollup.po_committed)} />
          {/* FIN-5 — vendor-billed cost (bill subtotals, tax excluded). Shown
              ALONGSIDE spent, not inside it: PO receipts already put material
              cost into `spent` via inventory, so adding bills would double
              count. See the rollup header note. */}
          <Stat label="Vendor billed" value={money(rollup.billed_cost)} />
          {/* FIN-8 — Job gross profit on the SAME basis as the project P&L:
              pre-tax invoiced revenue − (vendor-billed materials + labour).
              null (dashed) whenever the cost legs are redacted. */}
          <Stat label="Job gross profit" value={money(jobGrossProfit)} />
        </div>
      </Panel>

      {/* SUB-6 — who is assigned to this job (subs now, in-house techs later). */}
      <JobAssignments jobId={job.id} projectId={job.project_id} canEdit={canEdit} />

      {/* SUB-5 — subcontractor work orders attached to this job (self-hides when none). */}
      <JobWorkOrders jobId={job.id} />

      {/* Invoices — link to the (existing) invoice detail route. */}
      <Panel title="Invoices">
        {invoices.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            No invoices attached to this job.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-[var(--border)] text-left text-[11px] uppercase">
                  <th className="px-2 py-1.5 font-medium">Number</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--muted)]/40"
                  >
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-brand-charcoal font-medium underline-offset-2 hover:underline"
                      >
                        {inv.invoice_number ?? inv.id}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5 capitalize">
                      {inv.status}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {money(inv.total)}
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5">
                      {inv.issue_date ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Purchase orders — read-only (no /purchase-orders/[id] detail route yet;
          POs are managed via a drawer in the list view). */}
      <Panel title="Purchase orders">
        {purchaseOrders.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            No purchase orders attached to this job.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-[var(--border)] text-left text-[11px] uppercase">
                  <th className="px-2 py-1.5 font-medium">Number</th>
                  <th className="px-2 py-1.5 font-medium">Vendor</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po) => (
                  <tr
                    key={po.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="text-brand-charcoal px-2 py-1.5 font-medium">
                      {po.po_number}
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5">
                      {po.vendor_name}
                    </td>
                    <td className="text-muted-foreground px-2 py-1.5 capitalize">
                      {po.status.replace(/_/g, " ")}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {money(po.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {!canViewFinancials ? (
        <p className="text-muted-foreground text-[11px] italic">
          Financial figures are hidden for your role.
        </p>
      ) : null}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`bg-card p-4 shadow-sm ${className ?? ""}`}>
      <h2 className="text-brand-navy mb-3 font-serif text-sm font-semibold">
        {title}
      </h2>
      {children}
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
