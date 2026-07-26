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
import { Can } from "@/lib/role-context";
import { cn } from "@/lib/utils";

type Report = {
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string; // present = available; absent = coming
  soon?: string; // "REP-2" etc.
};

const SECTIONS: { section: string; reports: Report[] }[] = [
  {
    section: "Financial",
    reports: [
      { title: "Work-in-progress (WIP)", desc: "Over/under-billing across active projects.", icon: FileBarChart, href: "/reports/wip" },
      { title: "P&L by company", desc: "Per-opco profit & loss.", icon: BarChart3, soon: "REP-2" },
      { title: "Margin analysis", desc: "Quoted vs actual margin by project.", icon: TrendingUp, soon: "REP-2" },
      { title: "AR aging", desc: "Receivables by age bucket.", icon: Wallet, soon: "REP-2" },
      { title: "AP aging", desc: "Payables by age bucket.", icon: Receipt, soon: "REP-2" },
      { title: "HST / tax", desc: "Net HST position per company.", icon: Receipt, soon: "REP-2" },
    ],
  },
  {
    section: "Operational",
    reports: [
      { title: "Sales pipeline", desc: "Quotes by stage, conversion, value.", icon: TrendingUp, soon: "REP-3" },
      { title: "Labour utilization", desc: "Technician booked vs available.", icon: Gauge, soon: "REP-3" },
      { title: "Vendor spend", desc: "Top vendors by spend.", icon: Truck, soon: "REP-3" },
      { title: "Inventory valuation", desc: "Stock value by category + aging.", icon: Boxes, soon: "REP-3" },
    ],
  },
  {
    section: "Compliance",
    reports: [
      { title: "T5018 contractors", desc: "Annual contractor payment report.", icon: ShieldCheck, soon: "REP-2" },
    ],
  },
];

export default function ReportsPage() {
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
                <ReportCard key={r.title} report={r} />
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

function ReportCard({ report }: { report: Report }) {
  const { title, desc, icon: Icon, href, soon } = report;
  const inner = (
    <Card
      className={cn(
        "bg-card flex h-full items-start gap-3 border-l-4 p-4 shadow-sm transition-shadow",
        href ? "hover:shadow-md" : "opacity-60"
      )}
      style={{ borderLeftColor: href ? "var(--brand-accent)" : "var(--brand-border)" }}
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
        </p>
        <p className="text-muted-foreground text-[13px]">{desc}</p>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
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
