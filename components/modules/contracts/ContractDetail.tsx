"use client";

// RECUR-1 — service contract detail: parties/cadence/amount/status, lifecycle
// actions, "Generate now", and the generated-invoice history (with an Issue action
// for drafts awaiting approval).
// RECUR-2 — plus: the signed quote it came from (durable link + the terms exactly
// as signed), payment + late-fee terms, the late-fee approval queue, cancellation
// with pro-rated credits, and the credits issued.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CADENCE_LABEL,
  BILLING_MODE_LABEL,
  OPCO_LABEL,
  CONTRACT_STATUS_TONE,
} from "./shared";
import { ContractFormDrawer, type ClientOption, type SiteOption } from "./ContractFormDrawer";
import {
  setContractStatusAction,
  generateNowAction,
  issueContractDraftAction,
} from "@/app/(app)/contracts/actions";
import type { ServiceContractDetail } from "@/lib/api/service-contracts";
import type { LateFeeRow } from "@/lib/api/contract-adjustments";
import type { DbServiceContractCredit } from "@/lib/types/database";
import type { RecurringTermsSnapshot } from "@/lib/recurring/quote-terms";
import { CADENCE_PERIOD_NOUN } from "@/lib/recurring/quote-terms";
import { describeLateFeeTerms } from "@/lib/recurring/late-fees";
import { CancelContractDialog } from "./CancelContractDialog";
import { ContractLateFeesCard } from "./ContractLateFeesCard";

// RECUR-2 — "Cancel" is no longer a bare status flip: it opens the cancellation
// dialog (last day of service + pro-rated credit). Handled separately below.
const NEXT_STATUS: Record<string, { label: string; to: string; tone?: "danger" }[]> = {
  draft: [{ label: "Activate", to: "active" }],
  active: [{ label: "Suspend", to: "suspended" }],
  suspended: [{ label: "Reactivate", to: "active" }],
  cancelled: [],
  expired: [],
};
const CANCELLABLE = new Set(["active", "suspended"]);

export function ContractDetail({
  detail,
  canManage,
  clientOptions,
  siteOptions,
  lateFees = null,
  credits = [],
}: {
  detail: ServiceContractDetail;
  canManage: boolean;
  clientOptions: ClientOption[];
  siteOptions: SiteOption[];
  /** null = the viewer can't see financials (late fees are hidden, not faked). */
  lateFees?: LateFeeRow[] | null;
  credits?: DbServiceContractCredit[];
}) {
  const router = useRouter();
  const c = detail.contract;
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const signed = (c.source_terms ?? null) as RecurringTermsSnapshot | null;
  const lateFeeText = describeLateFeeTerms({
    mode: c.late_fee_mode ?? "none",
    monthlyPct: c.late_fee_monthly_pct,
    flatAmount: c.late_fee_flat_amount,
    graceDays: c.late_fee_grace_days,
  });
  const signedPeriod = signed?.periodTotal ?? null;
  const priceDrift = signedPeriod != null && Math.abs(signedPeriod - c.period_amount) > 0.005;
  const [pending, start] = useTransition();

  const changeStatus = (to: string) =>
    start(async () => {
      const res = await setContractStatusAction(c.id, to as never);
      if (res.ok) {
        toast.success(`Contract ${to}`);
        router.refresh();
      } else toast.error(res.error);
    });

  const generateNow = () =>
    start(async () => {
      const res = await generateNowAction(c.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const r = res.data;
      if (r.generated === 0 && r.skipped > 0) toast.success("Up to date — nothing new to bill");
      else if (r.generated > 0) toast.success(`Generated ${r.generated} invoice${r.generated === 1 ? "" : "s"}`);
      else toast.success("Nothing due");
      router.refresh();
    });

  const issueDraft = (invoiceId: string) =>
    start(async () => {
      const res = await issueContractDraftAction(invoiceId);
      if (res.ok) {
        toast.success("Invoice issued");
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className="space-y-6">
      <Link href="/contracts" className="text-muted-foreground hover:text-brand-charcoal text-xs">
        ← Back to Service Contracts
      </Link>

      <PageHeader
        eyebrow={OPCO_LABEL[c.opco] ?? c.opco}
        title={c.name}
        description={`${c.client_name ?? "—"}${c.site_name ? ` · ${c.site_name}` : ""}`}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={pending}>
                Edit
              </Button>
              <Button size="sm" onClick={generateNow} disabled={pending || c.status !== "active"}>
                Generate now
              </Button>
              {(NEXT_STATUS[c.status] ?? []).map((a) => (
                <Button
                  key={a.to}
                  size="sm"
                  variant={a.tone === "danger" ? "destructive" : "outline"}
                  onClick={() => changeStatus(a.to)}
                  disabled={pending}
                >
                  {a.label}
                </Button>
              ))}
              {CANCELLABLE.has(c.status) && (
                <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)} disabled={pending}>
                  Cancel contract
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Status">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
              CONTRACT_STATUS_TONE[c.status] ?? "bg-muted text-muted-foreground"
            )}
          >
            {c.status}
          </span>
        </Fact>
        <Fact label="Cadence">
          {CADENCE_LABEL[c.cadence]}
          {c.cadence === "custom" && c.custom_interval_days ? ` (${c.custom_interval_days}d)` : ""}
          <span className="text-muted-foreground"> · {c.billing_timing}</span>
        </Fact>
        <Fact label="Per period">{formatCurrency(c.period_amount)}</Fact>
        <Fact label="Next bill">{c.next_billing_date ?? "—"}</Fact>
        <Fact label="Generation">{BILLING_MODE_LABEL[c.billing_mode]}</Fact>
        <Fact label="Monthly equiv.">{formatCurrency(c.monthly_equivalent)}</Fact>
        <Fact label="Start">{c.start_date}</Fact>
        <Fact label="End">
          {c.end_date ?? "Open-ended"}
          {c.cancelled_effective_date ? (
            <span className="text-muted-foreground block text-[11px]">cancelled — last day of service</span>
          ) : null}
        </Fact>
        <Fact label="Payment terms">
          {c.payment_terms_days != null ? `Net ${c.payment_terms_days}` : "No due date"}
        </Fact>
        <Fact label="Late fee">
          {c.late_fee_mode === "percent_monthly"
            ? `${c.late_fee_monthly_pct}% / month`
            : c.late_fee_mode === "flat"
              ? `${formatCurrency(Number(c.late_fee_flat_amount))} once`
              : "None"}
        </Fact>
      </div>

      {/* RECUR-2 (2d) — the signed quote this contract was created from. */}
      {c.source_quote_id && (
        <Card className="bg-card p-4 shadow-sm">
          <h2 className="text-brand-navy mb-1 font-serif text-lg">Signed agreement</h2>
          <p className="text-sm">
            Created from quote{" "}
            <Link href={`/quotes/${c.source_quote_id}`} className="text-brand-navy underline">
              {c.source_quote_number ?? "quote"}
            </Link>
            , accepted on the portal by <strong>{c.source_signed_by ?? "the client"}</strong>
            {c.source_signed_at
              ? ` on ${new Date(c.source_signed_at).toLocaleString("en-CA", { timeZone: "America/Toronto" })}`
              : ""}
            .
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            The countersigned PDF and acceptance record are kept with the quote
            {c.source_record_hash ? ` (record ${c.source_record_hash.slice(0, 12)}…)` : ""}. If the client disputes a
            rate, this is the agreed version.
          </p>
          {signed && (
            <div className="mt-3 text-xs">
              <p className="mb-1 font-medium">Terms as signed</p>
              <ul className="space-y-0.5">
                {signed.services.map((s) => (
                  <li key={s.label + (s.detail ?? "")} className="flex justify-between">
                    <span>
                      {s.label}
                      {s.detail ? ` — ${s.detail}` : ""}
                    </span>
                    <span className="tabular-nums">{formatCurrency(s.monthlyFee)} / month</span>
                  </li>
                ))}
                <li className="flex justify-between border-t pt-0.5 font-medium">
                  <span>Per {CADENCE_PERIOD_NOUN[signed.cadence]} (+ HST)</span>
                  <span className="tabular-nums">{formatCurrency(signed.periodTotal)}</span>
                </li>
              </ul>
              {priceDrift && (
                <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900">
                  Current pricing ({formatCurrency(c.period_amount)} per period) differs from the signed terms. Make
                  sure the client agreed to the change.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Pricing lines */}
      <Card className="bg-card p-4 shadow-sm">
        <h2 className="text-brand-navy mb-2 font-serif text-lg">Pricing</h2>
        <table className="w-full text-sm">
          <tbody>
            {detail.lines.map((l) => (
              <tr key={l.id} className="border-b border-[var(--border)] last:border-0">
                <td className="py-1.5">{l.description}</td>
                <td className="py-1.5 text-right tabular-nums">{formatCurrency(Number(l.amount))}</td>
              </tr>
            ))}
            <tr>
              <td className="py-1.5 font-medium">Per period</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{formatCurrency(c.period_amount)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Generated invoices */}
      <Card className="bg-card p-4 shadow-sm">
        <h2 className="text-brand-navy mb-2 font-serif text-lg">
          Generated invoices ({detail.invoices.length})
        </h2>
        {detail.invoices.length === 0 ? (
          <p className="text-muted-foreground text-sm">None yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase text-muted-foreground">
                <th className="py-2">Period</th>
                <th className="py-2">Invoice</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {detail.invoices.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-2 text-xs tabular-nums">{r.period_start} → {r.period_end}</td>
                  <td className="py-2">
                    {r.invoice_id ? (
                      <Link href={`/invoices/${r.invoice_id}`} className="text-brand-navy underline">
                        {r.invoice_number ?? "Draft"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-xs capitalize">{r.invoice_status ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">
                    {r.invoice_total != null ? formatCurrency(Number(r.invoice_total)) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {canManage && r.invoice_id && r.invoice_status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => issueDraft(r.invoice_id!)} disabled={pending}>
                        Issue
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {lateFees !== null && (
        <ContractLateFeesCard fees={lateFees} canManage={canManage} termsText={lateFeeText} />
      )}

      {credits.length > 0 && (
        <Card className="bg-card p-4 shadow-sm">
          <h2 className="text-brand-navy mb-2 font-serif text-lg">Cancellation credits</h2>
          <table className="w-full text-sm">
            <tbody>
              {credits.map((cr) => (
                <tr key={cr.id} className="border-b border-[var(--border)] align-top last:border-0">
                  <td className="py-1.5 text-xs tabular-nums">
                    {cr.period_start} → {cr.period_end}
                    <span className="text-muted-foreground block">
                      {cr.days_in_period - cr.days_used} of {cr.days_in_period} days unused · last day {cr.effective_date}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatCurrency(Number(cr.credit_total))}
                    {Number(cr.refund_due) > 0 && (
                      <span className="block text-[11px] text-amber-800">
                        {formatCurrency(Number(cr.refund_due))} refund due
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {canManage && (
        <CancelContractDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          contractId={c.id}
          onCancelled={() => {
            setCancelOpen(false);
            router.refresh();
          }}
        />
      )}

      {canManage && (
        <ContractFormDrawer
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
          mode={{ kind: "edit", contract: detail }}
          clientOptions={clientOptions}
          siteOptions={siteOptions}
        />
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-md border border-[var(--border)] p-3 shadow-sm">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</p>
      <p className="text-brand-charcoal mt-0.5 text-sm">{children}</p>
    </div>
  );
}
