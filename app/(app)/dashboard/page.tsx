"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  Banknote,
  ClipboardList,
  FolderOpen,
  Percent,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RangePicker } from "@/components/modules/dashboard/RangePicker";
import { KpiCard } from "@/components/modules/dashboard/KpiCard";
import { Restricted } from "@/components/modules/dashboard/Restricted";
import { CanFinancials } from "@/components/modules/dashboard/CanFinancials";
import { RevenueTrendChart } from "@/components/modules/dashboard/RevenueTrendChart";
import { PipelineFunnel } from "@/components/modules/dashboard/PipelineFunnel";
import { ActivityFeed } from "@/components/modules/dashboard/ActivityFeed";
import { TopClientsTable } from "@/components/modules/dashboard/TopClientsTable";
import { InventoryHealth } from "@/components/modules/dashboard/InventoryHealth";
import { TechnicianUtilization } from "@/components/modules/dashboard/TechnicianUtilization";
import {
  buildKpis,
  inventoryByVendor,
  lowStockAlerts,
  pipelineFunnel,
  recentActivity,
  technicianUtilization,
  TODAY,
  topClientsYTD,
  trailing12MonthsTrend,
  type RangeKey,
} from "@/lib/dashboard-data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { currentUser } from "@/lib/mock-data/users";

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("mtd");
  const kpis = useMemo(() => buildKpis(range), [range]);
  const trend = useMemo(() => trailing12MonthsTrend(), []);
  const funnel = useMemo(() => pipelineFunnel(), []);
  const activity = useMemo(() => recentActivity(10), []);
  const top = useMemo(() => topClientsYTD(5), []);
  const inv = useMemo(() => inventoryByVendor(), []);
  const lowStock = useMemo(() => lowStockAlerts(6), []);
  const utilization = useMemo(() => technicianUtilization(), []);

  const greeting =
    TODAY.getHours() < 12
      ? "Good morning"
      : TODAY.getHours() < 18
        ? "Good afternoon"
        : "Good evening";
  const firstName = currentUser.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Fiscal Year ${TODAY.getFullYear()} · Q${Math.floor(TODAY.getMonth() / 3) + 1}`}
        title="Executive Dashboard"
        description={`${format(TODAY, "EEEE, MMMM d, yyyy")} — ${greeting}, ${firstName}.`}
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      {/* KPI grid: 2 rows x 3 cols on desktop */}
      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          index={0}
          label="Revenue MTD"
          value={kpis.current.revenue}
          format={formatCurrency}
          delta={kpis.delta.revenue}
          icon={Banknote}
        />

        <CanFinancials
          fallback={<Restricted label="EBITDA" variant="kpi" />}
        >
          <KpiCard
            index={1}
            label="EBITDA"
            value={kpis.current.ebitda}
            format={formatCurrency}
            delta={kpis.delta.ebitda}
            icon={TrendingUp}
          />
        </CanFinancials>

        <CanFinancials
          fallback={<Restricted label="Gross Margin %" variant="kpi" />}
        >
          <KpiCard
            index={2}
            label="Gross Margin %"
            value={kpis.current.grossMargin * 100}
            format={(n) => `${n.toFixed(1)}%`}
            delta={kpis.delta.grossMargin}
            deltaFormat={(n) => `${(n * 100).toFixed(1)} pts`}
            icon={Percent}
          />
        </CanFinancials>

        <KpiCard
          index={3}
          label="Open Quotes"
          value={kpis.current.openQuotes.count}
          format={formatNumber}
          icon={ClipboardList}
          footer={
            <p className="text-muted-foreground text-xs">
              <span className="text-brand-charcoal font-semibold tabular-nums">
                {formatCurrency(kpis.current.openQuotes.total)}
              </span>{" "}
              in pipeline value
            </p>
          }
        />

        <KpiCard
          index={4}
          label="Active Projects"
          value={kpis.current.activeProjects.count}
          format={formatNumber}
          icon={FolderOpen}
          footer={
            <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>
                <span className="text-emerald-600 font-semibold tabular-nums">
                  {kpis.current.activeProjects.inProgress}
                </span>{" "}
                in progress
              </span>
              <span>
                <span className="text-amber-600 font-semibold tabular-nums">
                  {kpis.current.activeProjects.onHold}
                </span>{" "}
                on hold
              </span>
              <span>
                <span className="text-red-600 font-semibold tabular-nums">
                  {kpis.current.activeProjects.atRisk}
                </span>{" "}
                at risk
              </span>
            </div>
          }
        />

        <KpiCard
          index={5}
          label="Overdue Invoices"
          value={kpis.current.overdueInvoices.count}
          format={formatNumber}
          icon={AlertCircle}
          accent={kpis.current.overdueInvoices.count > 0 ? "danger" : "default"}
          trendInverted
          footer={
            <p className="text-muted-foreground text-xs">
              <span
                className={
                  kpis.current.overdueInvoices.count > 0
                    ? "font-semibold text-red-600 tabular-nums"
                    : "text-brand-charcoal font-semibold tabular-nums"
                }
              >
                {formatCurrency(kpis.current.overdueInvoices.total)}
              </span>{" "}
              outstanding
            </p>
          }
        />
      </section>

      {/* Row 2 — Charts: 8 + 4 */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CanFinancials
            fallback={
              <Restricted
                label="Revenue & EBITDA Trend"
                variant="panel"
                className="min-h-[400px]"
              />
            }
          >
            <RevenueTrendChart data={trend} />
          </CanFinancials>
        </div>
        <div className="lg:col-span-4">
          <PipelineFunnel data={funnel} />
        </div>
      </section>

      {/* Row 3 — Activity + Top clients */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityFeed events={activity} />
        <CanFinancials
          fallback={<Restricted label="Top Clients YTD" variant="panel" />}
        >
          <TopClientsTable rows={top} />
        </CanFinancials>
      </section>

      {/* Row 4 — Inventory + Utilization */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InventoryHealth data={inv} alerts={lowStock} />
        <TechnicianUtilization rows={utilization} />
      </section>

      <p className="text-muted-foreground pt-2 text-center text-[11px]">
        Demo build · figures derived from synthetic data, anchored to{" "}
        {format(TODAY, "MMM d, yyyy")}.
      </p>
    </div>
  );
}
