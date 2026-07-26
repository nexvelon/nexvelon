"use client";

// REP-1 — the Reports hub, replacing the Coming Soon page. Category sections
// with report cards; each report exports to CSV / Excel / PDF via the shared
// foundation. REP-1 ships the WIP report + the duplicate-quote utility; the rest
// are marked "coming" (REP-2 financial, REP-3 operational). Gated reports:view.

import Link from "next/link";
import {
  BarChart3,
  Boxes,
  Copy,
  FileBarChart,
  Gauge,
  Lock,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Can, useRole } from "@/lib/role-context";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Report = {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string; // present = available; absent = coming
  soon?: string; // "REP-3" etc.
  /** Permission required to open the report; absent = no gate. */
  gate?: { resource: Resource; action: Action };
};

const SECTIONS: { section: string; reports: Report[] }[] = [
  {
    section: "Overview",
    reports: [
      { title: "Business snapshot", desc: "Run-rate, margin, backlog, position — not a valuation.", icon: Gauge, href: "/reports/business-snapshot", gate: { resource: "financials", action: "edit" } },
    ],
  },
  {
    section: "Financial",
    reports: [
      { title: "Work-in-progress (WIP)", desc: "Over/under-billing across active projects.", icon: FileBarChart, href: "/reports/wip", gate: { resource: "financials", action: "edit" } },
      { title: "P&L by company", desc: "Per-company profit & loss, project-to-date.", icon: BarChart3, href: "/reports/pnl-by-company", gate: { resource: "financials", action: "edit" } },
      { title: "Margin analysis", desc: "Quoted vs actual margin by project.", icon: TrendingUp, href: "/reports/margin", gate: { resource: "financials", action: "edit" } },
      { title: "Profitability ranking", desc: "Projects ranked by gross profit.", icon: BarChart3, href: "/reports/profitability", gate: { resource: "financials", action: "edit" } },
      { title: "AR aging", desc: "Receivables by client and age bucket.", icon: Wallet, href: "/reports/ar-aging", gate: { resource: "financials", action: "view" } },
      { title: "AP aging", desc: "Payables by vendor and age bucket.", icon: Receipt, href: "/reports/ap-aging", gate: { resource: "financials", action: "view" } },
      { title: "HST net position", desc: "HST collected vs ITCs, per company.", icon: Receipt, href: "/reports/hst", gate: { resource: "financials", action: "edit" } },
    ],
  },
  {
    section: "Operational",
    reports: [
      { title: "Sales pipeline", desc: "Quotes by stage, conversion, value.", icon: TrendingUp, href: "/reports/pipeline", gate: { resource: "quotes", action: "view" } },
      { title: "Technician utilization", desc: "Booked vs available hours by tech.", icon: Gauge, href: "/reports/utilization", gate: { resource: "scheduling", action: "view" } },
      { title: "Vendor spend", desc: "Top vendors by spend.", icon: Truck, href: "/reports/vendor-spend", gate: { resource: "financials", action: "view" } },
      { title: "Inventory valuation", desc: "In-stock value by category.", icon: Boxes, href: "/reports/inventory-valuation", gate: { resource: "inventory", action: "view" } },
    ],
  },
  {
    section: "Compliance",
    reports: [
      { title: "T5018 contractors", desc: "Annual contractor payment report.", icon: ShieldCheck, href: "/reports/t5018", gate: { resource: "financials", action: "edit" } },
    ],
  },
];

export default function ReportsPage() {
  const { role } = useRole();
  return (
    <Can resource="reports" action="view" fallback={<Restricted />}>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Reports"
          title="Reports"
          description="Cross-module reports — download as CSV, Excel, or PDF."
        />

        {SECTIONS.map(({ section, reports }) => (
          <div key={section}>
            <p className="nx-eyebrow mb-3">{section}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reports.map((r) => (
                <ReportCard
                  key={r.title}
                  report={r}
                  locked={r.gate ? !hasPermission(role, r.gate.resource, r.gate.action) : false}
                />
              ))}
            </div>
          </div>
        ))}

        <div>
          <p className="nx-eyebrow mb-3">Utilities</p>
          <ReportCard
            report={{
              title: "Duplicate quote numbers",
              desc: "Every quote number shared by two or more quotes, for reconciliation.",
              icon: Copy,
              href: "/reports/duplicate-quote-numbers",
            }}
          />
        </div>
      </div>
    </Can>
  );
}

function ReportCard({ report, locked = false }: { report: Report; locked?: boolean }) {
  const { title, desc, icon: Icon, href, soon } = report;
  // A report is openable only if it has an href AND (no tier gate or tier met).
  const open = Boolean(href) && !locked;
  const inner = (
    <Card
      className={cn(
        "bg-card flex h-full items-start gap-3 border-l-4 p-4 shadow-sm transition-shadow",
        open ? "hover:shadow-md" : "opacity-60"
      )}
      style={{ borderLeftColor: open ? "var(--brand-accent)" : "var(--brand-border)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "color-mix(in oklab, var(--brand-accent) 15%, transparent)", color: "var(--brand-accent)" }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-brand-navy flex items-center gap-2 font-serif text-base">
          {title}
          {soon && (
            <span className="text-muted-foreground rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide" style={{ borderColor: "var(--brand-border)" }}>
              {soon}
            </span>
          )}
          {locked && !soon && (
            <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide" style={{ borderColor: "var(--brand-border)" }}>
              <Lock className="h-2.5 w-2.5" /> Restricted
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-[13px]">{desc}</p>
      </div>
    </Card>
  );
  return open && href ? <Link href={href}>{inner}</Link> : inner;
}

function Restricted() {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
        <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
        <p className="text-muted-foreground mt-2 text-sm">Contact your administrator for access to reports.</p>
      </Card>
    </div>
  );
}
