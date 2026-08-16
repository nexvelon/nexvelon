"use client";

// DASH-2 — REAL quotes-by-status breakdown, replacing the fabricated pipeline
// funnel (which invented a "Lead = quoted × 1.6" top-of-funnel). Statuses are
// the app-level blob statuses (Draft/Sent/Approved/Revision/Converted/…); the
// open pipeline value is Draft + Sent. No synthetic stages.

import { useEffect, useState } from "react";
import { GitBranch, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getQuotesByStatusAction } from "@/app/(app)/dashboard/actions";
import { formatCurrency, formatNumber } from "@/lib/format";
import { DonutChart } from "@/components/charts";
import type { QuotesByStatus } from "@/lib/api/dashboard";

// Display order for the known statuses (unknowns append at the end).
const ORDER = ["Draft", "Sent", "Approved", "Revision", "Converted", "Closed", "Expired"];

export function QuotesByStatusPanel() {
  const [data, setData] = useState<QuotesByStatus | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    getQuotesByStatusAction().then((r) => {
      if (r.ok) setData(r.data);
      else setRestricted(true);
    });
  }, []);

  const sorted = data
    ? [...data.by_status].sort((a, b) => {
        const ia = ORDER.indexOf(a.status);
        const ib = ORDER.indexOf(b.status);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
    : [];
  const max = Math.max(1, ...sorted.map((s) => s.count));

  return (
    <Card className="bg-card h-full p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <GitBranch className="text-brand-navy h-4 w-4" />
        <h3 className="text-brand-navy font-serif text-base">Quotes by status</h3>
      </div>
      {restricted ? (
        <div className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
          <Lock className="h-3.5 w-3.5" /> Requires quotes access.
        </div>
      ) : !data ? (
        <p className="text-muted-foreground text-xs">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-muted-foreground text-xs">No quotes yet.</p>
      ) : (
        <>
          {/* UIDG-5 demo — a real donut of the live quote-count distribution
              (no chart existed here before; the list below keeps the exact
              count + value figures). Real data, real empty state. */}
          <DonutChart
            summary="Quote count distribution by status"
            height={150}
            data={sorted.map((s) => ({ name: s.status, value: s.count }))}
            valueFormatter={formatNumber}
            centerCaption="quotes"
            emptyMessage="No quotes yet."
            className="mb-4"
          />
          <ul className="space-y-2">
            {sorted.map((s) => (
              <li key={s.status} className="text-xs">
                <div className="mb-0.5 flex items-center justify-between">
                  <span style={{ color: "var(--brand-primary)" }}>{s.status}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.count} · {formatCurrency(s.value)}
                  </span>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div className="bg-brand-navy h-full rounded-full" style={{ width: `${(s.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-3 text-[11px]">
            <span className="text-brand-charcoal font-semibold tabular-nums">{formatCurrency(data.open_pipeline_value)}</span> open pipeline (Draft + Sent)
          </p>
        </>
      )}
    </Card>
  );
}
