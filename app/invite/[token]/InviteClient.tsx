"use client";

// POLISH-3 — public invitation UI: status/submit, the client + site info forms
// (debounced autosave), and the two T&C signing pages. All talk to the
// token-scoped public actions; no app auth.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  getInvitationAction,
  getInviteTermsAction,
  saveClientFormAction,
  saveSiteFormAction,
  signTcAction,
  submitInvitationAction,
  type InvitationView,
} from "./actions";

type FormState = Record<string, string>;

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
  return { inv, setInv, loading, error, refresh };
}

function Field({
  label,
  value,
  onChange,
  textarea,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs" style={{ color: "#5C5240" }}>
        {label}
      </Label>
      {textarea ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function LockedNotice() {
  return (
    <Card className="bg-white p-6 text-center text-sm" style={{ color: "#5C5240" }}>
      This invitation has already been submitted and is now locked. Thank you —
      our team will be in touch.
    </Card>
  );
}

// ── Shared autosave form scaffold ───────────────────────────────────────────
function AutosaveForm({
  token,
  title,
  description,
  fields,
  initial,
  save,
}: {
  token: string;
  title: string;
  description: string;
  fields: { key: string; label: string; textarea?: boolean; placeholder?: string }[];
  initial: Record<string, unknown> | null;
  save: (token: string, data: FormState) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [form, setForm] = useState<FormState>(() => {
    const f: FormState = {};
    for (const fl of fields) f[fl.key] = String(initial?.[fl.key] ?? "");
    return f;
  });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const lastSig = useRef<string>(JSON.stringify(form));
  const firstRun = useRef(true);

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

  return (
    <Card className="space-y-4 bg-white p-6">
      <div>
        <h1 className="font-serif text-xl" style={{ color: "#0A1226" }}>
          {title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#5C5240" }}>
          {description}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((fl) => (
          <div key={fl.key} className={fl.textarea ? "sm:col-span-2" : ""}>
            <Field
              label={fl.label}
              value={form[fl.key] ?? ""}
              onChange={(v) => setForm((p) => ({ ...p, [fl.key]: v }))}
              textarea={fl.textarea}
              placeholder={fl.placeholder}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "#5C5240" }}>
          {savedAt
            ? `Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Saves automatically"}
        </span>
        <Link href={`/invite/${token}`} className="text-sm" style={{ color: "#B8924B" }}>
          ← Back to status
        </Link>
      </div>
    </Card>
  );
}

export function ClientInfoForm({ token }: { token: string }) {
  const { inv, loading, error } = useInvitation(token);
  if (loading) return <Card className="bg-white p-6 text-sm">Loading…</Card>;
  if (error) return <Card className="bg-white p-6 text-sm text-red-700">{error}</Card>;
  if (inv?.submitted_at) return <LockedNotice />;
  return (
    <AutosaveForm
      token={token}
      title="Client Information"
      description="Your company's legal details, billing address, and primary contact."
      initial={inv?.client_form_data ?? null}
      save={async (t, d) => await saveClientFormAction(t, d)}
      fields={[
        { key: "legalName", label: "Legal company name", placeholder: "Acme Corporation Ltd." },
        { key: "industry", label: "Industry" },
        { key: "hstNumber", label: "HST / GST number" },
        { key: "contactName", label: "Primary contact name" },
        { key: "contactEmail", label: "Primary contact email" },
        { key: "contactPhone", label: "Primary contact phone" },
        { key: "billingStreet", label: "Billing street" },
        { key: "billingCity", label: "Billing city" },
        { key: "billingProvince", label: "Province" },
        { key: "billingPostal", label: "Postal code" },
        { key: "billingCountry", label: "Country", placeholder: "Canada" },
        { key: "notes", label: "Anything else we should know?", textarea: true },
      ]}
    />
  );
}

export function SiteInfoForm({ token }: { token: string }) {
  const { inv, loading, error } = useInvitation(token);
  if (loading) return <Card className="bg-white p-6 text-sm">Loading…</Card>;
  if (error) return <Card className="bg-white p-6 text-sm text-red-700">{error}</Card>;
  if (inv?.submitted_at) return <LockedNotice />;
  return (
    <AutosaveForm
      token={token}
      title="Site Information"
      description="The address and access details for the site we'll be servicing."
      initial={inv?.site_form_data ?? null}
      save={async (t, d) => await saveSiteFormAction(t, d)}
      fields={[
        { key: "siteName", label: "Site name", placeholder: "Head office" },
        { key: "addressLine1", label: "Street address" },
        { key: "addressLine2", label: "Unit / suite" },
        { key: "city", label: "City" },
        { key: "province", label: "Province" },
        { key: "postal", label: "Postal code" },
        { key: "country", label: "Country", placeholder: "Canada" },
        { key: "siteContactName", label: "On-site contact name" },
        { key: "siteContactPhone", label: "On-site contact phone" },
        { key: "accessNotes", label: "Access notes (gate codes, hours, parking)", textarea: true },
      ]}
    />
  );
}

export function TcSign({ token, which }: { token: string; which: "tc1" | "tc2" }) {
  const { inv, loading, error, refresh } = useInvitation(token);
  const [terms, setTerms] = useState<string>("");
  const [name, setName] = useState("");
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    getInviteTermsAction(which).then((r) => {
      if (r.ok) setTerms(r.data);
    });
  }, [which]);

  const title =
    which === "tc1"
      ? "Integrated Solutions — Terms & Conditions"
      : "Payment Terms & Conditions";
  const signedAt = which === "tc1" ? inv?.tc1_signed_at : inv?.tc2_signed_at;
  const signedName = which === "tc1" ? inv?.tc1_signed_name : inv?.tc2_signed_name;

  if (loading) return <Card className="bg-white p-6 text-sm">Loading…</Card>;
  if (error) return <Card className="bg-white p-6 text-sm text-red-700">{error}</Card>;
  if (inv?.submitted_at) return <LockedNotice />;

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

  return (
    <Card className="space-y-4 bg-white p-6">
      <h1 className="font-serif text-xl" style={{ color: "#0A1226" }}>
        {title}
      </h1>
      <div
        className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border p-4 text-xs leading-relaxed"
        style={{ borderColor: "#E5DFD0", color: "#2A2418", background: "#FBF9F4" }}
      >
        {terms || "Loading terms…"}
      </div>

      {signedAt ? (
        <div
          className="rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "#B8924B", background: "#FBF9F4", color: "#0A1226" }}
        >
          Signed by <strong>{signedName}</strong> on{" "}
          {new Date(signedAt).toLocaleString()}.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs" style={{ color: "#5C5240" }}>
              Type your full name to sign
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: "#0A1226" }}>
            <input
              type="checkbox"
              checked={false}
              disabled={signing}
              onChange={(e) => onAgree(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: "#B8924B" }}
            />
            I have read and agree to these Terms &amp; Conditions.
          </label>
        </div>
      )}

      <Link href={`/invite/${token}`} className="text-sm" style={{ color: "#B8924B" }}>
        ← Back to status
      </Link>
    </Card>
  );
}

// ── Status / Submit ─────────────────────────────────────────────────────────
function StepRow({
  href,
  label,
  done,
  detail,
}: {
  href: string;
  label: string;
  done: boolean;
  detail?: string | null;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-[#FBF9F4]"
      style={{ borderColor: "#E5DFD0" }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: done ? "#2e7d32" : "#C9C2B0" }}
      >
        {done ? "✓" : ""}
      </span>
      <span className="flex-1">
        <span className="text-sm font-medium" style={{ color: "#0A1226" }}>
          {label}
        </span>
        {detail ? (
          <span className="block text-[11px]" style={{ color: "#5C5240" }}>
            {detail}
          </span>
        ) : null}
      </span>
      <span style={{ color: "#B8924B" }}>{done ? "Edit" : "Start"} ›</span>
    </Link>
  );
}

export function InviteStatus({ token }: { token: string }) {
  const { inv, loading, error, refresh } = useInvitation(token);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Card className="bg-white p-6 text-sm">Loading…</Card>;
  if (error || !inv)
    return (
      <Card className="bg-white p-6 text-sm text-red-700">
        {error ?? "This invitation link is invalid."}
      </Card>
    );
  if (inv.submitted_at) return <LockedNotice />;

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

  const fmt = (iso: string | null) =>
    iso ? `Signed ${new Date(iso).toLocaleDateString()}` : null;

  return (
    <Card className="space-y-4 bg-white p-6">
      <div>
        <h1 className="font-serif text-xl" style={{ color: "#0A1226" }}>
          Your onboarding
        </h1>
        <p className="mt-1 text-sm" style={{ color: "#5C5240" }}>
          {inv.email}
        </p>
      </div>
      <div className="space-y-2">
        <StepRow
          href={`/invite/${token}/client`}
          label="Client Information Form"
          done={inv.client_form_completed}
        />
        <StepRow
          href={`/invite/${token}/site`}
          label="Site Information Form"
          done={inv.site_form_completed}
        />
        <StepRow
          href={`/invite/${token}/tc1`}
          label="Integrated Solutions — Terms & Conditions"
          done={!!inv.tc1_signed_at}
          detail={fmt(inv.tc1_signed_at)}
        />
        <StepRow
          href={`/invite/${token}/tc2`}
          label="Payment Terms & Conditions"
          done={!!inv.tc2_signed_at}
          detail={fmt(inv.tc2_signed_at)}
        />
      </div>
      <div className="border-t pt-4" style={{ borderColor: "#E5DFD0" }}>
        <Button
          onClick={onSubmit}
          disabled={!inv.ready || submitting}
          className="w-full text-white"
          style={{ background: inv.ready ? "#0A1226" : "#C9C2B0" }}
        >
          {submitting ? "Submitting…" : "Submit all"}
        </Button>
        {!inv.ready && (
          <p className="mt-2 text-center text-[11px]" style={{ color: "#5C5240" }}>
            Complete all four to submit.
          </p>
        )}
      </div>
    </Card>
  );
}
