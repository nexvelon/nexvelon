"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  createSiteAction,
  updateClientAction,
  getCurrentUserIsAdminAction,
  getPrimaryContactAction,
} from "./actions";
import { ContactFormDrawer } from "./ContactFormDrawer";
import type {
  DbClient,
  DbClientCurrency,
  DbClientOpco,
  DbClientPaymentMethod,
  DbClientPaymentTerms,
  DbClientStatus,
  DbClientTier,
  DbClientType,
  DbContact,
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
    existing?.status ?? "Active"
  );
  const [type, setType] = useState<DbClientType | "">(existing?.type ?? "");
  const [tier, setTier] = useState<DbClientTier | "">(existing?.tier ?? "");
  const [industry, setIndustry] = useState(existing?.industry ?? "");
  const [tags, setTags] = useState((existing?.tags ?? []).join(", "));

  // --- Section 2: Primary Contact (edit-mode only) ---
  const [primaryContact, setPrimaryContact] = useState<DbContact | null>(null);
  const [contactDrawer, setContactDrawer] = useState<
    | { kind: "create"; clientId: string }
    | { kind: "edit"; contact: DbContact }
    | null
  >(null);

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
  const [billSameAsSite, setBillSameAsSite] = useState(
    existing?.billing_same_as_primary_site ?? false
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

  // --- CL-3b: Initial Site (create-mode only) ---
  const [initialSite, setInitialSite] = useState({
    name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    province: "",
    postal_code: "",
    country: "Canada",
  });

  // The Initial Site section is "active" once any field has content.
  const isInitialSiteActive =
    initialSite.name.trim() !== "" ||
    initialSite.address_line1.trim() !== "" ||
    initialSite.address_line2.trim() !== "" ||
    initialSite.city.trim() !== "" ||
    initialSite.province.trim() !== "" ||
    initialSite.postal_code.trim() !== "";

  const [pending, startTransition] = useTransition();

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

  // Fetch the primary contact (edit mode only — needs a persisted client id).
  const refreshPrimaryContact = () => {
    if (!existing) return;
    getPrimaryContactAction(existing.id).then((r) => {
      if (r.ok) setPrimaryContact(r.data);
    });
  };
  useEffect(() => {
    if (!open || !existing) return;
    refreshPrimaryContact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

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
  // CL-3b: when the Initial Site section has content, a site name is required.
  if (isInitialSiteActive && !initialSite.name.trim())
    errors.initialSiteName =
      "Site name is required when adding an initial site.";
  const isInvalid = Object.keys(errors).length > 0;

  const toggleAllowedOpco = (oc: DbClientOpco) => {
    setAllowedOpcos((prev) =>
      prev.includes(oc) ? prev.filter((x) => x !== oc) : [...prev, oc]
    );
  };

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
      billing_same_as_primary_site: billSameAsSite,
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

      // Edit mode, or create with no initial site → original success path.
      if (isEdit || !isInitialSiteActive) {
        toast.success(isEdit ? `Updated ${tradeName}` : `Added ${tradeName}`);
        onClose();
        return;
      }

      // CL-3b: create mode + initial site active → chain the site insert.
      const siteName = initialSite.name.trim();
      const siteRes = await createSiteAction({
        client_id: result.data.id,
        name: siteName,
        address_line1: initialSite.address_line1.trim() || null,
        address_line2: initialSite.address_line2.trim() || null,
        city: initialSite.city.trim() || null,
        province: initialSite.province.trim() || null,
        postal_code: initialSite.postal_code.trim() || null,
        country: initialSite.country.trim() || "Canada",
      });

      if (siteRes.ok) {
        toast.success(`Added ${tradeName} · site “${siteName}” added`);
      } else {
        // Partial success — the client exists; the site can be added later.
        // No rollback: there is no transaction across the two server actions.
        toast.warning(
          `${tradeName} created, but the initial site couldn't be added: ${siteRes.error}. You can add it later from the Clients list.`
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
            {/* SECTION 1 */}
            <Section title="Identity & Classification" defaultOpen>
              <Field label="Legal name *" error={errors.legalName}>
                <Input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Meridian Capital Plaza Holdings Inc."
                />
              </Field>
              <Field label="Trade / display name">
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

            {/* SECTION 2 */}
            <Section title="Primary Contact" defaultOpen>
              {!existing ? (
                <p className="text-muted-foreground text-xs italic">
                  Create client first, then add a primary contact.
                </p>
              ) : primaryContact ? (
                <div className="space-y-1 rounded-md border border-[var(--border)] p-3">
                  <p className="text-sm font-medium">
                    {primaryContact.first_name} {primaryContact.last_name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {primaryContact.email ?? "—"} ·{" "}
                    {primaryContact.phone ?? "—"}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() =>
                      setContactDrawer({
                        kind: "edit",
                        contact: primaryContact,
                      })
                    }
                  >
                    Edit
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs">
                    No primary contact set.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setContactDrawer({
                        kind: "create",
                        clientId: existing.id,
                      })
                    }
                  >
                    Create primary contact
                  </Button>
                  <p className="text-muted-foreground text-[11px] italic">
                    Toggle “Primary contact” inside the contact form — the
                    contact drawer does not yet accept a primary default.
                  </p>
                </div>
              )}
            </Section>

            {/* SECTION 3 */}
            <Section title="Billing Address">
              <Toggle
                label="Same as primary site address"
                value={billSameAsSite}
                onChange={setBillSameAsSite}
                help="On save, billing address is copied from this client's first site."
              />
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
                  disabled={billSameAsSite}
                  placeholder="350 Bay Street"
                />
              </Field>
              <Field label="Unit / Suite">
                <Input
                  value={billUnit}
                  onChange={(e) => setBillUnit(e.target.value)}
                  disabled={billSameAsSite}
                  placeholder="Suite 1200"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <Input
                    value={billCity}
                    onChange={(e) => setBillCity(e.target.value)}
                    disabled={billSameAsSite}
                    placeholder="Toronto"
                  />
                </Field>
                <Field label="Province">
                  <Input
                    value={billProvince}
                    onChange={(e) => setBillProvince(e.target.value)}
                    disabled={billSameAsSite}
                    placeholder="ON"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Postal code">
                  <Input
                    value={billPostal}
                    onChange={(e) => setBillPostal(e.target.value)}
                    disabled={billSameAsSite}
                    placeholder="M5H 2S6"
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={billCountry}
                    onChange={(e) => setBillCountry(e.target.value)}
                    disabled={billSameAsSite}
                    placeholder="Canada"
                  />
                </Field>
              </div>
            </Section>

            {/* CL-3b — Initial Site (create-mode only) */}
            {!isEdit && (
              <Section
                title="Initial Site (optional)"
                error={errors.initialSiteName}
              >
                <p className="text-muted-foreground text-xs">
                  Add the client&apos;s first site now. Skip this section if no
                  specific site applies yet — you can add sites anytime from the
                  Clients list.
                </p>

                <Field label="Site name" error={errors.initialSiteName}>
                  <Input
                    value={initialSite.name}
                    onChange={(e) =>
                      setInitialSite({ ...initialSite, name: e.target.value })
                    }
                    placeholder="e.g. Main Office, Downtown Branch"
                  />
                </Field>

                <Field label="Address — line 1">
                  <AddressAutocomplete
                    value={initialSite.address_line1}
                    onChange={(value) =>
                      setInitialSite({ ...initialSite, address_line1: value })
                    }
                    onPlaceSelected={(p) =>
                      setInitialSite({
                        ...initialSite,
                        address_line1: p.street || initialSite.address_line1,
                        city: p.city || initialSite.city,
                        province: p.province || initialSite.province,
                        postal_code: p.postal || initialSite.postal_code,
                        country: p.country || initialSite.country,
                      })
                    }
                    placeholder="Start typing an address…"
                  />
                </Field>

                <Field label="Address — line 2">
                  <Input
                    value={initialSite.address_line2}
                    onChange={(e) =>
                      setInitialSite({
                        ...initialSite,
                        address_line2: e.target.value,
                      })
                    }
                    placeholder="Unit / suite / floor (optional)"
                  />
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="City">
                    <Input
                      value={initialSite.city}
                      onChange={(e) =>
                        setInitialSite({
                          ...initialSite,
                          city: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Province">
                    <Input
                      value={initialSite.province}
                      onChange={(e) =>
                        setInitialSite({
                          ...initialSite,
                          province: e.target.value,
                        })
                      }
                      placeholder="ON"
                    />
                  </Field>
                  <Field label="Postal code">
                    <Input
                      value={initialSite.postal_code}
                      onChange={(e) =>
                        setInitialSite({
                          ...initialSite,
                          postal_code: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>

                <Field label="Country">
                  <Input
                    value={initialSite.country}
                    onChange={(e) =>
                      setInitialSite({
                        ...initialSite,
                        country: e.target.value,
                      })
                    }
                  />
                </Field>
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

      {contactDrawer && (
        <ContactFormDrawer
          open={!!contactDrawer}
          onClose={() => {
            setContactDrawer(null);
            refreshPrimaryContact();
          }}
          mode={contactDrawer}
        />
      )}
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
