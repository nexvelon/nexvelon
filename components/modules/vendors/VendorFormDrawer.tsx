"use client";

// PO-1 — right-side drawer for creating / editing a vendor. Flat field set
// (vendors are simpler than clients), wired to create/updateVendorAction.

import { useState } from "react";
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
  createVendorAction,
  updateVendorAction,
} from "@/app/(app)/vendors/actions";
import type { DbVendor, DbVendorInsert } from "@/lib/types/database";

type Mode = { kind: "create" } | { kind: "edit"; vendor: DbVendor };

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  mode: Mode;
}

const blank: DbVendorInsert = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  website: "",
  address_line1: "",
  address_line2: "",
  city: "",
  province: "",
  postal_code: "",
  country: "",
  account_number: "",
  payment_terms: "",
  notes: "",
  is_active: true,
};

function seed(mode: Mode): DbVendorInsert {
  if (mode.kind === "create") return { ...blank };
  const v = mode.vendor;
  return {
    name: v.name,
    contact_name: v.contact_name ?? "",
    email: v.email ?? "",
    phone: v.phone ?? "",
    website: v.website ?? "",
    address_line1: v.address_line1 ?? "",
    address_line2: v.address_line2 ?? "",
    city: v.city ?? "",
    province: v.province ?? "",
    postal_code: v.postal_code ?? "",
    country: v.country ?? "",
    account_number: v.account_number ?? "",
    payment_terms: v.payment_terms ?? "",
    notes: v.notes ?? "",
    is_active: v.is_active,
  };
}

export function VendorFormDrawer({ open, onClose, onSaved, mode }: Props) {
  const isEdit = mode.kind === "edit";
  const [form, setForm] = useState<DbVendorInsert>(() => seed(mode));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof DbVendorInsert>(
    key: K,
    value: DbVendorInsert[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if ((form.name ?? "").trim() === "") {
      toast.error("Vendor name is required.");
      return;
    }
    setSaving(true);
    const res = isEdit
      ? await updateVendorAction(mode.vendor.id, form)
      : await createVendorAction(form);
    setSaving(false);
    if (res.ok) {
      toast.success(isEdit ? "Vendor updated" : "Vendor created");
      onSaved();
      onClose();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <SheetContent side="right" className="w-[480px] overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">
            {isEdit ? "Edit vendor" : "Add vendor"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update vendor information. Changes save immediately."
              : "Add a supplier you purchase stock from."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 px-4 pb-8">
          <Field label="Vendor name" required>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="ADI Global Distribution"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <Input
                value={form.contact_name ?? ""}
                onChange={(e) => set("contact_name", e.target.value)}
              />
            </Field>
            <Field label="Account number">
              <Input
                value={form.account_number ?? ""}
                onChange={(e) => set("account_number", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Website">
              <Input
                value={form.website ?? ""}
                onChange={(e) => set("website", e.target.value)}
              />
            </Field>
            <Field label="Payment terms">
              <Input
                value={form.payment_terms ?? ""}
                onChange={(e) => set("payment_terms", e.target.value)}
                placeholder="Net 30"
              />
            </Field>
          </div>

          <Field label="Address line 1">
            <Input
              value={form.address_line1 ?? ""}
              onChange={(e) => set("address_line1", e.target.value)}
            />
          </Field>
          <Field label="Address line 2">
            <Input
              value={form.address_line2 ?? ""}
              onChange={(e) => set("address_line2", e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input
                value={form.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="Province / State">
              <Input
                value={form.province ?? ""}
                onChange={(e) => set("province", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Postal / ZIP">
              <Input
                value={form.postal_code ?? ""}
                onChange={(e) => set("postal_code", e.target.value)}
              />
            </Field>
            <Field label="Country">
              <Input
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
            />
          </Field>

          <div className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2">
            <div>
              <Label className="text-xs">Active</Label>
              <p className="text-muted-foreground text-[11px]">
                Inactive vendors stay in the list but sort last.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={form.is_active ? "default" : "outline"}
              onClick={() => set("is_active", !form.is_active)}
              aria-pressed={form.is_active}
              className="min-w-[3.5rem]"
            >
              {form.is_active ? "On" : "Off"}
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save vendor" : "Create vendor"}
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
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
