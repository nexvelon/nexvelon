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
import {
  getInvitationAction,
  getInviteTermsAction,
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
const MUTED = "#5C5240";
const BORDER = "#E5DFD0";
const PANEL = "#FBF9F4";

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
      className="text-[11px] font-semibold uppercase tracking-[0.16em]"
      style={{ color: GOLD }}
    >
      {children}
    </h2>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-t pt-5 first:border-t-0 first:pt-0" style={{ borderColor: BORDER }}>
      <div>
        <SectionHeading>{title}</SectionHeading>
        {note ? (
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
    <Card className="space-y-6 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-xl" style={{ color: NAVY }}>
            {title}
          </h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            {description}
          </p>
        </div>
        <SaveStatus savedAt={savedAt} />
      </div>
      <div className="space-y-6">{children}</div>
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
    <ClientInfoFormInner token={token} initial={inv.client_form_data} />
  );
}

function ClientInfoFormInner({
  token,
  initial,
}: {
  token: string;
  initial: Record<string, unknown> | null;
}) {
  const { get, set, savedAt } = useAutosave(
    token,
    initial,
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
            placeholder="Acme Corporation Ltd."
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

      <Section title="Mailing address" note="Leave blank if same as billing.">
        <AddressBlock get={get} set={set} prefix="mailing" sectionPrefix="Mailing" />
      </Section>

      <TaxSection get={get} set={set} />
      <PaymentSection get={get} set={set} />
      <ContactsSection get={get} set={set} />
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

      <Section title="Mailing address" note="Leave blank if same as billing.">
        <AddressBlock get={get} set={set} prefix="mailing" sectionPrefix="Mailing" />
      </Section>

      <TaxSection get={get} set={set} />
      <PaymentSection get={get} set={set} />
      <ContactsSection get={get} set={set} />
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

  const title =
    which === "tc1"
      ? "Nexvelon Integrated Solutions Inc. Terms and Conditions"
      : "Nexvelon Guardian Inc. Terms and Conditions";

  const signedAt = inv ? (which === "tc1" ? inv.tc1_signed_at : inv.tc2_signed_at) : null;
  const signedName = inv ? (which === "tc1" ? inv.tc1_signed_name : inv.tc2_signed_name) : null;

  async function onAgree(checked: boolean) {
    if (!checked) return;
    if (!name.trim()) {
      toast.error("Type your full name first.");
      return;
    }
    setSigning(true);
    const res = await signTcAction(token, which, name.trim());
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

  // Guardian (tc2) gate: terms not published yet → no sign UI.
  const guardianGate =
    which === "tc2" && (terms.trim() === "" || inv.guardian_published === false);

  if (guardianGate) {
    return (
      <Card className="space-y-4 bg-white p-6">
        <h1 className="font-serif text-xl" style={{ color: NAVY }}>
          {title}
        </h1>
        <div
          className="rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: BORDER, background: PANEL, color: MUTED }}
        >
          Guardian terms not yet published — contact us.
        </div>
        <BackLink token={token} />
      </Card>
    );
  }

  return (
    <Card className="space-y-4 bg-white p-6">
      <h1 className="font-serif text-xl" style={{ color: NAVY }}>
        {title}
      </h1>

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
        <div className="space-y-3">
          <Field label="Type your full name to sign">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
            />
          </Field>
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
function StepRow({
  href,
  label,
  done,
  subnote,
}: {
  href: string;
  label: string;
  done: boolean;
  subnote?: string | null;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-[#FBF9F4]"
      style={{ borderColor: BORDER }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: done ? "#2e7d32" : "#C9C2B0" }}
      >
        {done ? "✓" : ""}
      </span>
      <span className="flex-1">
        <span className="text-sm font-medium" style={{ color: NAVY }}>
          {label}
        </span>
        {subnote ? (
          <span className="block text-[11px]" style={{ color: MUTED }}>
            {subnote}
          </span>
        ) : null}
      </span>
      <span className="text-sm" style={{ color: GOLD }}>
        {done ? "Edit" : "Start"} ›
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
    return <CenterCard>Submitted — thank you.</CenterCard>;
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

  const tc1Note = inv.tc1_signed_at
    ? `Signed ${new Date(inv.tc1_signed_at).toLocaleDateString()}`
    : null;
  const tc2Note = inv.tc2_signed_at
    ? `Signed ${new Date(inv.tc2_signed_at).toLocaleDateString()}`
    : !inv.guardian_published
      ? "Awaiting Guardian terms — you'll be able to sign once published."
      : null;

  return (
    <Card className="space-y-5 bg-white p-6">
      <div>
        <h1 className="font-serif text-xl" style={{ color: NAVY }}>
          Your onboarding
        </h1>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          {inv.email}
        </p>
      </div>

      <div className="space-y-2">
        {inv.invite_type === "full" ? (
          <StepRow
            href={`/invite/${token}/client`}
            label="Client Information"
            done={inv.client_form_completed}
          />
        ) : null}
        <StepRow
          href={`/invite/${token}/site`}
          label="Site Information"
          done={inv.site_form_completed}
        />
        <StepRow
          href={`/invite/${token}/tc1`}
          label="Nexvelon Integrated Solutions Inc. Terms and Conditions"
          done={!!inv.tc1_signed_at}
          subnote={tc1Note}
        />
        <StepRow
          href={`/invite/${token}/tc2`}
          label="Nexvelon Guardian Inc. Terms and Conditions"
          done={!!inv.tc2_signed_at}
          subnote={tc2Note}
        />
      </div>

      <div className="border-t pt-4" style={{ borderColor: BORDER }}>
        <Button
          onClick={onSubmit}
          disabled={!inv.ready || submitting}
          className="w-full text-white"
          style={{ background: inv.ready ? NAVY : "#C9C2B0" }}
        >
          {submitting ? "Submitting…" : "Submit"}
        </Button>
        {!inv.ready ? (
          <p className="mt-2 text-center text-[11px]" style={{ color: MUTED }}>
            Complete all steps to submit.
            {!inv.guardian_published
              ? " The Guardian terms are not yet available to sign."
              : ""}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
