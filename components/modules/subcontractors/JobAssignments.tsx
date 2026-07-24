"use client";

// SUB-6 — the "Assigned" card on the job detail page, next to SUB-5's work
// orders. Who is on this job (plus the project-wide crew), in what role, over
// what dates. Assigning a subcontractor is compliance-gated: the Assign button
// disables with reasons when the sub is blocked — but the SERVER is the real
// gate (createAssignment).

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, AlertTriangle, User, Building2, Star } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listAssignmentsForJobAction,
  createAssignmentAction,
  setAssignmentStatusAction,
  listActiveSubcontractorOptionsAction,
  listAssignableTechsAction,
  listLinkableWorkOrdersAction,
  getAssignmentEligibilityAction,
} from "@/app/(app)/projects/assignment-actions";
import type { AssignableTech } from "@/lib/api/job-assignments";
import type { AssignmentRow } from "@/lib/api/job-assignments";
import type { EligibilityResult } from "@/lib/subcontractors/eligibility";
import type { DbAssignmentRole } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const ROLES: DbAssignmentRole[] = ["lead", "crew", "supervisor", "specialist", "other"];
const ROLE_LABEL: Record<DbAssignmentRole, string> = {
  lead: "Lead",
  crew: "Crew",
  supervisor: "Supervisor",
  specialist: "Specialist",
  other: "Other",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  completed: "bg-muted text-muted-foreground",
  removed: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
};

export function JobAssignments({
  jobId,
  projectId,
  canEdit,
}: {
  jobId: string;
  projectId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = () => {
    listAssignmentsForJobAction(jobId).then((res) => {
      if (res.ok) setRows(res.data);
    });
  };
  useEffect(load, [jobId]);

  const handleStatus = (row: AssignmentRow, status: "completed" | "removed") =>
    startTransition(async () => {
      const res = await setAssignmentStatusAction(row.id, projectId, status, row.subcontractor_id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      load();
      toast.success(status === "removed" ? "Assignment removed" : "Assignment completed");
    });

  return (
    <Card className="space-y-3 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-base">Assigned</h3>
        {canEdit && (
          <Button type="button" size="xs" onClick={() => setAssignOpen(true)} disabled={pending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Assign
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">No one assigned to this job yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
              {/* Person icon for an in-house tech, company icon for a sub. */}
              {r.assignee_kind === "tech" ? (
                <User className="text-brand-navy h-3.5 w-3.5 shrink-0" aria-label="In-house technician" />
              ) : (
                <Building2 className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-label="Subcontractor" />
              )}
              <span className="text-brand-charcoal font-medium">{r.assignee_name}</span>
              {r.role === "lead" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--brand-accent)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-accent)]">
                  <Star className="h-2.5 w-2.5" /> Lead
                </span>
              ) : (
                <span className="text-muted-foreground rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px]">
                  {ROLE_LABEL[r.role]}
                </span>
              )}
              {r.assignee_kind === "tech" && (
                <span className="text-muted-foreground text-[10px]">(in-house)</span>
              )}
              {r.scope === "project" && (
                <span className="text-muted-foreground text-[10px] italic">project-wide</span>
              )}
              {r.agreement_number && (
                <span className="text-brand-navy text-[10px]">WO {r.agreement_number}</span>
              )}
              {(r.start_date || r.end_date) && (
                <span className="text-muted-foreground text-[10px] tabular-nums">
                  {r.start_date ?? "…"} → {r.end_date ?? "…"}
                </span>
              )}
              <span className={cn("ml-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[r.status])}>
                {r.status}
              </span>
              {canEdit && r.status === "active" && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Assignment actions"
                    className="text-muted-foreground hover:bg-muted hover:text-brand-charcoal inline-flex items-center justify-center rounded p-1"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleStatus(r, "completed")}>
                      Mark completed
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => handleStatus(r, "removed")}>
                      Remove from job
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <AssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          jobId={jobId}
          projectId={projectId}
          onAssigned={() => {
            setAssignOpen(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

// ─── Assign dialog ───────────────────────────────────────────────────────────

function AssignDialog({
  open,
  onOpenChange,
  jobId,
  projectId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  jobId: string;
  projectId: string;
  onAssigned: () => void;
}) {
  // ONE dialog with a party-type toggle (Technician / Subcontractor) rather
  // than two separate buttons — the same "pick the kind, then the person"
  // shape as PROJ2-11's task assignee picker. Keeps a single flow for role /
  // dates / notes and makes "who's on this job" one action.
  const [partyType, setPartyType] = useState<"tech" | "sub">("tech");
  const [techId, setTechId] = useState("");
  const [subId, setSubId] = useState("");
  const [role, setRole] = useState<DbAssignmentRole>("crew");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [agreementId, setAgreementId] = useState("none");
  const [notes, setNotes] = useState("");
  const [subs, setSubs] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [techs, setTechs] = useState<AssignableTech[]>([]);
  const [workOrders, setWorkOrders] = useState<{ id: string; agreement_number: string; title: string }[]>([]);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPartyType("tech"); setTechId(""); setSubId(""); setRole("crew");
      setStartDate(""); setEndDate(""); setAgreementId("none"); setNotes("");
      setEligibility(null); setWorkOrders([]);
      listAssignableTechsAction().then((r) => r.ok && setTechs(r.data));
      listActiveSubcontractorOptionsAction().then((r) => r.ok && setSubs(r.data));
    }
  }, [open]);

  // Compliance eligibility + linkable work orders apply to the SUB path only.
  useEffect(() => {
    setEligibility(null);
    setAgreementId("none");
    setWorkOrders([]);
    if (partyType !== "sub" || !subId) return;
    getAssignmentEligibilityAction(subId).then((r) => r.ok && setEligibility(r.data));
    listLinkableWorkOrdersAction(jobId, subId).then((r) => r.ok && setWorkOrders(r.data));
  }, [partyType, subId, jobId]);

  const blocked = partyType === "sub" && eligibility != null && !eligibility.ok;
  const datesInvalid = startDate !== "" && endDate !== "" && endDate < startDate;
  const noParty = partyType === "tech" ? !techId : !subId;
  const invalid = noParty || blocked || datesInvalid || saving;

  const handleAssign = async () => {
    setSaving(true);
    try {
      const res = await createAssignmentAction({
        projectId,
        jobId,
        techId: partyType === "tech" ? techId : null,
        subcontractorId: partyType === "sub" ? subId : null,
        agreementId: partyType === "sub" && agreementId !== "none" ? agreementId : null,
        role,
        startDate: startDate || null,
        endDate: endDate || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        if (res.reasons) toast.error(`Blocked: ${res.reasons.join(" ")}`);
        else toast.error(res.error);
        return;
      }
      toast.success(partyType === "tech" ? "Technician assigned" : "Subcontractor assigned");
      onAssigned();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign to job</DialogTitle>
          <DialogDescription>
            Put an in-house technician or a subcontractor on this job. A
            subcontractor needs current WSIB clearance and liability insurance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Party-type toggle */}
          <div className="flex gap-1">
            <Button type="button" size="xs" variant={partyType === "tech" ? "secondary" : "outline"} onClick={() => setPartyType("tech")}>
              <User className="mr-1 h-3.5 w-3.5" /> Technician
            </Button>
            <Button type="button" size="xs" variant={partyType === "sub" ? "secondary" : "outline"} onClick={() => setPartyType("sub")}>
              <Building2 className="mr-1 h-3.5 w-3.5" /> Subcontractor
            </Button>
          </div>

          {partyType === "tech" ? (
            <Field label="Technician">
              <Select value={techId} onValueChange={(v) => setTechId(v ?? "")}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select an active technician" />
                </SelectTrigger>
                <SelectContent>
                  {techs.map((t) => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Subcontractor">
              <Select value={subId} onValueChange={(v) => setSubId(v ?? "")}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select an active subcontractor" />
                </SelectTrigger>
                <SelectContent>
                  {subs.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {blocked && eligibility != null && !eligibility.ok && (
            <div className="border-destructive/40 bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-destructive rounded-md border px-3 py-2 text-xs">
              <p className="inline-flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> This subcontractor can&rsquo;t be assigned:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {eligibility!.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <p className="mt-1">
                <Link href={`/subcontractors/${subId}`} className="underline">
                  Update their compliance documents
                </Link>{" "}
                then try again.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Field label="Role">
              <Select value={role} onValueChange={(v) => setRole((v ?? "crew") as DbAssignmentRole)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="End date">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>
          {datesInvalid && (
            <p className="text-destructive text-[11px]">End date can&rsquo;t be before the start date.</p>
          )}

          {workOrders.length > 0 && (
            <Field label="Link a work order (optional)">
              <Select value={agreementId} onValueChange={(v) => setAgreementId(v ?? "none")}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked work order</SelectItem>
                  {workOrders.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.agreement_number} — {w.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAssign} disabled={invalid}>
            {saving ? "Assigning…" : "Assign"}
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
