"use client";

// RECUR-1 — create / edit a service contract. Cadence and generation mode are
// explicit, explained choices (the help text under each makes clear what
// "automatic" will do before it's selected).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  createContractAction,
  updateContractAction,
} from "@/app/(app)/contracts/actions";
import {
  OPCO_OPTIONS,
  CADENCE_OPTIONS,
  BILLING_MODE_OPTIONS,
  BILLING_TIMING_OPTIONS,
} from "./shared";
import {
  describeLateFeeTerms,
  type LateFeeMode,
  type LateFeeTerms,
} from "@/lib/recurring/late-fees";
import type { ServiceContractInput } from "@/lib/api/service-contracts";
import type { ServiceContractDetail } from "@/lib/api/service-contracts";
import type {
  ServiceContractCadence,
  ServiceContractBillingMode,
  ServiceContractBillingTiming,
} from "@/lib/types/database";

export interface ClientOption {
  id: string;
  name: string;
  defaultOpco: string | null;
}
export interface SiteOption {
  id: string;
  name: string;
  clientId: string;
}

type Mode = { kind: "create" } | { kind: "edit"; contract: ServiceContractDetail };

const SELECT_CLS =
  "mt-1.5 w-full rounded-md border border-[var(--border)] bg-card px-3 py-2 text-sm";

interface LineDraft {
  description: string;
  amount: string;
}

function seedLines(mode: Mode): LineDraft[] {
  if (mode.kind === "edit" && mode.contract.lines.length > 0) {
    return mode.contract.lines.map((l) => ({
      description: l.description,
      amount: String(l.amount),
    }));
  }
  return [{ description: "", amount: "" }];
}

export function ContractFormDrawer({
  open,
  onClose,
  onSaved,
  mode,
  clientOptions,
  siteOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: Mode;
  clientOptions: ClientOption[];
  siteOptions: SiteOption[];
}) {
  const isEdit = mode.kind === "edit";
  const c = mode.kind === "edit" ? mode.contract.contract : null;

  const [name, setName] = useState(c?.name ?? "");
  const [opco, setOpco] = useState(c?.opco ?? OPCO_OPTIONS[0].value);
  const [clientId, setClientId] = useState(c?.client_id ?? "");
  const [siteId, setSiteId] = useState(c?.site_id ?? "");
  const [cadence, setCadence] = useState<ServiceContractCadence>(c?.cadence ?? "monthly");
  const [customDays, setCustomDays] = useState(String(c?.custom_interval_days ?? ""));
  const [timing, setTiming] = useState<ServiceContractBillingTiming>(c?.billing_timing ?? "advance");
  const [billingMode, setBillingMode] = useState<ServiceContractBillingMode>(
    c?.billing_mode ?? "draft_for_approval"
  );
  const [startDate, setStartDate] = useState(c?.start_date ?? "");
  const [endDate, setEndDate] = useState(c?.end_date ?? "");
  const [taxRate, setTaxRate] = useState(String(c?.tax_rate ?? 13));
  const [taxExempt, setTaxExempt] = useState(c?.tax_exempt ?? false);
  const [notes, setNotes] = useState(c?.notes ?? "");
  // RECUR-2 — payment + late-fee terms (opt-in; default none).
  const [paymentTermsDays, setPaymentTermsDays] = useState(
    c?.payment_terms_days != null ? String(c.payment_terms_days) : ""
  );
  const [lateFeeMode, setLateFeeMode] = useState<LateFeeMode>(c?.late_fee_mode ?? "none");
  const [lateFeePct, setLateFeePct] = useState(c?.late_fee_monthly_pct != null ? String(c.late_fee_monthly_pct) : "");
  const [lateFeeFlat, setLateFeeFlat] = useState(c?.late_fee_flat_amount != null ? String(c.late_fee_flat_amount) : "");
  const [lateFeeGrace, setLateFeeGrace] = useState(String(c?.late_fee_grace_days ?? 0));
  const lateFee: LateFeeTerms = {
    mode: lateFeeMode,
    monthlyPct: lateFeeMode === "percent_monthly" ? parseFloat(lateFeePct) || 0 : null,
    flatAmount: lateFeeMode === "flat" ? parseFloat(lateFeeFlat) || 0 : null,
    graceDays: parseInt(lateFeeGrace, 10) || 0,
  };
  const [lines, setLines] = useState<LineDraft[]>(() => seedLines(mode));
  const [saving, setSaving] = useState(false);

  const sitesForClient = useMemo(
    () => siteOptions.filter((s) => s.clientId === clientId),
    [siteOptions, clientId]
  );

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const onPickClient = (id: string) => {
    setClientId(id);
    setSiteId(""); // reset site when the client changes
    const opt = clientOptions.find((o) => o.id === id);
    if (opt?.defaultOpco) setOpco(opt.defaultOpco);
  };

  async function handleSave() {
    const input: ServiceContractInput = {
      opco,
      clientId,
      siteId: siteId || null,
      name,
      cadence,
      customIntervalDays: cadence === "custom" ? parseInt(customDays, 10) || null : null,
      billingTiming: timing,
      billingMode,
      startDate,
      endDate: endDate || null,
      taxRate: parseFloat(taxRate) || 0,
      taxExempt,
      notes: notes || null,
      paymentTermsDays: paymentTermsDays.trim() === "" ? null : parseInt(paymentTermsDays, 10),
      lateFee,
      lines: lines
        .filter((l) => l.description.trim() !== "")
        .map((l) => ({ description: l.description.trim(), amount: parseFloat(l.amount) || 0 })),
    };
    setSaving(true);
    const res = isEdit
      ? await updateContractAction(mode.contract.contract.id, input)
      : await createContractAction(input);
    setSaving(false);
    if (res.ok) {
      toast.success(isEdit ? "Contract updated" : "Contract created (draft)");
      onSaved();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <SheetContent side="right" className="w-[520px] overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">
            {isEdit ? "Edit contract" : "New service contract"}
          </SheetTitle>
          <SheetDescription>
            A recurring-billing agreement. It starts as a draft — activate it to begin billing.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 px-4 pb-10">
          <Field label="Contract name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fire monitoring — 200 King St" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Client" required>
              <select className={SELECT_CLS} value={clientId} onChange={(e) => onPickClient(e.target.value)}>
                <option value="">Select a client…</option>
                {clientOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Site (optional)">
              <select
                className={SELECT_CLS}
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                disabled={!clientId}
              >
                <option value="">Whole client (no specific site)</option>
                {sitesForClient.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Operating company (files separately)" required>
            <select className={SELECT_CLS} value={opco} onChange={(e) => setOpco(e.target.value)}>
              {OPCO_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {/* Cadence */}
          <Field label="Billing frequency" required>
            <select
              className={SELECT_CLS}
              value={cadence}
              onChange={(e) => setCadence(e.target.value as ServiceContractCadence)}
            >
              {CADENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {cadence === "custom" && (
              <Input
                type="number"
                min={1}
                className="mt-2"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                placeholder="Interval in days (e.g. 45)"
              />
            )}
          </Field>

          {/* Billing timing */}
          <Field label="Billing timing">
            <select
              className={SELECT_CLS}
              value={timing}
              onChange={(e) => setTiming(e.target.value as ServiceContractBillingTiming)}
            >
              {BILLING_TIMING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {BILLING_TIMING_OPTIONS.find((o) => o.value === timing)?.help}
            </p>
          </Field>

          {/* Generation mode — explained */}
          <Field label="How invoices are generated" required>
            <select
              className={SELECT_CLS}
              value={billingMode}
              onChange={(e) => setBillingMode(e.target.value as ServiceContractBillingMode)}
            >
              {BILLING_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {BILLING_MODE_OPTIONS.find((o) => o.value === billingMode)?.help}
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" required>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date (optional)">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tax rate (%)">
              <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={taxExempt} />
            </Field>
            <Field label="Tax exempt">
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={taxExempt} onChange={(e) => setTaxExempt(e.target.checked)} />
                No HST on this contract
              </label>
            </Field>
          </div>

          {/* Pricing lines */}
          <div>
            <Label>Pricing lines</Label>
            <div className="mt-1.5 space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder="e.g. Fire monitoring"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    className="w-28"
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: e.target.value })}
                    placeholder="0.00"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { description: "", amount: "" }])}>
                + Add line
              </Button>
              <span className="text-brand-charcoal text-sm font-medium tabular-nums">
                Per period: ${total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* RECUR-2 — payment + late-fee terms. A late fee needs payment terms
              (no due date → nothing can be late). */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment terms (days)">
              <Input
                type="number"
                min={0}
                step={1}
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(e.target.value)}
                placeholder="e.g. 30 — blank = no due date"
              />
            </Field>
            <Field label="Late fee">
              <select className={SELECT_CLS} value={lateFeeMode} onChange={(e) => setLateFeeMode(e.target.value as LateFeeMode)}>
                <option value="none">None</option>
                <option value="percent_monthly">Interest — % per month</option>
                <option value="flat">Flat fee, once per invoice</option>
              </select>
            </Field>
            {lateFeeMode === "percent_monthly" && (
              <Field label="% per month">
                <Input type="number" min={0} step="0.01" value={lateFeePct} onChange={(e) => setLateFeePct(e.target.value)} />
              </Field>
            )}
            {lateFeeMode === "flat" && (
              <Field label="Flat fee ($)">
                <Input type="number" min={0} step="0.01" value={lateFeeFlat} onChange={(e) => setLateFeeFlat(e.target.value)} />
              </Field>
            )}
            {lateFeeMode !== "none" && (
              <Field label="Grace days">
                <Input type="number" min={0} step={1} value={lateFeeGrace} onChange={(e) => setLateFeeGrace(e.target.value)} />
              </Field>
            )}
          </div>
          {lateFeeMode !== "none" && (
            <p className="text-muted-foreground -mt-2 text-xs">
              {describeLateFeeTerms(lateFee)} Proposed daily for overdue invoices; charged only when approved. Only
              charge a client late fees they agreed to.
            </p>
          )}

          <Field label="Notes (internal)">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => !saving && onClose()} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create contract"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
