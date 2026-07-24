"use client";

// PROJ2-13 — the real Commissioning tab (the mock tabs/CommissioningTab.tsx is
// legacy dead code on the mock Project type, left untouched). A job can have
// multiple RUNS (re-tests preserve history); each run has checklist ITEMS with
// pass/fail/na results. A failed item can raise a deficiency. Sign-off captures
// a witnessed signature (the pickup-slip react-signature-canvas mechanism) and
// produces a certificate PDF.

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Plus, FileText, Download, XCircle } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listRunsForJobAction,
  getRunByIdAction,
  createRunAction,
  cancelRunAction,
  addItemAction,
  setItemResultAction,
  deleteItemAction,
  raiseDeficiencyFromItemAction,
  signOffRunAction,
  getCommissioningPdfUrlAction,
} from "@/app/(app)/projects/commissioning-actions";
import type {
  CommissioningRunRow,
  CommissioningRunDetail,
} from "@/lib/api/commissioning";
import type { DbCommissioningItemResult } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const RUN_STATUS_TONE: Record<string, string> = {
  in_progress: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy",
  completed: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]",
  signed_off: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  cancelled: "bg-muted text-muted-foreground line-through",
};
const RUN_STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  completed: "Completed",
  signed_off: "Signed off",
  cancelled: "Cancelled",
};
const RESULT_TONE: Record<DbCommissioningItemResult, string> = {
  pending: "bg-muted text-muted-foreground",
  pass: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]",
  fail: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
  na: "bg-muted text-muted-foreground",
};

export function JobCommissioningTab({
  jobId,
  projectId,
  canEdit,
}: {
  jobId: string;
  projectId: string;
  canEdit: boolean;
}) {
  const [runs, setRuns] = useState<CommissioningRunRow[]>([]);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    listRunsForJobAction(jobId).then((res) => {
      if (res.ok) setRuns(res.data);
    });
  };
  useEffect(load, [jobId]);

  const handleDownload = async (run: CommissioningRunRow) => {
    const res = await getCommissioningPdfUrlAction(run.id);
    if (res.ok && res.data.url) window.open(res.data.url, "_blank", "noopener,noreferrer");
    else toast.error(res.ok ? "No certificate yet." : res.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-brand-navy font-serif text-base">Commissioning runs</h3>
        {canEdit && (
          <Button type="button" size="xs" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New run
          </Button>
        )}
      </div>

      {runs.length === 0 ? (
        <Card className="p-6 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            No commissioning runs yet.
            {canEdit ? " Start one to record the checklist and sign off." : ""}
          </p>
        </Card>
      ) : (
        <Card className="p-0 shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Run</TableHead>
                <TableHead className="text-[11px] uppercase">Performed</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
                <TableHead className="text-[11px] uppercase">Results</TableHead>
                <TableHead className="text-[11px] uppercase" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpenRunId(r.id)}>
                  <TableCell className="text-brand-charcoal text-xs font-medium">{r.title}</TableCell>
                  <TableCell className="text-xs tabular-nums">
                    {r.performed_at ?? "—"}
                    {r.performed_by && <span className="text-muted-foreground"> · {r.performed_by}</span>}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", RUN_STATUS_TONE[r.status])}>
                      {RUN_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="text-[var(--brand-status-green)]">{r.summary.pass} pass</span>
                    {r.summary.fail > 0 && <span className="text-destructive"> · {r.summary.fail} fail</span>}
                    {r.summary.pending > 0 && <span className="text-muted-foreground"> · {r.summary.pending} pending</span>}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {r.pdf_path && (
                      <button type="button" onClick={() => handleDownload(r)} className="text-brand-navy hover:text-brand-gold" aria-label="Download certificate" title="Certificate PDF">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {canEdit && creating && (
        <CreateRunDialog
          projectId={projectId}
          jobId={jobId}
          runs={runs}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            load();
            setOpenRunId(id);
          }}
        />
      )}

      {openRunId && (
        <RunDetailDialog
          runId={openRunId}
          projectId={projectId}
          jobId={jobId}
          canEdit={canEdit}
          onClose={() => setOpenRunId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─── Create run ──────────────────────────────────────────────────────────────

function CreateRunDialog({
  projectId,
  jobId,
  runs,
  onClose,
  onCreated,
}: {
  projectId: string;
  jobId: string;
  runs: CommissioningRunRow[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("Commissioning");
  const [performedBy, setPerformedBy] = useState("");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 10));
  const [duplicateFrom, setDuplicateFrom] = useState("none");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await createRunAction({
        projectId,
        jobId,
        title: title.trim() || "Commissioning",
        performedBy: performedBy.trim() || null,
        performedAt: performedAt || null,
        duplicateFromRunId: duplicateFrom === "none" ? null : duplicateFrom,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Commissioning run started");
      onCreated(res.data.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New commissioning run</DialogTitle>
          <DialogDescription>A re-test is a new run so the history is preserved.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Performed by">
              <Input value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Performed on">
              <Input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>
          {runs.length > 0 && (
            <Field label="Copy checklist from a previous run (optional)">
              <select
                value={duplicateFrom}
                onChange={(e) => setDuplicateFrom(e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-sm"
              >
                <option value="none">Start empty</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>{r.title} — {r.performed_at ?? "no date"}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleCreate} disabled={saving || !title.trim()}>
            {saving ? "Starting…" : "Start run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Run detail ──────────────────────────────────────────────────────────────

function RunDetailDialog({
  runId,
  projectId,
  jobId,
  canEdit,
  onClose,
  onChanged,
}: {
  runId: string;
  projectId: string;
  jobId: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<CommissioningRunDetail | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newExpected, setNewExpected] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    getRunByIdAction(runId).then((res) => {
      if (res.ok) setDetail(res.data);
    });
  };
  useEffect(reload, [runId]);

  const signedOff = detail?.status === "signed_off";
  const cancelled = detail?.status === "cancelled";
  const editable = canEdit && !signedOff && !cancelled;

  const handleAddItem = async () => {
    if (!newDescription.trim()) return;
    setBusy(true);
    const res = await addItemAction(
      { runId, category: newCategory.trim() || null, description: newDescription.trim(), expectedResult: newExpected.trim() || null },
      projectId,
      jobId
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setNewCategory(""); setNewDescription(""); setNewExpected("");
    reload();
    onChanged();
  };

  const handleResult = async (id: string, result: DbCommissioningItemResult) => {
    const res = await setItemResultAction(id, result, projectId, jobId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    reload();
    onChanged();
  };

  const handleRaise = async (itemId: string) => {
    const res = await raiseDeficiencyFromItemAction(itemId, projectId, jobId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Deficiency raised from failed item");
    reload();
    onChanged();
  };

  const handleDeleteItem = async (id: string) => {
    const res = await deleteItemAction(id, projectId, jobId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    reload();
    onChanged();
  };

  const handleCancel = async () => {
    const res = await cancelRunAction(runId, projectId, jobId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    reload();
    onChanged();
  };

  const pending = detail?.summary.pending ?? 0;

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? "Commissioning run"}</DialogTitle>
            <DialogDescription>
              {detail && (
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", RUN_STATUS_TONE[detail.status])}>
                  {RUN_STATUS_LABEL[detail.status]}
                </span>
              )}
              {detail && (
                <span className="text-muted-foreground ml-2">
                  {detail.summary.pass} pass · {detail.summary.fail} fail · {detail.summary.na} n/a · {detail.summary.pending} pending
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {!detail ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] uppercase">Category</TableHead>
                      <TableHead className="text-[11px] uppercase">Test</TableHead>
                      <TableHead className="text-[11px] uppercase">Result</TableHead>
                      {editable && <TableHead className="text-[11px] uppercase" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={editable ? 4 : 3} className="text-muted-foreground py-4 text-center text-xs">
                          No items yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {detail.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="text-muted-foreground text-xs">{it.category ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <div className="text-brand-charcoal">{it.description}</div>
                          {it.expected_result && <div className="text-muted-foreground text-[10px]">Expect: {it.expected_result}</div>}
                          {it.deficiency_id && <div className="text-destructive text-[10px]">Deficiency raised</div>}
                        </TableCell>
                        <TableCell>
                          {editable ? (
                            <div className="flex gap-1">
                              {(["pass", "fail", "na"] as DbCommissioningItemResult[]).map((res) => (
                                <button
                                  key={res}
                                  type="button"
                                  onClick={() => handleResult(it.id, res)}
                                  className={cn(
                                    "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                                    it.result === res ? RESULT_TONE[res] : "text-muted-foreground border border-[var(--border)]"
                                  )}
                                >
                                  {res}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", RESULT_TONE[it.result])}>
                              {it.result}
                            </span>
                          )}
                        </TableCell>
                        {editable && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {it.result === "fail" && !it.deficiency_id && (
                                <button type="button" onClick={() => handleRaise(it.id)} className="text-destructive text-[10px] hover:underline">
                                  Raise deficiency
                                </button>
                              )}
                              <button type="button" onClick={() => handleDeleteItem(it.id)} className="text-muted-foreground hover:text-red-600" aria-label="Delete item">
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {editable && (
                <div className="grid grid-cols-[1fr_2fr_1.5fr_auto] items-end gap-2 border-t border-[var(--border)] pt-3">
                  <Field label="Category">
                    <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="h-8 text-xs" placeholder="Cameras" />
                  </Field>
                  <Field label="Test">
                    <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="h-8 text-xs" placeholder="Camera 1 records + retains" />
                  </Field>
                  <Field label="Expected">
                    <Input value={newExpected} onChange={(e) => setNewExpected(e.target.value)} className="h-8 text-xs" placeholder="30-day retention" />
                  </Field>
                  <Button type="button" size="xs" onClick={handleAddItem} disabled={busy || !newDescription.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {editable && (
              <Button type="button" variant="outline" onClick={handleCancel} className="mr-auto text-destructive">
                Cancel run
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            {editable && detail && (
              <Button
                type="button"
                onClick={() => setSignOpen(true)}
                disabled={detail.items.length === 0 || pending > 0}
                title={pending > 0 ? `${pending} item(s) still pending` : undefined}
              >
                <FileText className="mr-1 h-3.5 w-3.5" /> Sign off
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {signOpen && detail && (
        <SignOffDialog
          runId={runId}
          projectId={projectId}
          jobId={jobId}
          defaultWitness={detail.witnessed_by ?? ""}
          onClose={() => setSignOpen(false)}
          onSigned={() => {
            setSignOpen(false);
            reload();
            onChanged();
          }}
        />
      )}
    </>
  );
}

// ─── Sign-off (signature capture — the pickup-slip mechanism) ────────────────

function SignOffDialog({
  runId,
  projectId,
  jobId,
  defaultWitness,
  onClose,
  onSigned,
}: {
  runId: string;
  projectId: string;
  jobId: string;
  defaultWitness: string;
  onClose: () => void;
  onSigned: () => void;
}) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [witnessedBy, setWitnessedBy] = useState(defaultWitness);
  const [signing, setSigning] = useState(false);

  const handleSign = async () => {
    if (!signerName.trim()) {
      toast.error("Enter the signer's name.");
      return;
    }
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Please capture a signature first.");
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = pad.getTrimmedCanvas().toDataURL("image/png");
    } catch {
      dataUrl = pad.getCanvas().toDataURL("image/png");
    }
    setSigning(true);
    try {
      const res = await signOffRunAction(
        { runId, signerName: signerName.trim(), signerTitle: signerTitle.trim() || null, signatureData: dataUrl, witnessedBy: witnessedBy.trim() || null },
        projectId,
        jobId
      );
      if (!res.ok) {
        if (res.error === "items_pending") {
          toast.error(`${res.pendingCount} item(s) still pending — resolve them first.`);
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(res.warning ? `Signed off — ${res.warning}` : "Commissioning signed off");
      onSigned();
    } finally {
      setSigning(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign off commissioning</DialogTitle>
          <DialogDescription>
            Capture the witness signature. This produces the certificate PDF and locks the run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signer name">
              <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Signer title">
              <Input value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} className="h-9 text-sm" placeholder="Consultant / Client" />
            </Field>
          </div>
          <Field label="Witnessed by">
            <Input value={witnessedBy} onChange={(e) => setWitnessedBy(e.target.value)} className="h-9 text-sm" />
          </Field>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-[11px] uppercase tracking-wide">Signature</Label>
              <button type="button" onClick={() => sigRef.current?.clear()} className="text-brand-gold text-[11px] font-medium">Clear</button>
            </div>
            <div className="w-full overflow-hidden rounded-md border bg-white" style={{ borderColor: "var(--border)" }}>
              <SignatureCanvas
                ref={sigRef}
                penColor="#1a2332"
                canvasProps={{ className: "w-full", style: { width: "100%", height: 160, touchAction: "none" } }}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={signing}>Cancel</Button>
          <Button type="button" onClick={handleSign} disabled={signing}>
            {signing ? "Signing…" : "Sign & finish"}
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
