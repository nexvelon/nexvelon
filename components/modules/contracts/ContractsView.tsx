"use client";

// RECUR-1 — service contracts list. Header shows MRR (financials:view); a prominent
// banner surfaces draft invoices awaiting approval so they're never forgotten; the
// table links to each contract's detail; "New contract" opens the form drawer.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CADENCE_LABEL, OPCO_LABEL, CONTRACT_STATUS_TONE } from "./shared";
import { ContractFormDrawer, type ClientOption, type SiteOption } from "./ContractFormDrawer";
import type { ServiceContractRow, RecurringRevenue, PendingContractDraft } from "@/lib/api/service-contracts";

export function ContractsView({
  contracts,
  clientOptions,
  siteOptions,
  revenue,
  pendingDrafts,
  canManage,
  canViewFinancials,
}: {
  contracts: ServiceContractRow[];
  clientOptions: ClientOption[];
  siteOptions: SiteOption[];
  revenue: RecurringRevenue | null;
  pendingDrafts: PendingContractDraft[];
  canManage: boolean;
  canViewFinancials: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recurring revenue"
        title="Service Contracts"
        description="Monitoring and maintenance agreements that bill on a cycle."
        actions={
          canManage ? (
            <Button onClick={() => setFormOpen(true)}>New contract</Button>
          ) : undefined
        }
      />

      {/* MRR — honest, computed from ACTIVE contracts only (§2.8). */}
      {canViewFinancials && revenue && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="bg-card p-4 shadow-sm">
            <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
              Monthly recurring revenue
            </p>
            <p className="text-brand-navy mt-1 font-serif text-2xl tabular-nums">
              {formatCurrency(revenue.total)}
            </p>
            <p className="text-muted-foreground text-xs">
              {revenue.activeCount} active contract{revenue.activeCount === 1 ? "" : "s"}
            </p>
          </Card>
          {revenue.byOpco.map((o) => (
            <Card key={o.opco} className="bg-card p-4 shadow-sm">
              <p className="text-muted-foreground text-[11px] uppercase tracking-wide">
                {OPCO_LABEL[o.opco] ?? o.opco} · MRR
              </p>
              <p className="text-brand-navy mt-1 font-serif text-2xl tabular-nums">
                {formatCurrency(o.mrr)}
              </p>
              <p className="text-muted-foreground text-xs">{o.activeCount} active</p>
            </Card>
          ))}
        </div>
      )}

      {/* Pending drafts — the "don't forget to issue" queue, surfaced prominently. */}
      {canViewFinancials && pendingDrafts.length > 0 && (
        <Card className="border-[#C9A24B] bg-[color-mix(in_oklab,#C9A24B_10%,transparent)] p-4 shadow-sm">
          <p className="text-[#8a6d1f] text-sm font-semibold">
            {pendingDrafts.length} generated invoice{pendingDrafts.length === 1 ? "" : "s"} awaiting approval
          </p>
          <ul className="mt-2 space-y-1">
            {pendingDrafts.slice(0, 8).map((d) => (
              <li key={d.invoice_id} className="text-brand-charcoal flex items-center justify-between gap-3 text-xs">
                <span className="truncate">
                  <Link href={`/invoices/${d.invoice_id}`} className="text-brand-navy underline">
                    {d.contract_name}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {d.client_name} · {d.period_start} → {d.period_end}
                  </span>
                </span>
                <span className="tabular-nums">{formatCurrency(d.total)}</span>
              </li>
            ))}
          </ul>
          {pendingDrafts.length > 8 && (
            <p className="text-muted-foreground mt-1 text-[11px]">+{pendingDrafts.length - 8} more…</p>
          )}
        </Card>
      )}

      {contracts.length === 0 ? (
        <Card className="bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            No service contracts yet.{canManage ? " Create one to start billing on a cycle." : ""}
          </p>
        </Card>
      ) : (
        <Card className="bg-card overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">Contract</th>
                <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">Opco</th>
                <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">Cadence</th>
                <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-muted-foreground">Amount</th>
                <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">Next bill</th>
                <th className="px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-muted"
                  onClick={() => router.push(`/contracts/${c.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <div className="text-brand-navy font-medium">{c.name}</div>
                    <div className="text-muted-foreground text-[11px]">
                      {c.client_name}
                      {c.site_name ? ` · ${c.site_name}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{OPCO_LABEL[c.opco] ?? c.opco}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {CADENCE_LABEL[c.cadence]}
                    {c.cadence === "custom" && c.custom_interval_days ? ` (${c.custom_interval_days}d)` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(c.period_amount)}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums">{c.next_billing_date ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                        CONTRACT_STATUS_TONE[c.status] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {canManage && (
        <ContractFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
          mode={{ kind: "create" }}
          clientOptions={clientOptions}
          siteOptions={siteOptions}
        />
      )}
    </div>
  );
}
