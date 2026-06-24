"use client";

// POLISH-52 — inline read view of every client field in a wide responsive grid,
// with per-section edit-in-place (pencil → inputs → Save/Cancel). Only one
// section edits at a time. Saves reuse the existing partial updateClientAction
// (which validates + logs the diff). The Sites/Contacts/Attachments lists and
// the full "Edit all" drawer are unchanged and live in ClientDetailView.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateClientAction } from "../actions";
import type {
  DbClientWithCounts,
  DbClientUpdate,
  DbClientStatus,
  DbClientPaymentTerms,
  DbClientPaymentMethod,
  DbClientCurrency,
} from "@/lib/types/database";

const STATUSES: DbClientStatus[] = ["Active", "Inactive", "Prospect", "Lost"];
const TERMS: { value: DbClientPaymentTerms; label: string }[] = [
  { value: "due_on_receipt", label: "Due on receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
  { value: "custom", label: "Custom" },
];
const METHODS: { value: DbClientPaymentMethod; label: string }[] = [
  { value: "eft", label: "EFT" },
  { value: "e_transfer", label: "E-Transfer" },
  { value: "wire", label: "Wire" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque (legacy)" },
];
const CURRENCIES: DbClientCurrency[] = ["CAD", "USD", "AED", "INR", "EUR"];

/** Read value with em-dash fallback. */
function v(x: unknown): string {
  const s = x == null ? "" : String(x);
  return s.trim() === "" ? "—" : s;
}

/** True when every address part is empty (used for inheritance display). */
function addrEmpty(parts: Array<string | null>): boolean {
  return parts.every((p) => !p || p.trim() === "");
}

function termsLabel(t: DbClientPaymentTerms | null, custom: string | null): string {
  if (!t) return "—";
  if (t === "custom") return custom?.trim() ? `Custom — ${custom.trim()}` : "Custom";
  return TERMS.find((x) => x.value === t)?.label ?? t;
}

/** One read-mode label/value line. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
        {label}
      </span>
      <span className="text-brand-text text-xs">{value}</span>
    </div>
  );
}

/** Section card wrapper — module-scope so it isn't remounted on every keystroke
 *  (a nested component would lose input focus while typing). */
function SectionCard({
  title,
  editable = true,
  isEditing,
  onEditStart,
  onCancel,
  onSave,
  saving,
  children,
}: {
  title: string;
  editable?: boolean;
  isEditing: boolean;
  onEditStart?: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className="p-4 shadow-sm"
      style={{ background: "var(--brand-card)", borderColor: "var(--brand-border)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="nx-eyebrow">{title}</p>
        {editable && !isEditing && (
          <button
            type="button"
            onClick={() => onEditStart?.()}
            aria-label={`Edit ${title}`}
            className="text-muted-foreground hover:text-brand-charcoal rounded p-1 hover:bg-muted/40"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
      {isEditing && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** One edit-mode labelled input. */
function LabeledInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

export function ClientInfoSections({ client }: { client: DbClientWithCounts }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<DbClientUpdate>({});
  const [saving, setSaving] = useState(false);

  const startEdit = (section: string, initial: DbClientUpdate) => {
    if (editing && editing !== section) {
      toast.error("Finish editing the current section first.");
      return;
    }
    setDraft(initial);
    setEditing(section);
  };
  const cancel = () => {
    setEditing(null);
    setDraft({});
  };
  // POLISH-54 — cascade prompt: when a source address with an active downstream
  // "same as" flag is edited, ask whether to propagate to the dependent address.
  const [cascade, setCascade] = useState<
    | {
        source: "company" | "billing";
        targets: ("billing" | "mailing")[];
        draft: DbClientUpdate;
      }
    | null
  >(null);

  const doSave = (payload: DbClientUpdate) => {
    setSaving(true);
    updateClientAction(client.id, payload).then((r) => {
      setSaving(false);
      if (r.ok) {
        toast.success("Saved.");
        setEditing(null);
        setDraft({});
        setCascade(null);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  };
  const save = () => {
    // POLISH-55 — editing Company can cascade to BOTH billing and mailing (each
    // has its own "same as company" flag). Editing Billing can cascade to mailing.
    if (editing === "company") {
      const targets: ("billing" | "mailing")[] = [];
      if (client.billing_same_as_company) targets.push("billing");
      if (client.mailing_same_as_company) targets.push("mailing");
      if (targets.length) {
        setCascade({ source: "company", targets, draft });
        return;
      }
    }
    if (editing === "billing" && client.mailing_same_as_billing) {
      setCascade({ source: "billing", targets: ["mailing"], draft });
      return;
    }
    doSave(draft);
  };
  // Cascade resolution. "update" copies the new source values into each dependent
  // (flags stay true); "keep" leaves dependents untouched and flips their flags off.
  const resolveCascade = (mode: "update" | "keep") => {
    if (!cascade) return;
    const d = cascade.draft;
    let payload: DbClientUpdate = { ...d };
    for (const t of cascade.targets) {
      if (cascade.source === "company" && t === "billing") {
        payload =
          mode === "update"
            ? {
                ...payload,
                billing_street: d.company_address_line1 ?? null,
                billing_unit: d.company_address_line2 ?? null,
                billing_city: d.company_address_city ?? null,
                billing_province: d.company_address_province ?? null,
                billing_postal: d.company_address_postal ?? null,
                billing_country: d.company_address_country ?? null,
                billing_same_as_company: true,
              }
            : { ...payload, billing_same_as_company: false };
      } else if (cascade.source === "company" && t === "mailing") {
        payload =
          mode === "update"
            ? {
                ...payload,
                mailing_street: d.company_address_line1 ?? null,
                mailing_unit: d.company_address_line2 ?? null,
                mailing_city: d.company_address_city ?? null,
                mailing_province: d.company_address_province ?? null,
                mailing_postal: d.company_address_postal ?? null,
                mailing_country: d.company_address_country ?? null,
                mailing_same_as_company: true,
              }
            : { ...payload, mailing_same_as_company: false };
      } else if (cascade.source === "billing" && t === "mailing") {
        payload =
          mode === "update"
            ? {
                ...payload,
                mailing_street: d.billing_street ?? null,
                mailing_unit: d.billing_unit ?? null,
                mailing_city: d.billing_city ?? null,
                mailing_province: d.billing_province ?? null,
                mailing_postal: d.billing_postal ?? null,
                mailing_country: d.billing_country ?? null,
                mailing_same_as_billing: true,
              }
            : { ...payload, mailing_same_as_billing: false };
      }
    }
    doSave(payload);
  };
  const set = (patch: DbClientUpdate) => setDraft((d) => ({ ...d, ...patch }));
  // Read a draft string field for inputs.
  const ds = (k: keyof DbClientUpdate): string => {
    const x = draft[k];
    return x == null ? "" : String(x);
  };

  const ed = (id: string) => editing === id;
  // Shared props for every SectionCard (handlers + saving state).
  const sc = { onCancel: cancel, onSave: save, saving };

  return (
    <>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* A · IDENTITY */}
      <SectionCard
        title="Identity"
        isEditing={ed("identity")}
        {...sc}
        onEditStart={() =>
          startEdit("identity", {
            legal_name: client.legal_name,
            name: client.name,
            status: client.status,
          })
        }
      >
        {ed("identity") ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Legal name" value={ds("legal_name")} onChange={(x) => set({ legal_name: x })} />
            <LabeledInput label="Display name" value={ds("name")} onChange={(x) => set({ name: x })} />
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Status</span>
              <Select value={ds("status") || client.status} onValueChange={(x) => set({ status: x as DbClientStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal name" value={v(client.legal_name)} />
            <Field label="Display name" value={v(client.name)} />
            <Field label="Status" value={v(client.status)} />
            <Field label="Client code" value={v(client.client_code)} />
          </div>
        )}
      </SectionCard>

      {/* F · PRESTIGE TIER (display only) */}
      <SectionCard title="Prestige Tier" editable={false} isEditing={false} {...sc}>
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "var(--brand-gold)", color: "#1a2332", opacity: client.tier ? 1 : 0.5 }}
          >
            {client.tier ?? "None"}
          </span>
          <span className="text-muted-foreground text-[10px]">
            Managed via “Edit Tier”.
          </span>
        </div>
      </SectionCard>

      {/* POLISH-53 · COMPANY ADDRESS (top-level; billing inherits it) */}
      <SectionCard
        title="Company address"
        isEditing={ed("company")}
        {...sc}
        onEditStart={() =>
          startEdit("company", {
            company_address_line1: client.company_address_line1,
            company_address_line2: client.company_address_line2,
            company_address_city: client.company_address_city,
            company_address_province: client.company_address_province,
            company_address_postal: client.company_address_postal,
            company_address_country: client.company_address_country,
          })
        }
      >
        {ed("company") ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Street" value={ds("company_address_line1")} onChange={(x) => set({ company_address_line1: x })} />
            <LabeledInput label="Unit" value={ds("company_address_line2")} onChange={(x) => set({ company_address_line2: x })} />
            <LabeledInput label="City" value={ds("company_address_city")} onChange={(x) => set({ company_address_city: x })} />
            <LabeledInput label="Province" value={ds("company_address_province")} onChange={(x) => set({ company_address_province: x })} />
            <LabeledInput label="Postal" value={ds("company_address_postal")} onChange={(x) => set({ company_address_postal: x })} />
            <LabeledInput label="Country" value={ds("company_address_country")} onChange={(x) => set({ company_address_country: x })} />
          </div>
        ) : addrEmpty([
            client.company_address_line1, client.company_address_line2,
            client.company_address_city, client.company_address_province,
            client.company_address_postal, client.company_address_country,
          ]) ? (
          <p className="text-muted-foreground text-xs">Not set</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Street" value={v(client.company_address_line1)} />
            <Field label="Unit" value={v(client.company_address_line2)} />
            <Field label="City" value={v(client.company_address_city)} />
            <Field label="Province" value={v(client.company_address_province)} />
            <Field label="Postal" value={v(client.company_address_postal)} />
            <Field label="Country" value={v(client.company_address_country)} />
          </div>
        )}
      </SectionCard>

      {/* B · BILLING ADDRESS */}
      <SectionCard
        title="Billing address"
        isEditing={ed("billing")}
        {...sc}
        onEditStart={() =>
          startEdit("billing", {
            billing_street: client.billing_street,
            billing_unit: client.billing_unit,
            billing_city: client.billing_city,
            billing_province: client.billing_province,
            billing_postal: client.billing_postal,
            billing_country: client.billing_country,
          })
        }
      >
        {ed("billing") ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Street" value={ds("billing_street")} onChange={(x) => set({ billing_street: x })} />
            <LabeledInput label="Unit" value={ds("billing_unit")} onChange={(x) => set({ billing_unit: x })} />
            <LabeledInput label="City" value={ds("billing_city")} onChange={(x) => set({ billing_city: x })} />
            <LabeledInput label="Province" value={ds("billing_province")} onChange={(x) => set({ billing_province: x })} />
            <LabeledInput label="Postal" value={ds("billing_postal")} onChange={(x) => set({ billing_postal: x })} />
            <LabeledInput label="Country" value={ds("billing_country")} onChange={(x) => set({ billing_country: x })} />
          </div>
        ) : (
          <div className="space-y-2">
            {client.billing_same_as_company && (
              <p className="text-muted-foreground text-[10px] italic">Same as Company Address</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Street" value={v(client.billing_street)} />
              <Field label="Unit" value={v(client.billing_unit)} />
              <Field label="City" value={v(client.billing_city)} />
              <Field label="Province" value={v(client.billing_province)} />
              <Field label="Postal" value={v(client.billing_postal)} />
              <Field label="Country" value={v(client.billing_country)} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* C · MAILING ADDRESS */}
      <SectionCard
        title="Mailing address"
        isEditing={ed("mailing")}
        {...sc}
        onEditStart={() =>
          startEdit("mailing", {
            mailing_same_as_billing: client.mailing_same_as_billing,
            mailing_same_as_company: client.mailing_same_as_company,
            mailing_street: client.mailing_street,
            mailing_unit: client.mailing_unit,
            mailing_city: client.mailing_city,
            mailing_province: client.mailing_province,
            mailing_postal: client.mailing_postal,
            mailing_country: client.mailing_country,
          })
        }
      >
        {ed("mailing") ? (
          <div className="space-y-3">
            {/* POLISH-55 — two mutually-exclusive sources. */}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.mailing_same_as_billing === true}
                onChange={(e) =>
                  set({
                    mailing_same_as_billing: e.target.checked,
                    ...(e.target.checked ? { mailing_same_as_company: false } : {}),
                  })
                }
                className="h-4 w-4"
                style={{ accentColor: "var(--brand-accent)" }}
              />
              Same as Billing Address
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.mailing_same_as_company === true}
                onChange={(e) =>
                  set({
                    mailing_same_as_company: e.target.checked,
                    ...(e.target.checked ? { mailing_same_as_billing: false } : {}),
                  })
                }
                className="h-4 w-4"
                style={{ accentColor: "var(--brand-accent)" }}
              />
              Same as Company Address
            </label>
            {draft.mailing_same_as_billing !== true &&
              draft.mailing_same_as_company !== true && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <LabeledInput label="Street" value={ds("mailing_street")} onChange={(x) => set({ mailing_street: x })} />
                <LabeledInput label="Unit" value={ds("mailing_unit")} onChange={(x) => set({ mailing_unit: x })} />
                <LabeledInput label="City" value={ds("mailing_city")} onChange={(x) => set({ mailing_city: x })} />
                <LabeledInput label="Province" value={ds("mailing_province")} onChange={(x) => set({ mailing_province: x })} />
                <LabeledInput label="Postal" value={ds("mailing_postal")} onChange={(x) => set({ mailing_postal: x })} />
                <LabeledInput label="Country" value={ds("mailing_country")} onChange={(x) => set({ mailing_country: x })} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {client.mailing_same_as_billing ? (
              <p className="text-muted-foreground text-[10px] italic">Same as Billing Address</p>
            ) : client.mailing_same_as_company ? (
              <p className="text-muted-foreground text-[10px] italic">Same as Company Address</p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Street" value={v(client.mailing_street)} />
              <Field label="Unit" value={v(client.mailing_unit)} />
              <Field label="City" value={v(client.mailing_city)} />
              <Field label="Province" value={v(client.mailing_province)} />
              <Field label="Postal" value={v(client.mailing_postal)} />
              <Field label="Country" value={v(client.mailing_country)} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* D · TAX INFO */}
      <SectionCard
        title="Tax information"
        isEditing={ed("tax")}
        {...sc}
        onEditStart={() =>
          startEdit("tax", {
            client_hst_gst_number: client.client_hst_gst_number,
            tax_exempt: client.tax_exempt,
            tax_exempt_certificate_number: client.tax_exempt_certificate_number,
          })
        }
      >
        {ed("tax") ? (
          <div className="space-y-3">
            <LabeledInput label="HST / GST number" value={ds("client_hst_gst_number")} onChange={(x) => set({ client_hst_gst_number: x })} />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.tax_exempt === true}
                onChange={(e) => set({ tax_exempt: e.target.checked })}
                className="h-4 w-4"
                style={{ accentColor: "var(--brand-accent)" }}
              />
              Tax exempt
            </label>
            {draft.tax_exempt === true && (
              <LabeledInput
                label="Exempt certificate number"
                value={ds("tax_exempt_certificate_number")}
                onChange={(x) => set({ tax_exempt_certificate_number: x })}
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="HST / GST number" value={v(client.client_hst_gst_number)} />
            <Field label="Tax exempt" value={client.tax_exempt ? "Yes" : "No"} />
            {client.tax_exempt && (
              <Field label="Exempt certificate" value={v(client.tax_exempt_certificate_number)} />
            )}
          </div>
        )}
      </SectionCard>

      {/* E · PAYMENT INFO */}
      <SectionCard
        title="Payment information"
        isEditing={ed("payment")}
        {...sc}
        onEditStart={() =>
          startEdit("payment", {
            payment_terms: client.payment_terms,
            payment_terms_custom: client.payment_terms_custom,
            preferred_payment_method: client.preferred_payment_method,
            preferred_currency: client.preferred_currency,
          })
        }
      >
        {ed("payment") ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Payment terms</span>
              <Select
                value={(draft.payment_terms as string) ?? client.payment_terms ?? "net_30"}
                onValueChange={(x) => set({ payment_terms: x as DbClientPaymentTerms })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            {draft.payment_terms === "custom" && (
              <LabeledInput label="Custom terms" value={ds("payment_terms_custom")} onChange={(x) => set({ payment_terms_custom: x })} />
            )}
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Payment method</span>
              <Select
                value={(draft.preferred_payment_method as string) ?? client.preferred_payment_method ?? "eft"}
                onValueChange={(x) => set({ preferred_payment_method: x as DbClientPaymentMethod })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Currency</span>
              <Select
                value={(draft.preferred_currency as string) ?? client.preferred_currency ?? "CAD"}
                onValueChange={(x) => set({ preferred_currency: x as DbClientCurrency })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment terms" value={termsLabel(client.payment_terms, client.payment_terms_custom)} />
            <Field
              label="Payment method"
              value={v(METHODS.find((m) => m.value === client.preferred_payment_method)?.label ?? client.preferred_payment_method)}
            />
            <Field label="Currency" value={v(client.preferred_currency)} />
          </div>
        )}
      </SectionCard>

      {/* G · NOTES (full width) */}
      <div className="lg:col-span-2">
        <SectionCard
          title="Notes"
          isEditing={ed("notes")}
          {...sc}
          onEditStart={() => startEdit("notes", { notes: client.notes })}
        >
          {ed("notes") ? (
            <textarea
              value={ds("notes")}
              onChange={(e) => set({ notes: e.target.value })}
              rows={4}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-xs"
            />
          ) : (
            <p className="text-brand-text whitespace-pre-wrap text-xs">
              {client.notes?.trim() ? client.notes : "—"}
            </p>
          )}
        </SectionCard>
      </div>
    </div>

    {/* POLISH-54 — cascade prompt when editing a source address that has an
        active downstream "same as" relationship. */}
    <Dialog
      open={!!cascade}
      onOpenChange={(o) => {
        if (!o && !saving) setCascade(null);
      }}
    >
      <DialogContent>
        {(() => {
          const sourceLabel = cascade?.source === "company" ? "Company" : "Billing";
          const targetList = (cascade?.targets ?? [])
            .map((t) => (t === "billing" ? "Billing" : "Mailing"))
            .join(" and ");
          return (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif">
                  Update {targetList} Address{cascade && cascade.targets.length > 1 ? "es" : ""}?
                </DialogTitle>
                <DialogDescription>
                  {targetList} {cascade && cascade.targets.length > 1 ? "are" : "is"} currently
                  marked as Same as {sourceLabel} Address. Would you like to update {cascade && cascade.targets.length > 1 ? "them" : "it"} to
                  match the new {sourceLabel} Address?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => resolveCascade("keep")} disabled={saving}>
                  Keep old values
                </Button>
                <Button size="sm" onClick={() => resolveCascade("update")} disabled={saving}>
                  {saving ? "Saving…" : "Update to match"}
                </Button>
              </DialogFooter>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}
