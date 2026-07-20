"use client";

// FIN-1 — /financials over real data. Five tabs (Overview / Invoices /
// Receivables / Projects / Tax), all fed by the financials:view-gated server
// actions. The range selector drives { from, to } bounds on issue_date;
// "Custom" exposes two date inputs. The old mock shell's QuickBooks/Xero/
// Board-pack buttons and sync footer are gone — no accounting integration
// exists yet, so nothing pretends otherwise.

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OverviewTab,
  InvoicesTab,
  ReceivablesTab,
  ProjectsFinTab,
  TaxTab,
} from "@/components/modules/financials/Tabs";
import {
  FIN_RANGE_LABEL,
  rangeBounds,
  type FinRange,
} from "@/lib/financials-range";
import { Can } from "@/lib/role-context";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "invoices", label: "Invoices" },
  { key: "ar", label: "Receivables" },
  { key: "projects", label: "Projects" },
  { key: "tax", label: "Tax (GST/HST)" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function FinancialsPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [range, setRange] = useState<FinRange>("ytd");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const { from, to } = useMemo(() => {
    if (range === "custom") {
      return { from: customFrom || null, to: customTo || null };
    }
    return rangeBounds(range);
  }, [range, customFrom, customTo]);

  const now = new Date();

  return (
    <Can resource="financials" action="view" fallback={<RestrictedCard />}>
      <div className="space-y-6">
        <PageHeader
          eyebrow={`Fiscal Q${Math.floor(now.getMonth() / 3) + 1} · ${now.toLocaleString("en", { month: "short" })} ${now.getFullYear()}`}
          title="Financial Operations"
          description="Revenue · receivables · project financials · HST"
          actions={
            <>
              <Select value={range} onValueChange={(v) => setRange((v ?? "ytd") as FinRange)}>
                <SelectTrigger className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIN_RANGE_LABEL) as FinRange[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {FIN_RANGE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {range === "custom" && (
                <>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 w-36"
                    aria-label="From date"
                  />
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 w-36"
                    aria-label="To date"
                  />
                </>
              )}
            </>
          }
        />

        <nav className="bg-card rounded-lg border border-[var(--border)] p-1 shadow-sm">
          <ul className="flex flex-wrap gap-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-brand-navy text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-brand-charcoal"
                    )}
                  >
                    {t.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {tab === "overview" && <OverviewTab from={from} to={to} />}
        {tab === "invoices" && <InvoicesTab from={from} to={to} />}
        {tab === "ar" && <ReceivablesTab />}
        {tab === "projects" && <ProjectsFinTab />}
        {tab === "tax" && <TaxTab from={from} to={to} />}
      </div>
    </Can>
  );
}

function RestrictedCard() {
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="bg-card border-t-2 border-t-[#C9A24B] p-8 text-center shadow-sm">
        <div className="bg-brand-charcoal/5 text-brand-charcoal/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-brand-navy font-serif text-2xl">Restricted Access</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Contact your administrator for access to financial data.
        </p>
      </Card>
    </div>
  );
}
