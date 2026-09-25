"use client";

// RECUR-1 — a compact "Service contracts" section embedded on the client and site
// detail pages. Self-loading (gated action) so it doesn't thread props through the
// existing client/site view components. Renders nothing until loaded; hides itself
// entirely when the caller can't view contracts or there are none.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CADENCE_LABEL, CONTRACT_STATUS_TONE } from "./shared";
import {
  listContractsForClientAction,
  listContractsForSiteAction,
} from "@/app/(app)/contracts/actions";
import type { ServiceContractRow } from "@/lib/api/service-contracts";

export function ContractsSection(
  props: { clientId: string } | { siteId: string }
) {
  const [rows, setRows] = useState<ServiceContractRow[] | null>(null);

  useEffect(() => {
    let active = true;
    const load =
      "clientId" in props
        ? listContractsForClientAction(props.clientId)
        : listContractsForSiteAction(props.siteId);
    load.then((res) => {
      if (active && res.ok) setRows(res.data);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, ["clientId" in props ? props.clientId : props.siteId]);

  // Nothing to show (not loaded, no permission, or none) → render nothing.
  if (!rows || rows.length === 0) return null;

  return (
    <Card className="bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-brand-navy font-serif text-lg">Service contracts</h2>
        <Link href="/contracts" className="text-brand-gold text-xs hover:underline">
          All contracts →
        </Link>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <Link href={`/contracts/${c.id}`} className="text-brand-navy text-sm font-medium hover:underline">
                {c.name}
              </Link>
              <div className="text-muted-foreground text-[11px]">
                {CADENCE_LABEL[c.cadence]} · {formatCurrency(c.period_amount)}
                {c.next_billing_date ? ` · next ${c.next_billing_date}` : ""}
              </div>
            </div>
            <span
              className={cn(
                "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                CONTRACT_STATUS_TONE[c.status] ?? "bg-muted text-muted-foreground"
              )}
            >
              {c.status}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
