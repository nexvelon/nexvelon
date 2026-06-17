"use client";

// PROJ-1 — lean real-data project detail: header (P-number, title, client/site,
// opco, status) + Cost Centers (add / rename / delete) + linked Quotes. The
// richer Tasks/Schedule/Materials/etc. tabs are future domain — not wired here.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Pencil, Plus, Trash2, Check, X, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import { formatCurrency } from "@/lib/format";
import {
  addCostCenterAction,
  renameCostCenterAction,
  deleteCostCenterAction,
} from "@/app/(app)/projects/actions";
import {
  createInvoiceForProjectAction,
  listInvoicesForProjectAction,
} from "@/app/(app)/invoices/actions";
import {
  listLabourForProjectAction,
  listActiveTechsAction,
  type ProjectLabour,
} from "@/app/(app)/projects/labour-actions";
import { getProjectCostRollupAction } from "@/app/(app)/projects/rollup-actions";
import { CostCenterLabour } from "@/components/modules/projects/CostCenterLabour";
import {
  ProjectRollupCard,
  CostCenterRollupChips,
} from "@/components/modules/projects/ProjectRollup";
import { STATUS_TONE } from "@/components/modules/invoices/shared";
import type { ProjectDetail } from "@/lib/api/projects";
import type { InvoiceListRow } from "@/lib/api/invoices";
import type { ProjectCostRollup } from "@/lib/api/project-cost-rollup";
import type { DbProjectCostCenter, DbTech } from "@/lib/types/database";

const EMPTY_LABOUR: ProjectLabour = { entries: {}, totals: {} };

const OPCO_LABEL: Record<string, string> = {
  integrated_solutions: "Integrated",
  guardian: "Guardian",
};

function roleLabel(role: string): string {
  if (role === "original") return "Original";
  if (role === "change_order") return "Change order";
  return role;
}

export function ProjectDetailView({ detail }: { detail: ProjectDetail }) {
  const { project, client_name, site_name, quotes } = detail;
  const { role } = useRole();
  const router = useRouter();
  const canEdit = hasPermission(role, "quotes", "convert");
  // Invoicing is financial-sensitive — gated separately from project edits.
  const canInvoice = hasPermission(role, "financials", "edit");

  const [invoices, setInvoices] = useState<InvoiceListRow[]>([]);
  useEffect(() => {
    let active = true;
    listInvoicesForProjectAction(project.id)
      .then((rows) => {
        if (active) setInvoices(rows);
      })
      .catch(() => {
        /* leave empty */
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  // JC-1 — labour (entries grouped by cost center + per-cost-center totals) and
  // the active-tech list for the Add Labour Select. Fetched client-side like
  // invoices; refreshLabour re-pulls after any add/edit/delete.
  const [labour, setLabour] = useState<ProjectLabour>(EMPTY_LABOUR);
  const [techs, setTechs] = useState<DbTech[]>([]);
  const refreshLabour = () => {
    listLabourForProjectAction(project.id)
      .then((res) => {
        if (res.ok) setLabour(res.data);
      })
      .catch(() => {
        /* leave as-is */
      });
  };
  useEffect(() => {
    let active = true;
    listLabourForProjectAction(project.id)
      .then((res) => {
        if (active && res.ok) setLabour(res.data);
      })
      .catch(() => {
        /* leave empty */
      });
    listActiveTechsAction()
      .then((res) => {
        if (active && res.ok) setTechs(res.data);
      })
      .catch(() => {
        /* leave empty */
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  // JC-2 — cost rollup (contract / invoiced / materials / labour / spent /
  // margin / billed %). Client-fetched like labour; labour / spent / margin
  // arrive null when the caller lacks financials:edit. refreshRollup re-pulls
  // after any change that moves the numbers (labour edits, invoice creation).
  const [rollup, setRollup] = useState<ProjectCostRollup | null>(null);
  const [canSeeFinancials, setCanSeeFinancials] = useState(false);
  const refreshRollup = () => {
    getProjectCostRollupAction(project.id)
      .then((res) => {
        if (res.ok) {
          setRollup(res.data.rollup);
          setCanSeeFinancials(res.data.canSeeFinancials);
        }
      })
      .catch(() => {
        /* leave as-is */
      });
  };
  useEffect(() => {
    let active = true;
    getProjectCostRollupAction(project.id)
      .then((res) => {
        if (active && res.ok) {
          setRollup(res.data.rollup);
          setCanSeeFinancials(res.data.canSeeFinancials);
        }
      })
      .catch(() => {
        /* leave empty */
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  // Labour and stock-cost both feed the rollup, so a labour change must refresh
  // both the labour lists and the rollup.
  const onLabourChanged = () => {
    refreshLabour();
    refreshRollup();
  };

  const handleCreateInvoice = () => {
    startTransition(async () => {
      const res = await createInvoiceForProjectAction(project.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(`/invoices/${res.data.id}`);
    });
  };

  // PROJ-2: quote_id → business number, to label change-order cost centers.
  const quoteNumberById = new Map(quotes.map((q) => [q.quote_id, q.number]));
  // A cost center is a change-order center when its source quote differs from
  // the project's originating quote.
  const coLabel = (sourceQuoteId: string | null): string | null => {
    if (!sourceQuoteId || sourceQuoteId === project.originating_quote_id) {
      return null;
    }
    return `CO ${quoteNumberById.get(sourceQuoteId) ?? sourceQuoteId}`;
  };

  const [costCenters, setCostCenters] = useState<DbProjectCostCenter[]>(
    detail.costCenters
  );
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pending, startTransition] = useTransition();

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await addCostCenterAction(project.id, name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCostCenters((cs) => [...cs, res.data]);
      setNewName("");
      toast.success(`Added ${res.data.cc_number}`);
    });
  };

  const handleRename = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await renameCostCenterAction(id, project.id, name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCostCenters((cs) =>
        cs.map((c) => (c.id === id ? { ...c, name: res.data.name } : c))
      );
      setEditingId(null);
      toast.success("Cost center renamed");
    });
  };

  const handleDelete = (cc: DbProjectCostCenter) => {
    if (!window.confirm(`Delete cost center "${cc.name}" (${cc.cc_number})?`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteCostCenterAction(cc.id, project.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCostCenters((cs) => cs.filter((c) => c.id !== cc.id));
      toast.success("Cost center deleted");
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card
        className="p-5 shadow-sm"
        style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-brand-navy font-mono text-xs font-semibold tracking-wider">
              {project.project_number}
            </p>
            <h1 className="font-serif text-2xl font-semibold text-brand-primary">
              {project.title || "Untitled project"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {client_name ?? "—"}
              {site_name ? ` · ${site_name}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="bg-muted rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-primary">
              {OPCO_LABEL[project.opco] ?? project.opco}
            </span>
            <span className="rounded-full bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--brand-status-green)]">
              {project.status}
            </span>
          </div>
        </div>
      </Card>

      {/* JC-2 — project cost rollup */}
      {rollup && (
        <ProjectRollupCard
          rollup={rollup.perProject}
          canSeeFinancials={canSeeFinancials}
        />
      )}

      {/* Cost Centers */}
      <div>
        <p className="nx-eyebrow-soft mb-2">
          Cost Centers{" "}
          <span className="text-muted-foreground font-normal normal-case">
            · {costCenters.length}
          </span>
        </p>
        <Card className="bg-card p-0 shadow-sm">
          {costCenters.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">
              No cost centers yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {costCenters.map((cc) => (
                <li key={cc.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                  <span className="text-brand-navy w-44 shrink-0 font-mono text-xs">
                    {cc.cc_number}
                  </span>
                  {editingId === cc.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 flex-1 text-xs"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(cc.id)}
                        disabled={pending}
                        className="text-brand-charcoal hover:text-brand-navy"
                        aria-label="Save"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-muted-foreground hover:text-brand-charcoal"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-brand-charcoal flex-1 truncate">
                        {cc.name}
                      </span>
                      {coLabel(cc.source_quote_id) && (
                        <span className="text-muted-foreground shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">
                          {coLabel(cc.source_quote_id)}
                        </span>
                      )}
                      {canEdit && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(cc.id);
                              setEditName(cc.name);
                            }}
                            className="text-muted-foreground hover:text-brand-charcoal"
                            aria-label="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cc)}
                            disabled={pending}
                            className="text-muted-foreground hover:text-red-600"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  </div>
                  {rollup?.perCostCenter[cc.id] && (
                    <CostCenterRollupChips
                      cc={rollup.perCostCenter[cc.id]}
                      canSeeFinancials={canSeeFinancials}
                    />
                  )}
                  <CostCenterLabour
                    projectId={project.id}
                    costCenter={{
                      id: cc.id,
                      cc_number: cc.cc_number,
                      name: cc.name,
                    }}
                    entries={labour.entries[cc.id] ?? []}
                    total={labour.totals[cc.id] ?? 0}
                    techs={techs}
                    canEdit={canInvoice}
                    onChanged={onLabourChanged}
                  />
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="flex items-center gap-2 border-t border-[var(--border)] p-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="New cost center name…"
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                disabled={pending || !newName.trim()}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Invoices */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="nx-eyebrow-soft">
            Invoices{" "}
            <span className="text-muted-foreground font-normal normal-case">
              · {invoices.length}
            </span>
          </p>
          {canInvoice && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCreateInvoice}
              disabled={pending}
            >
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
              Create invoice
            </Button>
          )}
        </div>
        <Card className="bg-card p-0 shadow-sm">
          {invoices.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">
              No invoices yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="text-brand-navy font-mono text-xs font-semibold hover:underline"
                  >
                    {inv.invoice_number ?? "Draft"}
                  </Link>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {inv.issue_date
                      ? format(parseISO(inv.issue_date), "MMM d, yyyy")
                      : "—"}
                  </span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide capitalize ${STATUS_TONE[inv.status] ?? STATUS_TONE.draft}`}
                  >
                    {inv.status}
                  </span>
                  <span className="text-brand-charcoal w-24 text-right text-xs font-semibold tabular-nums">
                    {formatCurrency(Number(inv.total))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Linked Quotes */}
      <div>
        <p className="nx-eyebrow-soft mb-2">
          Quotes{" "}
          <span className="text-muted-foreground font-normal normal-case">
            · {quotes.length}
          </span>
        </p>
        <Card className="bg-card p-0 shadow-sm">
          {quotes.length === 0 ? (
            <p className="text-muted-foreground p-4 text-xs">
              No linked quotes.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {quotes.map((q) => (
                <li
                  key={q.quote_id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <Link
                    href={`/quotes/${q.quote_id}`}
                    className="text-brand-navy font-mono text-xs font-semibold hover:underline"
                  >
                    {q.number ?? q.quote_id}
                  </Link>
                  <span className="text-muted-foreground ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {roleLabel(q.role)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
