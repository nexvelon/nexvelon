"use client";

// SITES-2b — Shared site-form body. Lifted from SiteFormDrawer (which now
// becomes a thin Sheet wrapper) so both the drawer (edit mode) and the new
// full-screen /sites/new page (create mode) consume the exact same form.
//
// Mirrors the CL-9 ClientForm architecture: discriminated Mode union,
// onSubmitSuccess(id) callback, 8 collapsible Sections, internal Section /
// Field / Toggle helpers. The SITES-2a schema added 28 new columns; this
// form surfaces them via three live inheritance toggles:
//
//   1. billing_same_as_client (default true) — billing fields inherit from
//      the parent client's billing_*
//   2. mailing_same_as_billing (default true) — mailing fields inherit
//      from the site's effective billing (which itself may inherit)
//   3. inherit_payment_terms_from_client (default true) — single flag that
//      gates Tax + Payment + Portal sections as a group (SITES-2a
//      Decision Point 3 — splittable additively later)
//
// Inheritance semantics (Decision Point 1): when a toggle is ON, the
// site's own fields are persisted as NULL — the client is the only source
// of truth. When toggled OFF, the UI pre-populates with the client's
// values (one-time copy) so the operator has a starting point, then
// edits and we persist the site's own values.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { PhonesEditor } from "./PhonesEditor";
import { AddressSection } from "./AddressSection";
import {
  createContactAction,
  createSiteAction,
  updateSiteAction,
} from "../actions";
// ADDR-1: canada-provinces removed; lib/countries.ts now consolidates
// the per-country province lists. AddressSection encapsulates the
// Country + Province dropdowns; SiteForm no longer needs the constant.
import { defaultTaxRateForProvince } from "@/lib/tax-rates";
import type {
  ContactPhone,
  DbClient,
  DbClientCurrency,
  DbClientPaymentMethod,
  DbClientPaymentTerms,
  DbContactInsert,
  DbSite,
  DbSiteInsert,
  DbSiteStatus,
} from "@/lib/types/database";
// SITES-3: type-only import — the site template module itself is
// dynamic-imported inside handleDownloadTemplate / handleUploadTemplate
// so the ~1 MB exceljs lib stays out of the main bundle.
import type { ParsedContact } from "@/lib/site-form-template";

// ─── Module-level constants ────────────────────────────────────────────────

const STATUSES: DbSiteStatus[] = [
  "In Quote",
  "Active",
  "In Project",
  "Maintained",
  "Decommissioned",
];

// Reuse the canonical labels from ClientForm (same DB enums on both tables).
const PAYMENT_TERMS: { value: DbClientPaymentTerms; label: string }[] = [
  { value: "due_on_receipt", label: "Due on receipt" },
  { value: "net_7", label: "NET 7" },
  { value: "net_15", label: "NET 15" },
  { value: "net_30", label: "NET 30" },
  { value: "net_60", label: "NET 60" },
  { value: "net_90", label: "NET 90" },
  { value: "custom", label: "Custom" },
];

// CL-11: mirrors ClientForm — reordered + dropped Cheque + added Cash.
// The Cheque-legacy conditional include lives at the render site since
// SiteForm's dropdown is also driven by the parent client's value when
// inheritFromClient is true.
const PAYMENT_METHODS: { value: DbClientPaymentMethod; label: string }[] = [
  { value: "eft", label: "EFT" },
  { value: "e_transfer", label: "e-Transfer" },
  { value: "wire", label: "Wire" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Types ────────────────────────────────────────────────────────────────

export type Mode =
  | { kind: "create"; clientId?: string }
  | { kind: "edit"; site: DbSite };

// Mirrors ClientForm's ContactRowState exactly (CL-5c / CL-7). The only
// difference at fan-out is that we set BOTH client_id AND site_id on
// each created contact (dual-FK).
type ContactRowState = {
  first_name: string;
  last_name: string;
  role: string;
  email: string;
  phones: ContactPhone[];
  is_primary: boolean;
  is_billing: boolean;
  is_emergency: boolean;
  is_accounts_payable: boolean;
  contact_type_custom: string;
  has_custom_type: boolean; // UI-only — not persisted
};

function newEmptyContact(): ContactRowState {
  return {
    first_name: "",
    last_name: "",
    role: "",
    email: "",
    phones: [{ label: "Phone", number: "" }],
    is_primary: false,
    is_billing: false,
    is_emergency: false,
    is_accounts_payable: false,
    contact_type_custom: "",
    has_custom_type: false,
  };
}

// ─── SITES-3: parser-side merge-by-name helpers ──────────────────────────
// Duplicated from ClientForm.tsx — same merge semantics for the 4-row
// template (rows 1+2 → Primary pair, rows 3+4 → AP pair). Future option:
// extract to a shared module if both forms diverge in lockstep.

/** Case-insensitive trimmed match on first AND last name. Returns false
 *  if either side has an empty name. */
function namesMatch(a: ParsedContact, b: ParsedContact): boolean {
  const af = a.first_name.trim().toLowerCase();
  const al = a.last_name.trim().toLowerCase();
  const bf = b.first_name.trim().toLowerCase();
  const bl = b.last_name.trim().toLowerCase();
  if (!af || !al || !bf || !bl) return false;
  return af === bf && al === bl;
}

/** A parsed-template contact row has content if any of name/email/phone
 *  is non-empty. Used to decide whether to produce a contact from a
 *  non-merged row. */
function hasContactContent(pc: ParsedContact): boolean {
  return Boolean(
    pc.first_name.trim() ||
      pc.last_name.trim() ||
      pc.email.trim() ||
      pc.phone.trim()
  );
}

/** Convert a single (non-merged) ParsedContact into a ContactRowState
 *  with the right type-flag booleans + phone label. */
function buildContact(
  pc: ParsedContact,
  fallbackRole: string,
  phoneLabel: string,
  flags: {
    is_primary?: boolean;
    is_billing?: boolean;
    is_accounts_payable?: boolean;
  }
): ContactRowState {
  return {
    first_name: pc.first_name,
    last_name: pc.last_name,
    role: pc.role.trim() || pc.type_label.trim() || fallbackRole,
    email: pc.email.trim(),
    phones: [{ label: phoneLabel, number: pc.phone.trim() }],
    is_primary: flags.is_primary ?? false,
    is_billing: flags.is_billing ?? false,
    is_emergency: false,
    is_accounts_payable: flags.is_accounts_payable ?? false,
    contact_type_custom: "",
    has_custom_type: false,
  };
}

interface SiteFormProps {
  mode: Mode;
  /**
   * Full client rows used both for the picker (in create mode without a
   * preset clientId) AND for inheritance display (showing the parent
   * client's billing/payment/portal values when the matching inheritance
   * toggle is ON). Always pass at least the parent client when editing;
   * the picker only shows for create-no-preset.
   */
  clients: DbClient[];
  /**
   * Fires after a successful create OR edit. Receives the site id (the
   * existing id for edits, the freshly-created id for creates). The
   * drawer wrapper ignores the id and just closes; the page wrapper uses
   * it to navigate (currently to /sites since no /sites/[id] exists).
   */
  onSubmitSuccess: (siteId: string) => void;
  /** Fires when the user clicks Cancel. Drawer closes; page navigates back. */
  onCancel: () => void;
}

// ──────────────────────────────────────────────────────────────────────────

export function SiteForm({
  mode,
  clients,
  onSubmitSuccess,
  onCancel,
}: SiteFormProps) {
  const isEdit = mode.kind === "edit";
  const existing = isEdit ? mode.site : null;
  const presetClientId = !isEdit ? mode.clientId : undefined;

  // In edit mode the existing site has a fixed client_id. In create mode we
  // start with whatever the preset is (from the query param) or "" so the
  // operator picks from the dropdown.
  const initialClientId =
    existing?.client_id ?? presetClientId ?? "";

  const needsClientPicker = !isEdit && !presetClientId;

  // ─── Site basics ───
  const [selectedClientId, setSelectedClientId] =
    useState<string>(initialClientId);
  const [name, setName] = useState(existing?.name ?? "");
  const [siteCode] = useState(existing?.site_code ?? "");
  const [status, setStatus] = useState<DbSiteStatus>(
    existing?.status ?? "Active"
  );
  const [lastServiceDate, setLastServiceDate] = useState(
    existing?.last_service_date ?? ""
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  // ─── GC / Site Supervisor ───
  const [gcName, setGcName] = useState(existing?.gc_name ?? "");
  const [gcPhone, setGcPhone] = useState(existing?.gc_phone ?? "");
  const [gcEmail, setGcEmail] = useState(existing?.gc_email ?? "");

  // ─── Site (physical) address ───
  const [address1, setAddress1] = useState(existing?.address_line1 ?? "");
  const [address2, setAddress2] = useState(existing?.address_line2 ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [province, setProvince] = useState(existing?.province ?? "");
  const [postal, setPostal] = useState(existing?.postal_code ?? "");
  const [siteCountry, setSiteCountry] = useState(existing?.country ?? "Canada");

  // ─── Billing (defaults inherit from client) ───
  const [billSameAsClient, setBillSameAsClient] = useState(
    existing?.billing_same_as_client ?? true
  );
  const [billStreet, setBillStreet] = useState(existing?.billing_street ?? "");
  const [billUnit, setBillUnit] = useState(existing?.billing_unit ?? "");
  const [billCity, setBillCity] = useState(existing?.billing_city ?? "");
  const [billProvince, setBillProvince] = useState(
    existing?.billing_province ?? ""
  );
  const [billPostal, setBillPostal] = useState(existing?.billing_postal ?? "");
  const [billCountry, setBillCountry] = useState(
    existing?.billing_country ?? "Canada"
  );

  // ─── Mailing (defaults inherit from billing) ───
  const [mailSameAsBilling, setMailSameAsBilling] = useState(
    existing?.mailing_same_as_billing ?? true
  );
  const [mailStreet, setMailStreet] = useState(existing?.mailing_street ?? "");
  const [mailUnit, setMailUnit] = useState(existing?.mailing_unit ?? "");
  const [mailCity, setMailCity] = useState(existing?.mailing_city ?? "");
  const [mailProvince, setMailProvince] = useState(
    existing?.mailing_province ?? ""
  );
  const [mailPostal, setMailPostal] = useState(existing?.mailing_postal ?? "");
  const [mailCountry, setMailCountry] = useState(
    existing?.mailing_country ?? "Canada"
  );

  // ─── Tax / Payment / Portal — single inherit flag gates all three ───
  const [inheritFromClient, setInheritFromClient] = useState(
    existing?.inherit_payment_terms_from_client ?? true
  );

  // Tax
  const [siteHstGst, setSiteHstGst] = useState(
    existing?.site_hst_gst_number ?? ""
  );
  const [taxExempt, setTaxExempt] = useState(existing?.tax_exempt ?? false);
  const [taxExemptCert, setTaxExemptCert] = useState(
    existing?.tax_exempt_certificate_number ?? ""
  );
  const [taxRate, setTaxRate] = useState<string>(
    existing?.tax_rate != null ? String(existing.tax_rate) : ""
  );

  // Payment
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
  const [creditLimit, setCreditLimit] = useState<string>(
    existing?.credit_limit != null ? String(existing.credit_limit) : ""
  );
  const [creditHold, setCreditHold] = useState(existing?.credit_hold ?? false);
  const [currency, setCurrency] = useState<DbClientCurrency>(
    existing?.preferred_currency ?? "CAD"
  );

  // Portal
  const [portalEnabled, setPortalEnabled] = useState(
    existing?.portal_access_enabled ?? false
  );
  const [portalEmail, setPortalEmail] = useState(
    existing?.portal_contact_email ?? ""
  );

  // ─── Contacts (create-mode only) — dynamic rows; mirror ClientForm ───
  const [contacts, setContacts] = useState<ContactRowState[]>([]);

  const isContactActive = (c: ContactRowState) =>
    c.first_name.trim() !== "" ||
    c.last_name.trim() !== "" ||
    c.role.trim() !== "" ||
    c.email.trim() !== "" ||
    c.phones.some((p) => p.number.trim() !== "");

  // ─── UI plumbing ───
  const [pending, startTransition] = useTransition();

  // Avoid wiping a manual tax_rate edit when the user changes province —
  // we only want the auto-fill to fire on explicit button click, not as a
  // side effect of every province change. Tracking whether the field is
  // currently auto-filled is overkill; the explicit button is the contract.
  const _unused = useRef(null);
  void _unused;

  // ─── Derived helpers ───

  // The currently-selected parent client — null if the picker hasn't fired
  // yet OR if the preset id doesn't match any client in the `clients` prop
  // (shouldn't happen but defensive).
  const parentClient = useMemo<DbClient | null>(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  // For the tax-rate auto-fill: prefer the site's billing country +
  // province (when billing is overridden), otherwise the parent
  // client's billing country + province (when billing is inherited).
  // The site's physical address is ignored — tax follows the billing
  // address. ADDR-1 makes the lookup country-aware.
  const taxCountryForLookup =
    billSameAsClient && parentClient
      ? parentClient.billing_country
      : billCountry || null;
  const taxProvinceForLookup =
    billSameAsClient && parentClient
      ? parentClient.billing_province
      : billProvince || null;
  const suggestedTaxRate = defaultTaxRateForProvince(
    taxCountryForLookup,
    taxProvinceForLookup
  );

  // ─── Validation ───
  const errors: Record<string, string> = {};
  if (!selectedClientId) errors.client = "Client is required.";
  if (!name.trim()) errors.name = "Site/Project name is required.";
  // SITE-FIELDS: fields are always real/editable now, so validate them
  // unconditionally (no longer skipped while "inheriting" from the client).
  if (portalEnabled) {
    if (!portalEmail.trim())
      errors.portalEmail = "Portal contact email is required.";
    else if (!EMAIL_RE.test(portalEmail.trim()))
      errors.portalEmail = "Enter a valid email address.";
  }
  if (taxExempt && !taxExemptCert.trim())
    errors.taxExemptCert = "Certificate number is required when tax-exempt.";
  if (paymentTerms === "custom" && !paymentTermsCustom.trim())
    errors.paymentTermsCustom = "Custom terms text is required.";
  contacts.forEach((c, i) => {
    if (isContactActive(c)) {
      if (!c.first_name.trim())
        errors[`contact${i}FirstName`] = "First name is required";
      if (!c.last_name.trim())
        errors[`contact${i}LastName`] = "Last name is required";
    }
  });
  const isInvalid = Object.keys(errors).length > 0;

  // ─── Inheritance toggle handlers — one-time copy on toggle OFF ───

  function handleBillingInheritToggle(inherit: boolean) {
    if (!inherit && parentClient) {
      // Toggling OFF — pre-fill with client values so operator has a
      // starting point. Only fires when there's a parent to copy from.
      setBillStreet(parentClient.billing_street ?? "");
      setBillUnit(parentClient.billing_unit ?? "");
      setBillCity(parentClient.billing_city ?? "");
      setBillProvince(parentClient.billing_province ?? "");
      setBillPostal(parentClient.billing_postal ?? "");
      setBillCountry(parentClient.billing_country ?? "Canada");
    }
    setBillSameAsClient(inherit);
  }

  function handleMailingInheritToggle(inherit: boolean) {
    if (!inherit) {
      // Toggling OFF — pre-fill with whatever the effective billing is
      // (the site's own billing if overridden, else the client's billing).
      const effStreet = billSameAsClient
        ? parentClient?.billing_street ?? ""
        : billStreet;
      const effUnit = billSameAsClient
        ? parentClient?.billing_unit ?? ""
        : billUnit;
      const effCity = billSameAsClient
        ? parentClient?.billing_city ?? ""
        : billCity;
      const effProvince = billSameAsClient
        ? parentClient?.billing_province ?? ""
        : billProvince;
      const effPostal = billSameAsClient
        ? parentClient?.billing_postal ?? ""
        : billPostal;
      const effCountry = billSameAsClient
        ? parentClient?.billing_country ?? "Canada"
        : billCountry;
      setMailStreet(effStreet);
      setMailUnit(effUnit);
      setMailCity(effCity);
      setMailProvince(effProvince);
      setMailPostal(effPostal);
      setMailCountry(effCountry);
    }
    setMailSameAsBilling(inherit);
  }

  // SITE-FIELDS: copy the client's current tax/payment/portal values into the
  // site's own (editable) fields. Used as a prefill convenience — it never
  // locks the fields; the site always stores its own values.
  function prefillTaxPaymentPortalFromClient(client: DbClient) {
    setSiteHstGst(client.client_hst_gst_number ?? "");
    setTaxExempt(client.tax_exempt ?? false);
    setTaxExemptCert(client.tax_exempt_certificate_number ?? "");
    // Client has no tax_rate column — fall back to the province default.
    setTaxRate(suggestedTaxRate != null ? String(suggestedTaxRate) : "");
    setPaymentTerms(client.payment_terms ?? "net_30");
    setPaymentTermsCustom(client.payment_terms_custom ?? "");
    setPayMethod(client.preferred_payment_method ?? "eft");
    setCcSurcharge(client.apply_cc_surcharge ?? true);
    setCreditLimit(
      client.credit_limit != null ? String(client.credit_limit) : ""
    );
    setCreditHold(client.credit_hold ?? false);
    setCurrency(client.preferred_currency ?? "CAD");
    setPortalEnabled(client.portal_access_enabled ?? false);
    setPortalEmail(client.portal_contact_email ?? "");
  }

  // SITE-FIELDS: the inherit toggle is now a PREFILL convenience, not a lock.
  // Turning it ON copies the client's current values into the (still editable)
  // site fields; turning it OFF leaves the current values untouched. The flag
  // is persisted to record "these were taken from the client"; editing any
  // field flips it OFF (markOverridden) since the values then diverge.
  function handleInheritFromClientToggle(inherit: boolean) {
    if (inherit && parentClient) prefillTaxPaymentPortalFromClient(parentClient);
    setInheritFromClient(inherit);
  }

  // SITE-FIELDS: any manual edit to a tax/payment/portal field means the site
  // no longer simply mirrors the client — drop the "inherited" flag.
  function markOverridden() {
    setInheritFromClient(false);
  }

  // SITE-FIELDS: new sites default to inherit ON and are prefilled from the
  // parent client once it's known (e.g. preset from a client page, or picked).
  // Runs once; an existing site loads its own stored values, and any edit
  // (markOverridden) clears the flag so this won't clobber overrides.
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (isEdit || didPrefillRef.current) return;
    if (inheritFromClient && parentClient) {
      prefillTaxPaymentPortalFromClient(parentClient);
      didPrefillRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentClient]);

  // ─── SITES-3: template download / upload ─────────────────────────────
  // Hidden file input ref for the "Upload filled template" trigger.
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleDownloadTemplate() {
    try {
      const { generateSiteTemplate } = await import(
        "@/lib/site-form-template"
      );
      const blob = await generateSiteTemplate();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Site Form.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success("Template downloaded");
    } catch (e) {
      console.error("[SITES-3] Template generation failed:", e);
      toast.error("Failed to generate template");
    }
  }

  async function handleUploadTemplate(file: File) {
    let parsed;
    try {
      const { parseSiteTemplate } = await import("@/lib/site-form-template");
      parsed = await parseSiteTemplate(file);
    } catch (e) {
      console.error("[SITES-3] Template parse failed:", e);
      toast.error(
        e instanceof Error ? e.message : "Failed to parse template"
      );
      return;
    }
    const r = parsed.contacts; // always length 4

    // ─── Collect missing-mandatory-field list BEFORE setting state.
    const missing: string[] = [];

    // Site Info + Site Address (all 7 mandatory)
    if (!parsed.site.name) missing.push("Site/Project Name");
    if (!parsed.site.address_line1) missing.push("Site Address Street");
    if (!parsed.site.address_line2) missing.push("Site Address Unit / Suite");
    if (!parsed.site.city) missing.push("Site Address City");
    if (!parsed.site.province) missing.push("Site Address Province");
    if (!parsed.site.postal_code) missing.push("Site Address Postal Code");
    if (!parsed.site.country) missing.push("Site Address Country");

    // Billing — all 6 mandatory
    if (!parsed.billing.street) missing.push("Billing Street");
    if (!parsed.billing.unit) missing.push("Billing Unit / Suite");
    if (!parsed.billing.city) missing.push("Billing City");
    if (!parsed.billing.province) missing.push("Billing Province");
    if (!parsed.billing.postal) missing.push("Billing Postal Code");
    if (!parsed.billing.country) missing.push("Billing Country");

    // Tax
    if (!parsed.tax.hst_gst_number) missing.push("HST / GST Number");
    if (parsed.tax.tax_exempt === null) missing.push("Tax Exempt? (Yes/No)");
    if (parsed.tax.tax_exempt === true && !parsed.tax.tax_exempt_cert)
      missing.push("If Tax Exempt, Enter Certificate Number");

    // Payment
    if (!parsed.payment.terms) missing.push("Select Payment Terms");
    if (!parsed.payment.method) missing.push("Select Payment Method");
    if (!parsed.payment.currency) missing.push("Select Currency");

    // Contacts — rows 1 + 3 mandatory.
    if (!r[0]?.first_name || !r[0]?.last_name)
      missing.push("Primary Contact Work (name)");
    if (!r[0]?.role) missing.push("Primary Contact Work (role)");
    if (!r[0]?.email) missing.push("Primary Contact Work (email)");
    if (!r[0]?.phone) missing.push("Primary Contact Work (phone)");
    if (!r[2]?.first_name || !r[2]?.last_name)
      missing.push("AP work/ext Contact (name)");
    if (!r[2]?.role) missing.push("AP work/ext Contact (role)");
    if (!r[2]?.email) missing.push("AP work/ext Contact (email)");
    if (!r[2]?.phone) missing.push("AP work/ext Contact (phone)");

    // ─── Site basics ───
    if (parsed.site.name) setName(parsed.site.name);

    // ─── Site physical address ───
    if (parsed.site.address_line1) setAddress1(parsed.site.address_line1);
    if (parsed.site.address_line2) setAddress2(parsed.site.address_line2);
    if (parsed.site.city) setCity(parsed.site.city);
    if (parsed.site.province) setProvince(parsed.site.province);
    if (parsed.site.postal_code) setPostal(parsed.site.postal_code);
    if (parsed.site.country) setSiteCountry(parsed.site.country);

    // ─── Billing — auto-OFF same-as-client when template has values ───
    const billingHasContent =
      !!parsed.billing.street ||
      !!parsed.billing.unit ||
      !!parsed.billing.city ||
      !!parsed.billing.province ||
      !!parsed.billing.postal ||
      !!parsed.billing.country;
    if (billingHasContent) {
      setBillSameAsClient(false);
      if (parsed.billing.street) setBillStreet(parsed.billing.street);
      if (parsed.billing.unit) setBillUnit(parsed.billing.unit);
      if (parsed.billing.city) setBillCity(parsed.billing.city);
      if (parsed.billing.province) setBillProvince(parsed.billing.province);
      if (parsed.billing.postal) setBillPostal(parsed.billing.postal);
      if (parsed.billing.country) setBillCountry(parsed.billing.country);
    }

    // ─── Mailing — auto-detect "same as billing" / auto-OFF on content ─
    const mailingHasContent =
      !!parsed.mailing.street ||
      !!parsed.mailing.unit ||
      !!parsed.mailing.city ||
      !!parsed.mailing.province ||
      !!parsed.mailing.postal ||
      !!parsed.mailing.country;
    if (mailingHasContent) {
      setMailSameAsBilling(false);
      if (parsed.mailing.street) setMailStreet(parsed.mailing.street);
      if (parsed.mailing.unit) setMailUnit(parsed.mailing.unit);
      if (parsed.mailing.city) setMailCity(parsed.mailing.city);
      if (parsed.mailing.province) setMailProvince(parsed.mailing.province);
      if (parsed.mailing.postal) setMailPostal(parsed.mailing.postal);
      if (parsed.mailing.country) setMailCountry(parsed.mailing.country);
    }

    // ─── Tax / Payment — auto-OFF inheritFromClient on content ─────────
    const taxPaymentHasContent =
      !!parsed.tax.hst_gst_number ||
      parsed.tax.tax_exempt !== null ||
      !!parsed.tax.tax_exempt_cert ||
      !!parsed.payment.terms ||
      !!parsed.payment.method ||
      !!parsed.payment.currency;
    if (taxPaymentHasContent) {
      setInheritFromClient(false);
      if (parsed.tax.hst_gst_number) setSiteHstGst(parsed.tax.hst_gst_number);
      if (parsed.tax.tax_exempt !== null) setTaxExempt(parsed.tax.tax_exempt);
      if (parsed.tax.tax_exempt_cert)
        setTaxExemptCert(parsed.tax.tax_exempt_cert);
      if (parsed.payment.terms) {
        setPaymentTerms(parsed.payment.terms as DbClientPaymentTerms);
      }
      if (parsed.payment.method) {
        setPayMethod(parsed.payment.method as DbClientPaymentMethod);
      }
      if (
        parsed.payment.currency &&
        (["CAD", "USD", "AED", "INR", "EUR"] as DbClientCurrency[]).includes(
          parsed.payment.currency as DbClientCurrency
        )
      ) {
        setCurrency(parsed.payment.currency as DbClientCurrency);
      }
    }

    // ─── Contacts — merge-by-name for the 4 fixed template rows ────────
    const newContacts: ContactRowState[] = [];

    // PRIMARY pair (rows 1+2)
    if (r[0] && r[1] && namesMatch(r[0], r[1])) {
      newContacts.push({
        first_name: r[0].first_name,
        last_name: r[0].last_name,
        role: "Primary Contact",
        email: r[0].email.trim() || r[1].email.trim() || "",
        phones: [
          ...(r[0].phone.trim()
            ? [{ label: "Work", number: r[0].phone.trim() }]
            : []),
          ...(r[1].phone.trim()
            ? [{ label: "Personal", number: r[1].phone.trim() }]
            : []),
        ],
        is_primary: true,
        is_billing: false,
        is_emergency: false,
        is_accounts_payable: false,
        contact_type_custom: "",
        has_custom_type: false,
      });
    } else {
      if (r[0] && hasContactContent(r[0])) {
        newContacts.push(
          buildContact(r[0], "Primary Contact Work", "Work", {
            is_primary: true,
          })
        );
      }
      if (r[1] && hasContactContent(r[1])) {
        newContacts.push(
          buildContact(r[1], "Primary Contact Personal", "Personal", {
            is_primary: true,
          })
        );
      }
    }

    // AP pair (rows 3+4)
    if (r[2] && r[3] && namesMatch(r[2], r[3])) {
      newContacts.push({
        first_name: r[2].first_name,
        last_name: r[2].last_name,
        role: "Accounts Payable",
        email: r[2].email.trim() || r[3].email.trim() || "",
        phones: [
          ...(r[2].phone.trim()
            ? [{ label: "Work/Ext", number: r[2].phone.trim() }]
            : []),
          ...(r[3].phone.trim()
            ? [{ label: "Direct", number: r[3].phone.trim() }]
            : []),
        ],
        is_primary: false,
        is_billing: true,
        is_emergency: false,
        is_accounts_payable: true,
        contact_type_custom: "",
        has_custom_type: false,
      });
    } else {
      if (r[2] && hasContactContent(r[2])) {
        newContacts.push(
          buildContact(r[2], "AP work/ext", "Work/Ext", {
            is_billing: true,
            is_accounts_payable: true,
          })
        );
      }
      if (r[3] && hasContactContent(r[3])) {
        newContacts.push(
          buildContact(r[3], "AP direct", "Direct", {
            is_billing: true,
            is_accounts_payable: true,
          })
        );
      }
    }

    if (newContacts.length > 0) setContacts(newContacts);

    // ─── Final feedback toast ──────────────────────────────────────────
    if (missing.length > 0) {
      const preview = missing.slice(0, 5).join(", ");
      const more =
        missing.length > 5 ? ` …and ${missing.length - 5} more` : "";
      toast.warning(
        `Template loaded with ${missing.length} missing field${
          missing.length > 1 ? "s" : ""
        }: ${preview}${more}`,
        { duration: 8000 }
      );
    } else {
      toast.success("Site template loaded successfully");
    }
  }

  // ─── Submit ───
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isInvalid) {
      toast.error(Object.values(errors)[0]);
      return;
    }

    const parsedCredit = creditLimit.trim() ? Number(creditLimit.trim()) : null;
    const parsedTaxRate = taxRate.trim() ? Number(taxRate.trim()) : null;

    const payload: DbSiteInsert = {
      client_id: selectedClientId,
      name: name.trim(),
      site_code: siteCode.trim() || null,
      status,
      last_service_date: lastServiceDate || null,
      notes: notes.trim() || null,

      // GC / Site Supervisor
      gc_name: gcName.trim() || null,
      gc_phone: gcPhone.trim() || null,
      gc_email: gcEmail.trim() || null,

      // Site physical address (always editable)
      address_line1: address1.trim() || null,
      address_line2: address2.trim() || null,
      city: city.trim() || null,
      province: province || null,
      postal_code: postal.trim() || null,
      country: siteCountry.trim() || "Canada",

      // Billing — NULL when inherited per Phase 1 Decision Point 1
      billing_same_as_client: billSameAsClient,
      billing_street: billSameAsClient ? null : billStreet.trim() || null,
      billing_unit: billSameAsClient ? null : billUnit.trim() || null,
      billing_city: billSameAsClient ? null : billCity.trim() || null,
      billing_province: billSameAsClient ? null : billProvince || null,
      billing_postal: billSameAsClient ? null : billPostal.trim() || null,
      billing_country: billSameAsClient ? null : billCountry.trim() || null,

      // Mailing — NULL when "same as billing"
      mailing_same_as_billing: mailSameAsBilling,
      mailing_street: mailSameAsBilling ? null : mailStreet.trim() || null,
      mailing_unit: mailSameAsBilling ? null : mailUnit.trim() || null,
      mailing_city: mailSameAsBilling ? null : mailCity.trim() || null,
      mailing_province: mailSameAsBilling ? null : mailProvince || null,
      mailing_postal: mailSameAsBilling ? null : mailPostal.trim() || null,
      mailing_country: mailSameAsBilling ? null : mailCountry.trim() || null,

      // Tax / Payment / Portal — NULL when inheriting. Booleans use the
      // SITES-2a DB defaults (NOT NULL with DEFAULT) when inheriting so
      // the DB doesn't reject the insert; the inherit flag is the source
      // of truth at read time anyway.
      // SITE-FIELDS: the flag now records "prefilled from client" only; the
      // site ALWAYS persists its own tax/payment/portal values (no forcing).
      inherit_payment_terms_from_client: inheritFromClient,
      site_hst_gst_number: siteHstGst.trim() || null,
      tax_exempt: taxExempt,
      tax_exempt_certificate_number: taxExemptCert.trim() || null,
      tax_rate:
        parsedTaxRate != null && Number.isFinite(parsedTaxRate)
          ? parsedTaxRate
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
    };

    startTransition(async () => {
      const result =
        isEdit && existing
          ? await updateSiteAction(existing.id, payload)
          : await createSiteAction(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (isEdit && existing) {
        toast.success(`Updated ${name}`);
        onSubmitSuccess(existing.id);
        return;
      }

      const newSiteId = result.data.id;

      // Fan out contacts with DUAL-FK (client_id + site_id both set), so
      // each new contact appears on both the parent client's Contacts
      // pane AND any future site detail page.
      const activeContacts = contacts.filter(isContactActive);
      let contactFailCount = 0;
      if (activeContacts.length > 0) {
        const contactPayloads: DbContactInsert[] = activeContacts.map((c) => ({
          client_id: selectedClientId,
          site_id: newSiteId,
          first_name: c.first_name.trim(),
          last_name: c.last_name.trim(),
          title: c.role.trim() || null,
          email: c.email.trim() || null,
          phones: c.phones
            .filter((p) => p.number.trim() !== "")
            .map((p) => ({ label: p.label, number: p.number.trim() })),
          is_primary: c.is_primary,
          is_billing: c.is_billing,
          is_emergency: c.is_emergency,
          is_accounts_payable: c.is_accounts_payable,
          contact_type_custom:
            c.has_custom_type && c.contact_type_custom.trim()
              ? c.contact_type_custom.trim()
              : null,
        }));
        const results = await Promise.all(
          contactPayloads.map((p) => createContactAction(p))
        );
        contactFailCount = results.filter((r) => !r.ok).length;
      }

      toast.success(`Site "${name}" created`);
      if (contactFailCount > 0) {
        toast.warning(
          `${contactFailCount} contact${
            contactFailCount > 1 ? "s" : ""
          } couldn't be added. You can add them later from the client detail page.`
        );
      }
      onSubmitSuccess(newSiteId);
    });
  }

  // Effective values displayed when an inheritance toggle is ON. The
  // disabled inputs read these so the operator sees what's being
  // inherited. parentClient is null until the picker fires, so we
  // fall back to "" to keep the inputs controlled.
  const effBill = {
    street: parentClient?.billing_street ?? "",
    unit: parentClient?.billing_unit ?? "",
    city: parentClient?.billing_city ?? "",
    province: parentClient?.billing_province ?? "",
    postal: parentClient?.billing_postal ?? "",
    country: parentClient?.billing_country ?? "Canada",
  };
  // For mailing-when-same-as-billing display: prefer the site's own
  // billing (if it's been overridden) else the client's billing.
  const effMail = billSameAsClient
    ? effBill
    : {
        street: billStreet,
        unit: billUnit,
        city: billCity,
        province: billProvince,
        postal: billPostal,
        country: billCountry,
      };

  // ─── JSX ─────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* SITES-3 — onboarding template (create-mode only) */}
      {!isEdit && (
        <div className="space-y-2 rounded-md border border-[var(--border)] bg-muted/30 p-3">
          <p className="text-muted-foreground text-xs">
            Send the site template to your client to fill out, then upload
            it here to auto-populate the form.
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

      {/* SECTION 1 — Site Information */}
      <Section title="Site Information" defaultOpen>
        {needsClientPicker && (
          <Field label="Client *" error={errors.client}>
            <Select
              value={selectedClientId || undefined}
              onValueChange={(v) => setSelectedClientId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.client_code ? ` (${c.client_code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label="Site/Project name *" error={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Bay 4 (Cleanroom)"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Site code">
            <Input
              value={isEdit ? siteCode : "Auto-generated on save"}
              readOnly
              disabled
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onValueChange={(v) =>
                setStatus((v ?? "Active") as DbSiteStatus)
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
        </div>

        <Field label="Last service date">
          <Input
            type="date"
            value={lastServiceDate}
            onChange={(e) => setLastServiceDate(e.target.value)}
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Internal notes — not shown to the client."
          />
        </Field>
      </Section>

      {/* SECTION 2 — Site (physical) Address — ADDR-1 multi-country */}
      <Section title="Site Address">
        <AddressSection
          country={siteCountry}
          province={province}
          street={address1}
          unit={address2}
          city={city}
          postal={postal}
          onCountryChange={setSiteCountry}
          onProvinceChange={setProvince}
          onStreetChange={setAddress1}
          onUnitChange={setAddress2}
          onCityChange={setCity}
          onPostalChange={setPostal}
          streetPlaceholder="1842 Industrial Pkwy"
        />
      </Section>

      {/* SECTION 2b — GC / Site Supervisor */}
      <Section title="GC / Site Supervisor">
        <Field label="Name">
          <Input
            value={gcName}
            onChange={(e) => setGcName(e.target.value)}
            placeholder="e.g. John Doe"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={gcPhone}
            onChange={(e) => setGcPhone(e.target.value)}
            placeholder="e.g. (555) 123-4567"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={gcEmail}
            onChange={(e) => setGcEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </Field>
      </Section>

      {/* SECTION 3 — Billing Address — ADDR-1 multi-country */}
      <Section title="Billing Address">
        <InheritRadio
          name="billing_same_as_client"
          inheritedLabel="Same as client billing address"
          overrideLabel="Different address"
          value={billSameAsClient}
          onChange={handleBillingInheritToggle}
          parentClientName={parentClient?.name}
        />
        <AddressSection
          country={billSameAsClient ? effBill.country : billCountry}
          province={billSameAsClient ? effBill.province : billProvince}
          street={billSameAsClient ? effBill.street : billStreet}
          unit={billSameAsClient ? effBill.unit : billUnit}
          city={billSameAsClient ? effBill.city : billCity}
          postal={billSameAsClient ? effBill.postal : billPostal}
          onCountryChange={setBillCountry}
          onProvinceChange={setBillProvince}
          onStreetChange={setBillStreet}
          onUnitChange={setBillUnit}
          onCityChange={setBillCity}
          onPostalChange={setBillPostal}
          disabled={billSameAsClient}
        />
      </Section>

      {/* SECTION 4 — Mailing Address — ADDR-1 multi-country */}
      <Section title="Mailing Address">
        <InheritRadio
          name="mailing_same_as_billing"
          inheritedLabel="Same as billing address"
          overrideLabel="Different address"
          value={mailSameAsBilling}
          onChange={handleMailingInheritToggle}
          parentClientName={undefined /* mailing inherits from billing, not client name */}
        />
        <AddressSection
          country={mailSameAsBilling ? effMail.country : mailCountry}
          province={mailSameAsBilling ? effMail.province : mailProvince}
          street={mailSameAsBilling ? effMail.street : mailStreet}
          unit={mailSameAsBilling ? effMail.unit : mailUnit}
          city={mailSameAsBilling ? effMail.city : mailCity}
          postal={mailSameAsBilling ? effMail.postal : mailPostal}
          onCountryChange={setMailCountry}
          onProvinceChange={setMailProvince}
          onStreetChange={setMailStreet}
          onUnitChange={setMailUnit}
          onCityChange={setMailCity}
          onPostalChange={setMailPostal}
          disabled={mailSameAsBilling}
        />
      </Section>

      {/* SECTION 5/6/7 banner — single inherit flag controls all three */}
      <Section title="Tax">
        {/* SITE-FIELDS: prefill convenience, not a lock. Turning this ON copies
            the client's current Tax/Payment/Portal values into the editable
            fields below; the fields are always editable and the site stores its
            own values. Editing any field switches it to site-specific. */}
        <InheritRadio
          name="inherit_payment_terms_from_client"
          inheritedLabel="Prefill from client"
          overrideLabel="Site-specific"
          value={inheritFromClient}
          onChange={handleInheritFromClientToggle}
          parentClientName={parentClient?.name}
          helpText="Prefill copies the client's current Tax, Payment, and Portal values into the editable fields below. Editing any field switches to site-specific."
        />

        <Field label="HST / GST number">
          <Input
            value={siteHstGst}
            onChange={(e) => {
              setSiteHstGst(e.target.value);
              markOverridden();
            }}
            placeholder="123456789 RT0001"
          />
        </Field>
        <Toggle
          label="Tax-exempt"
          value={taxExempt}
          onChange={(v) => {
            setTaxExempt(v);
            markOverridden();
          }}
        />
        {taxExempt && (
          <Field
            label="Tax-exempt certificate number *"
            error={errors.taxExemptCert}
          >
            <Input
              value={taxExemptCert}
              onChange={(e) => {
                setTaxExemptCert(e.target.value);
                markOverridden();
              }}
              placeholder="Certificate / exemption ref."
            />
          </Field>
        )}
        <Field label="Tax rate (%)">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step="0.001"
              value={taxRate}
              onChange={(e) => {
                setTaxRate(e.target.value);
                markOverridden();
              }}
              placeholder={
                suggestedTaxRate != null ? String(suggestedTaxRate) : "Optional"
              }
              className="max-w-[140px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (suggestedTaxRate != null) {
                  setTaxRate(String(suggestedTaxRate));
                  markOverridden();
                }
              }}
              disabled={suggestedTaxRate == null}
            >
              Use{" "}
              {taxCountryForLookup && taxProvinceForLookup
                ? `${taxCountryForLookup} ${taxProvinceForLookup}`
                : "default"}{" "}
              default ({suggestedTaxRate != null ? `${suggestedTaxRate}%` : "—"})
            </Button>
          </div>
          <p className="text-muted-foreground text-[11px]">
            Auto-fills from billing country + province. Edit to override.
          </p>
        </Field>
      </Section>

      {/* SECTION 6 — Payment Terms & Method */}
      <Section title="Payment Terms & Method">
        <Field label="Payment terms">
          <Select
            value={paymentTerms}
            onValueChange={(v) => {
              setPaymentTerms((v ?? "net_30") as DbClientPaymentTerms);
              markOverridden();
            }}
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
              onChange={(e) => {
                setPaymentTermsCustom(e.target.value);
                markOverridden();
              }}
              placeholder="e.g. 50% deposit, balance NET 45"
            />
          </Field>
        )}
        <Field label="Preferred payment method">
          <Select
            value={payMethod}
            onValueChange={(v) => {
              setPayMethod((v ?? "eft") as DbClientPaymentMethod);
              markOverridden();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* CL-11: existing 'cheque' sites render with a "Cheque
                  (legacy)" option spliced in; once a non-cheque value is
                  picked the option disappears on next render. */}
              {(payMethod === "cheque"
                ? [
                    ...PAYMENT_METHODS,
                    { value: "cheque" as const, label: "Cheque (legacy)" },
                  ]
                : PAYMENT_METHODS
              ).map((p) => (
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
          onChange={(v) => {
            setCcSurcharge(v);
            markOverridden();
          }}
        />
        <Field label="Credit limit (CAD)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={creditLimit}
            onChange={(e) => {
              setCreditLimit(e.target.value);
              markOverridden();
            }}
            placeholder="Optional"
          />
        </Field>
        <Toggle
          label="Credit hold"
          value={creditHold}
          onChange={(v) => {
            setCreditHold(v);
            markOverridden();
          }}
        />
        <Field label="Preferred currency">
          <div className="flex gap-4">
            {(["CAD", "USD", "AED", "INR", "EUR"] as DbClientCurrency[]).map((c) => (
              <label
                key={c}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="currency"
                  checked={currency === c}
                  onChange={() => {
                    setCurrency(c);
                    markOverridden();
                  }}
                />
                {c}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      {/* SECTION 7 — Portal Access */}
      <Section title="Portal Access">
        <Toggle
          label="Portal access enabled"
          value={portalEnabled}
          onChange={(v) => {
            setPortalEnabled(v);
            markOverridden();
          }}
          help="Login provisioning ships with the Users module."
        />
        {portalEnabled && (
          <Field label="Portal contact email *" error={errors.portalEmail}>
            <Input
              type="email"
              value={portalEmail}
              onChange={(e) => {
                setPortalEmail(e.target.value);
                markOverridden();
              }}
              placeholder="ap@client.com"
            />
          </Field>
        )}
      </Section>

      {/* SECTION 8 — Contact Information (create-mode only) */}
      {!isEdit && (
        <Section title="Contact Information">
          <p className="text-muted-foreground text-xs">
            Add contacts now or anytime later from the client detail page.
            These contacts will be linked to both this client and this site.
          </p>

          {contacts.map((c, idx) => (
            <div
              key={idx}
              className="space-y-3 rounded-md border border-[var(--border)] p-3"
            >
              <div className="flex items-center justify-between">
                <p className="nx-eyebrow-soft text-[10px]">
                  Contact {idx + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                  aria-label="Remove contact"
                  onClick={() =>
                    setContacts(contacts.filter((_, i) => i !== idx))
                  }
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="First name *"
                  error={errors[`contact${idx}FirstName`]}
                >
                  <Input
                    value={c.first_name}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((x, i) =>
                          i === idx
                            ? { ...x, first_name: e.target.value }
                            : x
                        )
                      )
                    }
                  />
                </Field>
                <Field
                  label="Last name *"
                  error={errors[`contact${idx}LastName`]}
                >
                  <Input
                    value={c.last_name}
                    onChange={(e) =>
                      setContacts(
                        contacts.map((x, i) =>
                          i === idx
                            ? { ...x, last_name: e.target.value }
                            : x
                        )
                      )
                    }
                  />
                </Field>
              </div>

              <Field label="Role">
                <Input
                  value={c.role}
                  onChange={(e) =>
                    setContacts(
                      contacts.map((x, i) =>
                        i === idx ? { ...x, role: e.target.value } : x
                      )
                    )
                  }
                  placeholder="e.g. Site Lead, Facilities Manager"
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  value={c.email}
                  onChange={(e) =>
                    setContacts(
                      contacts.map((x, i) =>
                        i === idx ? { ...x, email: e.target.value } : x
                      )
                    )
                  }
                  placeholder="name@example.com"
                />
              </Field>

              <div className="space-y-2">
                <p className="nx-eyebrow-soft text-[10px]">Phones</p>
                <PhonesEditor
                  phones={c.phones}
                  onChange={(nextPhones) =>
                    setContacts(
                      contacts.map((x, i) =>
                        i === idx ? { ...x, phones: nextPhones } : x
                      )
                    )
                  }
                />
              </div>

              <div className="space-y-1.5">
                <p className="nx-eyebrow-soft text-[10px]">Contact type</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={c.is_primary}
                      onChange={(e) =>
                        setContacts(
                          contacts.map((x, i) =>
                            i === idx
                              ? { ...x, is_primary: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                    Primary
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={c.is_billing}
                      onChange={(e) =>
                        setContacts(
                          contacts.map((x, i) =>
                            i === idx
                              ? { ...x, is_billing: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                    Billing
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={c.is_emergency}
                      onChange={(e) =>
                        setContacts(
                          contacts.map((x, i) =>
                            i === idx
                              ? { ...x, is_emergency: e.target.checked }
                              : x
                          )
                        )
                      }
                    />
                    Emergency
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={c.is_accounts_payable}
                      onChange={(e) =>
                        setContacts(
                          contacts.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  is_accounts_payable: e.target.checked,
                                }
                              : x
                          )
                        )
                      }
                    />
                    AP
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={c.has_custom_type}
                      onChange={(e) =>
                        setContacts(
                          contacts.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  has_custom_type: e.target.checked,
                                  contact_type_custom: e.target.checked
                                    ? x.contact_type_custom
                                    : "",
                                }
                              : x
                          )
                        )
                      }
                    />
                    Custom
                  </label>
                </div>
                {c.has_custom_type && (
                  <Field label="Custom type label">
                    <Input
                      value={c.contact_type_custom}
                      onChange={(e) =>
                        setContacts(
                          contacts.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  contact_type_custom: e.target.value,
                                }
                              : x
                          )
                        )
                      }
                      placeholder="e.g. HR Lead, Vendor Coordinator"
                    />
                  </Field>
                )}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setContacts([...contacts, newEmptyContact()])}
          >
            <Plus className="h-3 w-3" />
            Add contact
          </Button>
        </Section>
      )}

      {/* Footer — Cancel + Submit (mirror ClientForm) */}
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={onCancel}
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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add site"}
        </button>
      </div>
    </form>
  );
}

// ─── Local helpers ────────────────────────────────────────────────────────
// ADDR-1: removed the local ProvinceSelect + AddressFields helpers —
// the shared <AddressSection> from ./AddressSection.tsx replaces both.

function InheritRadio({
  name,
  inheritedLabel,
  overrideLabel,
  value,
  onChange,
  parentClientName,
  helpText,
}: {
  name: string;
  inheritedLabel: string;
  overrideLabel: string;
  value: boolean;
  onChange: (next: boolean) => void;
  parentClientName?: string;
  helpText?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={name}
            checked={value}
            onChange={() => onChange(true)}
          />
          {inheritedLabel}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={name}
            checked={!value}
            onChange={() => onChange(false)}
          />
          {overrideLabel}
        </label>
      </div>
      {value && parentClientName && (
        <p className="text-muted-foreground text-[11px] italic">
          Currently inheriting from {parentClientName}.
        </p>
      )}
      {helpText && (
        <p className="text-muted-foreground text-[11px]">{helpText}</p>
      )}
    </div>
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
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  help?: string;
  disabled?: boolean;
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
        disabled={disabled}
        className="min-w-[3.25rem] shrink-0"
      >
        {value ? "On" : "Off"}
      </Button>
    </div>
  );
}
