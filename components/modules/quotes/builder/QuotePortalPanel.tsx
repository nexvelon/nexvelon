"use client";

// QUOTE-PORTAL-2 — the operator's send-and-track panel. Pick recipients (To/Cc)
// from real client/site contacts + employees (or free-type), choose a delivery
// mode, send, and watch status. Prior sends/acceptances stay as history. An Admin
// can permanently delete an acceptance (confirmed, audited). Honest status only.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, Copy, Check, Trash2, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  sendQuotePortalAction,
  getQuotePortalOverviewAction,
  getQuoteRecipientOptionsAction,
  deleteAcceptanceAction,
  type QuoteRecipientOption,
} from "@/app/(app)/quotes/actions";
import type { QuotePortalOverview, DeliveryMode, PortalRecipientInput } from "@/lib/api/quote-portal";

type Picked = { name: string; email: string; source: string };

function fmt(ts: string | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return ts;
  }
}

export function QuotePortalPanel({ quoteId }: { quoteId: string; defaultEmail?: string }) {
  const { role } = useRole();
  const canEdit = hasPermission(role, "quotes", "edit");
  const isAdmin = role === "Admin";

  const [overview, setOverview] = useState<QuotePortalOverview | null>(null);
  const [options, setOptions] = useState<{
    clientContacts: QuoteRecipientOption[];
    siteContacts: QuoteRecipientOption[];
    employees: QuoteRecipientOption[];
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [composing, setComposing] = useState(false);
  const [mode, setMode] = useState<DeliveryMode>("link");
  const [to, setTo] = useState<Picked[]>([]);
  const [cc, setCc] = useState<Picked[]>([]);
  const [search, setSearch] = useState("");
  const [freeName, setFreeName] = useState("");
  const [freeEmail, setFreeEmail] = useState("");
  const [links, setLinks] = useState<{ email: string; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const refresh = useCallback(async () => {
    const res = await getQuotePortalOverviewAction(quoteId);
    if (res.ok) setOverview(res.data);
    setLoaded(true);
  }, [quoteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (composing && !options) {
      void getQuoteRecipientOptionsAction(quoteId).then((res) => {
        if (res.ok) setOptions(res.data);
      });
    }
  }, [composing, options, quoteId]);

  const inTo = (email: string) => to.some((r) => r.email.toLowerCase() === email.toLowerCase());
  const inCc = (email: string) => cc.some((r) => r.email.toLowerCase() === email.toLowerCase());

  const addTo = (r: Picked) => {
    setCc((c) => c.filter((x) => x.email.toLowerCase() !== r.email.toLowerCase()));
    setTo((t) => (inTo(r.email) ? t : [...t, r]));
  };
  const addCc = (r: Picked) => {
    setTo((t) => t.filter((x) => x.email.toLowerCase() !== r.email.toLowerCase()));
    setCc((c) => (inCc(r.email) ? c : [...c, r]));
  };
  const removeFrom = (email: string) => {
    setTo((t) => t.filter((x) => x.email.toLowerCase() !== email.toLowerCase()));
    setCc((c) => c.filter((x) => x.email.toLowerCase() !== email.toLowerCase()));
  };

  const allOptions = useMemo(() => {
    if (!options) return [];
    return [...options.clientContacts, ...options.siteContacts, ...options.employees];
  }, [options]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) => o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q) || (o.role ?? "").toLowerCase().includes(q)
    );
  }, [allOptions, search]);

  const addFreeType = (target: "to" | "cc") => {
    const email = freeEmail.trim();
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    const r: Picked = { name: freeName.trim() || email, email, source: "manual" };
    if (target === "to") addTo(r);
    else addCc(r);
    setFreeName("");
    setFreeEmail("");
    setError(null);
  };

  const send = () => {
    if (to.length === 0) {
      setError("Add at least one To recipient.");
      return;
    }
    setError(null);
    setLinks([]);
    const recipients: PortalRecipientInput[] = [
      ...to.map((r) => ({ role: "to" as const, name: r.name, email: r.email, source: r.source })),
      ...cc.map((r) => ({ role: "cc" as const, name: r.name, email: r.email, source: r.source })),
    ];
    start(async () => {
      const res = await sendQuotePortalAction({ quoteId, deliveryMode: mode, recipients });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLinks(res.data.links);
      if (res.data.emailWarning) {
        toast.warning(`Sent, but an email may not have gone out (${res.data.emailWarning}). Copy the link and follow up.`);
      } else {
        toast.success("Quote sent");
      }
      setComposing(false);
      setTo([]);
      setCc([]);
      await refresh();
    });
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1600);
    } catch {
      /* clipboard blocked — link is shown for manual copy */
    }
  };

  const deleteAcceptance = (acceptanceId: string, signer: string) => {
    if (
      !window.confirm(
        `Permanently delete the acceptance signed by ${signer}? This CANNOT be undone. The record will be removed; the fact that it was deleted (by you, now) is kept in the audit log.`
      )
    )
      return;
    start(async () => {
      const res = await deleteAcceptanceAction({ acceptanceId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Acceptance deleted");
      await refresh();
    });
  };

  const latest = overview?.latest ?? null;
  const acceptance = latest?.acceptance ?? null;

  return (
    <div className="bg-card rounded-lg border border-[var(--border)] p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Send className="text-brand-gold h-4 w-4" />
        <h2 className="text-brand-navy font-serif text-lg">Client portal</h2>
        {latest && <StatusChip status={latest.send.status} />}
        {canEdit && !composing && (
          <Button size="sm" className="ml-auto" onClick={() => setComposing(true)}>
            {latest ? "Resend (new link)" : "Send to client"}
          </Button>
        )}
      </div>

      {!loaded ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          {latest && canEdit && !composing && (
            <p className="text-muted-foreground mb-3 text-[11px]">
              Resending captures a fresh snapshot and a new link, and immediately revokes the previous
              link — a client can never accept superseded pricing.
            </p>
          )}

          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

          {/* Compose */}
          {composing && (
            <div className="mb-4 rounded-md border border-[var(--border)] p-3">
              <div className="mb-3 flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Send as:</span>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === "link"} onChange={() => setMode("link")} /> Link only
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === "attachment"} onChange={() => setMode("attachment")} /> PDF attachment + link
                </label>
                <button className="text-muted-foreground ml-auto" onClick={() => setComposing(false)} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <RecipientRow label="To" people={to} onRemove={removeFrom} />
              <RecipientRow label="Cc" people={cc} onRemove={removeFrom} hint="Cc receives the PDF (attachment mode) but never a signing link." />

              {/* Picker */}
              <div className="mt-3">
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-2 top-2.5 h-4 w-4" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search contacts & employees…"
                    className="pl-8"
                  />
                </div>
                <div className="mt-2 max-h-56 overflow-auto rounded border border-[var(--border)]">
                  {filtered.length === 0 ? (
                    <p className="text-muted-foreground p-3 text-sm">
                      {options && allOptions.length === 0
                        ? "No contacts on file for this client or site. Add one on the client/site, or type an address below."
                        : "No matches."}
                    </p>
                  ) : (
                    filtered.map((o) => (
                      <div key={`${o.source}-${o.email}`} className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-sm last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{o.name}</div>
                          <div className="text-muted-foreground truncate text-xs">
                            {o.email}
                            {o.role ? ` · ${o.role}` : ""} · {sourceLabel(o.source)}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => addTo({ name: o.name, email: o.email, source: o.source })} disabled={inTo(o.email)}>
                          To
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => addCc({ name: o.name, email: o.email, source: o.source })} disabled={inCc(o.email)}>
                          Cc
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {/* Free-type */}
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Input value={freeName} onChange={(e) => setFreeName(e.target.value)} placeholder="Name (optional)" className="w-40" />
                  <Input value={freeEmail} onChange={(e) => setFreeEmail(e.target.value)} placeholder="someone@company.com" className="w-56" />
                  <Button size="sm" variant="outline" onClick={() => addFreeType("to")}>Add to To</Button>
                  <Button size="sm" variant="outline" onClick={() => addFreeType("cc")}>Add to Cc</Button>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={send} disabled={busy || to.length === 0}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {busy ? "Sending…" : mode === "attachment" ? "Send PDF + link" : "Send link"}
                </Button>
              </div>
            </div>
          )}

          {/* Links just produced */}
          {links.length > 0 && (
            <div className="mb-4 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
              <p className="mb-1.5 text-xs font-medium">Signing links (To recipients):</p>
              {links.map((l) => (
                <div key={l.url} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="text-muted-foreground w-40 truncate">{l.email}</span>
                  <span className="min-w-0 flex-1 truncate">{l.url}</span>
                  <button onClick={() => copy(l.url)} aria-label="Copy link">
                    {copied === l.url ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Latest status */}
          {!latest && !composing && <p className="text-muted-foreground text-sm">This quote hasn&apos;t been sent yet.</p>}

          {latest && (
            <div className="text-sm">
              <div className="text-muted-foreground mb-2 text-[13px]">
                Sent {fmt(latest.send.sent_at)} · {latest.send.delivery_mode === "attachment" ? "PDF + link" : "link"} · valid until {fmt(latest.send.expires_at)}
              </div>
              <div className="space-y-1">
                {latest.recipients.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-[13px]">
                    <span className="w-8 uppercase text-[11px] text-muted-foreground">{r.role}</span>
                    <span className="min-w-0 flex-1 truncate">{r.name ? `${r.name} · ` : ""}{r.email}</span>
                    <span className="text-muted-foreground text-xs">
                      {r.role === "cc"
                        ? "copy only"
                        : r.view_count > 0
                          ? `viewed ${r.view_count}×`
                          : "not viewed yet"}
                      {r.status !== "sent" && r.status !== "viewed" ? ` · ${r.status}` : ""}
                    </span>
                  </div>
                ))}
              </div>

              {acceptance && (
                <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--muted)] p-3">
                  <div className="flex items-center gap-2 font-medium">
                    {acceptance.decision === "accepted" ? (
                      <><Check className="h-4 w-4 text-emerald-600" /> Accepted &amp; signed</>
                    ) : (
                      <>Declined</>
                    )}
                    {isAdmin && (
                      <button
                        className="ml-auto inline-flex items-center gap-1 text-xs text-red-600"
                        onClick={() => deleteAcceptance(acceptance.id, acceptance.signer_name ?? acceptance.signer_email ?? "unknown")}
                        disabled={busy}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete record
                      </button>
                    )}
                  </div>
                  <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                    {acceptance.signer_name && (<><dt>Signed by</dt><dd className="text-foreground">{acceptance.signer_name}{acceptance.signer_title ? `, ${acceptance.signer_title}` : ""}</dd></>)}
                    {acceptance.signer_email && (<><dt>Email</dt><dd className="text-foreground">{acceptance.signer_email}</dd></>)}
                    <dt>When</dt><dd className="text-foreground">{fmt(acceptance.accepted_at)}</dd>
                    {acceptance.ip && (<><dt>IP</dt><dd className="text-foreground font-mono text-xs">{acceptance.ip}</dd></>)}
                    {acceptance.decision === "declined" && acceptance.decline_reason && (<><dt>Reason</dt><dd className="text-foreground">{acceptance.decline_reason}</dd></>)}
                  </dl>
                </div>
              )}
            </div>
          )}

          {/* History */}
          {overview && overview.history.length > 1 && (
            <details className="mt-3">
              <summary className="text-muted-foreground cursor-pointer text-xs">Earlier sends ({overview.history.length - 1})</summary>
              <div className="mt-2 space-y-1">
                {overview.history.slice(1).map((h) => (
                  <div key={h.send.id} className="text-muted-foreground text-xs">
                    {fmt(h.send.sent_at)} — {h.send.status}
                    {h.acceptance ? ` · ${h.acceptance.decision} by ${h.acceptance.signer_name ?? "client"}` : ""}
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function RecipientRow({ label, people, onRemove, hint }: { label: string; people: Picked[]; onRemove: (email: string) => void; hint?: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground mt-1 w-8 text-[11px] uppercase">{label}</span>
        <div className="flex min-h-[34px] flex-1 flex-wrap items-center gap-1.5 rounded border border-[var(--border)] p-1.5">
          {people.length === 0 ? (
            <span className="text-muted-foreground px-1 text-xs">None</span>
          ) : (
            people.map((r) => (
              <span key={r.email} className="inline-flex items-center gap-1 rounded bg-[var(--muted)] px-2 py-0.5 text-xs">
                {r.name || r.email}
                <button onClick={() => onRemove(r.email)} aria-label={`Remove ${r.email}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>
      {hint && <p className="text-muted-foreground ml-10 mt-0.5 text-[11px]">{hint}</p>}
    </div>
  );
}

function sourceLabel(source: string): string {
  return source === "client_contact" ? "Client contact" : source === "site_contact" ? "Site contact" : source === "employee" ? "Employee" : "Manual";
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
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}
