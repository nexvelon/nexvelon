// POLISH-10 (CHANGE 8) — single source of truth for "is this invite form
// complete?". Used by BOTH the public invite form (the live missing-fields alert
// in InviteClient) AND the save actions' *_form_completed gate (so the hub
// Submit button enables exactly when the form is genuinely complete).
//
// Pure module (no "server-only") so client components can import it.
//
// Each entry's `sectionId` matches the DOM id of the corresponding <Section> in
// InviteClient, so the alert can scroll to it on click.

export interface MissingField {
  /** Stable key (for React lists). */
  id: string;
  /** Human label shown in the alert (matches the section heading). */
  label: string;
  /** DOM id of the <Section> to scroll to. */
  sectionId: string;
}

type Data = Record<string, unknown>;

const filled = (d: Data, key: string): boolean =>
  String(d[key] ?? "").trim() !== "";

const ackd = (d: Data): boolean => {
  const v = d.payment_policies_acknowledged;
  return v === true || String(v ?? "").trim() === "true";
};

// POLISH-22 (CHANGE 1) — address validation is now field-level so the banner
// surfaces EACH missing sub-field (e.g. "Mailing address: Postal code").
const ADDR_FIELDS: ReadonlyArray<{ suffix: string; label: string }> = [
  { suffix: "Street", label: "Street" },
  { suffix: "City", label: "City" },
  { suffix: "Province", label: "State / Province" },
  { suffix: "Postal", label: "Postal code" },
  { suffix: "Country", label: "Country" },
];

function addressMissing(
  d: Data,
  prefix: string,
  sectionId: string,
  label: string
): MissingField[] {
  return ADDR_FIELDS.filter((f) => !filled(d, `${prefix}${f.suffix}`)).map(
    (f) => ({
      id: `${prefix}-${f.suffix}`,
      label: `${label}: ${f.label}`,
      sectionId,
    })
  );
}

/** "Same as …" toggles default to ON (true); only an explicit "false" turns the
 *  hidden address back into required fields. */
export function sameAs(d: Data, key: string): boolean {
  return String(d[key] ?? "").trim() !== "false";
}

/** Tax section: an HST/GST number AND a Tax-Exempt selection; if exempt is
 *  "Yes", the certificate number is required too. */
function taxComplete(d: Data): boolean {
  if (!filled(d, "hstNumber") || !filled(d, "taxExempt")) return false;
  if (String(d.taxExempt).trim() === "Yes" && !filled(d, "taxExemptCert"))
    return false;
  return true;
}

/** Payment section: terms + method + currency all chosen. */
function paymentComplete(d: Data): boolean {
  return (
    filled(d, "paymentTerms") &&
    filled(d, "paymentMethod") &&
    filled(d, "currency")
  );
}

// POLISH-15 (CHANGE 4) — every contact now requires First/Last/Email + Personal
// & Work phones (Office phone is optional and never gates). Work phone uses the
// legacy `c{i}Phone` key. The alert lists each contact's missing fields by name.
const CONTACT_REQUIRED: ReadonlyArray<{ suffix: string; label: string }> = [
  { suffix: "First", label: "First Name" },
  { suffix: "Last", label: "Last Name" },
  { suffix: "Email", label: "Email" },
  { suffix: "PersonalPhone", label: "Personal Phone" },
  { suffix: "Phone", label: "Work Phone" },
];

/** One MissingField per incomplete contact, naming the missing required fields:
 *  e.g. "Primary Contact missing: Last Name, Email, Work Phone". POLISH-27 —
 *  keyed by prefix (c0/c1 for Primary/AP, gc for the GC / Site Supervisor, which
 *  is now a contact row rather than a separate section). */
function contactMissing(
  d: Data,
  prefix: string,
  contactLabel: string
): MissingField | null {
  const names = CONTACT_REQUIRED.filter(
    (f) => !filled(d, `${prefix}${f.suffix}`)
  ).map((f) => f.label);
  if (names.length === 0) return null;
  return {
    id: `contact-${prefix}`,
    label: `${contactLabel} missing: ${names.join(", ")}`,
    sectionId: "contacts",
  };
}

/** Missing required items on the CLIENT form (full invite). Empty array =
 *  complete. The tier opt-in is intentionally omitted: "None" is the valid
 *  default selection, so the tier requirement is always satisfied. */
export function clientFormMissing(d: Data): MissingField[] {
  const out: MissingField[] = [];
  if (!filled(d, "legalName"))
    out.push({ id: "legalName", label: "Legal company name", sectionId: "company" });
  out.push(...addressMissing(d, "billing", "billing", "Billing address"));
  // Mailing is required only when "Same as Billing" is unchecked.
  if (!sameAs(d, "mailing_same_as_billing"))
    out.push(...addressMissing(d, "mailing", "mailing", "Mailing address"));
  if (!taxComplete(d))
    out.push({ id: "tax", label: "Tax Information", sectionId: "tax" });
  if (!ackd(d))
    out.push({
      id: "policies",
      label: "Payment Policies acknowledgment",
      sectionId: "payment-policies",
    });
  if (!paymentComplete(d))
    out.push({ id: "payment", label: "Payment Information", sectionId: "payment" });
  const primary = contactMissing(d, "c0", "Primary Contact");
  if (primary) out.push(primary);
  const ap = contactMissing(d, "c1", "AP Contact");
  if (ap) out.push(ap);
  // POLISH-27 — GC / Site Supervisor is an OPTIONAL contact on the client form,
  // so it is intentionally not validated here.
  return out;
}

/** Missing required items on the SITE form. Empty array = complete. */
export function siteFormMissing(d: Data): MissingField[] {
  const out: MissingField[] = [];
  if (!filled(d, "siteName"))
    out.push({ id: "siteName", label: "Site / Project name", sectionId: "site" });
  out.push(...addressMissing(d, "site", "site-address", "Site address"));
  // Billing + Mailing are required only when their "Same as Site" is unchecked.
  if (!sameAs(d, "billing_same_as_site"))
    out.push(...addressMissing(d, "billing", "billing", "Billing address"));
  if (!sameAs(d, "mailing_same_as_site"))
    out.push(...addressMissing(d, "mailing", "mailing", "Mailing address"));
  if (!taxComplete(d))
    out.push({ id: "tax", label: "Tax Information", sectionId: "tax" });
  if (!paymentComplete(d))
    out.push({ id: "payment", label: "Payment Information", sectionId: "payment" });
  if (!ackd(d))
    out.push({
      id: "policies",
      label: "Payment Policies acknowledgment",
      sectionId: "payment-policies",
    });
  // POLISH-27 — Primary, AP, and GC / Site Supervisor are all required contacts.
  const primary = contactMissing(d, "c0", "Primary Contact");
  if (primary) out.push(primary);
  const ap = contactMissing(d, "c1", "AP Contact");
  if (ap) out.push(ap);
  const gc = contactMissing(d, "gc", "GC / Site Supervisor");
  if (gc) out.push(gc);
  return out;
}
