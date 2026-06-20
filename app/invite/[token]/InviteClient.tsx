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

const CONTACT_ROWS = [
  "Primary Contact (Work)",
  "Primary Contact (Personal)",
  "AP (Work / Ext)",
  "AP (Direct)",
] as const;

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

  return { inv, loading, error, refresh };
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
      <Label className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
        {label}
        {required ? <span style={{ color: GOLD }}> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

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
        <SelectTrigger className="w-full">
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

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: GOLD }}
    >
      <span aria-hidden style={{ color: GOLD, fontSize: 9 }}>
        ◆
      </span>
      {children}
    </h2>
  );
}

// CHANGE 13 — the "Leave blank if same as billing" mailing note, rendered
// prominently: italic Garamond-feel serif, deeper gold, a touch larger than
// the plain helper text.
function MailingNote() {
  return (
    <p
      className="mt-1 text-[13px]"
      style={{ color: GOLD_DEEP, fontFamily: SERIF, fontStyle: "italic" }}
    >
      Leave blank if same as billing.
    </p>
  );
}

function Section({
  title,
  note,
  noteNode,
  children,
}: {
  title: string;
  note?: string;
  /** Custom note element (e.g. the highlighted mailing note). Takes
   *  precedence over the plain `note` string. */
  noteNode?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-t pt-5 first:border-t-0 first:pt-0" style={{ borderColor: BORDER }}>
      <div>
        <SectionHeading>{title}</SectionHeading>
        {noteNode ? (
          noteNode
        ) : note ? (
          <p className="mt-1 text-xs" style={{ color: MUTED }}>
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

  return { get, set, savedAt };
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
    <Section title="Tax">
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
    <Section title="Payment">
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
    <Section title="Contacts">
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
                value={get(`c${i}First`)}
                onChange={(v) => set(`c${i}First`, v)}
              />
              <TextField
                label="Last Name"
                value={get(`c${i}Last`)}
                onChange={(v) => set(`c${i}Last`, v)}
              />
              <TextField
                label="Role"
                value={get(`c${i}Role`)}
                onChange={(v) => set(`c${i}Role`, v)}
              />
              <TextField
                label="Email"
                type="email"
                value={get(`c${i}Email`)}
                onChange={(v) => set(`c${i}Email`, v)}
              />
              <TextField
                label="Phone"
                type="tel"
                value={get(`c${i}Phone`)}
                onChange={(v) => set(`c${i}Phone`, v)}
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
    <Section title="Apply for a Prestige Tier (optional)">
      <p className="text-xs" style={{ color: MUTED }}>
        Select the tier you&apos;d like to apply for. Final tier assignment is
        determined by Nexvelon Global based on annual business volume and
        exclusivity.
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
      {/* None option (full width) */}
      <button
        type="button"
        role="radio"
        aria-checked={selected === ""}
        onClick={() => set("tierRequested", "")}
        className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors"
        style={{
          borderColor: selected === "" ? GOLD : BORDER,
          background: selected === "" ? "linear-gradient(180deg, #FFFFFF 0%, #FBF4E2 100%)" : "#FFFFFF",
          boxShadow: selected === "" ? `0 0 0 1px ${GOLD}` : "none",
        }}
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
        <span className="text-sm font-semibold" style={{ color: NAVY, fontFamily: SERIF }}>
          None — I&apos;d prefer not to apply for a tier
        </span>
      </button>
      {/* CHANGE 5 — both fine-print disclaimers, requirements then discretion. */}
      <div className="space-y-1.5">
        <p
          className="text-[11px]"
          style={{ color: GOLD_DEEP, fontStyle: "italic", fontFamily: SERIF }}
        >
          {disclaimers?.requirements ??
            "Tier requirements and benefits are updated from time to time; clients are required to maintain qualifying conditions to retain their tier benefits."}
        </p>
        {disclaimers?.discretion ? (
          <p
            className="text-[11px]"
            style={{ color: MUTED, fontStyle: "italic", fontFamily: SERIF }}
          >
            {disclaimers.discretion}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

// CHANGE 7 — GC / Site Supervisor block on the SITE form. Keys: gcName,
// gcPhone, gcEmail (all part of the site-form autosave map).
function GcSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section title="GC / Site Supervisor">
      <Grid>
        <TextField
          label="Name"
          value={get("gcName")}
          onChange={(v) => set("gcName", v)}
        />
        <TextField
          label="Phone"
          type="tel"
          value={get("gcPhone")}
          onChange={(v) => set("gcPhone", v)}
        />
        <TextField
          label="Email"
          type="email"
          value={get("gcEmail")}
          onChange={(v) => set("gcEmail", v)}
        />
      </Grid>
    </Section>
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

  const { get, set, savedAt } = useAutosave(
    token,
    seeded,
    (t, d) => saveClientFormAction(t, d)
  );

  return (
    <FormShell
      token={token}
      title="Client Information"
      description="Your company's legal details, billing & mailing addresses, tax, payment, and contacts."
      savedAt={savedAt}
    >
      <Section title="Company">
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

      <Section title="Billing address">
        <AddressBlock get={get} set={set} prefix="billing" sectionPrefix="Billing" />
      </Section>

      <Section title="Mailing address" noteNode={<MailingNote />}>
        <AddressBlock get={get} set={set} prefix="mailing" sectionPrefix="Mailing" />
      </Section>

      <TaxSection get={get} set={set} />
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
  const { get, set, savedAt } = useAutosave(
    token,
    initial,
    (t, d) => saveSiteFormAction(t, d)
  );

  return (
    <FormShell
      token={token}
      title="Site Information"
      description="The site we'll be servicing, plus billing & mailing, tax, payment, and contacts."
      savedAt={savedAt}
    >
      <Section title="Site">
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

      <Section title="Site address">
        <AddressBlock get={get} set={set} prefix="site" sectionPrefix="Site" />
      </Section>

      <Section title="Billing address">
        <AddressBlock get={get} set={set} prefix="billing" sectionPrefix="Billing" />
      </Section>

      <Section title="Mailing address" noteNode={<MailingNote />}>
        <AddressBlock get={get} set={set} prefix="mailing" sectionPrefix="Mailing" />
      </Section>

      <TaxSection get={get} set={set} />
      <PaymentSection get={get} set={set} />
      <ContactsSection get={get} set={set} />
      <GcSection get={get} set={set} />
    </FormShell>
  );
}

// ── T&C signing ───────────────────────────────────────────────────────────────
export function TcSign({ token, which }: { token: string; which: "tc1" | "tc2" }) {
  const { inv, loading, error, refresh } = useInvitation(token);
  const [terms, setTerms] = useState<string>("");
  const [termsLoaded, setTermsLoaded] = useState(false);
  const [name, setName] = useState("");
  const [signing, setSigning] = useState(false);
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
  // agree checkbox: on check, validate → capture PNG data URL → signTcAction.
  async function onAgree(checked: boolean) {
    if (!checked) return;
    if (!name.trim()) {
      toast.error("Type your full name first.");
      return;
    }
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Please draw your signature first.");
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
    setSigning(true);
    const res = await signTcAction(token, which, name.trim(), dataUrl);
    setSigning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Signed");
    refresh();
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
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: MUTED }}
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

          <label className="flex items-center gap-2 text-sm" style={{ color: NAVY }}>
            <input
              type="checkbox"
              checked={false}
              disabled={signing}
              onChange={(e) => onAgree(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: GOLD }}
            />
            I have read and agree to these Terms &amp; Conditions.
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
      className="flex items-center gap-3 rounded-lg border border-l-4 px-4 py-3.5 transition-colors hover:bg-[#FBF6EA]"
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

      <div className="border-t pt-5" style={{ borderColor: BORDER }}>
        <Button
          onClick={onSubmit}
          disabled={!inv.ready || submitting}
          className="w-full text-white"
          style={{ background: inv.ready ? NAVY : "#C9C2B0" }}
        >
          {submitting ? "Submitting…" : "Submit"}
        </Button>
        {!inv.ready ? (
          <p
            className="mt-3 text-center text-[13px] italic"
            style={{ color: MUTED, fontFamily: SERIF }}
          >
            {isFull
              ? "Complete all four to submit."
              : "Complete all three to submit."}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
