import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, FileBarChart, Mail, Sparkles, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

// ============================================================================
// /reports — deliberate "Coming soon" state, NOT a placeholder.
//
// Server component. No auth check here — the (app) route group layout
// already validated the session server-side. The page renders a fully-
// composed empty state in the elite-workspace tone: parchment + navy +
// gold, Cormorant Garamond serif headline, tracked-gold eyebrow, and a
// four-pillar breakdown of what Reports v1 will deliver.
// ============================================================================

export const metadata: Metadata = {
  title: "Reports",
  description: "Cross-module analytics, scheduled exports, and custom dashboards for Nexvelon.",
};

const PILLARS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}> = [
  {
    icon: BarChart3,
    title: "Cross-module analytics",
    body: "Single canvas that joins quotes, projects, inventory, scheduling, and financials — without the spreadsheet exports.",
  },
  {
    icon: Sparkles,
    title: "Customizable dashboards",
    body: "Pin the views that matter to your role. Save and share boards with the rest of your team in one click.",
  },
  {
    icon: Mail,
    title: "Scheduled email reports",
    body: "Weekly margin briefings, monthly close packets, and on-demand client deliveries — sent straight from the suite.",
  },
  {
    icon: FileBarChart,
    title: "Export to PDF, CSV, Excel",
    body: "Print-ready PDFs for the boardroom, audit-friendly CSVs for the accountant, and live Excel workbooks for the analyst.",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reports · Coming Soon"
        title="A reporting layer worthy of the suite."
        description="Cross-module analytics, custom dashboards, scheduled deliveries, and clean exports — currently in design."
      />

      <Card
        className="overflow-hidden p-0 shadow-sm"
        style={{
          borderTop: "2px solid var(--brand-accent)",
          background: "var(--brand-card)",
        }}
      >
        <div className="px-8 py-10 sm:px-12 sm:py-14">
          <div className="mx-auto max-w-2xl text-center">
            <p className="nx-eyebrow">By Design</p>

            <h2
              className="font-serif text-3xl leading-[1.15] sm:text-4xl"
              style={{ color: "var(--brand-primary)", letterSpacing: "-0.005em" }}
            >
              The Reports module is being crafted to match the rest of
              the Nexvelon Enterprise Suite.
            </h2>

            <span
              className="mx-auto mt-6 block h-px w-24"
              style={{ background: "var(--brand-accent)" }}
              aria-hidden
            />

            <p
              className="font-serif text-[15px] italic leading-relaxed mt-6 sm:text-base"
              style={{ color: "var(--brand-taupe, #5C5240)" }}
            >
              When it lands, Reports will surface cross-module analytics in a
              single canvas — pipeline through invoiced revenue, margin by
              client tier, technician utilization against budgeted hours.
              Customizable dashboards, scheduled email briefings, and
              export-ready PDF / CSV / Excel deliverables come standard, so
              the boardroom, the accountant, and the analyst all get the
              shape they need.
            </p>

            <p className="nx-subtitle mt-5 text-sm">
              Until then, the operational modules continue to capture every
              quote, project, schedule, and invoice — Reports will join
              those streams without any data migration required.
            </p>
          </div>
        </div>

        {/* Gold gradient hairline before the pillar grid — matches the
            invite email / reset-password email separator pattern. */}
        <div
          className="h-px"
          style={{
            background:
              "linear-gradient(90deg, rgba(184,146,75,0) 0%, var(--brand-accent) 50%, rgba(184,146,75,0) 100%)",
          }}
          aria-hidden
        />

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 px-8 py-10 sm:px-12 sm:py-12 md:grid-cols-2">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  background:
                    "color-mix(in oklab, var(--brand-accent) 15%, transparent)",
                  color: "var(--brand-accent)",
                }}
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p
                  className="font-serif text-lg"
                  style={{ color: "var(--brand-primary)" }}
                >
                  {title}
                </p>
                <p
                  className="mt-1 text-[13px] leading-relaxed"
                  style={{ color: "var(--brand-text)" }}
                >
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div
          className="border-t px-8 py-5 sm:px-12"
          style={{ borderColor: "var(--brand-border)" }}
        >
          <p
            className="text-center text-[10px] uppercase tracking-[0.32em]"
            style={{ color: "var(--brand-accent-soft, #94835B)" }}
          >
            ◆ Reports · A Nexvelon Enterprise Suite Module ◆
          </p>
        </div>
      </Card>

      {/* Available now — the operational reports that already ship. */}
      <div>
        <p className="nx-eyebrow mb-2">Available now</p>
        <Link
          href="/reports/duplicate-quote-numbers"
          className="bg-card flex items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3 shadow-sm transition-colors hover:bg-[var(--muted)]/40"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "color-mix(in oklab, var(--brand-accent) 15%, transparent)",
              color: "var(--brand-accent)",
            }}
            aria-hidden
          >
            <Copy className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="text-brand-navy block font-serif text-base">
              Duplicate quote numbers
            </span>
            <span className="text-muted-foreground block text-[13px]">
              Every quote number shared by two or more quotes, for reconciliation.
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
