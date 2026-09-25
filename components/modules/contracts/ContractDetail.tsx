"use client";

// RECUR-1 — service contract detail: parties/cadence/amount/status, lifecycle
// actions, "Generate now", and the generated-invoice history (with an Issue action
// for drafts awaiting approval).

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

const NEXT_STATUS: Record<string, { label: string; to: string; tone?: "danger" }[]> = {
  draft: [{ label: "Activate", to: "active" }],
  active: [
    { label: "Suspend", to: "suspended" },
    { label: "Cancel", to: "cancelled", tone: "danger" },
  ],
  suspended: [
    { label: "Reactivate", to: "active" },
    { label: "Cancel", to: "cancelled", tone: "danger" },
  ],
  cancelled: [],
  expired: [],
};

export function ContractDetail({
  detail,
  canManage,
  clientOptions,
  siteOptions,
}: {
  detail: ServiceContractDetail;
  canManage: boolean;
  clientOptions: ClientOption[];
  siteOptions: SiteOption[];
}) {
  const router = useRouter();
  const c = detail.contract;
  const [editOpen, setEditOpen] = useState(false);
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
        <Fact label="End">{c.end_date ?? "Open-ended"}</Fact>
      </div>

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
