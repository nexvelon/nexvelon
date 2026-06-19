"use client";

// POLISH-5 — admin review of a pending client submission. Loads the full
// submission (client + sites + originating invitation with the submitted form
// jsonb and signed-T&C metadata), renders it read-only, and exposes the
// approve / decline decision panel. Admin-gating is enforced both on the
// server page and inside the actions.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getSubmissionDetailAction,
  approvePendingClientAction,
  declinePendingClientAction,
  type SubmissionDetail,
} from "../../invite-actions";
import { getInviteTermsAction } from "@/app/invite/[token]/actions";
import { businessDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { DbClientTier } from "@/lib/types/database";

// ── helpers ───────────────────────────────────────────────────

/** Safely read a string field out of a jsonb map. */
function str(map: Record<string, unknown> | null | undefined, key: string): string {
  if (!map) return "";
  const v = map[key];
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

/** A label/value row. Skips empty values unless `anchor` (renders "—"). */
function Row({
  label,
  value,
  anchor = false,
}: {
  label: string;
  value: string;
  anchor?: boolean;
}) {
  if (!value && !anchor) return null;
  return (
    <div className="flex gap-4 border-b border-[var(--border)] py-1.5 last:border-b-0">
      <span className="text-muted-foreground w-44 shrink-0 text-[11px]">{label}</span>
      <span className="text-brand-charcoal text-xs">{value || "—"}</span>
    </div>
  );
}

/** A section card with a gold uppercase eyebrow heading. */
function Section({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-card p-6 shadow-sm">
      <p className="text-brand-gold mb-3 text-[10px] font-semibold uppercase tracking-[0.16em]">
        {eyebrow}
      </p>
      {children}
    </Card>
  );
}

/** Compose a "Street, Unit, City, Province Postal, Country" address line from
 *  a jsonb map and a key prefix (e.g. "billing", "mailing", "site"). */
function addressLine(
  map: Record<string, unknown> | null | undefined,
  prefix: string
): string {
  const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  const street = str(map, `${prefix}Street`);
  const unit = str(map, `${prefix}Unit`);
  const city = str(map, `${prefix}City`);
  const province = str(map, `${prefix}Province`);
  const postal = str(map, `${prefix}Postal`);
  const country = str(map, `${prefix}Country`);
  void cap;
  const parts: string[] = [];
  const line1 = [street, unit].filter(Boolean).join(", ");
  if (line1) parts.push(line1);
  const cityProv = [city, [province, postal].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  if (cityProv) parts.push(cityProv);
  if (country) parts.push(country);
  return parts.join(", ");
}

const CONTACT_LABELS = [
  "Primary Contact (Work)",
  "Primary Contact (Personal)",
  "AP (Work / Ext)",
  "AP (Direct)",
] as const;

/** Render the four fixed contact rows from c0..c3 keys; skip a row if all five
 *  fields are blank. */
function ContactRows({ map }: { map: Record<string, unknown> | null | undefined }) {
  const rows = CONTACT_LABELS.map((label, i) => {
    const first = str(map, `c${i}First`);
    const last = str(map, `c${i}Last`);
    const role = str(map, `c${i}Role`);
    const email = str(map, `c${i}Email`);
    const phone = str(map, `c${i}Phone`);
    const empty = !first && !last && !role && !email && !phone;
    return { label, first, last, role, email, phone, empty };
  }).filter((r) => !r.empty);

  if (rows.length === 0)
    return <p className="text-muted-foreground text-xs">No contacts provided.</p>;

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const name = [r.first, r.last].filter(Boolean).join(" ");
        return (
          <div key={r.label} className="rounded-md border border-[var(--border)] p-3">
            <p className="text-brand-navy text-[11px] font-semibold uppercase tracking-wide">
              {r.label}
            </p>
            <div className="mt-1.5">
              <Row label="Name" value={name} />
              <Row label="Role / Title" value={r.role} />
              <Row label="Email" value={r.email} />
              <Row label="Phone" value={r.phone} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── tier select options ───────────────────────────────────────

const TIER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "none", label: "None" },
  { value: "Bronze", label: "Bronze" },
  { value: "Silver", label: "Silver" },
  { value: "Gold", label: "Gold" },
  { value: "Platinum", label: "Platinum" },
];

// ── component ─────────────────────────────────────────────────

export function PendingReviewDetail({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);

  const [tier, setTier] = useState<string>("none");
  const [declineReason, setDeclineReason] = useState("");
  const [pending, startAction] = useTransition();

  // Terms dialog state.
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsTitle, setTermsTitle] = useState("");
  const [termsText, setTermsText] = useState<string | null>(null);
  const [termsLoading, setTermsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    getSubmissionDetailAction(clientId)
      .then((res) => {
        if (!active) return;
        if (res.ok) setDetail(res.data);
        else setError(res.error);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Failed to load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  const openTerms = (which: "tc1" | "tc2", title: string) => {
    setTermsTitle(title);
    setTermsText(null);
    setTermsLoading(true);
    setTermsOpen(true);
    getInviteTermsAction(which)
      .then((res) => {
        setTermsText(res.ok ? res.data : `Unable to load terms: ${res.error}`);
      })
      .catch(() => setTermsText("Unable to load terms."))
      .finally(() => setTermsLoading(false));
  };

  const handleApprove = () => {
    const selectedTier: DbClientTier | null =
      tier === "none" ? null : (tier as DbClientTier);
    startAction(async () => {
      const res = await approvePendingClientAction(clientId, selectedTier);
      if (res.ok) {
        toast.success("Client approved");
        router.push("/clients");
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleDecline = () => {
    startAction(async () => {
      const res = await declinePendingClientAction(clientId, declineReason || null);
      if (res.ok) {
        toast.success("Application declined");
        router.push("/clients");
      } else {
        toast.error(res.error);
      }
    });
  };

  // ── loading / error ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5">
        <BackLink />
        <Card className="bg-card p-10 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">Loading submission…</p>
        </Card>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-5">
        <BackLink />
        <Card className="bg-card p-10 text-center shadow-sm">
          <p className="text-brand-navy font-serif text-lg">Unable to load submission</p>
          <p className="text-muted-foreground mt-2 text-sm">
            {error ?? "This submission could not be found."}
          </p>
        </Card>
      </div>
    );
  }

  const { client, sites, invitation } = detail;
  const clientForm = invitation?.client_form_data ?? null;
  const siteForm = invitation?.site_form_data ?? null;
  const isSiteOnly = invitation?.invite_type === "site_only";

  // Validation anchors for the Approve button.
  const legalName = str(clientForm, "legalName");
  const siteName = str(siteForm, "siteName");
  const canApprove = isSiteOnly ? Boolean(siteName) : Boolean(legalName);

  return (
    <div className="space-y-5">
      <BackLink />

      {/* Header */}
      <div>
        <p className="text-brand-gold text-[10px] font-semibold uppercase tracking-[0.16em]">
          {isSiteOnly ? "Site-only submission" : "New client submission"} · Pending review
        </p>
        <h1 className="text-brand-navy font-serif text-2xl">
          {client.name || legalName || siteName || "Untitled submission"}
        </h1>
        {invitation?.submitted_at && (
          <p className="text-muted-foreground mt-1 text-xs">
            Submitted {businessDateTime(invitation.submitted_at)}
            {invitation.email ? ` · ${invitation.email}` : ""}
          </p>
        )}
      </div>

      {/* ── Client info (full invites only) ───────────────────── */}
      {!isSiteOnly && (
        <>
          <Section eyebrow="Client information">
            <Row label="Legal name" value={legalName} anchor />
            <Row label="Trade name" value={str(clientForm, "tradeName")} />
          </Section>

          <Section eyebrow="Addresses">
            <Row label="Billing address" value={addressLine(clientForm, "billing")} />
            <Row label="Mailing address" value={addressLine(clientForm, "mailing")} />
          </Section>

          <Section eyebrow="Tax">
            <Row label="HST number" value={str(clientForm, "hstNumber")} />
            <Row label="Tax exempt" value={str(clientForm, "taxExempt")} />
            <Row label="Exempt certificate" value={str(clientForm, "taxExemptCert")} />
          </Section>

          <Section eyebrow="Payment">
            <Row label="Payment terms" value={str(clientForm, "paymentTerms")} />
            <Row label="Payment method" value={str(clientForm, "paymentMethod")} />
            <Row label="Currency" value={str(clientForm, "currency")} />
          </Section>

          <Section eyebrow="Contacts">
            <ContactRows map={clientForm} />
          </Section>
        </>
      )}

      {/* ── Site info ──────────────────────────────────────────── */}
      <Section eyebrow="Site information">
        <Row label="Site name" value={str(siteForm, "siteName")} anchor={isSiteOnly} />
        <Row label="Site address" value={addressLine(siteForm, "site")} />
      </Section>

      <Section eyebrow="Site addresses">
        <Row label="Billing address" value={addressLine(siteForm, "billing")} />
        <Row label="Mailing address" value={addressLine(siteForm, "mailing")} />
      </Section>

      <Section eyebrow="Site tax">
        <Row label="HST number" value={str(siteForm, "hstNumber")} />
        <Row label="Tax exempt" value={str(siteForm, "taxExempt")} />
        <Row label="Exempt certificate" value={str(siteForm, "taxExemptCert")} />
      </Section>

      <Section eyebrow="Site payment">
        <Row label="Payment terms" value={str(siteForm, "paymentTerms")} />
        <Row label="Payment method" value={str(siteForm, "paymentMethod")} />
        <Row label="Currency" value={str(siteForm, "currency")} />
      </Section>

      <Section eyebrow="Site contacts">
        <ContactRows map={siteForm} />
      </Section>

      {sites.length > 0 && (
        <Section eyebrow="Attached sites">
          <div className="space-y-1.5">
            {sites.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between border-b border-[var(--border)] py-1.5 text-xs last:border-b-0"
              >
                <span className="text-brand-charcoal">{s.name || "Unnamed site"}</span>
                {s.city && <span className="text-muted-foreground">{s.city}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Signed T&Cs ────────────────────────────────────────── */}
      <Section eyebrow="Signed terms & conditions">
        <div className="space-y-3">
          <SignedTermsRow
            title="Nexvelon Integrated Solutions Inc. Terms and Conditions"
            signedName={invitation?.tc1_signed_name ?? null}
            signedAt={invitation?.tc1_signed_at ?? null}
            onView={() =>
              openTerms("tc1", "Nexvelon Integrated Solutions Inc. Terms and Conditions")
            }
          />
          <SignedTermsRow
            title="Nexvelon Guardian Inc. Terms and Conditions"
            signedName={invitation?.tc2_signed_name ?? null}
            signedAt={invitation?.tc2_signed_at ?? null}
            onView={() =>
              openTerms("tc2", "Nexvelon Guardian Inc. Terms and Conditions")
            }
          />
        </div>
      </Section>

      {/* ── Decision panel ─────────────────────────────────────── */}
      <Card className="bg-card border-t-2 border-t-[#C9A24B] p-6 shadow-sm">
        <p className="text-brand-gold mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
          Decision
        </p>
        <h3 className="text-brand-navy font-serif text-lg">Review & decide</h3>
        <p className="text-muted-foreground mt-1 mb-4 text-xs">
          Approving sends a welcome email and (optionally) sets the prestige tier.
          Declining emails the applicant the outcome and removes the pending record.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label className="text-muted-foreground text-[11px]">Assign tier</Label>
            <Select
              value={tier}
              onValueChange={(v) => setTier(v ?? "none")}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-muted-foreground text-[11px]">
              Decline reason (optional)
            </Label>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
              disabled={pending}
              placeholder="Shared with the applicant on decline."
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleDecline}
            disabled={pending}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            Decline & Send Outcome
          </Button>
          <Button
            onClick={handleApprove}
            disabled={pending || !canApprove}
            className="bg-brand-navy text-white hover:bg-brand-navy/90"
          >
            {pending ? "Working…" : "Approve & Send Welcome"}
          </Button>
        </div>
        {!canApprove && (
          <p className="text-muted-foreground mt-2 text-right text-[11px]">
            {isSiteOnly
              ? "A site name is required before approving."
              : "A legal name is required before approving."}
          </p>
        )}
      </Card>

      {/* ── Signed-terms dialog ────────────────────────────────── */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">{termsTitle}</DialogTitle>
            <DialogDescription>
              The terms text as signed by the applicant.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-[var(--border)] bg-muted/30 p-4">
            {termsLoading ? (
              <p className="text-muted-foreground text-xs">Loading terms…</p>
            ) : (
              <p className="text-brand-charcoal whitespace-pre-wrap text-xs leading-relaxed">
                {termsText || "No terms text available."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── small subcomponents ───────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/clients"
      className="text-muted-foreground hover:text-foreground text-sm"
    >
      ← Back to Clients
    </Link>
  );
}

function SignedTermsRow({
  title,
  signedName,
  signedAt,
  onView,
}: {
  title: string;
  signedName: string | null;
  signedAt: string | null;
  onView: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-[var(--border)] p-3">
      <div className="min-w-0">
        <p className="text-brand-navy text-xs font-semibold">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {signedName ? (
            <>
              Signed by <span className="text-brand-charcoal">{signedName}</span>
              {signedAt ? ` · ${businessDateTime(signedAt)}` : ""}
            </>
          ) : (
            "Not signed"
          )}
        </p>
      </div>
      <Button variant="outline" size="xs" onClick={onView} className="shrink-0">
        View signed terms
      </Button>
    </div>
  );
}
