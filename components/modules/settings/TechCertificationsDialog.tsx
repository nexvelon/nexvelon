"use client";

// SCHED-1 — a technician's certifications (the tech side of the dispatch cert
// hard-block). Mirrors the SUB-2 compliance card: list with valid/expiring/
// expired badges + add + delete. Cert validity is DERIVED from expiry_date via
// the shared expiry-state vocabulary — never stored. Files are out of scope for
// this v1 surface (the schema/API carry attachment_id for a later add).

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  listTechCertificationsAction,
  createTechCertificationAction,
  deleteTechCertificationAction,
} from "@/app/(app)/scheduling/actions";
import {
  KNOWN_CERT_TYPES,
  certTypeLabel,
} from "@/lib/scheduling/tech-eligibility";
// DES-2 — the panel warns at 60d renewal lead time (the dispatch hard-block is
// expired-only, so this window is informational).
import { TECH_CERT_WARN_DAYS } from "@/lib/scheduling/tech-cert-status";
import { expiryState, type ExpiryState } from "@/lib/expiry-state";
import { businessDateISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DbTech, DbTechCertification } from "@/lib/types/database";

const STATE_BADGE: Record<ExpiryState, { label: string; cls: string }> = {
  no_expiry: { label: "No expiry", cls: "bg-slate-100 text-slate-600" },
  active: { label: "Valid", cls: "bg-emerald-100 text-emerald-700" },
  expiring_soon: { label: "Expiring soon", cls: "bg-amber-100 text-amber-700" },
  expired: { label: "Expired", cls: "bg-red-100 text-red-700" },
};

export function TechCertificationsDialog({
  tech,
  open,
  onClose,
}: {
  tech: DbTech;
  open: boolean;
  onClose: () => void;
}) {
  const [certs, setCerts] = useState<DbTechCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [certType, setCertType] = useState<string>(KNOWN_CERT_TYPES[0]);
  const [certName, setCertName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [pending, start] = useTransition();
  const today = businessDateISO();

  const load = () =>
    listTechCertificationsAction(tech.id).then((r) => {
      if (r.ok) setCerts(r.data);
      setLoading(false);
    });
  useEffect(() => {
    if (open) { setLoading(true); load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tech.id]);

  const add = () =>
    start(async () => {
      const res = await createTechCertificationAction({
        techId: tech.id,
        certType: certType.trim(),
        certName: certName.trim() || null,
        expiryDate: expiry || null,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Certification added");
      setCertName("");
      setExpiry("");
      load();
    });

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteTechCertificationAction(id);
      if (!res.ok) { toast.error(res.error); return; }
      load();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tech.name} — certifications</DialogTitle>
          <DialogDescription>
            A technician can only be booked to a job whose required certifications
            they hold, valid (non-expired).
          </DialogDescription>
        </DialogHeader>

        {/* Add form */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">Type</span>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value)}
              className="mt-1 block rounded-md border bg-card px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--brand-border)" }}
            >
              {KNOWN_CERT_TYPES.map((t) => (
                <option key={t} value={t}>{certTypeLabel(t)}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">Name (optional)</span>
            <Input value={certName} onChange={(e) => setCertName(e.target.value)} className="mt-1 h-9 w-40" placeholder="e.g. EntraPass" />
          </label>
          <label className="text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">Expiry</span>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-1 h-9" />
          </label>
          <Button type="button" size="sm" onClick={add} disabled={pending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </div>

        {/* List */}
        <div className="mt-2 max-h-64 overflow-y-auto">
          {loading ? (
            <p className="text-muted-foreground text-xs">Loading…</p>
          ) : certs.length === 0 ? (
            <p className="text-muted-foreground text-xs">No certifications recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {certs.map((c) => {
                const state = expiryState(c.expiry_date, today, TECH_CERT_WARN_DAYS);
                const badge = STATE_BADGE[state];
                return (
                  <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--brand-border)" }}>
                    <div>
                      <span style={{ color: "var(--brand-primary)" }}>{certTypeLabel(c.cert_type)}</span>
                      {c.cert_name ? <span className="text-muted-foreground"> · {c.cert_name}</span> : null}
                      <span className="text-muted-foreground">
                        {c.expiry_date ? ` · exp ${c.expiry_date}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", badge.cls)}>{badge.label}</span>
                      <button type="button" onClick={() => remove(c.id)} disabled={pending} className="text-muted-foreground hover:text-red-600" aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
