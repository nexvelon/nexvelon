"use client";

// CL-9 — Shared client-form body. Extracted wholesale from the old
// ClientFormDrawer so both the drawer (edit mode) and the new full-screen
// /clients/new page (create mode) consume the exact same form. Drawer chrome
// (<Sheet>, <SheetContent>, <SheetHeader>) lives in ClientFormDrawer; this
// file owns every field, every helper, every validation rule, and every
// state hook. Sole behavioural change: handleSubmit signals completion via
// onSubmitSuccess(clientId) so the page wrapper can router.push to the new
// detail page while the drawer wrapper just closes itself.

import { useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
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
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { PhonesEditor } from "./PhonesEditor";
import {
  createClientAction,
  createContactAction,
  updateClientAction,
} from "../actions";
import type {
  DbClient,
  DbClientCurrency,
  DbClientPaymentMethod,
  DbClientPaymentTerms,
  DbClientStatus,
  DbClientTier,
  DbClientType,
  DbContactInsert,
  ContactPhone,
} from "@/lib/types/database";
// CL-10: type-only import — the template module itself is dynamic-imported
// inside handleUploadTemplate so the ~1 MB exceljs lib stays out of the
// main bundle.
import type { ParsedContact } from "@/lib/client-onboarding-template";

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

export type Mode = { kind: "create" } | { kind: "edit"; client: DbClient };

// CL-5c — one row in the dynamic Contact Information section. `role` maps to
// the DbContact.title column (the UI just labels it "Role").
type ContactRowState = {
  first_name: string;
  last_name: string;
  role: string;
  email: string;
  phones: ContactPhone[];
  is_primary: boolean;
  is_billing: boolean;
  is_emergency: boolean;
  // CL-7
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

// ─── CL-10: parser-side merge-by-name helpers ────────────────────────────

/** Case-insensitive trimmed match on first AND last name. Returns false
 *  if either side has an empty name (can't confirm a match). */
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
 *  with the right type-flag booleans + phone label. The `fallbackRole`
 *  is used only if the row's Role column is blank — defaults to the
 *  type_label (which is pre-filled by the template). */
function buildContact(
  pc: ParsedContact,
  fallbackRole: string,
  phoneLabel: string,
  flags: {
    is_primary: boolean;
    is_billing: boolean;
    is_accounts_payable: boolean;
  }
): ContactRowState {
  return {
    first_name: pc.first_name,
    last_name: pc.last_name,
    role: pc.role.trim() || pc.type_label.trim() || fallbackRole,
    email: pc.email.trim(),
    phones: [
      { label: phoneLabel, number: pc.phone.trim() },
    ],
    is_primary: flags.is_primary,
    is_billing: flags.is_billing,
    is_emergency: false,
    is_accounts_payable: flags.is_accounts_payable,
    contact_type_custom: "",
    has_custom_type: false,
  };
}

interface ClientFormProps {
  mode: Mode;
  /**
   * Fires after a successful create OR edit. Receives the client id (the
   * existing id for edits, the freshly-created id for creates). The drawer
   * wrapper ignores the id and just closes; the /clients/new page wrapper
   * uses it to router.push to the new detail page.
   */
  onSubmitSuccess: (clientId: string) => void;
  /** Fires when the user clicks Cancel. Drawer closes; page navigates back. */
  onCancel: () => void;
}

export function ClientForm({ mode, onSubmitSuccess, onCancel }: ClientFormProps) {
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
  // CL-6: default flipped to true — new clients use the billing address for
  // mailing unless the operator explicitly picks "Different address".
  const [mailSameAsBilling, setMailSameAsBilling] = useState(
    existing?.mailing_same_as_billing ?? true
  );

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

  // --- CL-5c: Contact Information (create-mode only) — dynamic rows ---
  const [contacts, setContacts] = useState<ContactRowState[]>([]);

  // A contact row is "active" once any of its fields has content.
  const isContactActive = (c: ContactRowState) =>
    c.first_name.trim() !== "" ||
    c.last_name.trim() !== "" ||
    c.role.trim() !== "" ||
    c.email.trim() !== "" ||
    c.phones.some((p) => p.number.trim() !== "");

  const [pending, startTransition] = useTransition();

  // CL-4: hidden file input for the "Upload filled template" button.
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

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
  // CL-5c: each active contact row needs first + last name (NOT NULL schema).
  contacts.forEach((c, i) => {
    if (isContactActive(c)) {
      if (!c.first_name.trim())
        errors[`contact${i}FirstName`] = "First name is required";
      if (!c.last_name.trim())
        errors[`contact${i}LastName`] = "Last name is required";
    }
  });
  const isInvalid = Object.keys(errors).length > 0;

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

  // CL-10: parse a filled v2 template and auto-populate the form. The
  // parser raises a friendly "older version" error for any pre-v2
  // template (no version stamp in the title cell). Status / Industry /
  // Credit Limit / Portal / Notes are no longer carried by the template
  // — they keep their existing form defaults / values. Contacts arrive
  // as 4 fixed rows in order (Primary Work / Primary Personal / AP
  // work/ext / AP direct); the merge-by-name logic below collapses
  // pairs with matching names into a single contact with two phones.
  async function handleUploadTemplate(file: File) {
    try {
      const { parseClientTemplate } = await import(
        "@/lib/client-onboarding-template"
      );
      const parsed = await parseClientTemplate(file);
      const r = parsed.contacts; // always length 4

      // ─── Collect missing-mandatory-field list BEFORE setting state,
      // so the warn-and-proceed toast accurately reflects what the
      // operator will still need to fill in by hand. Non-blocking —
      // the form populates whatever IS present regardless.
      const missing: string[] = [];

      // Client identity
      if (!parsed.client.legal_name) missing.push("Company Legal Name");
      if (!parsed.client.name) missing.push("Trade / Display Name");
      // Billing — all 6 mandatory
      if (!parsed.billing.street) missing.push("Billing Street");
      if (!parsed.billing.city) missing.push("Billing City");
      if (!parsed.billing.province) missing.push("Billing Province");
      if (!parsed.billing.postal) missing.push("Billing Postal Code");
      if (!parsed.billing.country) missing.push("Billing Country");
      // Tax — HST mandatory; cert only if exempt
      if (!parsed.client.hst_gst_number) missing.push("HST / GST Number");
      if (parsed.client.tax_exempt === null)
        missing.push("Tax Exempt? (Yes/No)");
      if (parsed.client.tax_exempt === true && !parsed.client.tax_exempt_cert)
        missing.push("Tax Exempt Certificate Number");
      // Payment — terms/method/currency all mandatory
      if (!parsed.payment.terms) missing.push("Select Payment Terms");
      if (!parsed.payment.method) missing.push("Select Payment Method");
      if (!parsed.payment.currency) missing.push("Select Currency");
      // Contacts — row 1 (Primary Work) + row 3 (AP work/ext) mandatory.
      // Rows 2 + 4 are optional secondary phone numbers for the same
      // person.
      if (!r[0]?.first_name || !r[0]?.last_name)
        missing.push("Primary Contact Work (name)");
      if (!r[0]?.email) missing.push("Primary Contact Work (email)");
      if (!r[0]?.phone) missing.push("Primary Contact Work (phone)");
      if (!r[2]?.first_name || !r[2]?.last_name)
        missing.push("AP work/ext Contact (name)");
      if (!r[2]?.email) missing.push("AP work/ext Contact (email)");
      if (!r[2]?.phone) missing.push("AP work/ext Contact (phone)");

      // ─── Client identity ───
      if (parsed.client.legal_name) setLegalName(parsed.client.legal_name);
      if (parsed.client.name) setName(parsed.client.name);
      // CL-10: setStatus / setIndustry removed — fields no longer on
      // the template; form keeps its own defaults.
      if (parsed.client.hst_gst_number)
        setHstGst(parsed.client.hst_gst_number);
      if (parsed.client.tax_exempt !== null)
        setTaxExempt(parsed.client.tax_exempt);
      if (parsed.client.tax_exempt_cert)
        setTaxCert(parsed.client.tax_exempt_cert);

      // ─── Billing address ───
      if (parsed.billing.street) setBillStreet(parsed.billing.street);
      if (parsed.billing.unit) setBillUnit(parsed.billing.unit);
      if (parsed.billing.city) setBillCity(parsed.billing.city);
      if (parsed.billing.province) setBillProvince(parsed.billing.province);
      if (parsed.billing.postal) setBillPostal(parsed.billing.postal);
      if (parsed.billing.country) setBillCountry(parsed.billing.country);

      // ─── Mailing address — if ANY mailing cell has content, populate
      // and flip same-as-billing OFF. If all blank, keep the default
      // (same as billing).
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

      // ─── Payment terms & method ───
      if (parsed.payment.terms) {
        setPaymentTerms(parsed.payment.terms as DbClientPaymentTerms);
      }
      if (parsed.payment.terms_custom)
        setPaymentTermsCustom(parsed.payment.terms_custom);
      if (parsed.payment.method) {
        setPayMethod(parsed.payment.method as DbClientPaymentMethod);
      }
      // CL-10: setCreditLimit removed — template no longer carries it.
      if (
        parsed.payment.currency &&
        (["CAD", "USD"] as DbClientCurrency[]).includes(
          parsed.payment.currency as DbClientCurrency
        )
      ) {
        setCurrency(parsed.payment.currency as DbClientCurrency);
      }

      // CL-10: setPortalEnabled / setPortalEmail / setNotes removed —
      // template no longer carries these sections.

      // ─── Contacts — merge-by-name logic for the 4 fixed template rows.
      // Rows 1+2 are the Primary pair (Work + Personal phones for the
      // same person, or 2 separate contacts if names differ). Rows 3+4
      // are the AP pair (Work/Ext + Direct).
      const newContacts: ContactRowState[] = [];

      // PRIMARY pair
      if (r[0] && r[1] && namesMatch(r[0], r[1])) {
        // Merge into 1 contact with 2 phones
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
              is_billing: false,
              is_accounts_payable: false,
            })
          );
        }
        if (r[1] && hasContactContent(r[1])) {
          newContacts.push(
            buildContact(r[1], "Primary Contact Personal", "Personal", {
              is_primary: true,
              is_billing: false,
              is_accounts_payable: false,
            })
          );
        }
      }

      // AP pair — same pattern
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
              is_primary: false,
              is_billing: true,
              is_accounts_payable: true,
            })
          );
        }
        if (r[3] && hasContactContent(r[3])) {
          newContacts.push(
            buildContact(r[3], "AP direct", "Direct", {
              is_primary: false,
              is_billing: true,
              is_accounts_payable: true,
            })
          );
        }
      }

      if (newContacts.length > 0) setContacts(newContacts);

      // ─── Final feedback toast — warn-and-proceed on missing fields,
      // else plain success.
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
        toast.success("Template loaded successfully");
      }
    } catch (e) {
      console.error("[CL-10] Template parse failed:", e);
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
      // CL-6 removed the Operating Company form section. Hardcoded here so
      // (a) createClient's client_code prefix resolves to "IS" (omitting the
      // field would produce "C-XX-…") and (b) the row matches what the DB
      // default would have set anyway.
      default_opco: "integrated_solutions" as const,
      allowed_opcos: ["integrated_solutions"],
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
      // CL-9: pass the existing id back; the drawer wrapper ignores it and
      // just closes, the page wrapper would navigate (but edits don't run
      // through the page today — only the drawer surfaces edit mode).
      if (isEdit && existing) {
        toast.success(`Updated ${tradeName}`);
        onSubmitSuccess(existing.id);
        return;
      }

      const newClientId = result.data.id;

      // CL-5c: create every active contact in parallel. `role` maps to the
      // title column; empty phone rows are dropped from the phones payload.
      const activeContacts = contacts.filter(isContactActive);
      let contactSuccessCount = 0;
      let contactFailCount = 0;
      if (activeContacts.length > 0) {
        const contactPayloads: DbContactInsert[] = activeContacts.map((c) => ({
          client_id: newClientId,
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
          // CL-7: Custom badge gates on the text value (not the checkbox), so
          // a checked-but-empty Custom row writes null. has_custom_type is
          // UI-only — not persisted.
          is_accounts_payable: c.is_accounts_payable,
          contact_type_custom:
            c.has_custom_type && c.contact_type_custom.trim()
              ? c.contact_type_custom.trim()
              : null,
        }));
        const results = await Promise.all(
          contactPayloads.map((p) => createContactAction(p))
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

      // CL-9: hand the new id to the parent — the page wrapper navigates to
      // /clients/${newClientId}; the drawer wrapper ignores it and closes.
      onSubmitSuccess(newClientId);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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

      {/* CL-6: edit-mode-only created-on line */}
      {isEdit && existing && (
        <p className="text-muted-foreground text-xs">
          Client created on{" "}
          {format(parseISO(existing.created_at), "MMMM d, yyyy")}
        </p>
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
            value={isEdit ? clientCode : "Auto-generated on save"}
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
        {/* CL-6: 2-option radio replaces the old Toggle. Default = Same. */}
        <div className="space-y-2">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mailing_same_as_billing"
                checked={mailSameAsBilling}
                onChange={() => setMailSameAsBilling(true)}
              />
              Same as billing address
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="mailing_same_as_billing"
                checked={!mailSameAsBilling}
                onChange={() => setMailSameAsBilling(false)}
              />
              Different address
            </label>
          </div>
          {mailSameAsBilling && (
            <p className="text-muted-foreground text-[11px]">
              On save, mailing address is copied from this client&apos;s
              billing address.
            </p>
          )}
        </div>
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

      {/* CL-5c — Contact Information (create-mode only) */}
      {!isEdit && (
        <Section title="Contact Information">
          <p className="text-muted-foreground text-xs">
            Add contacts now or anytime later from the client detail
            page. Each contact needs at least a first and last name.
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
                  placeholder="e.g. CFO, Operations Manager, Facilities Director"
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

              {/* Phones */}
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

              {/* Contact type */}
              <div className="space-y-1.5">
                <p className="nx-eyebrow-soft text-[10px]">
                  Contact type
                </p>
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
          {pending
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : "Add client"}
        </button>
      </div>
    </form>
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
