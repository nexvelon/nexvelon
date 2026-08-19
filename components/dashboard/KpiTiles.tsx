"use client";

// UIDG-10 — the ten split KPI tiles. Each is an independently placeable, gated
// widget, but they all read from the ONE shared snapshot (KpiDataProvider) so the
// split costs no extra queries. Every tile keeps the EXACT presentation, props and
// role gate the old combined KpiOverviewWidget used for it — Revenue/Cash/HST
// announce the selected window (they are range-aware); the point-in-time tiles
// (AR, AP, deposits, projects, quotes, WIP, margin) show a plain label.

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
import { KpiSparkline, KpiDual, KpiPlain, KpiStatList, KpiProgress } from "@/components/kpi";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useKpiData } from "./KpiDataProvider";
import { useDashboardRange } from "./range-context";

/** Shared state props: loading until the first snapshot lands; empty (with a
 *  prompt) while a custom range is incomplete — so no tile fabricates a zero. */
function useTileState() {
  const win = useDashboardRange();
  const { kpi, loading } = useKpiData();
  return {
    win,
    kpi,
    loading: loading && !kpi,
    invalid: !win.valid,
  };
}

const NEEDS_RANGE = "Set a date range";

export function KpiRevenueTile() {
  const { win, kpi, loading, invalid } = useTileState();
  const { trend } = useKpiData();
  const fin = kpi?.financial ?? null;
  return (
    <KpiSparkline
      restricted={!loading && !invalid && !fin}
      loading={loading}
      empty={invalid}
      emptyMessage={NEEDS_RANGE}
      label={`Revenue · ${win.label}`}
      value={fin?.revenue ?? 0}
      series={trend ? trend.map((p) => p.invoiced) : []}
      format={formatCurrency}
      icon={Banknote}
      href="/financials"
      comparison={{ prior: fin?.compare?.revenue ?? null, basis: win.comparisonBasis, polarity: "normal" }}
    />
  );
}

export function KpiCashTile() {
  const { win, kpi, loading, invalid } = useTileState();
  const { trend } = useKpiData();
  const fin = kpi?.financial ?? null;
  return (
    <KpiSparkline
      restricted={!loading && !invalid && !fin}
      loading={loading}
      empty={invalid}
      emptyMessage={NEEDS_RANGE}
      label={`Cash collected · ${win.label}`}
      value={fin?.cash_collected ?? 0}
      series={trend ? trend.map((p) => p.collected) : []}
      format={formatCurrency}
      icon={HandCoins}
      href="/financials"
      comparison={{ prior: fin?.compare?.cash_collected ?? null, basis: win.comparisonBasis, polarity: "normal" }}
    />
  );
}

export function KpiArTile() {
  const { kpi, loading, invalid } = useTileState();
  const fin = kpi?.financial ?? null;
  return (
    <KpiDual
      restricted={!loading && !invalid && !fin}
      loading={loading}
      label="Accounts receivable"
      icon={AlertCircle}
      href="/invoices"
      primary={{ label: "Outstanding", value: fin?.ar_outstanding ?? 0, format: formatCurrency }}
      secondary={{ label: "Overdue", value: fin?.ar_overdue ?? 0, format: formatCurrency, tone: (fin?.ar_overdue ?? 0) > 0 ? "bad" : "default" }}
    />
  );
}

export function KpiApTile() {
  const { kpi, loading, invalid } = useTileState();
  const fin = kpi?.financial ?? null;
  return (
    <KpiDual
      restricted={!loading && !invalid && !fin}
      loading={loading}
      label="Accounts payable"
      icon={Receipt}
      href="/financials"
      primary={{ label: "Outstanding", value: fin?.ap_outstanding ?? 0, format: formatCurrency }}
      secondary={{ label: "Overdue", value: fin?.ap_overdue ?? 0, format: formatCurrency, tone: (fin?.ap_overdue ?? 0) > 0 ? "bad" : "default" }}
    />
  );
}

export function KpiDepositsTile() {
  const { kpi, loading, invalid } = useTileState();
  const fin = kpi?.financial ?? null;
  return (
    <KpiPlain
      restricted={!loading && !invalid && !fin}
      loading={loading}
      label="Deposits held"
      value={fin?.deposits_held ?? 0}
      format={formatCurrency}
      icon={Wallet}
      href="/financials"
    />
  );
}

export function KpiActiveProjectsTile() {
  const { kpi, loading, invalid } = useTileState();
  const proj = kpi?.operational.projects ?? null;
  return (
    <KpiDual
      restricted={!loading && !invalid && !proj}
      loading={loading}
      label="Active projects"
      icon={FolderOpen}
      href="/projects"
      primary={{ label: "Projects", value: proj?.active_projects ?? 0, format: formatNumber }}
      secondary={{ label: "Contract value", value: proj?.active_contract_value ?? 0, format: formatCurrency }}
    />
  );
}

export function KpiOpenQuotesTile() {
  const { kpi, loading, invalid } = useTileState();
  const quo = kpi?.operational.quotes ?? null;
  return (
    <KpiDual
      restricted={!loading && !invalid && !quo}
      loading={loading}
      label="Open quotes"
      icon={ClipboardList}
      href="/quotes"
      primary={{ label: "Quotes", value: quo?.open_quotes ?? 0, format: formatNumber }}
      secondary={{ label: "Pipeline", value: quo?.open_quotes_value ?? 0, format: formatCurrency }}
    />
  );
}

export function KpiWipTile() {
  const { kpi, loading, invalid } = useTileState();
  const finEdit = kpi?.financial_edit ?? null;
  return (
    <KpiStatList
      restricted={!loading && !invalid && !finEdit}
      loading={loading}
      label="WIP position"
      icon={TrendingUp}
      href="/financials"
      rows={[
        { label: "Net (over/under)", value: finEdit?.wip_net ?? 0, format: formatCurrency },
        { label: "Overbilled", value: finEdit?.wip_overbilled ?? 0, format: formatCurrency, tone: "bad" },
        { label: "Underbilled", value: Math.abs(finEdit?.wip_underbilled ?? 0), format: formatCurrency, tone: "good" },
      ]}
    />
  );
}

export function KpiHstTile() {
  const { win, kpi, loading, invalid } = useTileState();
  const finEdit = kpi?.financial_edit ?? null;
  return (
    <KpiPlain
      restricted={!loading && !invalid && !finEdit}
      loading={loading}
      empty={invalid}
      emptyMessage={NEEDS_RANGE}
      label={`HST net position · ${win.label}`}
      value={finEdit?.hst_net_total ?? 0}
      format={formatCurrency}
      icon={Receipt}
      href="/financials"
    />
  );
}

export function KpiMarginTile() {
  const { kpi, loading, invalid } = useTileState();
  const finEdit = kpi?.financial_edit ?? null;
  return (
    <KpiProgress
      restricted={!loading && !invalid && !finEdit}
      loading={loading}
      empty={!!finEdit && finEdit.blended_margin_pct == null}
      emptyMessage="No revenue yet"
      label="Blended margin"
      value={finEdit?.blended_margin_pct ?? 0}
      caption="gross margin"
      icon={Percent}
      href="/financials"
    />
  );
}
