"use client";

import { useEffect, useState } from "react";
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
import { KpiSparkline, KpiDual, KpiPlain, KpiStatList, KpiProgress } from "@/components/kpi";
import { RevenueTrendChart } from "@/components/modules/dashboard/RevenueTrendChart";
import { QuotesByStatusPanel } from "@/components/modules/dashboard/QuotesByStatusPanel";
import { ActivityFeed } from "@/components/modules/dashboard/ActivityFeed";
import { TopClientsTable } from "@/components/modules/dashboard/TopClientsTable";
import { InventoryHealth } from "@/components/modules/dashboard/InventoryHealth";
import { TechnicianUtilization } from "@/components/modules/dashboard/TechnicianUtilization";
import { AlertsWorklists } from "@/components/modules/dashboard/AlertsWorklists";
import { RANGE_LABEL, rangeFor, comparisonRange, type RangeKey } from "@/lib/date-range";
import { getDashboardKpisAction, getRevenueTrendAction } from "@/app/(app)/dashboard/actions";
import type { DashboardKpis } from "@/lib/api/dashboard";
import type { MonthlyRevenuePoint } from "@/lib/api/financials";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useAuth } from "@/components/auth/AuthProvider";

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>("mtd");
  const [kpi, setKpi] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  // UIDG-6 — real trailing-12-month history for the Revenue/Cash sparklines
  // (same financials gate as the tiles). Fetched once, range-independent.
  const [trend, setTrend] = useState<MonthlyRevenuePoint[] | null>(null);
  useEffect(() => {
    getRevenueTrendAction().then((r) => {
      if (r.ok) setTrend(r.data);
    });
  }, []);
  const invoicedSeries = trend ? trend.map((p) => p.invoiced) : [];
  const collectedSeries = trend ? trend.map((p) => p.collected) : [];

  // UIDG-6B — the comparison (prior-period) window follows the SAME range, so
  // changing the picker moves the current and comparison windows together.
  const compareBasis = comparisonRange(range).basis;

  // Real today drives the range-aware tiles + greeting (the mock's anchored
  // TODAY is gone from the dashboard).
  useEffect(() => {
    setLoading(true);
    const anchor = new Date();
    const { start, end } = rangeFor(range, anchor);
    const cmp = comparisonRange(range, anchor);
    getDashboardKpisAction({
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      compareFrom: cmp.start.toISOString().slice(0, 10),
      compareTo: cmp.end.toISOString().slice(0, 10),
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
          {/* UIDG-6 — the KPI card family. `restricted` is derived from each
              tier flag, so one card definition renders both the data state and
              the restricted state (no leak) and UIDG-8 can place any variant
              uniformly. No tile gained a value/delta the data doesn't provide. */}
          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* ── financials:view tier ── */}
            <KpiSparkline
              index={0}
              restricted={!fin}
              label={`Revenue · ${RANGE_LABEL[range]}`}
              value={fin?.revenue ?? 0}
              series={invoicedSeries}
              format={formatCurrency}
              icon={Banknote}
              href="/financials"
              comparison={{ prior: fin?.compare?.revenue ?? null, basis: compareBasis, polarity: "normal" }}
            />
            <KpiSparkline
              index={1}
              restricted={!fin}
              label={`Cash collected · ${RANGE_LABEL[range]}`}
              value={fin?.cash_collected ?? 0}
              series={collectedSeries}
              format={formatCurrency}
              icon={HandCoins}
              href="/financials"
              comparison={{ prior: fin?.compare?.cash_collected ?? null, basis: compareBasis, polarity: "normal" }}
            />
            <KpiDual
              index={2}
              restricted={!fin}
              label="Accounts receivable"
              icon={AlertCircle}
              href="/invoices"
              primary={{ label: "Outstanding", value: fin?.ar_outstanding ?? 0, format: formatCurrency }}
              secondary={{ label: "Overdue", value: fin?.ar_overdue ?? 0, format: formatCurrency, tone: (fin?.ar_overdue ?? 0) > 0 ? "bad" : "default" }}
            />
            <KpiDual
              index={3}
              restricted={!fin}
              label="Accounts payable"
              icon={Receipt}
              href="/financials"
              primary={{ label: "Outstanding", value: fin?.ap_outstanding ?? 0, format: formatCurrency }}
              secondary={{ label: "Overdue", value: fin?.ap_overdue ?? 0, format: formatCurrency, tone: (fin?.ap_overdue ?? 0) > 0 ? "bad" : "default" }}
            />
            <KpiPlain
              index={4}
              restricted={!fin}
              label="Deposits held"
              value={fin?.deposits_held ?? 0}
              format={formatCurrency}
              icon={Wallet}
              href="/financials"
            />

            {/* ── operational (projects:view / quotes:view) ── */}
            <KpiDual
              index={5}
              restricted={!proj}
              label="Active projects"
              icon={FolderOpen}
              href="/projects"
              primary={{ label: "Projects", value: proj?.active_projects ?? 0, format: formatNumber }}
              secondary={{ label: "Contract value", value: proj?.active_contract_value ?? 0, format: formatCurrency }}
            />
            <KpiDual
              index={6}
              restricted={!quo}
              label="Open quotes"
              icon={ClipboardList}
              href="/quotes"
              primary={{ label: "Quotes", value: quo?.open_quotes ?? 0, format: formatNumber }}
              secondary={{ label: "Pipeline", value: quo?.open_quotes_value ?? 0, format: formatCurrency }}
            />

            {/* ── financials:edit tier (cost-side) ── */}
            <KpiStatList
              index={7}
              restricted={!finEdit}
              label="WIP position"
              icon={TrendingUp}
              href="/financials"
              rows={[
                { label: "Net (over/under)", value: finEdit?.wip_net ?? 0, format: formatCurrency },
                { label: "Overbilled", value: finEdit?.wip_overbilled ?? 0, format: formatCurrency, tone: "bad" },
                { label: "Underbilled", value: Math.abs(finEdit?.wip_underbilled ?? 0), format: formatCurrency, tone: "good" },
              ]}
            />
            <KpiPlain
              index={8}
              restricted={!finEdit}
              label="HST net position"
              value={finEdit?.hst_net_total ?? 0}
              format={formatCurrency}
              icon={Receipt}
              href="/financials"
            />
            <KpiProgress
              index={9}
              restricted={!finEdit}
              empty={!!finEdit && finEdit.blended_margin_pct == null}
              emptyMessage="No revenue yet"
              label="Blended margin"
              value={finEdit?.blended_margin_pct ?? 0}
              caption="gross margin"
              icon={Percent}
              href="/financials"
            />
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

      {/* Row 2 — real Revenue trend + real Quotes-by-status */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RevenueTrendChart />
        </div>
        <div className="lg:col-span-4">
          <QuotesByStatusPanel />
        </div>
      </section>

      {/* Row 3 — real Activity feed + real Top clients */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityFeed />
        <TopClientsTable />
      </section>

      {/* Row 4 — real Inventory health + real Utilization */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InventoryHealth />
        <TechnicianUtilization />
      </section>
    </div>
  );
}

