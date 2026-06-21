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

/** All five address sub-fields present for a key prefix (e.g. "billing"). */
function addressComplete(d: Data, prefix: string): boolean {
  return (
    filled(d, `${prefix}Street`) &&
    filled(d, `${prefix}City`) &&
    filled(d, `${prefix}Province`) &&
    filled(d, `${prefix}Postal`) &&
    filled(d, `${prefix}Country`)
  );
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

/** At least one contact row (c0..c3) with a first + last name and an email or
 *  phone — covers the spec's "at least one contact" + AP info (AP contacts are
 *  rows within this same Contacts section). */
function hasOneContact(d: Data): boolean {
  for (let i = 0; i < 4; i++) {
    const hasName = filled(d, `c${i}First`) && filled(d, `c${i}Last`);
    const hasReach = filled(d, `c${i}Email`) || filled(d, `c${i}Phone`);
    if (hasName && hasReach) return true;
  }
  return false;
}

/** Missing required items on the CLIENT form (full invite). Empty array =
 *  complete. The tier opt-in is intentionally omitted: "None" is the valid
 *  default selection, so the tier requirement is always satisfied. */
export function clientFormMissing(d: Data): MissingField[] {
  const out: MissingField[] = [];
  if (!filled(d, "legalName"))
    out.push({ id: "legalName", label: "Legal company name", sectionId: "company" });
  if (!addressComplete(d, "billing"))
    out.push({ id: "billing", label: "Billing address", sectionId: "billing" });
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
  if (!hasOneContact(d))
    out.push({ id: "contacts", label: "Contacts", sectionId: "contacts" });
  return out;
}

/** Missing required items on the SITE form. Empty array = complete. */
export function siteFormMissing(d: Data): MissingField[] {
  const out: MissingField[] = [];
  if (!filled(d, "siteName"))
    out.push({ id: "siteName", label: "Site / Project name", sectionId: "site" });
  if (!addressComplete(d, "site"))
    out.push({ id: "siteAddr", label: "Site address", sectionId: "site-address" });
  if (!taxComplete(d))
    out.push({ id: "tax", label: "Tax Information", sectionId: "tax" });
  if (!filled(d, "gcFirst") || !filled(d, "gcLast"))
    out.push({
      id: "gc",
      label: "GC / Site Supervisor name",
      sectionId: "gc",
    });
  if (!paymentComplete(d))
    out.push({ id: "payment", label: "Payment Information", sectionId: "payment" });
  if (!ackd(d))
    out.push({
      id: "policies",
      label: "Payment Policies acknowledgment",
      sectionId: "payment-policies",
    });
  if (!hasOneContact(d))
    out.push({ id: "contacts", label: "Contacts", sectionId: "contacts" });
  return out;
}
