"use client";

// PROJ2-19 — the Bonds & insurance card on the project detail page. Shows the
// OPERATIONAL status AND the DERIVED expiry state SEPARATELY, so an
// active-but-expired bond is unmistakable (status "Active" + red "Expired"
// badge side by side). Certificate upload rides the signed-URL flow
// (entity_type='project_bond').

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
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
  listBondsForProjectAction,
  createBondAction,
  updateBondAction,
  setBondStatusAction,
  deleteBondAction,
} from "@/app/(app)/projects/warranty-bond-actions";
import { createAttachment, getSignedDownloadUrlAction } from "@/app/(app)/attachments/actions";
import { uploadViaSignedUrl } from "@/lib/attachments/upload-client";
import type { BondRow } from "@/lib/api/project-bonds";
import type { DbBondStatus, DbBondType } from "@/lib/types/database";
import { ExpiryBadge } from "@/components/modules/projects/ExpiryBadge";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const BOND_TYPES: DbBondType[] = [
  "performance", "labour_material", "bid", "maintenance",
  "liability_insurance", "builders_risk", "other",
];
const BOND_TYPE_LABEL: Record<DbBondType, string> = {
  performance: "Performance bond",
  labour_material: "Labour & material bond",
  bid: "Bid bond",
  maintenance: "Maintenance bond",
  liability_insurance: "Liability insurance",
  builders_risk: "Builders' risk",
  other: "Other",
};
const STATUSES: DbBondStatus[] = ["active", "expired", "released", "cancelled"];
const STATUS_TONE: Record<DbBondStatus, string> = {
  active: "bg-[color-mix(in_oklab,var(--brand-navy)_15%,transparent)] text-brand-navy",
  expired: "bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-destructive",
  released: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};
const STATUS_LABEL: Record<DbBondStatus, string> = {
  active: "Active", expired: "Expired", released: "Released", cancelled: "Cancelled",
};

export function BondsCard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<BondRow[]>([]);
  const [editing, setEditing] = useState<BondRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    listBondsForProjectAction(projectId).then((res) => {
      if (res.ok) setRows(res.data);
    });
  };
  useEffect(load, [projectId]);

  const handleStatus = async (b: BondRow, status: DbBondStatus) => {
    const res = await setBondStatusAction(b.id, projectId, status);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    load();
  };

  const handleDelete = async (b: BondRow) => {
    const res = await deleteBondAction(b.id, projectId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    load();
    toast.success("Bond removed");
  };

  const handleDownload = async (attachmentId: string) => {
    const res = await getSignedDownloadUrlAction({ attachmentId });
    if (res.ok) window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    else toast.error(res.error);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="nx-eyebrow-soft">Bonds &amp; insurance</p>
        {canEdit && (
          <Button type="button" size="xs" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add bond
          </Button>
        )}
      </div>
      <Card className="p-0 shadow-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground p-4 text-xs">No bonds or insurance recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] uppercase">Type</TableHead>
                  <TableHead className="text-[11px] uppercase">Provider / policy</TableHead>
                  <TableHead className="text-right text-[11px] uppercase">Coverage</TableHead>
                  <TableHead className="text-[11px] uppercase">Effective → Expiry</TableHead>
                  <TableHead className="text-[11px] uppercase">Status</TableHead>
                  <TableHead className="text-[11px] uppercase">Expiry</TableHead>
                  <TableHead className="text-[11px] uppercase">Cert</TableHead>
                  {canEdit && <TableHead className="text-[11px] uppercase" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => {
                  // The alarm: operationally active, but derived-expired.
                  const mismatch = b.status === "active" && b.state === "expired";
                  return (
                    <TableRow key={b.id} className={cn(mismatch && "border-l-2 border-l-red-500")}>
                      <TableCell className="text-brand-charcoal text-xs font-medium">
                        {BOND_TYPE_LABEL[b.bond_type]}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{b.provider ?? "—"}</div>
                        {b.policy_number && <div className="text-muted-foreground font-mono text-[10px]">{b.policy_number}</div>}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {b.coverage_amount != null ? formatCurrency(Number(b.coverage_amount)) : "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {b.effective_date ?? "—"} → {b.expiry_date ?? "—"}
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Select value={b.status} onValueChange={(v) => v && handleStatus(b, v as DbBondStatus)}>
                            <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (<SelectItem key={s} value={s} className="text-xs">{STATUS_LABEL[s]}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_TONE[b.status])}>
                            {STATUS_LABEL[b.status]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell><ExpiryBadge state={b.state} /></TableCell>
                      <TableCell className="text-xs">
                        {b.attachment_id ? (
                          <button type="button" onClick={() => handleDownload(b.attachment_id!)} className="text-brand-navy inline-flex items-center gap-1 hover:underline">
                            <Download className="h-3 w-3" /> {b.attachment_filename ?? "cert"}
                          </button>
                        ) : "—"}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => setEditing(b)} className="text-muted-foreground hover:text-brand-charcoal" aria-label="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDelete(b)} className="text-muted-foreground hover:text-red-600" aria-label="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {canEdit && (creating || editing) && (
        <BondDialog
          open
          bond={editing}
          projectId={projectId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function BondDialog({
  open,
  bond,
  projectId,
  onClose,
  onSaved,
}: {
  open: boolean;
  bond: BondRow | null;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bondType, setBondType] = useState<DbBondType>(bond?.bond_type ?? "performance");
  const [provider, setProvider] = useState(bond?.provider ?? "");
  const [policyNumber, setPolicyNumber] = useState(bond?.policy_number ?? "");
  const [coverage, setCoverage] = useState(bond?.coverage_amount != null ? String(bond.coverage_amount) : "");
  const [premium, setPremium] = useState(bond?.premium_amount != null ? String(bond.premium_amount) : "");
  const [effective, setEffective] = useState(bond?.effective_date ?? "");
  const [expiry, setExpiry] = useState(bond?.expiry_date ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const datesInvalid = useMemo(
    () => effective !== "" && expiry !== "" && expiry < effective,
    [effective, expiry]
  );

  const handleSave = async () => {
    if (datesInvalid) {
      toast.error("Expiry can't be before the effective date.");
      return;
    }
    setSaving(true);
    try {
      // Upload the certificate first (upload-then-save; a failed upload never
      // saves an orphan reference) — the #310 lesson.
      let attachmentId: string | null = bond?.attachment_id ?? null;
      if (file) {
        const up = await uploadViaSignedUrl({ entityType: "project_bond", entityId: projectId, file });
        if (!up.ok) {
          toast.error(up.error);
          return;
        }
        const att = await createAttachment("project_bond", projectId, "Bonds", {
          path: up.path, filename: file.name, contentType: file.type, size: file.size,
        });
        if (!att.ok) {
          toast.error(att.error);
          return;
        }
        attachmentId = att.data.id;
      }
      const payload = {
        bondType,
        provider: provider.trim() || null,
        policyNumber: policyNumber.trim() || null,
        coverageAmount: coverage.trim() === "" ? null : Number(coverage),
        premiumAmount: premium.trim() === "" ? null : Number(premium),
        effectiveDate: effective || null,
        expiryDate: expiry || null,
        attachmentId,
      };
      const res = bond
        ? await updateBondAction(bond.id, projectId, payload)
        : await createBondAction({ projectId, ...payload });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(bond ? "Bond updated" : "Bond added");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{bond ? "Edit bond / insurance" : "Add bond / insurance"}</DialogTitle>
          <DialogDescription>Track a bond or policy with its coverage and expiry.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={bondType} onValueChange={(v) => setBondType((v ?? "performance") as DbBondType)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOND_TYPES.map((t) => (<SelectItem key={t} value={t}>{BOND_TYPE_LABEL[t]}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Provider (surety / insurer)">
              <Input value={provider} onChange={(e) => setProvider(e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Policy #">
              <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Coverage">
              <Input value={coverage} inputMode="decimal" onChange={(e) => setCoverage(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Premium">
              <Input value={premium} inputMode="decimal" onChange={(e) => setPremium(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Effective date">
              <Input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
            <Field label="Expiry date">
              <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-9 text-sm tabular-nums" />
            </Field>
          </div>
          {datesInvalid && <p className="text-destructive text-[11px]">Expiry can&rsquo;t be before the effective date.</p>}
          <Field label="Certificate (PDF or image)">
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-muted-foreground block w-full text-xs file:mr-3 file:rounded-md file:border file:border-[var(--border)] file:bg-card file:px-3 file:py-1.5 file:text-xs"
            />
            {file && <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]"><Upload className="h-3 w-3" /> {file.name}</span>}
            {bond?.attachment_filename && !file && (
              <span className="text-muted-foreground text-[11px]">Current: {bond.attachment_filename}</span>
            )}
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving || datesInvalid}>
            {saving ? "Saving…" : bond ? "Save changes" : "Add bond"}
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
