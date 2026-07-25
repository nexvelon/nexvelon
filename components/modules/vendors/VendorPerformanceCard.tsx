"use client";

// INV-9-1 — vendor performance summary. KPI row + spend-by-month bars + top
// parts + price variance. Every metric that can be null renders "Not enough
// data yet" rather than a fabricated 0%/100%. Spend figures are hidden when the
// caller lacks financials:view (redacted to null server-side). On-time / lead
// time only cover POs received since migration 0109 — surfaced in a footnote.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Activity, Clock, PercentCircle, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { getVendorMetricsAction, type VendorMetricsView } from "@/app/(app)/vendors/actions";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOT_ENOUGH = "Not enough data yet";

function pctLabel(v: number | null): string {
  return v == null ? NOT_ENOUGH : `${v.toFixed(1)}%`;
}
function daysLabel(v: number | null): string {
  return v == null ? NOT_ENOUGH : `${v} day${v === 1 ? "" : "s"}`;
}
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  vendorId: string;
  initialMetrics: VendorMetricsView;
  initialCanSeeSpend: boolean;
  years: number[];
  initialYear: number;
}

export function VendorPerformanceCard({
  vendorId,
  initialMetrics,
  initialCanSeeSpend,
  years,
  initialYear,
}: Props) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [canSeeSpend, setCanSeeSpend] = useState(initialCanSeeSpend);
  const [year, setYear] = useState(initialYear);
  const [pending, startTransition] = useTransition();

  function changeYear(next: number) {
    setYear(next);
    startTransition(async () => {
      const res = await getVendorMetricsAction(vendorId, next);
      if (res.ok) {
        setMetrics(res.data.metrics);
        setCanSeeSpend(res.data.canSeeSpend);
      } else {
        toast.error(res.error);
      }
    });
  }

  const maxMonthly = Math.max(
    0,
    ...metrics.spend_by_month.map((m) => Number(m.amount ?? 0))
  );
  const hasSpendChart = canSeeSpend && maxMonthly > 0;
  const showReceiptFootnote =
    metrics.metrics_since != null &&
    (metrics.on_time.pct != null || metrics.avg_lead_time_days != null);

  return (
    <Card className="p-5" style={{ background: "var(--brand-card)" }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="nx-eyebrow">Performance</p>
          <h2
            className="font-serif text-xl tracking-tight"
            style={{ color: "var(--brand-primary)" }}
          >
            Supplier scorecard
          </h2>
        </div>
        <label className="text-muted-foreground flex items-center gap-2 text-[12px]">
          Spend year
          <select
            value={year}
            onChange={(e) => changeYear(Number(e.target.value))}
            disabled={pending}
            className="rounded-md border bg-card px-2 py-1 text-[12px] disabled:opacity-60"
            style={{ borderColor: "var(--brand-border)" }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<TrendingUp className="h-4 w-4" />}
          label={`${year} spend`}
          value={
            !canSeeSpend
              ? "—"
              : metrics.ytd_spend == null
                ? NOT_ENOUGH
                : formatCurrency(metrics.ytd_spend)
          }
          hint={!canSeeSpend ? "Requires financials access" : `${metrics.bill_count} bill${metrics.bill_count === 1 ? "" : "s"}`}
        />
        <Kpi
          icon={<PercentCircle className="h-4 w-4" />}
          label="On-time delivery"
          value={pctLabel(metrics.on_time.pct)}
          hint={
            metrics.on_time.pct == null
              ? "No dated receipts yet"
              : `${metrics.on_time.on_time_pos}/${metrics.on_time.received_pos} POs`
          }
        />
        <Kpi
          icon={<Clock className="h-4 w-4" />}
          label="Avg lead time"
          value={daysLabel(metrics.avg_lead_time_days)}
          hint="Issued → fully received"
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          label="Fill rate"
          value={pctLabel(metrics.fill_rate.pct)}
          hint={
            metrics.fill_rate.pct == null
              ? "No ordered parts yet"
              : `${metrics.fill_rate.received}/${metrics.fill_rate.ordered} units`
          }
        />
      </div>

      {/* Spend by month */}
      {canSeeSpend && (
        <div className="mt-6">
          <p className="nx-eyebrow-soft mb-2">Spend by month · {year}</p>
          {hasSpendChart ? (
            <div className="flex items-end gap-1.5" style={{ height: 96 }}>
              {metrics.spend_by_month.map((m) => {
                const amt = Number(m.amount ?? 0);
                const h = maxMonthly > 0 ? Math.round((amt / maxMonthly) * 84) : 0;
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: Math.max(h, amt > 0 ? 2 : 0),
                          background: "var(--brand-accent)",
                        }}
                        title={`${MONTHS[m.month - 1]}: ${formatCurrency(amt)}`}
                      />
                    </div>
                    <span className="text-muted-foreground text-[9px]">
                      {MONTHS[m.month - 1][0]}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-[12px]">
              No billed spend recorded for {year}.
            </p>
          )}
        </div>
      )}

      {/* Price variance */}
      {canSeeSpend && metrics.price_variance.matched_pos > 0 && (
        <div className="mt-6">
          <p className="nx-eyebrow-soft mb-1">Price variance</p>
          <p className="text-sm" style={{ color: "var(--brand-primary)" }}>
            <span
              className={
                (metrics.price_variance.amount ?? 0) > 0
                  ? "text-red-600"
                  : (metrics.price_variance.amount ?? 0) < 0
                    ? "text-emerald-600"
                    : ""
              }
            >
              {metrics.price_variance.amount == null
                ? "—"
                : `${metrics.price_variance.amount >= 0 ? "+" : "−"}${formatCurrency(
                    Math.abs(metrics.price_variance.amount)
                  )}`}
            </span>
            {metrics.price_variance.pct != null && (
              <span className="text-muted-foreground">
                {" "}
                ({metrics.price_variance.pct >= 0 ? "+" : ""}
                {metrics.price_variance.pct.toFixed(1)}%)
              </span>
            )}
            <span
              className="text-muted-foreground ml-2 cursor-help text-[11px] underline decoration-dotted"
              title="Billed subtotal (pre-tax) minus the purchase-order's expected line value (qty × unit price), summed across purchase orders that have at least one linked bill. Positive means billed above the PO."
            >
              how this is measured
            </span>
          </p>
        </div>
      )}

      {/* Top parts */}
      {metrics.top_parts.length > 0 && (
        <div className="mt-6">
          <p className="nx-eyebrow-soft mb-2">Top parts</p>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="pb-1 font-medium">Part</th>
                <th className="pb-1 text-right font-medium">Qty ordered</th>
                <th className="pb-1 text-right font-medium">PO value</th>
              </tr>
            </thead>
            <tbody>
              {metrics.top_parts.map((p) => (
                <tr key={p.product_id} className="border-t" style={{ borderColor: "var(--brand-border)" }}>
                  <td className="py-1.5" style={{ color: "var(--brand-primary)" }}>
                    {p.name}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{p.qty}</td>
                  <td className="text-muted-foreground py-1.5 text-right tabular-nums">
                    {p.spend == null ? "—" : formatCurrency(p.spend)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Receipt-window footnote */}
      {showReceiptFootnote && (
        <p className="text-muted-foreground mt-5 text-[11px]">
          On-time and lead-time metrics are based on purchase orders received
          since {prettyDate(metrics.metrics_since!)}.
        </p>
      )}
      {metrics.metrics_since == null && (
        <p className="text-muted-foreground mt-5 text-[11px]">
          Delivery metrics (on-time, lead time) will populate as purchase orders
          are received going forward.
        </p>
      )}
    </Card>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  const muted = value === NOT_ENOUGH || value === "—";
  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: "var(--brand-border)", background: "var(--brand-card)" }}
    >
      <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-[11px]">
        {icon}
        {label}
      </div>
      <p
        className={muted ? "text-muted-foreground text-sm" : "font-serif text-lg"}
        style={muted ? undefined : { color: "var(--brand-primary)" }}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-0.5 text-[10px]">{hint}</p>}
    </div>
  );
}
