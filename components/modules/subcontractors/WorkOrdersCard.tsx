"use client";

// SUB-5 — the Work orders (subcontractor agreements) card on the sub detail
// page (replaces the SUB-1 placeholder). List + create/edit + the compliance-
// gated Issue flow. The Issue button is disabled and the reasons shown when the
// sub is compliance-blocked — but the SERVER is the real gate (issueAgreement).

import { useEffect, useState, useTransition } from "react";
import { Plus, Download, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import {
  listAgreementsAction,
  createAgreementAction,
  issueAgreementAction,
  setAgreementStatusAction,
  getAgreementPdfUrlAction,
  getWorkOrderEligibilityAction,
  listWorkOrderProjectOptionsAction,
  listWorkOrderJobOptionsAction,
} from "@/app/(app)/subcontractors/actions";
import type { AgreementListRow } from "@/lib/api/sub-agreements";
import type { EligibilityResult } from "@/lib/subcontractors/eligibility";
import type { DbSubAgreementStatus } from "@/lib/types/database";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<DbSubAgreementStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Issued", cls: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy" },
  in_progress: { label: "In progress", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  completed: { label: "Completed", cls: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]" },
  cancelled: { label: "Cancelled", cls: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive" },
};

export function WorkOrdersCard({
  subcontractorId,
  subEmail,
  canEdit,
}: {
  subcontractorId: string;
  subEmail: string | null;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<AgreementListRow[]>([]);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [issuing, setIssuing] = useState<AgreementListRow | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    listAgreementsAction({ subcontractorId }).then((res) => {
      if (res.ok) setRows(res.data);
    });
    if (canEdit) {
      getWorkOrderEligibilityAction(subcontractorId).then((res) => {
        if (res.ok) setEligibility(res.data);
      });
    }
  };
  useEffect(load, [subcontractorId, canEdit]);

  const blocked = eligibility != null && !eligibility.ok;

  const handleDownload = async (row: AgreementListRow) => {
    const res = await getAgreementPdfUrlAction(row.id);
    if (!res.ok || !res.data.url) {
      toast.error(res.ok ? "No PDF available yet." : res.error);
      return;
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  };

  const handleStatus = (row: AgreementListRow, status: DbSubAgreementStatus) =>
    startTransition(async () => {
      const res = await setAgreementStatusAction(row.id, subcontractorId, status);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      load();
      toast.success("Work order updated");
    });

  return (
    <Card className="space-y-4 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-lg">Work orders</h3>
        {canEdit && (
          <Button type="button" size="xs" onClick={() => setCreateOpen(true)} disabled={pending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New work order
          </Button>
        )}
      </div>

      {/* Compliance block banner — issuing is disabled while this shows. */}
      {canEdit && blocked && !eligibility!.ok && (
        <div className="border-destructive/40 bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-destructive rounded-md border px-3 py-2 text-xs">
          <p className="inline-flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            Work orders can&rsquo;t be issued to this subcontractor:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {eligibility!.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <p className="text-destructive/80 mt-1">
            Update the Compliance documents above, then reload. (You can still
            create and prepare a draft.)
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">No work orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">WO #</TableHead>
                <TableHead className="text-[11px] uppercase">Title</TableHead>
                <TableHead className="text-[11px] uppercase">Project / Job</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Value</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
                <TableHead className="text-[11px] uppercase">Issued</TableHead>
                <TableHead className="text-[11px] uppercase" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const badge = STATUS_BADGE[r.status];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.agreement_number}</TableCell>
                    <TableCell className="text-brand-charcoal text-xs">{r.title}</TableCell>
                    <TableCell className="text-xs">
                      {r.project_number ? (
                        <>
                          <div>{r.project_number}</div>
                          {r.job_label && (
                            <div className="text-muted-foreground text-[10px]">{r.job_label}</div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCurrency(Number(r.agreed_value))}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {r.issued_at ? r.issued_at.slice(0, 10) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.pdf_path && (
                          <button
                            type="button"
                            onClick={() => handleDownload(r)}
                            className="text-brand-navy hover:text-brand-gold"
                            aria-label="Download work order PDF"
                            title="Download PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canEdit && r.status === "draft" && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => setIssuing(r)}
                            disabled={pending || blocked}
                            title={blocked ? "Blocked by compliance — see above" : undefined}
                          >
                            Issue
                          </Button>
                        )}
                        {canEdit && (r.status === "issued" || r.status === "in_progress") && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label="Work order actions"
                              className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex items-center justify-center rounded p-1"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {r.status === "issued" && (
                                <DropdownMenuItem onClick={() => handleStatus(r, "in_progress")}>
                                  Mark in progress
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleStatus(r, "completed")}>
                                Mark completed
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleStatus(r, "cancelled")}
                              >
                                Cancel work order
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canEdit && (
        <CreateWorkOrderDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          subcontractorId={subcontractorId}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {canEdit && issuing && (
        <IssueWorkOrderDialog
          agreement={issuing}
          subcontractorId={subcontractorId}
          subEmail={subEmail}
          eligibility={eligibility}
          onClose={() => setIssuing(null)}
          onIssued={() => {
            setIssuing(null);
            load();
          }}
        />
      )}
    </Card>
  );
}

// ─── Create dialog ───────────────────────────────────────────────────────────

function CreateWorkOrderDialog({
  open,
  onOpenChange,
  subcontractorId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subcontractorId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [value, setValue] = useState("");
  const [projectId, setProjectId] = useState("none");
  const [jobId, setJobId] = useState("none");
  const [startDate, setStartDate] = useState("");
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [projects, setProjects] = useState<{ id: string; number: string | null; title: string | null }[]>([]);
  const [jobs, setJobs] = useState<{ id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(""); setScope(""); setValue(""); setProjectId("none"); setJobId("none");
      setStartDate(""); setTarget(""); setNotes(""); setJobs([]);
      listWorkOrderProjectOptionsAction().then((r) => r.ok && setProjects(r.data));
    }
  }, [open]);

  useEffect(() => {
    setJobId("none");
    if (projectId === "none") {
      setJobs([]);
      return;
    }
    listWorkOrderJobOptionsAction(projectId).then((r) => r.ok && setJobs(r.data));
  }, [projectId]);

  const datesInvalid = startDate !== "" && target !== "" && target < startDate;
  const invalid = !title.trim() || datesInvalid || saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await createAgreementAction({
        subcontractorId,
        projectId: projectId === "none" ? null : projectId,
        jobId: jobId === "none" ? null : jobId,
        title: title.trim(),
        scopeOfWork: scope.trim() || null,
        agreedValue: value.trim() === "" ? 0 : Number(value),
        startDate: startDate || null,
        targetCompletion: target || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Work order drafted");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New work order</DialogTitle>
          <DialogDescription>
            A scoped instruction to this subcontractor. Drafts can be prepared
            freely; issuing is compliance-gated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" placeholder="e.g. Rough-in electrical, Level 3" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project (optional)">
              <Select value={projectId} onValueChange={(v) => setProjectId(v ?? "none")}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.number ?? p.id.slice(0, 8)}{p.title ? ` — ${p.title}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Job (optional)">
              <Select value={jobId} onValueChange={(v) => setJobId(v ?? "none")} disabled={projectId === "none"}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={projectId === "none" ? "Pick a project first" : "Whole project"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Whole project</SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Scope of work">
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
              placeholder="Describe the work being subbed out…"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Agreed value">
              <Input value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} className="h-9 text-sm tabular-nums" placeholder="0.00" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Target completion">
              <Input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>
          {datesInvalid && (
            <p className="text-destructive text-[11px]">Target completion can&rsquo;t be before the start date.</p>
          )}
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={invalid}>
            {saving ? "Saving…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Issue dialog ────────────────────────────────────────────────────────────

function IssueWorkOrderDialog({
  agreement,
  subcontractorId,
  subEmail,
  eligibility,
  onClose,
  onIssued,
}: {
  agreement: AgreementListRow;
  subcontractorId: string;
  subEmail: string | null;
  eligibility: EligibilityResult | null;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [sendEmail, setSendEmail] = useState(!!subEmail);
  const [pending, startTransition] = useTransition();
  const blocked = eligibility != null && !eligibility.ok;

  const handleIssue = () =>
    startTransition(async () => {
      const res = await issueAgreementAction(agreement.id, subcontractorId, sendEmail && !!subEmail);
      if (!res.ok) {
        if (res.reasons) {
          toast.error(`Blocked: ${res.reasons.join(" ")}`);
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(res.warning ? `Issued — but: ${res.warning}` : "Work order issued");
      onIssued();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue {agreement.agreement_number}?</DialogTitle>
          <DialogDescription>
            Issuing renders the work-order PDF and locks its scope and value.
          </DialogDescription>
        </DialogHeader>

        {blocked && !eligibility!.ok ? (
          <div className="border-destructive/40 bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-destructive rounded-md border px-3 py-2 text-xs">
            <p className="font-medium">This subcontractor can&rsquo;t be issued a work order:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {eligibility!.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="mt-1">Fix the compliance documents on this subcontractor, then try again.</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground text-xs">
              Compliance check passed — required documents are current.
            </p>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={sendEmail}
                disabled={!subEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span className="text-brand-charcoal">
                {subEmail ? `Email the work order to ${subEmail}` : "No email on file for this subcontractor"}
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleIssue} disabled={pending || blocked}>
            <FileText className="mr-1 h-3.5 w-3.5" />
            {pending ? "Issuing…" : "Issue work order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}
