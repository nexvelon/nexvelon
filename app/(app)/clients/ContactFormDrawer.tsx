"use client";

import { useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createContactAction, updateContactAction } from "./actions";
import { PhonesEditor } from "./_components/PhonesEditor";
import type { ContactPhone, DbContact, DbSite } from "@/lib/types/database";

type Mode =
  | { kind: "create"; clientId: string }
  | { kind: "edit"; contact: DbContact };

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  /** Sites on this client — used for the optional site association picker. */
  sites?: DbSite[];
}

export function ContactFormDrawer({ open, onClose, mode, sites = [] }: Props) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.contact : null;
  const clientId = isEdit ? mode.contact.client_id : mode.clientId;

  const [firstName, setFirstName] = useState(existing?.first_name ?? "");
  const [lastName, setLastName] = useState(existing?.last_name ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [department, setDepartment] = useState(existing?.department ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  // CL-5c: dynamic multi-phone list (a fresh contact starts with one empty row).
  const [phones, setPhones] = useState<ContactPhone[]>(
    existing?.phones ?? [{ label: "Phone", number: "" }]
  );
  const [siteId, setSiteId] = useState<string>(existing?.site_id ?? "none");
  const [isPrimary, setIsPrimary] = useState(existing?.is_primary ?? true);
  const [isBilling, setIsBilling] = useState(existing?.is_billing ?? false);
  const [isEmergency, setIsEmergency] = useState(existing?.is_emergency ?? false);
  // CL-7
  const [isAccountsPayable, setIsAccountsPayable] = useState(
    existing?.is_accounts_payable ?? false
  );
  const [contactTypeCustom, setContactTypeCustom] = useState(
    existing?.contact_type_custom ?? ""
  );
  const [showCustom, setShowCustom] = useState(
    existing?.contact_type_custom != null && existing.contact_type_custom !== ""
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First and last name are required.");
      return;
    }

    const payload = {
      client_id: clientId ?? null,
      site_id: siteId === "none" ? null : siteId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      title: title.trim() || null,
      department: department.trim() || null,
      email: email.trim() || null,
      // CL-5c: drop empty phone rows before persisting.
      phones: phones
        .filter((p) => p.number.trim() !== "")
        .map((p) => ({ label: p.label, number: p.number.trim() })),
      is_primary: isPrimary,
      is_billing: isBilling,
      is_emergency: isEmergency,
      // CL-7: Custom badge gates on the text value, not the toggle state.
      is_accounts_payable: isAccountsPayable,
      contact_type_custom:
        showCustom && contactTypeCustom.trim()
          ? contactTypeCustom.trim()
          : null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = isEdit && existing
        ? await updateContactAction(existing.id, payload)
        : await createContactAction(payload);

      if (result.ok) {
        const fullName = `${payload.first_name} ${payload.last_name}`;
        toast.success(isEdit ? `Updated ${fullName}` : `Added ${fullName}`);
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[440px] overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">
            {isEdit ? "Edit contact" : "Add contact"}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update contact details."
              : "Add a person at this client. Link to a specific site if known."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name *" required>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Last name *" required>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="Role">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Director of Facilities, CFO, Operations Manager"
            />
          </Field>

          <Field label="Department">
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Operations · Compliance"
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Phones">
            <PhonesEditor phones={phones} onChange={setPhones} />
          </Field>

          {sites.length > 0 && (
            <Field label="Site">
              <Select value={siteId} onValueChange={(v) => setSiteId(v ?? "none")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No specific site —</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <p className="nx-eyebrow-soft text-[10px]">Roles</p>
            <Toggle label="Primary contact" value={isPrimary} onChange={setIsPrimary} />
            <Toggle label="Billing contact" value={isBilling} onChange={setIsBilling} />
            <Toggle label="Emergency contact" value={isEmergency} onChange={setIsEmergency} />
            <Toggle
              label="Accounts payable contact"
              value={isAccountsPayable}
              onChange={setIsAccountsPayable}
            />
            <Toggle
              label="Custom contact type"
              value={showCustom}
              onChange={(on) => {
                setShowCustom(on);
                if (!on) setContactTypeCustom("");
              }}
            />
            {showCustom && (
              <Field label="Custom type label">
                <Input
                  value={contactTypeCustom}
                  onChange={(e) => setContactTypeCustom(e.target.value)}
                  placeholder="e.g. HR Lead, Vendor Coordinator"
                />
              </Field>
            )}
          </div>

          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
              style={{
                background: "var(--brand-accent)",
                color: "var(--brand-primary)",
              }}
            >
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add contact"}
            </button>
          </div>
        </form>
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
    <div className="space-y-1.5">
      <Label className="nx-eyebrow-soft text-[10px]">
        {label}
        {required && <span className="ml-1 text-red-600">·</span>}
      </Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-brand-text">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors"
        style={{
          background: value ? "var(--brand-accent)" : "var(--brand-muted)",
        }}
        aria-pressed={value}
      >
        <span
          className="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
          style={{ transform: value ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </label>
  );
}
