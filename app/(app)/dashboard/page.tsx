"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  Banknote,
  ClipboardList,
  FolderOpen,
  HandCoins,
  Percent,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { RangePicker } from "@/components/modules/dashboard/RangePicker";
import { KpiCard } from "@/components/modules/dashboard/KpiCard";
import { Restricted } from "@/components/modules/dashboard/Restricted";
import { CanFinancials } from "@/components/modules/dashboard/CanFinancials";
import { RevenueTrendChart } from "@/components/modules/dashboard/RevenueTrendChart";
import { QuotesByStatusPanel } from "@/components/modules/dashboard/QuotesByStatusPanel";
import { ActivityFeed } from "@/components/modules/dashboard/ActivityFeed";
import { TopClientsTable } from "@/components/modules/dashboard/TopClientsTable";
import { InventoryHealth } from "@/components/modules/dashboard/InventoryHealth";
import { TechnicianUtilization } from "@/components/modules/dashboard/TechnicianUtilization";
import { AlertsWorklists } from "@/components/modules/dashboard/AlertsWorklists";
import {
  inventoryByVendor,
  lowStockAlerts,
  RANGE_LABEL,
  rangeFor,
  topClientsYTD,
  trailing12MonthsTrend,
  type RangeKey,
} from "@/lib/dashboard-data";
import { getDashboardKpisAction } from "@/app/(app)/dashboard/actions";
import type { DashboardKpis } from "@/lib/api/dashboard";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useAuth } from "@/components/auth/AuthProvider";

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>("mtd");
  const [kpi, setKpi] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  // DASH-3 still renders these mock tiles (empty until wired).
  const trend = useMemo(() => trailing12MonthsTrend(), []);
  const top = useMemo(() => topClientsYTD(5), []);
  const inv = useMemo(() => inventoryByVendor(), []);
  const lowStock = useMemo(() => lowStockAlerts(6), []);

  // Real today drives the range-aware tiles + greeting (the mock's anchored
  // TODAY is gone from the dashboard).
  useEffect(() => {
    setLoading(true);
    const { start, end } = rangeFor(range, new Date());
    getDashboardKpisAction({
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    }).then((r) => {
      if (r.ok) setKpi(r.data);
      else toast.error(r.error);
      setLoading(false);
    });
  }, [range]);

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name.split(" ")[0] ?? "there";
  const asOf = kpi ? format(new Date(kpi.as_of), "MMM d, yyyy") : "today";

  const fin = kpi?.financial ?? null;
  const finEdit = kpi?.financial_edit ?? null;
  const proj = kpi?.operational.projects ?? null;
  const quo = kpi?.operational.quotes ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Fiscal Year ${now.getFullYear()} · Q${Math.floor(now.getMonth() / 3) + 1}`}
        title="Executive Dashboard"
        description={`${format(now, "EEEE, MMMM d, yyyy")} — ${greeting}, ${firstName}.`}
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {loading && !kpi ? (
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card h-28 animate-pulse rounded-lg border border-[var(--border)]" />
          ))}
        </section>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* ── financials:view tier (null block = restricted) ── */}
            {fin ? (
              <>
                <KpiCard index={0} label={`Revenue · ${RANGE_LABEL[range]}`} value={fin.revenue} format={formatCurrency} icon={Banknote} />
                <KpiCard index={1} label={`Cash collected · ${RANGE_LABEL[range]}`} value={fin.cash_collected} format={formatCurrency} icon={HandCoins} />
                <KpiCard
                  index={2}
                  label="Outstanding AR"
                  value={fin.ar_outstanding}
                  format={formatCurrency}
                  icon={AlertCircle}
                  footer={<OverdueFooter amount={fin.ar_overdue} />}
                />
                <KpiCard
                  index={3}
                  label="Payables (AP)"
                  value={fin.ap_outstanding}
                  format={formatCurrency}
                  icon={Receipt}
                  footer={<OverdueFooter amount={fin.ap_overdue} />}
                />
                <KpiCard index={4} label="Deposits held" value={fin.deposits_held} format={formatCurrency} icon={Wallet} />
              </>
            ) : (
              <>
                <Restricted label="Revenue" variant="kpi" />
                <Restricted label="Cash collected" variant="kpi" />
                <Restricted label="Outstanding AR" variant="kpi" />
                <Restricted label="Payables (AP)" variant="kpi" />
                <Restricted label="Deposits held" variant="kpi" />
              </>
            )}

            {/* ── operational (projects:view / quotes:view) ── */}
            {proj ? (
              <KpiCard
                index={5}
                label="Active projects"
                value={proj.active_projects}
                format={formatNumber}
                icon={FolderOpen}
                footer={
                  <p className="text-muted-foreground text-xs">
                    <span className="text-brand-charcoal font-semibold tabular-nums">{formatCurrency(proj.active_contract_value)}</span> contract value
                  </p>
                }
              />
            ) : (
              <Restricted label="Active projects" variant="kpi" />
            )}

            {quo ? (
              <KpiCard
                index={6}
                label="Open quotes"
                value={quo.open_quotes}
                format={formatNumber}
                icon={ClipboardList}
                footer={
                  <p className="text-muted-foreground text-xs">
                    <span className="text-brand-charcoal font-semibold tabular-nums">{formatCurrency(quo.open_quotes_value)}</span> in pipeline value
                  </p>
                }
              />
            ) : (
              <Restricted label="Open quotes" variant="kpi" />
            )}

            {/* ── financials:edit tier (cost-side) ── */}
            {finEdit ? (
              <>
                <KpiCard
                  index={7}
                  label="WIP net (over/under)"
                  value={finEdit.wip_net}
                  format={formatCurrency}
                  icon={TrendingUp}
                  footer={
                    <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                      <span><span className="font-semibold text-red-600 tabular-nums">{formatCurrency(finEdit.wip_overbilled)}</span> over</span>
                      <span><span className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(Math.abs(finEdit.wip_underbilled))}</span> under</span>
                    </div>
                  }
                />
                <KpiCard index={8} label="HST net position" value={finEdit.hst_net_total} format={formatCurrency} icon={Receipt} />
                <KpiCard
                  index={9}
                  label="Blended margin"
                  value={finEdit.blended_margin_pct ?? 0}
                  format={(n) => (finEdit.blended_margin_pct == null ? "—" : `${n.toFixed(1)}%`)}
                  icon={Percent}
                  footer={finEdit.blended_margin_pct == null ? <p className="text-muted-foreground text-xs">No revenue yet</p> : undefined}
                />
              </>
            ) : (
              <>
                <Restricted label="WIP net" variant="kpi" />
                <Restricted label="HST net position" variant="kpi" />
                <Restricted label="Blended margin" variant="kpi" />
              </>
            )}
          </section>

          <p className="text-muted-foreground -mt-2 text-[11px]">
            Revenue, cash and HST reflect the selected range; AR, AP, deposits, WIP,
            projects and quotes are a live snapshot as of {asOf}.
          </p>
        </>
      )}

      {/* DASH-2 — real alerts & worklists (gated per resource). */}
      <div>
        <h2 className="text-brand-navy mb-3 font-serif text-lg">Alerts &amp; worklists</h2>
        <AlertsWorklists />
      </div>

      {/* Row 2 — Revenue trend (DASH-3, mock) + real Quotes-by-status */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CanFinancials
            fallback={<Restricted label="Revenue Trend" variant="panel" className="min-h-[400px]" />}
          >
            <RevenueTrendChart data={trend} />
          </CanFinancials>
        </div>
        <div className="lg:col-span-4">
          <QuotesByStatusPanel />
        </div>
      </section>

      {/* Row 3 — real Activity feed + Top clients (DASH-3, mock) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityFeed />
        <CanFinancials fallback={<Restricted label="Top Clients YTD" variant="panel" />}>
          <TopClientsTable rows={top} />
        </CanFinancials>
      </section>

      {/* Row 4 — Inventory (DASH-3, mock) + real Utilization */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InventoryHealth data={inv} alerts={lowStock} />
        <TechnicianUtilization />
      </section>

      <p className="text-muted-foreground pt-2 text-center text-[11px]">
        The revenue trend, top clients and inventory panels are not yet wired to
        live data (coming in DASH-3).
      </p>
    </div>
  );
}

function OverdueFooter({ amount }: { amount: number }) {
  if (amount <= 0) {
    return <p className="text-muted-foreground text-xs">Nothing overdue</p>;
  }
  return (
    <p className="text-muted-foreground text-xs">
      <span className="font-semibold text-red-600 tabular-nums">{formatCurrency(amount)}</span> overdue
    </p>
  );
}
