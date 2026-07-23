"use client";

// SUB-2 — the Compliance documents card on the subcontractor detail page. A
// summary strip (expired / expiring / valid counts + missing-required chips), a
// table of docs with derived state badges and signed-URL download, and an
// add/edit dialog whose file upload rides the shared signed-URL flow
// (upload → attachment id → save row; a failed upload never creates a row).

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
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
  listComplianceDocsAction,
  createComplianceDocAction,
  deleteComplianceDocAction,
} from "@/app/(app)/subcontractors/actions";
import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import { createAttachment } from "@/app/(app)/attachments/actions";
import { downloadAttachment } from "@/lib/attachments/download-client";
import type { ComplianceDocRow } from "@/lib/api/subcontractor-compliance";
import type { ComplianceSummary } from "@/lib/subcontractors/compliance-status";
import {
  complianceState,
  daysUntilExpiry,
  DOC_TYPE_LABEL,
  COVERAGE_DOC_TYPES,
} from "@/lib/subcontractors/compliance-status";
import type { DbComplianceDocType } from "@/lib/types/database";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATE_BADGE: Record<string, { label: string; cls: string }> = {
  no_expiry: { label: "No expiry", cls: "bg-muted text-muted-foreground" },
  valid: { label: "Valid", cls: "bg-[color-mix(in_oklab,var(--brand-status-green)_18%,transparent)] text-[var(--brand-status-green)]" },
  expiring_soon: { label: "Expiring", cls: "bg-[color-mix(in_oklab,#C9A24B_22%,transparent)] text-[#8a6d1f]" },
  expired: { label: "Expired", cls: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive" },
};

const DOC_TYPES: DbComplianceDocType[] = [
  "wsib_clearance",
  "liability_insurance",
  "auto_insurance",
  "license",
  "qualification",
  "agreement",
  "other",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ComplianceDocsCard({
  subcontractorId,
  canEdit,
  onSummary,
}: {
  subcontractorId: string;
  canEdit: boolean;
  onSummary?: (s: ComplianceSummary) => void;
}) {
  const [docs, setDocs] = useState<ComplianceDocRow[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ComplianceDocRow | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    listComplianceDocsAction(subcontractorId).then((res) => {
      if (!res.ok) return;
      setDocs(res.data.docs);
      setSummary(res.data.summary);
      onSummary?.(res.data.summary);
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [subcontractorId]);

  const handleDelete = (doc: ComplianceDocRow) =>
    startTransition(async () => {
      const res = await deleteComplianceDocAction(doc.id, subcontractorId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirmDelete(null);
      load();
      toast.success("Document removed");
    });

  const handleDownload = async (doc: ComplianceDocRow) => {
    if (!doc.attachment_id) return;
    const res = await downloadAttachment({ attachmentId: doc.attachment_id });
    if (!res.ok) toast.error(res.error);
  };

  return (
    <Card className="space-y-4 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-brand-navy font-serif text-lg">Compliance documents</h3>
        {canEdit && (
          <Button type="button" size="xs" onClick={() => setAddOpen(true)} disabled={pending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add document
          </Button>
        )}
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="flex flex-wrap items-center gap-2">
          <CountChip label="Expired" n={summary.expired} tone="text-destructive" />
          <CountChip label="Expiring soon" n={summary.expiring_soon} tone="text-[#8a6d1f]" />
          <CountChip label="Valid" n={summary.valid} tone="text-[var(--brand-status-green)]" />
          {summary.missing_required.map((t) => (
            <span
              key={t}
              className="text-destructive border-destructive/40 rounded-full border px-2 py-0.5 text-[10px] font-medium"
            >
              Missing: {DOC_TYPE_LABEL[t]}
            </span>
          ))}
        </div>
      )}

      {docs.length === 0 ? (
        <p className="text-muted-foreground text-[11px]">
          No compliance documents on file.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Type</TableHead>
                <TableHead className="text-[11px] uppercase">Reference</TableHead>
                <TableHead className="text-[11px] uppercase">Issued</TableHead>
                <TableHead className="text-[11px] uppercase">Expires</TableHead>
                <TableHead className="text-[11px] uppercase">Coverage</TableHead>
                <TableHead className="text-[11px] uppercase">State</TableHead>
                <TableHead className="text-[11px] uppercase">File</TableHead>
                {canEdit && <TableHead className="text-[11px] uppercase" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => {
                const st = complianceState(d, today());
                const days = daysUntilExpiry(d, today());
                const badge = STATE_BADGE[st];
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">
                      <div className="text-brand-charcoal font-medium">{DOC_TYPE_LABEL[d.doc_type]}</div>
                      {d.title && <div className="text-muted-foreground text-[10px]">{d.title}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{d.issuer ?? "—"}</div>
                      {d.reference_number && (
                        <div className="text-muted-foreground font-mono text-[10px]">{d.reference_number}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{d.issued_date ?? "—"}</TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {d.expiry_date ?? "—"}
                      {days != null && st !== "expired" && (
                        <span className="text-muted-foreground ml-1 text-[10px]">({days}d)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {d.coverage_amount != null ? formatCurrency(d.coverage_amount) : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", badge.cls)}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.attachment_id ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(d)}
                          className="text-brand-navy inline-flex items-center gap-1 hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          {d.attachment_filename ?? "file"}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(d)}
                          disabled={pending}
                          className="text-muted-foreground hover:text-red-600"
                          aria-label="Delete document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {canEdit && (
        <AddDocDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          subcontractorId={subcontractorId}
          onSaved={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}

      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              This removes the record and its uploaded file.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete)} disabled={pending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CountChip({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px]">
      {label} <span className={cn("font-semibold tabular-nums", n > 0 ? tone : "text-muted-foreground")}>{n}</span>
    </span>
  );
}

// ─── Add dialog ──────────────────────────────────────────────────────────────

function AddDocDialog({
  open,
  onOpenChange,
  subcontractorId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subcontractorId: string;
  onSaved: () => void;
}) {
  const [docType, setDocType] = useState<DbComplianceDocType>("wsib_clearance");
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [reference, setReference] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [coverage, setCoverage] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDocType("wsib_clearance");
      setTitle(""); setIssuer(""); setReference(""); setIssuedDate("");
      setExpiryDate(""); setCoverage(""); setNotes(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  const showsCoverage = useMemo(() => COVERAGE_DOC_TYPES.includes(docType), [docType]);
  const datesInvalid = issuedDate !== "" && expiryDate !== "" && expiryDate < issuedDate;

  const handleSave = async () => {
    if (datesInvalid) {
      toast.error("Expiry can't be before the issue date.");
      return;
    }
    setSaving(true);
    try {
      // Upload first — the doc row is only created if the file lands (#310).
      let attachmentId: string | null = null;
      if (file) {
        const up = await uploadViaSignedUrl({
          entityType: "subcontractor_doc",
          entityId: subcontractorId,
          file,
        });
        if (!up.ok) {
          toast.error(up.error);
          return;
        }
        const att = await createAttachment(
          "subcontractor_doc",
          subcontractorId,
          "Compliance",
          { path: up.path, filename: file.name, contentType: file.type, size: file.size }
        );
        if (!att.ok) {
          toast.error(att.error);
          return;
        }
        attachmentId = att.data.id;
      }

      const res = await createComplianceDocAction({
        subcontractorId,
        docType,
        title: title.trim() || null,
        issuer: issuer.trim() || null,
        referenceNumber: reference.trim() || null,
        issuedDate: issuedDate || null,
        expiryDate: expiryDate || null,
        coverageAmount: showsCoverage && coverage.trim() !== "" ? Number(coverage) : null,
        attachmentId,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Document added");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add compliance document</DialogTitle>
          <DialogDescription>
            WSIB clearance, insurance certificate, licence or qualification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Type">
            <Select value={docType} onValueChange={(v) => setDocType((v ?? "wsib_clearance") as DbComplianceDocType)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{DOC_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title (optional)">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Issuer">
              <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="h-9 text-sm" placeholder="WSIB, insurer…" />
            </Field>
          </div>
          <Field label="Reference / policy number">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-9 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issued date">
              <Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Expiry date">
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="h-9 text-sm tabular-nums" />
              <span className="text-muted-foreground text-[11px]">Leave blank if it doesn&rsquo;t expire.</span>
            </Field>
          </div>
          {datesInvalid && (
            <p className="text-destructive text-[11px]">Expiry can&rsquo;t be before the issue date.</p>
          )}
          {showsCoverage && (
            <Field label="Coverage amount">
              <Input value={coverage} inputMode="decimal" onChange={(e) => setCoverage(e.target.value)} className="h-9 text-sm tabular-nums" placeholder="e.g. 2000000" />
            </Field>
          )}
          <Field label="File (PDF or image, max 20 MB)">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-muted-foreground block w-full text-xs file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-card file:px-3 file:py-1.5 file:text-xs"
            />
            {file && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                <Upload className="h-3 w-3" /> {file.name}
              </span>
            )}
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || datesInvalid}>
            {saving ? "Saving…" : "Add document"}
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
