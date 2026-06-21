"use client";

// POLISH-3 — public invitation UI: status/submit hub, the client + site info
// forms (debounced autosave to a flat string→jsonb map), and the two T&C
// signing pages. All talk to the token-scoped public actions; no app auth.
//
// The client/site forms autosave a FLAT Record<string,string> using the exact
// keys the server submit-mapping reads (legalName, billing*/mailing*, contacts
// c{0..3}*, etc.). Keep these key strings in sync with actions.ts / the submit
// mapping — they are the contract.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressSection } from "@/app/(app)/clients/_components/AddressSection";
import { parseTierText } from "@/lib/tier-text-parser";
import { paymentPolicyText } from "@/lib/payment-policy-text";
import {
  clientFormMissing,
  siteFormMissing,
  type MissingField,
} from "@/lib/invite-form-validation";
import {
  getInvitationAction,
  getInviteTermsAction,
  getTierDescriptionsAction,
  getTierDisclaimersAction,
  saveClientFormAction,
  saveSiteFormAction,
  signTcAction,
  submitInvitationAction,
  type InvitationView,
} from "./actions";

// ── Palette ──────────────────────────────────────────────────────────────────
// (page background cream #F5F1E8 is applied by the route layout)
const NAVY = "#0A1226";
const GOLD = "#B8924B";
const GOLD_DEEP = "#b8902c"; // deeper gold for emphasis text (CHANGE 13)
const MUTED = "#5C5240";
const BORDER = "#E5DFD0";
const PANEL = "#FBF9F4";

// Garamond-feel serif for royal/futuristic headings (CHANGE 11). The app's
// serif is wired via a CSS var, but a plain Georgia stack reads identically
// here and keeps this public file free of app-only font dependencies.
const SERIF = "Georgia, serif";

// Prestige tiers the client may opt into (CHANGE 6). The value is the
// PascalCase tier name written to client_form_data.tierRequested; "" = None.
// Highest first: Diamond → Platinum → Gold → Silver → Bronze.
const TIERS = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"] as const;

// ── Dropdown option lists ────────────────────────────────────────────────────
const PAYMENT_TERMS = [
  { v: "due_on_receipt", l: "Due on receipt" },
  { v: "net_7", l: "NET 7" },
  { v: "net_15", l: "NET 15" },
  { v: "net_30", l: "NET 30" },
] as const;

const PAYMENT_METHODS = [
  { v: "eft", l: "EFT" },
  { v: "e_transfer", l: "e-Transfer" },
  { v: "wire", l: "Wire" },
  { v: "credit_card", l: "Credit Card" },
  { v: "cash", l: "Cash" },
] as const;

const CURRENCY = ["CAD", "USD", "AED", "INR", "EUR"] as const;
const TAX_EXEMPT = ["Yes", "No"] as const;

// POLISH-15 (CHANGE 4) — two contacts per form (Primary + AP), each carrying its
// own First/Last/Email + Personal/Work/Office phones. Index 0 = Primary, 1 = AP.
// Work phone keeps the legacy `c{i}Phone` key so existing email summaries (which
// read c0Phone) keep working unchanged.
const CONTACT_ROWS = ["Primary Contact", "AP Contact"] as const;

type FormState = Record<string, string>;

// ── Invitation loader ────────────────────────────────────────────────────────
function useInvitation(token: string) {
  const [inv, setInv] = useState<InvitationView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await getInvitationAction(token);
    if (res.ok) setInv(res.data);
    else setError(res.error);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // POLISH-15 — apply an authoritative view returned by a mutating action (e.g.
  // signTcAction) directly, so the UI reflects it without a (possibly stale)
  // refetch. This is the fix for the recurring T&C signing regression.
  const applyView = useCallback((v: InvitationView) => setInv(v), []);

  return { inv, loading, error, refresh, applyView };
}

// ── Small layout helpers ─────────────────────────────────────────────────────
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        className="text-[12px] font-medium normal-case"
        style={{ color: "#1a2332", letterSpacing: "normal" }}
      >
        {label}
        {required ? <span style={{ color: GOLD }}> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

// CHANGE 6 — shared input/select styling: substantial 14px text, generous
// padding, a 1.5px navy/30 border. Applied to the <Input> in TextField and the
// <SelectTrigger> in SelectField without touching the shared ui components.
const CONTROL_CLASS = "text-[14px] py-2.5";
const CONTROL_STYLE = {
  borderWidth: 1.5,
  borderColor: "rgba(26,35,50,0.3)",
} as const;

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={CONTROL_CLASS}
        style={CONTROL_STYLE}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { v: string; l: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <Select value={value || undefined} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger className={`w-full ${CONTROL_CLASS}`} style={CONTROL_STYLE}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function SectionHeading({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <h2
        className="text-[18px] font-bold"
        style={{ color: "#1a2332", fontFamily: SERIF }}
      >
        {children}
        {required ? (
          // CHANGE 7 — visible red asterisk marking a mandatory section.
          <span style={{ color: "#C0392B" }}> *</span>
        ) : null}
      </h2>
      <div
        aria-hidden
        className="mt-1.5 h-0.5 w-10 rounded-full"
        style={{ background: GOLD_DEEP }}
      />
    </div>
  );
}

// CHANGE 6 — the "Leave blank if same as billing" mailing note, rendered
// prominently: deep navy, Inter SemiBold, 13px, NOT italic (overrides the prior
// gold-italic treatment) so it reads as a clear, authoritative instruction.
function MailingNote() {
  return (
    <p
      className="mt-1 text-[13px] font-semibold"
      style={{ color: "#1a2332" }}
    >
      Leave blank if same as billing.
    </p>
  );
}

function Section({
  id,
  title,
  required,
  note,
  noteNode,
  children,
}: {
  /** Optional DOM id used as a scroll anchor by the missing-fields alert. */
  id?: string;
  title: string;
  /** CHANGE 7 — render a red asterisk on the heading for mandatory sections. */
  required?: boolean;
  note?: string;
  /** Custom note element (e.g. the highlighted mailing note). Takes
   *  precedence over the plain `note` string. */
  noteNode?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-6 space-y-3 border-t pt-5 first:border-t-0 first:pt-0"
      style={{ borderColor: BORDER }}
    >
      <div>
        <SectionHeading required={required}>{title}</SectionHeading>
        {noteNode ? (
          noteNode
        ) : note ? (
          <p className="mt-1.5 text-[11px]" style={{ color: "#3a3a3a" }}>
            {note}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function CenterCard({ children }: { children: ReactNode }) {
  return (
    <Card className="bg-white p-6 text-center text-sm" style={{ color: MUTED }}>
      {children}
    </Card>
  );
}

function LockedNotice() {
  return (
    <CenterCard>
      This invitation has already been submitted and is now locked.
    </CenterCard>
  );
}

function BackLink({ token }: { token: string }) {
  return (
    <Link href={`/invite/${token}`} className="text-sm" style={{ color: GOLD }}>
      ← Back to status
    </Link>
  );
}

function Loading() {
  return (
    <Card className="bg-white p-6 text-sm" style={{ color: MUTED }}>
      Loading…
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="bg-white p-6 text-sm text-red-700">{message}</Card>
  );
}

// ── Autosave hook ────────────────────────────────────────────────────────────
// Seeds a flat string map from the saved jsonb, then debounces 1500ms after any
// change and persists via the supplied save action.
function useAutosave(
  token: string,
  initial: Record<string, unknown> | null,
  save: (token: string, data: FormState) => Promise<{ ok: boolean; error?: string }>
) {
  const seed = useMemo<FormState>(() => {
    const f: FormState = {};
    if (initial) {
      for (const [k, v] of Object.entries(initial)) {
        f[k] = v == null ? "" : String(v);
      }
    }
    return f;
  }, [initial]);

  const [form, setForm] = useState<FormState>(seed);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastSig = useRef<string>(JSON.stringify(seed));
  const firstRun = useRef(true);

  const set = useCallback((key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const get = useCallback((key: string) => form[key] ?? "", [form]);

  useEffect(() => {
    const sig = JSON.stringify(form);
    if (firstRun.current) {
      firstRun.current = false;
      lastSig.current = sig;
      return;
    }
    if (sig === lastSig.current) return;
    const t = setTimeout(async () => {
      lastSig.current = sig;
      const res = await save(token, form);
      if (res.ok) setSavedAt(Date.now());
      else toast.error(res.error ?? "Save failed");
    }, 1500);
    return () => clearTimeout(t);
  }, [form, save, token]);

  return { get, set, savedAt, values: form };
}

function SaveStatus({ savedAt }: { savedAt: number | null }) {
  return (
    <span className="text-[11px]" style={{ color: MUTED }}>
      {savedAt
        ? `Saved ${new Date(savedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Saves automatically"}
    </span>
  );
}

// ── Reusable form sub-sections ───────────────────────────────────────────────
type Getter = (key: string) => string;
type Setter = (key: string, value: string) => void;

// A reusable <AddressSection> block bound to a key prefix
// (e.g. "billing" → billingCountry, billingProvince, …, billingPostal).
function AddressBlock({
  get,
  set,
  prefix,
  sectionPrefix,
}: {
  get: Getter;
  set: Setter;
  prefix: string;
  sectionPrefix: string;
}) {
  const k = (suffix: string) =>
    `${prefix}${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
  return (
    <Grid>
      <AddressSection
        sectionPrefix={sectionPrefix}
        streetPlaceholder="123 Xyz St"
        country={get(k("country"))}
        province={get(k("province"))}
        street={get(k("street"))}
        unit={get(k("unit"))}
        city={get(k("city"))}
        postal={get(k("postal"))}
        onCountryChange={(v) => set(k("country"), v)}
        onProvinceChange={(v) => set(k("province"), v)}
        onStreetChange={(v) => set(k("street"), v)}
        onUnitChange={(v) => set(k("unit"), v)}
        onCityChange={(v) => set(k("city"), v)}
        onPostalChange={(v) => set(k("postal"), v)}
      />
    </Grid>
  );
}

function TaxSection({ get, set }: { get: Getter; set: Setter }) {
  const exempt = get("taxExempt");
  return (
    <Section id="tax" title="Tax Information" required>
      <Grid>
        <TextField
          label="HST / GST Number"
          value={get("hstNumber")}
          onChange={(v) => set("hstNumber", v)}
        />
        <SelectField
          label="Tax Exempt?"
          value={exempt}
          onChange={(v) => set("taxExempt", v)}
          options={TAX_EXEMPT.map((t) => ({ v: t, l: t }))}
        />
        {exempt === "Yes" ? (
          <TextField
            label="Tax Exempt Certificate Number"
            value={get("taxExemptCert")}
            onChange={(v) => set("taxExemptCert", v)}
          />
        ) : null}
      </Grid>
    </Section>
  );
}

function PaymentSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section id="payment" title="Payment Information" required>
      <Grid>
        <SelectField
          label="Payment Terms"
          value={get("paymentTerms")}
          onChange={(v) => set("paymentTerms", v)}
          options={PAYMENT_TERMS}
        />
        <SelectField
          label="Payment Method"
          value={get("paymentMethod")}
          onChange={(v) => set("paymentMethod", v)}
          options={PAYMENT_METHODS}
        />
        <SelectField
          label="Currency"
          value={get("currency")}
          onChange={(v) => set("currency", v)}
          options={CURRENCY.map((c) => ({ v: c, l: c }))}
        />
      </Grid>
    </Section>
  );
}

function ContactsSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section id="contacts" title="Contacts" required>
      <div className="space-y-4">
        {CONTACT_ROWS.map((label, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border p-3"
            style={{ borderColor: BORDER, background: PANEL }}
          >
            <p className="text-xs font-medium" style={{ color: NAVY }}>
              {label}
            </p>
            <Grid>
              <TextField
                label="First Name"
                required
                value={get(`c${i}First`)}
                onChange={(v) => set(`c${i}First`, v)}
              />
              <TextField
                label="Last Name"
                required
                value={get(`c${i}Last`)}
                onChange={(v) => set(`c${i}Last`, v)}
              />
              <TextField
                label="Email"
                type="email"
                required
                value={get(`c${i}Email`)}
                onChange={(v) => set(`c${i}Email`, v)}
              />
              <TextField
                label="Personal Phone"
                type="tel"
                required
                value={get(`c${i}PersonalPhone`)}
                onChange={(v) => set(`c${i}PersonalPhone`, v)}
              />
              <TextField
                label="Work Phone"
                type="tel"
                required
                value={get(`c${i}Phone`)}
                onChange={(v) => set(`c${i}Phone`, v)}
              />
              <TextField
                label="Office Phone"
                type="tel"
                value={get(`c${i}OfficePhone`)}
                onChange={(v) => set(`c${i}OfficePhone`, v)}
              />
            </Grid>
          </div>
        ))}
      </div>
    </Section>
  );
}

// CHANGE 6 — optional Prestige Tier opt-in on the CLIENT form. Single-select
// card radio (incl. a default "None"); writes the PascalCase tier name (or "")
// to the shared autosave map under `tierRequested`.
function TierSection({ get, set }: { get: Getter; set: Setter }) {
  const selected = get("tierRequested"); // "" = None
  const [desc, setDesc] = useState<Record<string, string>>({});
  const [disclaimers, setDisclaimers] = useState<{
    requirements: string;
    discretion: string;
  } | null>(null);
  useEffect(() => {
    getTierDescriptionsAction().then((r) => {
      if (r.ok) setDesc(r.data as Record<string, string>);
    });
    getTierDisclaimersAction().then((r) => {
      if (r.ok) setDisclaimers(r.data);
    });
  }, []);
  // CHANGE 3/5 — Bronze → Diamond, compact bullet cards (2-col on sm+).
  const ascending = [...TIERS].reverse();
  return (
    <Section
      id="tier"
      title="Select the Tier benefits you would love to have with Nexvelon (stated conditions and benefits)"
    >
      <p className="text-xs" style={{ color: MUTED }}>
        Final tier assignment is determined by Nexvelon Global based on annual
        business volume and exclusivity.
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ascending.map((tier) => {
          const active = selected === tier;
          const parsed = parseTierText(desc[tier.toLowerCase()] ?? "");
          return (
            <button
              key={tier}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => set("tierRequested", tier)}
              className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors"
              style={{
                borderLeft: `3px solid ${GOLD}`,
                borderColor: active ? GOLD : BORDER,
                borderLeftColor: GOLD,
                background: active
                  ? "linear-gradient(180deg, #FFFFFF 0%, #FBF4E2 100%)"
                  : "#FFFFFF",
                boxShadow: active ? `0 0 0 1px ${GOLD}` : "none",
              }}
            >
              <span
                aria-hidden
                className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: active ? GOLD : "#C9C2B0" }}
              >
                {active ? (
                  <span className="h-2 w-2 rounded-full" style={{ background: GOLD }} />
                ) : null}
              </span>
              <span className="min-w-0">
                <span
                  className="block text-sm font-semibold italic"
                  style={{ color: GOLD_DEEP, fontFamily: SERIF }}
                >
                  {tier}
                </span>
                {parsed.headline ? (
                  <span className="mt-0.5 block text-[11px] italic leading-snug" style={{ color: MUTED }}>
                    {parsed.headline}
                  </span>
                ) : null}
                {parsed.bullets.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {parsed.bullets.map((b, i) => (
                      <li key={i} className="text-[11px] leading-snug" style={{ color: "#2A2418" }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {parsed.bodyParas.map((par, i) => (
                  <span key={i} className="mt-1 block text-[11px] leading-snug" style={{ color: MUTED }}>
                    {par}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {/* None option (full width). CHANGE 6 — kept visually neutral even when it
          is the (default) selection: no gold highlight border/gradient/shadow and
          a plain, non-bold label, so it reads as one option among five rather
          than the recommended choice. The radio dot still reflects selection. */}
      <button
        type="button"
        role="radio"
        aria-checked={selected === ""}
        onClick={() => set("tierRequested", "")}
        className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors"
        style={{ borderColor: BORDER, background: "#FFFFFF" }}
      >
        <span
          aria-hidden
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: selected === "" ? GOLD : "#C9C2B0" }}
        >
          {selected === "" ? (
            <span className="h-2 w-2 rounded-full" style={{ background: GOLD }} />
          ) : null}
        </span>
        <span className="text-sm" style={{ color: NAVY }}>
          None — I&apos;d love to discuss first or customize add-on benefits
        </span>
      </button>
      {/* Both fine-print disclaimers, requirements then discretion. POLISH-15
          (CHANGE 2) — minimized to 9px, muted dark grey, italic, tight leading. */}
      <div className="space-y-1.5">
        <p
          className="text-[9px] italic leading-[1.4]"
          style={{ color: "#3a3a3a" }}
        >
          {disclaimers?.requirements ??
            "Tier requirements and benefits are updated from time to time; clients are required to maintain qualifying conditions to retain their tier benefits."}
        </p>
        {disclaimers?.discretion ? (
          <p
            className="text-[9px] italic leading-[1.4]"
            style={{ color: "#3a3a3a" }}
          >
            {disclaimers.discretion}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

// GC / Site Supervisor block on the SITE form. POLISH-10 split the name into
// first + last; POLISH-15 (CHANGE 4) gives it the same contact field set as the
// other contacts: First/Last/Email + Personal/Work/Office phones (Office is the
// only optional one). Work phone keeps the `gcPhone` key (promoted to the
// sites.gc_phone column on approval); personal/office live in the form jsonb.
function GcSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section id="gc" title="GC / Site Supervisor">
      <Grid>
        <TextField
          label="First Name"
          required
          value={get("gcFirst")}
          onChange={(v) => set("gcFirst", v)}
        />
        <TextField
          label="Last Name"
          required
          value={get("gcLast")}
          onChange={(v) => set("gcLast", v)}
        />
        <TextField
          label="Email"
          type="email"
          required
          value={get("gcEmail")}
          onChange={(v) => set("gcEmail", v)}
        />
        <TextField
          label="Personal Phone"
          type="tel"
          required
          value={get("gcPersonalPhone")}
          onChange={(v) => set("gcPersonalPhone", v)}
        />
        <TextField
          label="Work Phone"
          type="tel"
          required
          value={get("gcPhone")}
          onChange={(v) => set("gcPhone", v)}
        />
        <TextField
          label="Office Phone"
          type="tel"
          value={get("gcOfficePhone")}
          onChange={(v) => set("gcOfficePhone", v)}
        />
      </Grid>
    </Section>
  );
}

// CHANGE 1 — Payment Policies. Renders the canonical 3-line policy text
// (keyed off the form's billing country, Canada fallback) in a formal bordered
// panel, plus a single acknowledgment checkbox bound to the shared autosave map
// under `payment_policies_acknowledged` ("true" when checked, "" when not). The
// server gates form-complete on this key; both forms reuse the same key name in
// their separate autosave maps.
function PaymentPoliciesSection({ get, set }: { get: Getter; set: Setter }) {
  const text = paymentPolicyText(get("billingCountry"));
  const acknowledged = get("payment_policies_acknowledged") === "true";
  return (
    <Section
      id="payment-policies"
      title="Payment Policies"
      note="The rates below reflect your selected billing country."
    >
      <div
        className="rounded-md p-4"
        style={{
          background: PANEL,
          borderLeft: `3px solid ${GOLD}`,
          border: `1px solid ${BORDER}`,
          borderLeftWidth: 3,
          borderLeftColor: GOLD,
        }}
      >
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "#2A2418", whiteSpace: "pre-line" }}
        >
          {text}
        </p>
      </div>
      <label
        className="flex items-start gap-2.5 text-[13px]"
        style={{ color: NAVY }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) =>
            set("payment_policies_acknowledged", e.target.checked ? "true" : "")
          }
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ accentColor: GOLD }}
        />
        I acknowledge and accept the payment policies as set out above.
      </label>
    </Section>
  );
}

// CHANGE 8 — a live completeness banner at the top of each form. While anything
// required is missing it lists each item; clicking one scrolls to that section.
// When everything's filled it confirms the form is ready to submit.
function FormCompleteness({ missing }: { missing: MissingField[] }) {
  if (missing.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border px-4 py-3 text-[13px] font-medium"
        style={{ borderColor: GOLD, background: PANEL, color: NAVY }}
      >
        <span aria-hidden style={{ color: GOLD_DEEP }}>
          ◆
        </span>
        All required information is complete — return to the status page to submit.
      </div>
    );
  }
  const scrollTo = (sectionId: string) => {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{ borderColor: "#E2B7AE", background: "#FCF3F1" }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "#7A2E22" }}>
        Please complete the following to submit:
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
        {missing.map((m, i) => (
          <li key={m.id} className="text-[13px]" style={{ color: "#7A2E22" }}>
            <button
              type="button"
              onClick={() => scrollTo(m.sectionId)}
              className="font-medium underline underline-offset-2"
              style={{ color: "#9B3A2C" }}
            >
              {m.label}
            </button>
            {i < missing.length - 1 ? <span aria-hidden>,</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormShell({
  token,
  title,
  description,
  savedAt,
  children,
}: {
  token: string;
  title: string;
  description: string;
  savedAt: number | null;
  children: ReactNode;
}) {
  return (
    <Card
      className="space-y-7 p-6 sm:p-8"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FDFBF4 100%)",
        borderColor: BORDER,
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1
            className="text-2xl"
            style={{ color: NAVY, fontFamily: SERIF }}
          >
            {title}
          </h1>
          <div
            className="mt-2 h-px w-16"
            style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }}
          />
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            {description}
          </p>
        </div>
        <SaveStatus savedAt={savedAt} />
      </div>
      <div className="space-y-7">{children}</div>
      <div className="border-t pt-4" style={{ borderColor: BORDER }}>
        <BackLink token={token} />
      </div>
    </Card>
  );
}

// ── Client Information form ───────────────────────────────────────────────────
export function ClientInfoForm({ token }: { token: string }) {
  const { inv, loading, error } = useInvitation(token);

  if (loading) return <Loading />;
  if (error || !inv) return <ErrorCard message={error ?? "This invitation link is invalid."} />;
  if (inv.submitted_at) return <LockedNotice />;

  return (
    <ClientInfoFormInner
      token={token}
      initial={inv.client_form_data}
      tierRequested={inv.tier_requested}
    />
  );
}

function ClientInfoFormInner({
  token,
  initial,
  tierRequested,
}: {
  token: string;
  initial: Record<string, unknown> | null;
  tierRequested: string | null;
}) {
  // Seed the tierRequested key from the invitation if the saved form map
  // doesn't already carry it (e.g. an earlier draft saved before this field
  // existed). The autosave map remains the single source of truth.
  const seeded = useMemo(() => {
    if (!tierRequested) return initial;
    const base = (initial ?? {}) as Record<string, unknown>;
    if (base.tierRequested != null && String(base.tierRequested) !== "") {
      return initial;
    }
    return { ...base, tierRequested };
  }, [initial, tierRequested]);

  const { get, set, savedAt, values } = useAutosave(
    token,
    seeded,
    (t, d) => saveClientFormAction(t, d)
  );
  const missing = clientFormMissing(values);

  return (
    <FormShell
      token={token}
      title="Client Information"
      description="Your company's legal details, billing & mailing addresses, tax, payment, and contacts."
      savedAt={savedAt}
    >
      <FormCompleteness missing={missing} />
      <Section id="company" title="Company">
        <Grid>
          <TextField
            label="Legal company name"
            required
            value={get("legalName")}
            onChange={(v) => set("legalName", v)}
            placeholder="ABC Corporation Ltd."
          />
          <TextField
            label="Trade / business name"
            value={get("tradeName")}
            onChange={(v) => set("tradeName", v)}
          />
        </Grid>
      </Section>

      <Section id="billing" title="Billing address">
        <AddressBlock get={get} set={set} prefix="billing" sectionPrefix="Billing" />
      </Section>

      <Section id="mailing" title="Mailing address" noteNode={<MailingNote />}>
        <AddressBlock get={get} set={set} prefix="mailing" sectionPrefix="Mailing" />
      </Section>

      {/* CHANGE 4 — Payment Policies sit between Tax and Payment Information so
          the client reads the payment terms before choosing a payment method. */}
      <TaxSection get={get} set={set} />
      <PaymentPoliciesSection get={get} set={set} />
      <PaymentSection get={get} set={set} />
      <ContactsSection get={get} set={set} />
      <TierSection get={get} set={set} />
    </FormShell>
  );
}

// ── Site Information form ─────────────────────────────────────────────────────
export function SiteInfoForm({ token }: { token: string }) {
  const { inv, loading, error } = useInvitation(token);

  if (loading) return <Loading />;
  if (error || !inv) return <ErrorCard message={error ?? "This invitation link is invalid."} />;
  if (inv.submitted_at) return <LockedNotice />;

  return <SiteInfoFormInner token={token} initial={inv.site_form_data} />;
}

function SiteInfoFormInner({
  token,
  initial,
}: {
  token: string;
  initial: Record<string, unknown> | null;
}) {
  const { get, set, savedAt, values } = useAutosave(
    token,
    initial,
    (t, d) => saveSiteFormAction(t, d)
  );
  const missing = siteFormMissing(values);

  return (
    <FormShell
      token={token}
      title="Site Information"
      description="The site we'll be servicing, plus billing & mailing, tax, payment, and contacts."
      savedAt={savedAt}
    >
      <FormCompleteness missing={missing} />
      <Section id="site" title="Site">
        <Grid>
          <TextField
            label="Site / Project name"
            required
            value={get("siteName")}
            onChange={(v) => set("siteName", v)}
            placeholder="Head office"
          />
        </Grid>
      </Section>

      <Section id="site-address" title="Site address">
        <AddressBlock get={get} set={set} prefix="site" sectionPrefix="Site" />
      </Section>

      <Section id="billing" title="Billing address">
        <AddressBlock get={get} set={set} prefix="billing" sectionPrefix="Billing" />
      </Section>

      <Section id="mailing" title="Mailing address" noteNode={<MailingNote />}>
        <AddressBlock get={get} set={set} prefix="mailing" sectionPrefix="Mailing" />
      </Section>

      {/* CHANGE 5 — GC / Site Supervisor moves up (after Tax, before Payment);
          Payment Policies sit after Payment; Contacts close the form. (This form
          has no standalone "AP Info" section — AP is contact rows within
          Contacts — so we follow the spec's explicit flow order.) */}
      <TaxSection get={get} set={set} />
      <GcSection get={get} set={set} />
      <PaymentSection get={get} set={set} />
      <PaymentPoliciesSection get={get} set={set} />
      <ContactsSection get={get} set={set} />
    </FormShell>
  );
}

// ── T&C signing ───────────────────────────────────────────────────────────────
// POLISH-15 — explicit signing state machine. The recurring T&C regression came
// from relying on a post-sign refetch (which could read stale data) instead of
// the authoritative view the action already returns. We now apply that view
// directly and track the flow as idle → signing → signed / error.
type SignStatus = "idle" | "signing" | "signed" | "error";

export function TcSign({ token, which }: { token: string; which: "tc1" | "tc2" }) {
  const { inv, loading, error, applyView } = useInvitation(token);
  const [terms, setTerms] = useState<string>("");
  const [termsLoaded, setTermsLoaded] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<SignStatus>("idle");
  const sigRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    let alive = true;
    getInviteTermsAction(which).then((r) => {
      if (!alive) return;
      if (r.ok) setTerms(r.data);
      setTermsLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [which]);

  // CHANGE 3 — exact page titles; tc2 always renders terms now.
  const title =
    which === "tc1"
      ? "Nexvelon Integrated Solutions Inc. — Default Terms and Conditions"
      : "Nexvelon Guardian Inc. — Default Terms and Conditions";

  const signedAt = inv ? (which === "tc1" ? inv.tc1_signed_at : inv.tc2_signed_at) : null;
  const signedName = inv ? (which === "tc1" ? inv.tc1_signed_name : inv.tc2_signed_name) : null;

  // Signing requires BOTH a typed name AND a drawn signature. Triggered by the
  // agree checkbox: on check, validate → capture PNG → signTcAction → apply the
  // returned view. POLISH-15 — on success we apply `res.data` (the authoritative
  // signed invitation) DIRECTLY rather than refetching, so the "Signed at …"
  // view renders deterministically; the old refetch could return stale data and
  // leave the screen looking unsigned. The status machine also blocks
  // double-clicks while in flight and reverts cleanly on validation/RPC failure.
  const signing = status === "signing";
  async function onAgree(checked: boolean) {
    if (status === "signing") return; // ignore clicks while a sign is in flight
    if (!checked) {
      setStatus("idle");
      return;
    }
    if (!name.trim()) {
      toast.error("Type your full name first.");
      setStatus("idle");
      return;
    }
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Please draw your signature first.");
      setStatus("idle");
      return;
    }
    let dataUrl: string;
    try {
      // Prefer a trimmed canvas (tight crop of the strokes); fall back to the
      // full canvas if the trim helper is unavailable in this build.
      dataUrl = pad.getTrimmedCanvas().toDataURL("image/png");
    } catch {
      dataUrl = pad.getCanvas().toDataURL("image/png");
    }
    setStatus("signing");
    const res = await signTcAction(token, which, name.trim(), dataUrl);
    if (!res.ok) {
      toast.error(res.error);
      setStatus("error"); // checkbox reverts to unchecked + re-enabled for retry
      return;
    }
    applyView(res.data); // authoritative — signedAt is now set → signed view shows
    setStatus("signed");
    toast.success("Signed");
  }

  if (loading || !termsLoaded) return <Loading />;
  if (error || !inv) return <ErrorCard message={error ?? "This invitation link is invalid."} />;
  if (inv.submitted_at) return <LockedNotice />;

  return (
    <Card
      className="space-y-5 p-6 sm:p-8"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FDFBF4 100%)",
        borderColor: BORDER,
      }}
    >
      <div>
        <h1 className="text-2xl" style={{ color: NAVY, fontFamily: SERIF }}>
          {title}
        </h1>
        <div
          className="mt-2 h-px w-16"
          style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }}
        />
      </div>

      <div
        className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border p-4 text-xs leading-relaxed"
        style={{ borderColor: BORDER, color: "#2A2418", background: PANEL }}
      >
        {terms}
      </div>

      {signedAt ? (
        <div
          className="rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: GOLD, background: PANEL, color: NAVY }}
        >
          Signed by <strong>{signedName}</strong> on{" "}
          {new Date(signedAt).toLocaleString()}.
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Type your full name to sign">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
            />
          </Field>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label
                className="text-[12px] font-medium normal-case"
                style={{ color: "#1a2332", letterSpacing: "normal" }}
              >
                Draw your signature below
              </Label>
              <button
                type="button"
                onClick={() => sigRef.current?.clear()}
                className="text-[11px] font-medium"
                style={{ color: GOLD }}
              >
                Clear
              </button>
            </div>
            <div
              className="w-full overflow-hidden rounded-md border"
              style={{ borderColor: BORDER, background: "#FFFFFF", width: "100%" }}
            >
              <SignatureCanvas
                ref={sigRef}
                penColor={NAVY}
                canvasProps={{
                  className: "w-full",
                  style: { width: "100%", height: 200, touchAction: "none" },
                }}
              />
            </div>
          </div>

          <label
            className="flex cursor-pointer items-center gap-2 text-sm"
            style={{ color: NAVY }}
          >
            <input
              type="checkbox"
              checked={status === "signing" || status === "signed"}
              disabled={signing}
              onChange={(e) => onAgree(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
              style={{ accentColor: GOLD }}
            />
            {signing
              ? "Signing…"
              : "I have read and agree to these Terms & Conditions."}
          </label>
        </div>
      )}

      <div className="border-t pt-4" style={{ borderColor: BORDER }}>
        <BackLink token={token} />
      </div>
    </Card>
  );
}

// ── Status / Submit hub ───────────────────────────────────────────────────────
type StepStatus = "complete" | "in_progress" | "not_started";

function StatusBadge({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, { label: string; bg: string; color: string; border: string }> = {
    complete: { label: "Complete", bg: GOLD, color: "#FFFFFF", border: GOLD },
    in_progress: { label: "In Progress", bg: PANEL, color: MUTED, border: BORDER },
    not_started: { label: "Not Started", bg: "#F2F0EA", color: "#9A937F", border: BORDER },
  };
  const s = map[status];
  return (
    <span
      className="shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      {s.label}
    </span>
  );
}

function StepRow({
  href,
  label,
  status,
  subnote,
}: {
  href: string;
  label: string;
  status: StepStatus;
  subnote?: string | null;
}) {
  const complete = status === "complete";
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-l-4 px-3 py-3 transition-colors hover:bg-[#FBF6EA] sm:px-4 sm:py-3.5"
      style={{
        borderColor: BORDER,
        borderLeftColor: complete ? GOLD : "#D8D0BC",
        background: complete
          ? "linear-gradient(180deg, #FFFFFF 0%, #FCF7EC 100%)"
          : "#FFFFFF",
      }}
    >
      <span className="min-w-0 flex-1">
        <span
          className="block text-sm italic"
          style={{ color: NAVY, fontFamily: SERIF }}
        >
          {label}
        </span>
        {subnote ? (
          <span className="mt-0.5 block text-[11px]" style={{ color: MUTED }}>
            {subnote}
          </span>
        ) : null}
      </span>
      <StatusBadge status={status} />
      <span className="shrink-0 text-sm" style={{ color: GOLD }}>
        ›
      </span>
    </Link>
  );
}

export function InviteStatus({ token }: { token: string }) {
  const { inv, loading, error, refresh } = useInvitation(token);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Loading />;
  if (error || !inv)
    return <ErrorCard message={error ?? "This invitation link is invalid."} />;

  if (inv.submitted_at) {
    return (
      <Card
        className="space-y-3 p-8 text-center"
        style={{
          background: "linear-gradient(180deg, #FFFFFF 0%, #FCF7EC 100%)",
          borderColor: GOLD,
        }}
      >
        <div aria-hidden style={{ color: GOLD, fontSize: 18 }}>
          ◆
        </div>
        <h1 className="text-2xl" style={{ color: NAVY, fontFamily: SERIF }}>
          Submitted — thank you.
        </h1>
        <p className="text-sm" style={{ color: MUTED }}>
          Your onboarding is complete and now locked. Our team will be in touch.
        </p>
      </Card>
    );
  }

  async function onSubmit() {
    setSubmitting(true);
    const res = await submitInvitationAction(token);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Submitted — thank you!");
    refresh();
  }

  const isFull = inv.invite_type === "full";
  const totalSteps = isFull ? 4 : 3;

  // Per-step status. "in_progress" = started (some saved data) but not yet
  // marked complete by the server; tc steps are binary (signed or not).
  const clientHasData = !!inv.client_form_data && Object.keys(inv.client_form_data).length > 0;
  const siteHasData = !!inv.site_form_data && Object.keys(inv.site_form_data).length > 0;

  const clientStatus: StepStatus = inv.client_form_completed
    ? "complete"
    : clientHasData
      ? "in_progress"
      : "not_started";
  const siteStatus: StepStatus = inv.site_form_completed
    ? "complete"
    : siteHasData
      ? "in_progress"
      : "not_started";
  const tc1Status: StepStatus = inv.tc1_signed_at ? "complete" : "not_started";
  const tc2Status: StepStatus = inv.tc2_signed_at ? "complete" : "not_started";

  const completedCount =
    (isFull && clientStatus === "complete" ? 1 : 0) +
    (siteStatus === "complete" ? 1 : 0) +
    (tc1Status === "complete" ? 1 : 0) +
    (tc2Status === "complete" ? 1 : 0);

  const tc1Note = inv.tc1_signed_at
    ? `Signed ${new Date(inv.tc1_signed_at).toLocaleDateString()}`
    : null;
  const tc2Note = inv.tc2_signed_at
    ? `Signed ${new Date(inv.tc2_signed_at).toLocaleDateString()}`
    : null;

  return (
    <Card
      className="space-y-6 p-6 sm:p-8"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FDFBF4 100%)",
        borderColor: BORDER,
      }}
    >
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl" style={{ color: NAVY, fontFamily: SERIF }}>
            Your onboarding
          </h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            {inv.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-[12px] uppercase tracking-[0.18em]"
            style={{ color: GOLD, fontFamily: SERIF, fontStyle: "italic" }}
          >
            Step {completedCount} of {totalSteps}
          </span>
          <span
            className="h-px flex-1"
            style={{ background: `linear-gradient(90deg, ${GOLD}, transparent)` }}
          />
        </div>
      </div>

      {/* POLISH-15 (CHANGE 3) — the Prestige Tier preview was removed from the
          hub; tier descriptions now live only on the client form's TierSection
          (where the actual selection happens). The hub goes straight to steps. */}
      <div className="space-y-3">
        <SectionHeading>Application Steps</SectionHeading>
        <div className="space-y-2.5">
          {isFull ? (
            <StepRow
              href={`/invite/${token}/client`}
              label="Client Information"
              status={clientStatus}
            />
          ) : null}
          <StepRow
            href={`/invite/${token}/site`}
            label="Site Information"
            status={siteStatus}
          />
          <StepRow
            href={`/invite/${token}/tc1`}
            label="Nexvelon Integrated Solutions Inc. — Default Terms and Conditions"
            status={tc1Status}
            subnote={tc1Note}
          />
          <StepRow
            href={`/invite/${token}/tc2`}
            label="Nexvelon Guardian Inc. — Default Terms and Conditions"
            status={tc2Status}
            subnote={tc2Note}
          />
        </div>
      </div>

      <div className="border-t pt-5" style={{ borderColor: BORDER }}>
        {/* CHANGE 8 — the disabled Submit carries a tooltip; the title attr sits
            on a wrapper span so it surfaces on hover even while the button is
            disabled (disabled controls don't fire hover in some browsers). */}
        <span
          title={
            !inv.ready
              ? "Some required information is missing — open each step above and complete the highlighted fields."
              : undefined
          }
        >
          <Button
            onClick={onSubmit}
            disabled={!inv.ready || submitting}
            className="w-full py-7 italic"
            style={{
              // CHANGE 4 — match the email CTA: navy fill, 2px antique-gold
              // border, italic Garamond gold label, soft gold shadow when ready.
              background: inv.ready ? "#1a2332" : "#C9C2B0",
              border: `2px solid ${inv.ready ? GOLD_DEEP : "#BBB3A0"}`,
              borderRadius: 6,
              color: inv.ready ? GOLD_DEEP : "#7A7560",
              fontFamily: "Garamond, 'Times New Roman', Georgia, serif",
              fontSize: 18,
              letterSpacing: "1.5px",
              boxShadow: inv.ready ? "0 2px 8px rgba(184,144,44,0.3)" : "none",
            }}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </span>
        {!inv.ready ? (
          <p
            className="mt-3 text-center text-[13px] italic"
            style={{ color: MUTED, fontFamily: SERIF }}
          >
            {isFull
              ? "Complete all four steps to submit — each step shows what's still needed at the top."
              : "Complete all three steps to submit — each step shows what's still needed at the top."}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
