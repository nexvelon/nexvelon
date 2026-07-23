"use client";

// SUB-1 — create/edit drawer for subcontractors, mirroring VendorFormDrawer:
// a flat field set in a slide-over Sheet, one shared component for both modes.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSubcontractorAction,
  updateSubcontractorAction,
} from "@/app/(app)/subcontractors/actions";
import type {
  DbSubcontractor,
  DbSubcontractorInsert,
  DbSubcontractorStatus,
} from "@/lib/types/database";

export type DrawerMode =
  | { kind: "create" }
  | { kind: "edit"; sub: DbSubcontractor };

const STATUS_OPTIONS: { value: DbSubcontractorStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "do_not_use", label: "Do not use" },
];

type FormState = {
  name: string;
  legal_name: string;
  trade: string;
  contact_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  business_number: string;
  gst_hst_number: string;
  default_labour_rate: string;
  payment_terms: string;
  status: DbSubcontractorStatus;
  notes: string;
};

function blank(): FormState {
  return {
    name: "", legal_name: "", trade: "", contact_name: "", email: "", phone: "",
    address_line1: "", address_line2: "", city: "", province: "", postal_code: "",
    country: "Canada", business_number: "", gst_hst_number: "",
    default_labour_rate: "", payment_terms: "", status: "active", notes: "",
  };
}

function seed(s: DbSubcontractor): FormState {
  return {
    name: s.name ?? "",
    legal_name: s.legal_name ?? "",
    trade: s.trade ?? "",
    contact_name: s.contact_name ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    address_line1: s.address_line1 ?? "",
    address_line2: s.address_line2 ?? "",
    city: s.city ?? "",
    province: s.province ?? "",
    postal_code: s.postal_code ?? "",
    country: s.country ?? "Canada",
    business_number: s.business_number ?? "",
    gst_hst_number: s.gst_hst_number ?? "",
    default_labour_rate: s.default_labour_rate == null ? "" : String(s.default_labour_rate),
    payment_terms: s.payment_terms ?? "",
    status: s.status,
    notes: s.notes ?? "",
  };
}

function toPayload(f: FormState): DbSubcontractorInsert {
  const trimOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    name: f.name.trim(),
    legal_name: trimOrNull(f.legal_name),
    trade: trimOrNull(f.trade),
    contact_name: trimOrNull(f.contact_name),
    email: trimOrNull(f.email),
    phone: trimOrNull(f.phone),
    address_line1: trimOrNull(f.address_line1),
    address_line2: trimOrNull(f.address_line2),
    city: trimOrNull(f.city),
    province: trimOrNull(f.province),
    postal_code: trimOrNull(f.postal_code),
    country: trimOrNull(f.country),
    business_number: trimOrNull(f.business_number),
    gst_hst_number: trimOrNull(f.gst_hst_number),
    default_labour_rate:
      f.default_labour_rate.trim() === "" ? null : Number(f.default_labour_rate),
    payment_terms: trimOrNull(f.payment_terms),
    status: f.status,
    notes: trimOrNull(f.notes),
  };
}

export function SubcontractorFormDrawer({
  open,
  mode,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: DrawerMode;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<FormState>(blank());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(mode.kind === "edit" ? seed(mode.sub) : blank());
  }, [open, mode]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (form.name.trim() === "") {
      toast.error("Subcontractor name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      const res =
        mode.kind === "edit"
          ? await updateSubcontractorAction(mode.sub.id, payload)
          : await createSubcontractorAction(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(mode.kind === "edit" ? "Subcontractor updated" : "Subcontractor created");
      onSaved(res.data.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {mode.kind === "edit" ? "Edit subcontractor" : "New subcontractor"}
          </SheetTitle>
          <SheetDescription>
            A payable business partner — the company or person you send work to
            and pay.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-2">
          <Field label="Name *">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Legal name (for T5018)">
              <Input value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
            </Field>
            <Field label="Trade">
              <Input
                value={form.trade}
                onChange={(e) => set("trade", e.target.value)}
                placeholder="e.g. Low-voltage, Monitoring"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", (v ?? "active") as DbSubcontractorStatus)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>

          <Field label="Address line 1">
            <Input value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} />
          </Field>
          <Field label="Address line 2">
            <Input value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Province">
              <Input value={form.province} onChange={(e) => set("province", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Postal code">
              <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
            </Field>
            <Field label="Country">
              <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Business number (CRA BN)">
              <Input value={form.business_number} onChange={(e) => set("business_number", e.target.value)} />
            </Field>
            <Field label="GST/HST number">
              <Input value={form.gst_hst_number} onChange={(e) => set("gst_hst_number", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default labour rate">
              <Input
                value={form.default_labour_rate}
                inputMode="decimal"
                onChange={(e) => set("default_labour_rate", e.target.value)}
                placeholder="per hour"
              />
            </Field>
            <Field label="Payment terms">
              <Input
                value={form.payment_terms}
                onChange={(e) => set("payment_terms", e.target.value)}
                placeholder="e.g. Net 30"
              />
            </Field>
          </div>

          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {mode.kind === "edit" ? "Save changes" : "Create subcontractor"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
