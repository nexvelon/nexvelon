"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Download, Upload } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import {
  createClientAction,
  createContactAction,
  updateClientAction,
  getCurrentUserIsAdminAction,
} from "./actions";
import type {
  DbClient,
  DbClientCurrency,
  DbClientOpco,
  DbClientPaymentMethod,
  DbClientPaymentTerms,
  DbClientStatus,
  DbClientTier,
  DbClientType,
  DbContactInsert,
} from "@/lib/types/database";

const TYPES: DbClientType[] = [
  "Commercial",
  "Industrial",
  "Residential",
  "Healthcare",
  "Education",
  "Government",
  "Heritage",
];
const TIERS: DbClientTier[] = ["Platinum", "Gold", "Silver", "Bronze"];
const STATUSES: DbClientStatus[] = ["Active", "Inactive", "Prospect", "Lost"];

const OPCOS: { value: DbClientOpco; label: string }[] = [
  { value: "integrated_solutions", label: "Integrated Solutions" },
  { value: "guardian", label: "Guardian" },
];

const PAYMENT_TERMS: { value: DbClientPaymentTerms; label: string }[] = [
  { value: "due_on_receipt", label: "Due on receipt" },
  { value: "net_7", label: "NET 7" },
  { value: "net_15", label: "NET 15" },
  { value: "net_30", label: "NET 30" },
  { value: "net_60", label: "NET 60" },
  { value: "net_90", label: "NET 90" },
  { value: "custom", label: "Custom" },
];

const PAYMENT_METHODS: { value: DbClientPaymentMethod; label: string }[] = [
  { value: "cheque", label: "Cheque" },
  { value: "eft", label: "EFT" },
  { value: "credit_card", label: "Credit Card" },
  { value: "e_transfer", label: "E-Transfer" },
  { value: "wire", label: "Wire" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = { kind: "create" } | { kind: "edit"; client: DbClient };

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
}

export function ClientFormDrawer({ open, onClose, mode }: Props) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.client : null;

  // --- Section 1: Identity & Classification ---
  const [legalName, setLegalName] = useState(existing?.legal_name ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [clientCode] = useState(existing?.client_code ?? "");
  const [status, setStatus] = useState<DbClientStatus>(
    existing?.status ?? "Prospect"
  );
  const [type, setType] = useState<DbClientType | "">(existing?.type ?? "");
  const [tier, setTier] = useState<DbClientTier | "">(existing?.tier ?? "");
  const [industry, setIndustry] = useState(existing?.industry ?? "");
  const [tags, setTags] = useState((existing?.tags ?? []).join(", "));

  // --- Section 3: Billing Address ---
  const [billStreet, setBillStreet] = useState(existing?.billing_street ?? "");
  const [billUnit, setBillUnit] = useState(existing?.billing_unit ?? "");
  const [billCity, setBillCity] = useState(existing?.billing_city ?? "");
  const [billProvince, setBillProvince] = useState(
    existing?.billing_province ?? "ON"
  );
  const [billPostal, setBillPostal] = useState(existing?.billing_postal ?? "");
  const [billCountry, setBillCountry] = useState(
    existing?.billing_country ?? "Canada"
  );

  // --- Section 3.5: Mailing Address (CL-5b) ---
  const [mailStreet, setMailStreet] = useState(existing?.mailing_street ?? "");
  const [mailUnit, setMailUnit] = useState(existing?.mailing_unit ?? "");
  const [mailCity, setMailCity] = useState(existing?.mailing_city ?? "");
  const [mailProvince, setMailProvince] = useState(
    existing?.mailing_province ?? "ON"
  );
  const [mailPostal, setMailPostal] = useState(existing?.mailing_postal ?? "");
  const [mailCountry, setMailCountry] = useState(
    existing?.mailing_country ?? "Canada"
  );
  const [mailSameAsBilling, setMailSameAsBilling] = useState(
    existing?.mailing_same_as_billing ?? false
  );

  // --- Section 4: Operating Company ---
  const [defaultOpco, setDefaultOpco] = useState<DbClientOpco>(
    existing?.default_opco ?? "integrated_solutions"
  );
  const [allowedOpcos, setAllowedOpcos] = useState<DbClientOpco[]>(
    (existing?.allowed_opcos as DbClientOpco[] | null) ?? ["integrated_solutions"]
  );
  const [isAdmin, setIsAdmin] = useState(false);

  // --- Section 5: Tax ---
  const [hstGst, setHstGst] = useState(existing?.client_hst_gst_number ?? "");
  const [taxExempt, setTaxExempt] = useState(existing?.tax_exempt ?? false);
  const [taxCert, setTaxCert] = useState(
    existing?.tax_exempt_certificate_number ?? ""
  );

  // --- Section 6: Payment Terms & Method ---
  const [paymentTerms, setPaymentTerms] = useState<DbClientPaymentTerms>(
    existing?.payment_terms ?? "net_30"
  );
  const [paymentTermsCustom, setPaymentTermsCustom] = useState(
    existing?.payment_terms_custom ?? ""
  );
  const [payMethod, setPayMethod] = useState<DbClientPaymentMethod>(
    existing?.preferred_payment_method ?? "eft"
  );
  const [ccSurcharge, setCcSurcharge] = useState(
    existing?.apply_cc_surcharge ?? true
  );
  const [creditLimit, setCreditLimit] = useState(
    existing?.credit_limit != null ? String(existing.credit_limit) : ""
  );
  const [creditHold, setCreditHold] = useState(existing?.credit_hold ?? false);
  const [currency, setCurrency] = useState<DbClientCurrency>(
    existing?.preferred_currency ?? "CAD"
  );

  // --- Section 7: Portal Access ---
  const [portalEnabled, setPortalEnabled] = useState(
    existing?.portal_access_enabled ?? false
  );
  const [portalEmail, setPortalEmail] = useState(
    existing?.portal_contact_email ?? ""
  );

  // --- Section 8: Notes ---
  const [notes, setNotes] = useState(existing?.notes ?? "");

  // --- CL-3c: Initial Contacts (create-mode only) — 3 fixed-role slots ---
  const [mainContact, setMainContact] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });
  const [apContact, setApContact] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });
  const [additionalContact, setAdditionalContact] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
  });

  // A contact slot is "active" once any of its fields has content.
  const isMainContactActive =
    mainContact.first_name.trim() !== "" ||
    mainContact.last_name.trim() !== "" ||
    mainContact.phone.trim() !== "" ||
    mainContact.email.trim() !== "";
  const isApContactActive =
    apContact.first_name.trim() !== "" ||
    apContact.last_name.trim() !== "" ||
    apContact.phone.trim() !== "" ||
    apContact.email.trim() !== "";
  const isAdditionalContactActive =
    additionalContact.first_name.trim() !== "" ||
    additionalContact.last_name.trim() !== "" ||
    additionalContact.phone.trim() !== "" ||
    additionalContact.email.trim() !== "";

  const [pending, startTransition] = useTransition();

  // CL-4: hidden file input for the "Upload filled template" button.
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  // Resolve admin flag (Guardian gate) on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCurrentUserIsAdminAction().then((r) => {
      if (!cancelled && r.ok) setIsAdmin(r.data.isAdmin);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Keep allowed_opcos a superset of default_opco.
  useEffect(() => {
    setAllowedOpcos((prev) =>
      prev.includes(defaultOpco) ? prev : [...prev, defaultOpco]
    );
  }, [defaultOpco]);

  // ---- Client-side validation (mirrors the Phase 3 server rules) ----
  const errors: Record<string, string> = {};
  if (!legalName.trim()) errors.legalName = "Legal name is required.";
  if (taxExempt && !taxCert.trim())
    errors.taxCert = "Certificate number is required when tax-exempt.";
  if (portalEnabled) {
    if (!portalEmail.trim())
      errors.portalEmail = "Portal contact email is required.";
    else if (!EMAIL_RE.test(portalEmail.trim()))
      errors.portalEmail = "Enter a valid email address.";
  }
  if (paymentTerms === "custom" && !paymentTermsCustom.trim())
    errors.paymentTermsCustom = "Custom terms text is required.";
  if (!allowedOpcos.includes(defaultOpco))
    errors.allowedOpcos = "Allowed operating companies must include the default.";
  // CL-3c: each active contact slot needs first + last name (NOT NULL schema).
  if (isMainContactActive) {
    if (!mainContact.first_name.trim())
      errors.mainContactFirstName = "First name is required";
    if (!mainContact.last_name.trim())
      errors.mainContactLastName = "Last name is required";
  }
  if (isApContactActive) {
    if (!apContact.first_name.trim())
      errors.apContactFirstName = "First name is required";
    if (!apContact.last_name.trim())
      errors.apContactLastName = "Last name is required";
  }
  if (isAdditionalContactActive) {
    if (!additionalContact.first_name.trim())
      errors.additionalContactFirstName = "First name is required";
    if (!additionalContact.last_name.trim())
      errors.additionalContactLastName = "Last name is required";
  }
  const isInvalid = Object.keys(errors).length > 0;

  const toggleAllowedOpco = (oc: DbClientOpco) => {
    setAllowedOpcos((prev) =>
      prev.includes(oc) ? prev.filter((x) => x !== oc) : [...prev, oc]
    );
  };

  // CL-4: build the onboarding Excel template and trigger a browser download.
  // generateClientTemplate dynamic-imports exceljs, so the lib only loads here.
  async function handleDownloadTemplate() {
    try {
      const { generateClientTemplate } = await import(
        "@/lib/client-onboarding-template"
      );
      const blob = await generateClientTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Nexvelon-Client-Onboarding-Template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (e) {
      console.error("[CL-4] Template generation failed:", e);
      toast.error("Failed to generate template");
    }
  }

  // CL-4: parse a filled template and auto-populate the drawer. Only sets
  // fields that have content — values Jay already typed are preserved.
  async function handleUploadTemplate(file: File) {
    try {
      const { parseClientTemplate } = await import(
        "@/lib/client-onboarding-template"
      );
      const parsed = await parseClientTemplate(file);

      // Client info
      if (parsed.client.legal_name) setLegalName(parsed.client.legal_name);
      if (parsed.client.name) setName(parsed.client.name);
      if (parsed.client.hst_gst_number)
        setHstGst(parsed.client.hst_gst_number);
      if (parsed.client.tax_exempt !== null)
        setTaxExempt(parsed.client.tax_exempt);
      if (parsed.client.tax_exempt_cert)
        setTaxCert(parsed.client.tax_exempt_cert);

      // Billing address
      if (parsed.billing.street) setBillStreet(parsed.billing.street);
      if (parsed.billing.unit) setBillUnit(parsed.billing.unit);
      if (parsed.billing.city) setBillCity(parsed.billing.city);
      if (parsed.billing.province) setBillProvince(parsed.billing.province);
      if (parsed.billing.postal) setBillPostal(parsed.billing.postal);
      if (parsed.billing.country) setBillCountry(parsed.billing.country);

      // Contacts — only when a name has content (mirrors CL-3c "active" gating).
      if (parsed.mainContact.first_name || parsed.mainContact.last_name) {
        setMainContact(parsed.mainContact);
      }
      if (parsed.apContact.first_name || parsed.apContact.last_name) {
        setApContact(parsed.apContact);
      }
      if (
        parsed.additionalContact.first_name ||
        parsed.additionalContact.last_name
      ) {
        setAdditionalContact(parsed.additionalContact);
      }

      // CL-5a removed the Initial Site section — the template's Site sheet is
      // still parsed but no longer populates a form field (sites are added on
      // the client detail page now).

      toast.success("Template loaded — review the form below before saving");
    } catch (e) {
      console.error("[CL-4] Template parse failed:", e);
      toast.error(
        e instanceof Error ? e.message : "Failed to parse template"
      );
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalid) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    const tradeName = name.trim() || legalName.trim();
    const parsedCredit = creditLimit.trim()
      ? Number(creditLimit.trim())
      : null;

    const payload = {
      name: tradeName,
      legal_name: legalName.trim(),
      // client_code is read-only in edit; auto-generated server/DB-side on
      // create (no generator scheme is defined in CL-2 — see PR notes).
      client_code: isEdit ? clientCode.trim() || null : null,
      status,
      type: (type || null) as DbClientType | null,
      tier: (tier || null) as DbClientTier | null,
      industry: industry.trim() || null,
      tags: tags.trim()
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : null,
      billing_street: billStreet.trim() || null,
      billing_unit: billUnit.trim() || null,
      billing_city: billCity.trim() || null,
      billing_province: billProvince.trim() || null,
      billing_postal: billPostal.trim() || null,
      billing_country: billCountry.trim() || null,
      billing_same_as_primary_site: false,
      // CL-5b: Mailing address (eager copy when same-as-billing)
      mailing_street: (mailSameAsBilling ? billStreet : mailStreet).trim() || null,
      mailing_unit: (mailSameAsBilling ? billUnit : mailUnit).trim() || null,
      mailing_city: (mailSameAsBilling ? billCity : mailCity).trim() || null,
      mailing_province:
        (mailSameAsBilling ? billProvince : mailProvince).trim() || null,
      mailing_postal: (mailSameAsBilling ? billPostal : mailPostal).trim() || null,
      mailing_country:
        (mailSameAsBilling ? billCountry : mailCountry).trim() || null,
      mailing_same_as_billing: mailSameAsBilling,
      default_opco: defaultOpco,
      allowed_opcos: allowedOpcos,
      client_hst_gst_number: hstGst.trim() || null,
      tax_exempt: taxExempt,
      tax_exempt_certificate_number: taxExempt
        ? taxCert.trim() || null
        : null,
      payment_terms: paymentTerms,
      payment_terms_custom:
        paymentTerms === "custom" ? paymentTermsCustom.trim() || null : null,
      preferred_payment_method: payMethod,
      apply_cc_surcharge: ccSurcharge,
      credit_limit:
        parsedCredit != null && Number.isFinite(parsedCredit)
          ? parsedCredit
          : null,
      credit_hold: creditHold,
      preferred_currency: currency,
      portal_access_enabled: portalEnabled,
      portal_contact_email: portalEnabled
        ? portalEmail.trim() || null
        : null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result =
        isEdit && existing
          ? await updateClientAction(existing.id, payload)
          : await createClientAction(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // Edit mode → original success path (no inline site/contacts in edit).
      if (isEdit) {
        toast.success(`Updated ${tradeName}`);
        onClose();
        return;
      }

      const newClientId = result.data.id;

      // CL-3c: chain up to 3 contact inserts (in parallel). Roles are fixed
      // per slot — Main → primary, Accounts Payable → billing, Additional → none.
      const contactsToCreate: DbContactInsert[] = [];
      if (isMainContactActive) {
        contactsToCreate.push({
          client_id: newClientId,
          first_name: mainContact.first_name.trim(),
          last_name: mainContact.last_name.trim(),
          phone: mainContact.phone.trim() || null,
          email: mainContact.email.trim() || null,
          is_primary: true,
          is_billing: false,
          is_emergency: false,
        });
      }
      if (isApContactActive) {
        contactsToCreate.push({
          client_id: newClientId,
          first_name: apContact.first_name.trim(),
          last_name: apContact.last_name.trim(),
          phone: apContact.phone.trim() || null,
          email: apContact.email.trim() || null,
          is_primary: false,
          is_billing: true,
          is_emergency: false,
        });
      }
      if (isAdditionalContactActive) {
        contactsToCreate.push({
          client_id: newClientId,
          first_name: additionalContact.first_name.trim(),
          last_name: additionalContact.last_name.trim(),
          phone: additionalContact.phone.trim() || null,
          email: additionalContact.email.trim() || null,
          is_primary: false,
          is_billing: false,
          is_emergency: false,
        });
      }

      let contactSuccessCount = 0;
      let contactFailCount = 0;
      if (contactsToCreate.length > 0) {
        const results = await Promise.all(
          contactsToCreate.map((p) => createContactAction(p))
        );
        contactSuccessCount = results.filter((r) => r.ok).length;
        contactFailCount = results.length - contactSuccessCount;
      }

      // Combined success toast — client + contact counts.
      let toastMsg = `Added ${tradeName}`;
      if (contactSuccessCount > 0) {
        toastMsg += ` · ${contactSuccessCount} contact${
          contactSuccessCount > 1 ? "s" : ""
        } added`;
      }
      toast.success(toastMsg);

      if (contactFailCount > 0) {
        // Partial success — the client exists; failed contacts can be added
        // later. No rollback across the chained server actions.
        toast.warning(
          `${contactFailCount} contact${
            contactFailCount > 1 ? "s" : ""
          } couldn't be added. You can add them later from the client detail page.`
        );
      }

      onClose();
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="right"
          className="w-[480px] overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle className="font-serif text-2xl">
              {isEdit ? "Edit client" : "Add client"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update client information. Changes save immediately."
                : "Create a new master client record. Add the primary contact after the client is saved."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
            {/* CL-4 — onboarding template (create-mode only) */}
            {!isEdit && (
              <div className="space-y-2 rounded-md border border-[var(--border)] bg-muted/30 p-3">
                <p className="text-muted-foreground text-xs">
                  Send the template to your client to fill out, then upload it
                  here to auto-populate the form.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download template
                  </Button>
                  <input
                    ref={templateFileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = ""; // allow re-selecting the same file
                      if (file) handleUploadTemplate(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => templateFileInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload filled template
                  </Button>
                </div>
              </div>
            )}

            {/* SECTION 1 */}
            <Section title="Identity & Classification" defaultOpen>
              <Field label="Company legal name *" error={errors.legalName}>
                <Input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Meridian Capital Plaza Holdings Inc."
                />
              </Field>
              <Field label="Company trade / display name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Defaults to legal name if left blank"
                />
              </Field>
              <Field label="Client code">
                <Input
                  value={
                    isEdit
                      ? clientCode
                      : "Auto-generated on save"
                  }
                  readOnly
                  disabled
                  className="font-mono text-xs"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setStatus((v ?? "Active") as DbClientStatus)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Type">
                  <Select
                    value={type || undefined}
                    onValueChange={(v) =>
                      setType((v ?? "") as DbClientType | "")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tier">
                  <Select
                    value={tier || undefined}
                    onValueChange={(v) =>
                      setTier((v ?? "") as DbClientTier | "")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tier…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Industry">
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Pharmaceuticals"
                  />
                </Field>
              </div>
              <Field label="Tags (comma-separated)">
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="vip, ndaa-compliant, gmp"
                />
              </Field>
            </Section>

            {/* SECTION 3 */}
            <Section title="Billing Address">
              <Field label="Street">
                <AddressAutocomplete
                  value={billStreet}
                  onChange={setBillStreet}
                  onPlaceSelected={(p) => {
                    setBillStreet(p.street);
                    if (p.city) setBillCity(p.city);
                    if (p.province) setBillProvince(p.province);
                    if (p.postal) setBillPostal(p.postal);
                    if (p.country) setBillCountry(p.country);
                  }}
                  placeholder="350 Bay Street"
                />
              </Field>
              <Field label="Unit / Suite">
                <Input
                  value={billUnit}
                  onChange={(e) => setBillUnit(e.target.value)}
                  placeholder="Suite 1200"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <Input
                    value={billCity}
                    onChange={(e) => setBillCity(e.target.value)}
                    placeholder="Toronto"
                  />
                </Field>
                <Field label="Province">
                  <Input
                    value={billProvince}
                    onChange={(e) => setBillProvince(e.target.value)}
                    placeholder="ON"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Postal code">
                  <Input
                    value={billPostal}
                    onChange={(e) => setBillPostal(e.target.value)}
                    placeholder="M5H 2S6"
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={billCountry}
                    onChange={(e) => setBillCountry(e.target.value)}
                    placeholder="Canada"
                  />
                </Field>
              </div>
            </Section>

            {/* SECTION 3.5: Mailing Address (CL-5b) */}
            <Section title="Mailing Address">
              <Toggle
                label="Same as billing address"
                value={mailSameAsBilling}
                onChange={setMailSameAsBilling}
                help="On save, mailing address is copied from this client's billing address."
              />
              <Field label="Street">
                <AddressAutocomplete
                  value={mailSameAsBilling ? billStreet : mailStreet}
                  onChange={setMailStreet}
                  onPlaceSelected={(p) => {
                    setMailStreet(p.street);
                    if (p.city) setMailCity(p.city);
                    if (p.province) setMailProvince(p.province);
                    if (p.postal) setMailPostal(p.postal);
                    if (p.country) setMailCountry(p.country);
                  }}
                  placeholder="350 Bay Street"
                  disabled={mailSameAsBilling}
                />
              </Field>
              <Field label="Unit / Suite">
                <Input
                  value={mailSameAsBilling ? billUnit : mailUnit}
                  onChange={(e) => setMailUnit(e.target.value)}
                  placeholder="Suite 1200"
                  disabled={mailSameAsBilling}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <Input
                    value={mailSameAsBilling ? billCity : mailCity}
                    onChange={(e) => setMailCity(e.target.value)}
                    placeholder="Toronto"
                    disabled={mailSameAsBilling}
                  />
                </Field>
                <Field label="Province">
                  <Input
                    value={mailSameAsBilling ? billProvince : mailProvince}
                    onChange={(e) => setMailProvince(e.target.value)}
                    placeholder="ON"
                    disabled={mailSameAsBilling}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Postal code">
                  <Input
                    value={mailSameAsBilling ? billPostal : mailPostal}
                    onChange={(e) => setMailPostal(e.target.value)}
                    placeholder="M5H 2S6"
                    disabled={mailSameAsBilling}
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={mailSameAsBilling ? billCountry : mailCountry}
                    onChange={(e) => setMailCountry(e.target.value)}
                    placeholder="Canada"
                    disabled={mailSameAsBilling}
                  />
                </Field>
              </div>
            </Section>

            {/* CL-3c — Initial Contacts (create-mode only) */}
            {!isEdit && (
              <Section
                title="Initial Contacts (optional)"
                error={
                  errors.mainContactFirstName ||
                  errors.mainContactLastName ||
                  errors.apContactFirstName ||
                  errors.apContactLastName ||
                  errors.additionalContactFirstName ||
                  errors.additionalContactLastName
                }
              >
                <p className="text-muted-foreground text-xs">
                  Add up to 3 contacts now. Each contact needs at least a first
                  and last name. You can add more anytime from the client
                  detail page.
                </p>

                {/* ---- MAIN CONTACT ---- */}
                <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
                  <p className="nx-eyebrow-soft text-[10px]">Main Contact</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" error={errors.mainContactFirstName}>
                      <Input
                        value={mainContact.first_name}
                        onChange={(e) =>
                          setMainContact({
                            ...mainContact,
                            first_name: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Last name" error={errors.mainContactLastName}>
                      <Input
                        value={mainContact.last_name}
                        onChange={(e) =>
                          setMainContact({
                            ...mainContact,
                            last_name: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone">
                      <Input
                        type="tel"
                        value={mainContact.phone}
                        onChange={(e) =>
                          setMainContact({
                            ...mainContact,
                            phone: e.target.value,
                          })
                        }
                        placeholder="e.g. (416) 555-0100"
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={mainContact.email}
                        onChange={(e) =>
                          setMainContact({
                            ...mainContact,
                            email: e.target.value,
                          })
                        }
                        placeholder="name@example.com"
                      />
                    </Field>
                  </div>
                </div>

                {/* ---- ACCOUNTS PAYABLE CONTACT ---- */}
                <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
                  <p className="nx-eyebrow-soft text-[10px]">
                    Accounts Payable Contact
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First name" error={errors.apContactFirstName}>
                      <Input
                        value={apContact.first_name}
                        onChange={(e) =>
                          setApContact({
                            ...apContact,
                            first_name: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Last name" error={errors.apContactLastName}>
                      <Input
                        value={apContact.last_name}
                        onChange={(e) =>
                          setApContact({
                            ...apContact,
                            last_name: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone">
                      <Input
                        type="tel"
                        value={apContact.phone}
                        onChange={(e) =>
                          setApContact({ ...apContact, phone: e.target.value })
                        }
                        placeholder="e.g. (416) 555-0100"
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={apContact.email}
                        onChange={(e) =>
                          setApContact({ ...apContact, email: e.target.value })
                        }
                        placeholder="ap@example.com"
                      />
                    </Field>
                  </div>
                </div>

                {/* ---- ADDITIONAL CONTACT ---- */}
                <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
                  <p className="nx-eyebrow-soft text-[10px]">
                    Additional Contact (optional)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="First name"
                      error={errors.additionalContactFirstName}
                    >
                      <Input
                        value={additionalContact.first_name}
                        onChange={(e) =>
                          setAdditionalContact({
                            ...additionalContact,
                            first_name: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="Last name"
                      error={errors.additionalContactLastName}
                    >
                      <Input
                        value={additionalContact.last_name}
                        onChange={(e) =>
                          setAdditionalContact({
                            ...additionalContact,
                            last_name: e.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phone">
                      <Input
                        type="tel"
                        value={additionalContact.phone}
                        onChange={(e) =>
                          setAdditionalContact({
                            ...additionalContact,
                            phone: e.target.value,
                          })
                        }
                        placeholder="e.g. (416) 555-0100"
                      />
                    </Field>
                    <Field label="Email">
                      <Input
                        type="email"
                        value={additionalContact.email}
                        onChange={(e) =>
                          setAdditionalContact({
                            ...additionalContact,
                            email: e.target.value,
                          })
                        }
                        placeholder="name@example.com"
                      />
                    </Field>
                  </div>
                </div>
              </Section>
            )}

            {/* SECTION 4 */}
            <Section title="Operating Company" error={errors.allowedOpcos}>
              <Field label="Default operating company">
                <div className="flex flex-col gap-1.5">
                  {OPCOS.map((oc) => {
                    const guardianLocked =
                      oc.value === "guardian" && !isAdmin;
                    return (
                      <label
                        key={oc.value}
                        className="flex items-center gap-2 text-sm"
                        title={
                          guardianLocked
                            ? "Admin-only — contact admin to enable Guardian access"
                            : undefined
                        }
                      >
                        <input
                          type="radio"
                          name="default_opco"
                          checked={defaultOpco === oc.value}
                          disabled={guardianLocked}
                          onChange={() => setDefaultOpco(oc.value)}
                        />
                        <span
                          className={
                            guardianLocked
                              ? "text-muted-foreground"
                              : undefined
                          }
                        >
                          {oc.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Field>
              <Field label="Allowed operating companies">
                <div className="flex flex-col gap-1.5">
                  {OPCOS.map((oc) => {
                    const guardianLocked =
                      oc.value === "guardian" && !isAdmin;
                    return (
                      <label
                        key={oc.value}
                        className="flex items-center gap-2 text-sm"
                        title={
                          guardianLocked
                            ? "Admin-only — contact admin to enable Guardian access"
                            : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={allowedOpcos.includes(oc.value)}
                          disabled={guardianLocked}
                          onChange={() => toggleAllowedOpco(oc.value)}
                        />
                        <span
                          className={
                            guardianLocked
                              ? "text-muted-foreground"
                              : undefined
                          }
                        >
                          {oc.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Field>
            </Section>

            {/* SECTION 5 */}
            <Section title="Tax">
              <Field label="HST / GST number">
                <Input
                  value={hstGst}
                  onChange={(e) => setHstGst(e.target.value)}
                  placeholder="123456789 RT0001"
                />
              </Field>
              <Toggle
                label="Tax-exempt"
                value={taxExempt}
                onChange={setTaxExempt}
              />
              {taxExempt && (
                <Field
                  label="Tax-exempt certificate number *"
                  error={errors.taxCert}
                >
                  <Input
                    value={taxCert}
                    onChange={(e) => setTaxCert(e.target.value)}
                    placeholder="Certificate / exemption ref."
                  />
                </Field>
              )}
            </Section>

            {/* SECTION 6 */}
            <Section title="Payment Terms & Method">
              <Field label="Payment terms">
                <Select
                  value={paymentTerms}
                  onValueChange={(v) =>
                    setPaymentTerms((v ?? "net_30") as DbClientPaymentTerms)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {paymentTerms === "custom" && (
                <Field
                  label="Custom payment terms *"
                  error={errors.paymentTermsCustom}
                >
                  <Input
                    value={paymentTermsCustom}
                    onChange={(e) => setPaymentTermsCustom(e.target.value)}
                    placeholder="e.g. 50% deposit, balance NET 45"
                  />
                </Field>
              )}
              <Field label="Preferred payment method">
                <Select
                  value={payMethod}
                  onValueChange={(v) =>
                    setPayMethod((v ?? "eft") as DbClientPaymentMethod)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Toggle
                label="Apply credit-card surcharge"
                value={ccSurcharge}
                onChange={setCcSurcharge}
                help="Adds 2.5% + applicable HST line on invoices when paid by credit card."
              />
              <Field label="Credit limit (CAD)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Toggle
                label="Credit hold"
                value={creditHold}
                onChange={setCreditHold}
                help="Blocks new quotes/jobs against this client when ON."
              />
              <Field label="Preferred currency">
                <div className="flex gap-4">
                  {(["CAD", "USD"] as DbClientCurrency[]).map((c) => (
                    <label
                      key={c}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="currency"
                        checked={currency === c}
                        onChange={() => setCurrency(c)}
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </Field>
            </Section>

            {/* SECTION 7 */}
            <Section title="Portal Access">
              <Toggle
                label="Portal access enabled"
                value={portalEnabled}
                onChange={setPortalEnabled}
                help="Login provisioning ships with the Users module."
              />
              {portalEnabled && (
                <Field
                  label="Portal contact email *"
                  error={errors.portalEmail}
                >
                  <Input
                    type="email"
                    value={portalEmail}
                    onChange={(e) => setPortalEmail(e.target.value)}
                    placeholder="ap@client.com"
                  />
                </Field>
              )}
            </Section>

            {/* SECTION 8 */}
            <Section title="Notes">
              <Field label="Notes">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes — not shown to the client."
                />
              </Field>
            </Section>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:bg-muted rounded-md px-3 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || isInvalid}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold tracking-wide shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
                style={{
                  background: "var(--brand-accent)",
                  color: "var(--brand-primary)",
                }}
              >
                {pending
                  ? "Saving…"
                  : isEdit
                    ? "Save changes"
                    : "Add client"}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({
  title,
  defaultOpen,
  error,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-md border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted/50 flex w-full items-center justify-between rounded-t-md px-3 py-2.5 text-left"
      >
        <span className="font-serif text-sm font-medium">{title}</span>
        <span className="flex items-center gap-2">
          {error && (
            <span className="text-[10px] font-medium text-red-600">
              needs attention
            </span>
          )}
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>
      {open && <div className="space-y-3 px-3 pb-4 pt-1">{children}</div>}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="nx-eyebrow-soft text-[10px]">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label className="nx-eyebrow-soft text-[10px]">{label}</Label>
        {help && (
          <p className="text-muted-foreground mt-1 text-[11px]">{help}</p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant={value ? "default" : "outline"}
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className="min-w-[3.25rem] shrink-0"
      >
        {value ? "On" : "Off"}
      </Button>
    </div>
  );
}
