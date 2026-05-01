"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OverviewTab,
  PLTab,
  BalanceSheetTab,
  CashFlowTab,
  InvoicesTab,
  BillsTab,
  ReceivablesTab,
  PayablesTab,
  TaxTab,
  ReportsTab,
  SyncFooter,
} from "@/components/modules/financials/Tabs";
import { FIN_RANGE_LABEL, type FinRange } from "@/lib/financials-data";
import { Can } from "@/lib/role-context";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "pl", label: "Profit & Loss" },
  { key: "bs", label: "Balance Sheet" },
  { key: "cf", label: "Cash Flow" },
  { key: "invoices", label: "Invoices" },
  { key: "bills", label: "Bills" },
  { key: "ar", label: "Receivables" },
  { key: "ap", label: "Payables" },
  { key: "tax", label: "Tax (GST/HST)" },
  { key: "reports", label: "Reports" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function FinancialsPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [range, setRange] = useState<FinRange>("ytd");

  return (
    <Can resource="financials" action="view" fallback={<RestrictedCard />}>
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-brand-navy font-serif text-3xl">Financials</h1>
            <p className="text-brand-charcoal/70 mt-1 text-sm">
              Profitability, cash flow, receivables, and tax reporting.
            </p>
          </div>
          <Select value={range} onValueChange={(v) => setRange((v ?? "ytd") as FinRange)}>
            <SelectTrigger className="w-44">
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
        </header>

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

        {tab === "overview" && <OverviewTab range={range} />}
        {tab === "pl" && <PLTab range={range} />}
        {tab === "bs" && <BalanceSheetTab />}
        {tab === "cf" && <CashFlowTab range={range} />}
        {tab === "invoices" && <InvoicesTab />}
        {tab === "bills" && <BillsTab />}
        {tab === "ar" && <ReceivablesTab />}
        {tab === "ap" && <PayablesTab />}
        {tab === "tax" && <TaxTab range={range} />}
        {tab === "reports" && <ReportsTab />}

        <SyncFooter />
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
