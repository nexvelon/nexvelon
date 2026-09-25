"use client";

// QUOTE-PORTAL-1 — the operator's view of the client e-acceptance portal. Shows
// the current send status (not sent / sent / viewed / accepted / declined) with
// honest engagement data (§2.8 — "not viewed yet" is only ever shown when the
// view_count is genuinely 0), the shareable link, and the append-only acceptance
// record (signer, title, timestamp, IP) once the client responds. Sending is a
// deliberate operator action; conversion to a project stays separate.

import { useCallback, useEffect, useState } from "react";
import { Send, Link2, Check, Copy, Eye, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  sendQuotePortalAction,
  getQuotePortalStatusAction,
} from "@/app/(app)/quotes/actions";
import type { QuotePortalStatus } from "@/lib/api/quote-portal";

function fmt(ts: string | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return ts;
  }
}

export function QuotePortalPanel({
  quoteId,
  defaultEmail,
}: {
  quoteId: string;
  defaultEmail?: string;
}) {
  const { role } = useRole();
  const canEdit = hasPermission(role, "quotes", "edit");

  const [status, setStatus] = useState<QuotePortalStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const res = await getQuotePortalStatusAction(quoteId);
    if (res.ok) setStatus(res.data);
    setLoaded(true);
  }, [quoteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Prefill from the client contact once the quote loads it, unless the operator
  // has already typed something.
  useEffect(() => {
    setEmail((cur) => (cur ? cur : defaultEmail ?? ""));
  }, [defaultEmail]);

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await sendQuotePortalAction({ quoteId, recipientEmail: email.trim() });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    await refresh();
  };

  const latest = status?.latest ?? null;
  const acceptance = status?.acceptance ?? null;
  const portalUrl =
    latest && typeof window !== "undefined"
      ? `${window.location.origin}/q/${latest.token}`
      : null;
  const isOpen = latest && (latest.status === "sent" || latest.status === "viewed");

  const copy = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the link is shown for manual copy */
    }
  };

  return (
    <div className="bg-card rounded-lg border border-[var(--border)] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="text-brand-gold h-4 w-4" />
        <h2 className="text-brand-navy font-serif text-lg">Client portal</h2>
        {latest && <StatusChip status={latest.status} />}
      </div>

      {!loaded ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          {/* Acceptance record — the legally meaningful part. */}
          {acceptance && (
            <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {acceptance.decision === "accepted" ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    Accepted
                  </>
                ) : (
                  <>Declined</>
                )}
              </div>
              <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                {acceptance.signer_name && (
                  <>
                    <dt>Signed by</dt>
                    <dd className="text-foreground">
                      {acceptance.signer_name}
                      {acceptance.signer_title ? `, ${acceptance.signer_title}` : ""}
                    </dd>
                  </>
                )}
                {acceptance.signer_email && (
                  <>
                    <dt>Email</dt>
                    <dd className="text-foreground">{acceptance.signer_email}</dd>
                  </>
                )}
                <dt>When</dt>
                <dd className="text-foreground">{fmt(acceptance.accepted_at)}</dd>
                {acceptance.ip && (
                  <>
                    <dt>IP</dt>
                    <dd className="text-foreground font-mono text-xs">{acceptance.ip}</dd>
                  </>
                )}
                {acceptance.decision === "declined" && acceptance.decline_reason && (
                  <>
                    <dt>Reason</dt>
                    <dd className="text-foreground">{acceptance.decline_reason}</dd>
                  </>
                )}
              </dl>
              {acceptance.signature_image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={acceptance.signature_image}
                  alt="Client signature"
                  className="mt-2 max-h-20 rounded border border-[var(--border)] bg-white"
                />
              )}
              <p className="text-muted-foreground mt-2 text-[11px]">
                This acceptance is recorded against the exact quote that was sent. Converting
                it to a project is a separate step you take from the quote actions.
              </p>
            </div>
          )}

          {/* Engagement (honest — never fabricated). */}
          {latest && !acceptance && (
            <div className="text-muted-foreground mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span>Sent {fmt(latest.sent_at)}</span>
              {latest.recipient_email && <span>to {latest.recipient_email}</span>}
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {latest.view_count > 0
                  ? `Viewed ${latest.view_count}× · last ${fmt(latest.last_viewed_at)}`
                  : "Not viewed yet"}
              </span>
              <span>Link valid until {fmt(latest.expires_at)}</span>
            </div>
          )}

          {/* Shareable link for an open send. */}
          {isOpen && portalUrl && (
            <div className="mb-4 flex items-center gap-2">
              <div className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1.5 text-xs">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{portalUrl}</span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          )}

          {/* Send / resend (edit permission). */}
          {canEdit && !acceptance && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="email"
                inputMode="email"
                placeholder="client@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sm:max-w-xs"
              />
              <Button type="button" onClick={send} disabled={busy}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {busy ? "Sending…" : latest ? "Resend (new link)" : "Send to client"}
              </Button>
            </div>
          )}

          {canEdit && latest && !acceptance && (
            <p className="text-muted-foreground mt-2 text-[11px]">
              Resending revises the offer: it captures a fresh snapshot and invalidates the
              previous link so an old copy can&apos;t be accepted.
            </p>
          )}

          {!canEdit && !latest && (
            <p className="text-muted-foreground text-sm">This quote hasn&apos;t been sent yet.</p>
          )}

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    sent: { label: "Sent", cls: "bg-blue-100 text-blue-800" },
    viewed: { label: "Viewed", cls: "bg-amber-100 text-amber-800" },
    accepted: { label: "Accepted", cls: "bg-emerald-100 text-emerald-800" },
    declined: { label: "Declined", cls: "bg-red-100 text-red-800" },
    revoked: { label: "Revoked", cls: "bg-neutral-200 text-neutral-700" },
    expired: { label: "Expired", cls: "bg-neutral-200 text-neutral-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-neutral-200 text-neutral-700" };
  return (
    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
