"use client";

// FIN-1 — the real Financials tabs. Five surfaces, all wired to live data via
// the financials:view-gated server actions (no mock, no fabricated ratios —
// the honest-data principle: a number renders only when it's a real
// transaction figure). The old ten-tab mock (ratio P&L, hardcoded balance
// sheet, fake bills, toast-only sync/report buttons) is gone; P&L returns for
// real as FIN-8, payables as FIN-7.
//
// FIN-3 — Receivables is now real aging (5 buckets by days past due) with a
// CSV export and per-client statements, replacing FIN-1's days-since-issue
// placeholder.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimatedNumber } from "@/components/modules/dashboard/AnimatedNumber";
import {
  OPCO_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/components/modules/invoices/shared";
import {
  getArAgingByClientAction,
  getArAgingSummaryAction,
  getDepositsHeldTotalAction,
  getApSummaryAction,
  getMonthlyRevenueAction,
  getProjectFinancialSummariesAction,
  getRevenueSummaryAction,
  getTaxCollectedSummaryAction,
  exportArAgingCsvAction,
  listFinancialInvoicesAction,
} from "@/app/(app)/financials/actions";
import type {
  FinInvoiceListRow,
  MonthlyRevenuePoint,
  ProjectFinancialSummary,
  RevenueSummary,
  TaxCollectedSummary,
} from "@/lib/api/financials";
import type { ArAgingClientRow, ArAgingSummary } from "@/lib/api/ar-aging";
import type { ApSummary } from "@/lib/api/vendor-bills";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { useThemeColors } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

export interface TabProps {
  from: string | null;
  to: string | null;
}

function opcoLabel(opco: string): string {
  return OPCO_LABEL[opco] ?? opco;
}

function monthLabel(key: string): string {
  // key is "YYYY-MM"
  return format(parseISO(`${key}-01`), "MMM");
}

function KpiCard({ label, value, sub, format: fmt, tone }: {
  label: string;
  value: number | null;
  sub?: string;
  format?: (n: number) => string;
  /** Optional text-colour override — e.g. red for a non-zero overdue total. */
  tone?: string;
}) {
  return (
    <Card className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-muted-foreground font-serif text-[11px] tracking-wide">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", tone ?? "text-brand-navy")}>
        {value == null ? "—" : <AnimatedNumber value={value} format={fmt ?? formatCurrency} />}
      </p>
      {sub && <p className="text-muted-foreground text-[11px]">{sub}</p>}
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="p-6 text-center shadow-sm">
      <p className="text-muted-foreground text-sm">{message}</p>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ────────────────────────────────────────────────────────────────────────────

export function OverviewTab({ from, to }: TabProps) {
  const t = useThemeColors();
  const [rangeSummary, setRangeSummary] = useState<RevenueSummary | null>(null);
  const [allTime, setAllTime] = useState<RevenueSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRevenuePoint[]>([]);
  const [projects, setProjects] = useState<ProjectFinancialSummary[]>([]);
  // FIN-3 — past-due total for the Overdue AR KPI.
  const [aging, setAging] = useState<ArAgingSummary | null>(null);
  // FIN-4 — unapplied deposit credit across all projects.
  const [depositsHeld, setDepositsHeld] = useState<number | null>(null);
  // FIN-5 — what we owe vendors, and how much of it is late.
  const [ap, setAp] = useState<ApSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([
      getRevenueSummaryAction({ from, to }),
      getRevenueSummaryAction({}),
      getMonthlyRevenueAction({ months: 12 }),
      getProjectFinancialSummariesAction(),
      getArAgingSummaryAction(),
      getDepositsHeldTotalAction(),
      getApSummaryAction(),
    ]).then(([ranged, pit, months, projs, ar, held, apRes]) => {
      if (!active) return;
      if (!ranged.ok) return setError(ranged.error);
      if (!pit.ok) return setError(pit.error);
      setRangeSummary(ranged.data);
      setAllTime(pit.data);
      if (months.ok) setMonthly(months.data);
      // FIN-2 — cost legs arrive null for financials:view-only holders, so the
      // blended-margin KPI below resolves to "—" for them.
      if (projs.ok) setProjects(projs.data.summaries);
      if (ar.ok) setAging(ar.data);
      if (held.ok) setDepositsHeld(held.data);
      if (apRes.ok) setAp(apRes.data);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  const contractTotal = useMemo(
    () => projects.reduce((s, p) => s + p.contract, 0),
    [projects]
  );
  const blendedMargin = useMemo(() => {
    const withSpend = projects.filter((p) => p.spent != null);
    const contract = withSpend.reduce((s, p) => s + p.contract, 0);
    const spent = withSpend.reduce((s, p) => s + (p.spent ?? 0), 0);
    return contract > 0 ? (contract - spent) / contract : null;
  }, [projects]);

  const trend = useMemo(
    () => monthly.map((m) => ({ ...m, label: monthLabel(m.month) })),
    [monthly]
  );

  if (error) return <ErrorCard message={error} />;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Invoiced (range)" value={rangeSummary?.total ?? null} sub={`${rangeSummary?.invoiceCount ?? 0} invoices`} />
        {/* FIN-4 — real cash received in the range (payments excluding deposit
            applications + deposits received), on a cash-date basis. */}
        <KpiCard
          label="Collected (range)"
          value={rangeSummary?.cashCollected ?? null}
          sub={
            rangeSummary && rangeSummary.cashBreakdown.deposits > 0
              ? `incl. ${formatCurrency(rangeSummary.cashBreakdown.deposits)} deposits`
              : "Cash received"
          }
        />
        <KpiCard label="Outstanding AR" value={allTime?.outstandingTotal ?? null} sub="All open invoices" />
        {/* FIN-3 — past due (every bucket except current). Red when non-zero. */}
        <KpiCard
          label="Overdue AR"
          value={aging?.overdueTotal ?? null}
          sub="Past due"
          tone={aging && aging.overdueTotal > 0 ? "text-red-600" : undefined}
        />
        <KpiCard label="Holdback retained" value={allTime?.holdbackRetained ?? null} sub="All issued invoices" />
        {/* FIN-4 — cash held that hasn't been applied to an invoice yet. */}
        <KpiCard label="Deposits held" value={depositsHeld} sub="Unapplied credit" />
        {/* FIN-5 — the AP side: what we owe, and the late slice of it. */}
        <KpiCard
          label="AP outstanding"
          value={ap?.outstanding ?? null}
          sub={ap ? `${ap.billCount} open bill${ap.billCount === 1 ? "" : "s"}` : "Owed to vendors"}
        />
        <KpiCard
          label="Overdue AP"
          value={ap?.overdue ?? null}
          sub="Past due"
          tone={ap && ap.overdue > 0 ? "text-red-600" : undefined}
        />
        <KpiCard label="Open project contracts" value={contractTotal} sub={`${projects.length} projects`} />
        <KpiCard
          label="Blended margin"
          value={blendedMargin}
          format={(n) => formatPercent(n)}
          sub="Contract − spent, open projects"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="p-4 shadow-sm transition-shadow hover:shadow-md lg:col-span-8">
          <h3 className="text-brand-navy mb-3 font-serif text-lg">
            Invoiced vs collected — trailing 12 months
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke={t.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: t.chartTertiary, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: t.chartTertiary, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                  width={64}
                />
                <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} />
                <Bar dataKey="invoiced" name="Invoiced" fill={t.primary} radius={[3, 3, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill={t.accent} radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 shadow-sm transition-shadow hover:shadow-md lg:col-span-4">
          <h3 className="text-brand-navy mb-3 font-serif text-lg">Revenue by entity</h3>
          {rangeSummary && rangeSummary.byOpco.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-xs">
              No issued invoices in the selected range.
            </p>
          )}
          <ul className="space-y-3">
            {rangeSummary?.byOpco.map((o) => (
              <li key={o.opco} className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2.5">
                <span>
                  <span className="text-brand-charcoal block text-sm font-medium">{opcoLabel(o.opco)}</span>
                  <span className="text-muted-foreground text-[11px]">
                    {o.count} invoice{o.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-brand-navy text-sm font-semibold tabular-nums">
                  {formatCurrency(o.total)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// INVOICES
// ────────────────────────────────────────────────────────────────────────────

const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "void",
] as const;
const OPCOS = ["integrated_solutions", "guardian"] as const;

export function InvoicesTab({ from, to }: TabProps) {
  const router = useRouter();
  const [rows, setRows] = useState<FinInvoiceListRow[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [opco, setOpco] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    listFinancialInvoicesAction({
      status: status === "all" ? undefined : status,
      opco: opco === "all" ? undefined : opco,
      from,
      to,
    }).then((res) => {
      if (!active) return;
      if (!res.ok) return setError(res.error);
      setRows(res.data);
    });
    return () => {
      active = false;
    };
  }, [status, opco, from, to]);

  if (error) return <ErrorCard message={error} />;

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
          <SelectTrigger className="h-9 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={opco} onValueChange={(v) => setOpco(v ?? "all")}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Both entities</SelectItem>
            {OPCOS.map((o) => (
              <SelectItem key={o} value={o}>
                {opcoLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground ml-auto text-[11px]">
          Invoices are created from a project&apos;s Financials tab.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Number</TableHead>
            <TableHead className="text-[11px] uppercase">Client</TableHead>
            <TableHead className="text-[11px] uppercase">Project</TableHead>
            <TableHead className="text-[11px] uppercase">Entity</TableHead>
            <TableHead className="text-[11px] uppercase">Issued</TableHead>
            <TableHead className="text-[11px] uppercase">Status</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground py-6 text-center text-xs">
                No invoices match the current filters.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow
              key={r.id}
              className="cursor-pointer"
              onClick={() => router.push(`/invoices/${r.id}`)}
            >
              <TableCell className="font-mono text-xs">{r.invoice_number ?? "Draft"}</TableCell>
              <TableCell className="text-brand-charcoal text-xs">{r.client_name ?? "—"}</TableCell>
              <TableCell className="text-xs">{r.project_number ?? "—"}</TableCell>
              <TableCell className="text-xs">{opcoLabel(r.opco)}</TableCell>
              <TableCell className="text-xs tabular-nums">
                {r.issue_date ? format(parseISO(r.issue_date), "MMM d, yyyy") : "—"}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                      STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {/* FIN-2 — derived overdue marker (open + past due_date). */}
                  {r.is_overdue && (
                    <span
                      className="text-destructive text-[10px] font-semibold uppercase"
                      title={`Due ${r.due_date}`}
                    >
                      • Overdue
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right text-xs font-semibold tabular-nums">
                {formatCurrency(Number(r.total))}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatCurrency(r.balance)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RECEIVABLES
// ────────────────────────────────────────────────────────────────────────────

// FIN-3 — bucket presentation. Escalating tone: current is calm, 90+ is loud.
const BUCKET_CARDS = [
  { key: "current" as const, label: "Current", tone: "text-[var(--brand-status-green)]" },
  { key: "d1_30" as const, label: "1–30 days", tone: "text-brand-navy" },
  { key: "d31_60" as const, label: "31–60 days", tone: "text-[#8a6d1f]" },
  { key: "d61_90" as const, label: "61–90 days", tone: "text-orange-600" },
  { key: "d90_plus" as const, label: "90+ days", tone: "text-red-600" },
];

// Point-in-time surface — open balances don't range-filter, so no TabProps.
export function ReceivablesTab() {
  const [summary, setSummary] = useState<ArAgingSummary | null>(null);
  const [rows, setRows] = useState<ArAgingClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getArAgingSummaryAction(), getArAgingByClientAction()]).then(
      ([sum, byClient]) => {
        if (!active) return;
        if (!sum.ok) return setError(sum.error);
        setSummary(sum.data);
        if (byClient.ok) setRows(byClient.data);
      }
    );
    return () => {
      active = false;
    };
  }, []);

  // FIN-3 — the accountant hand-off. The action returns the CSV text; the
  // browser saves it via a synthetic anchor click (the #310/#311 pattern).
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportArAgingCsvAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("AR aging exported");
    } finally {
      setExporting(false);
    }
  };

  if (error) return <ErrorCard message={error} />;

  return (
    <div className="space-y-6">
      {/* Aging summary strip */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {BUCKET_CARDS.map((b) => (
          <Card
            key={b.key}
            className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-muted-foreground font-serif text-[11px] tracking-wide">
              {b.label}
            </p>
            <p className={cn("text-xl font-semibold tabular-nums", b.tone)}>
              {summary ? formatCurrency(summary.buckets[b.key]) : "—"}
            </p>
          </Card>
        ))}
        <Card className="border-t-2 border-t-brand-navy p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px] tracking-wide">
            Total AR
          </p>
          <p className="text-brand-navy text-xl font-semibold tabular-nums">
            {summary ? formatCurrency(summary.total) : "—"}
          </p>
          <p className="text-muted-foreground text-[11px]">
            As of {summary?.asOf ?? "—"}
          </p>
        </Card>
      </section>

      {/* Aged receivables by client */}
      <Card className="p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-brand-navy font-serif text-lg">
            Aged receivables by client
          </h3>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground text-[11px]">
              Aged by days past due (falling back to issue date when no due date
              is set).
            </p>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export AR aging (CSV)
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Client</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Current</TableHead>
                <TableHead className="text-right text-[11px] uppercase">1–30</TableHead>
                <TableHead className="text-right text-[11px] uppercase">31–60</TableHead>
                <TableHead className="text-right text-[11px] uppercase">61–90</TableHead>
                <TableHead className="text-right text-[11px] uppercase">90+</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Oldest</TableHead>
                <TableHead className="text-[11px] uppercase" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground py-6 text-center text-xs"
                  >
                    No open invoices — nothing is owed right now.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                // Anything in 31+ marks the client as a collection concern.
                const seriouslyLate = r.d31_60 + r.d61_90 + r.d90_plus > 0;
                return (
                  <TableRow
                    key={r.client_id}
                    className={cn(
                      seriouslyLate && "border-l-2 border-l-red-500/70"
                    )}
                  >
                    <TableCell className="text-brand-charcoal text-xs">
                      {r.client_name}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {r.current ? formatCurrency(r.current) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {r.d1_30 ? formatCurrency(r.d1_30) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-[#8a6d1f]">
                      {r.d31_60 ? formatCurrency(r.d31_60) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-orange-600">
                      {r.d61_90 ? formatCurrency(r.d61_90) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold tabular-nums text-red-600">
                      {r.d90_plus ? formatCurrency(r.d90_plus) : "—"}
                    </TableCell>
                    <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(r.total)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs tabular-nums",
                        r.oldest_days > 60 && "font-semibold text-red-600"
                      )}
                    >
                      {r.oldest_days > 0 ? `${r.oldest_days}d` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/financials/statement/${r.client_id}`}
                        className="text-brand-navy text-[11px] hover:underline"
                      >
                        Statement
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PROJECTS (the 6b rollup surface)
// ────────────────────────────────────────────────────────────────────────────

// Point-in-time surface — the rollup is live state, not range history.
export function ProjectsFinTab() {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectFinancialSummary[]>([]);
  // FIN-2 — false for financials:view-only holders; the cost legs arrive null.
  const [canSeeFinancials, setCanSeeFinancials] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getProjectFinancialSummariesAction().then((res) => {
      if (!active) return;
      if (!res.ok) return setError(res.error);
      setRows(res.data.summaries);
      setCanSeeFinancials(res.data.canSeeFinancials);
    });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <ErrorCard message={error} />;

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-brand-navy font-serif text-lg">Open projects</h3>
        <p className="text-muted-foreground text-[11px]">
          {canSeeFinancials
            ? "Contract, billed, spent and margin from the live cost rollup."
            : "Cost and margin need financials:edit — contract and billing shown."}
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Project</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Contract</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Invoiced</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Billed %</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Spent</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Margin</TableHead>
            <TableHead className="text-right text-[11px] uppercase">PO committed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground py-6 text-center text-xs">
                No open projects.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow
              key={r.project_id}
              className="cursor-pointer"
              onClick={() => router.push(`/projects/${r.project_id}`)}
            >
              <TableCell className="text-xs">
                <span className="text-brand-charcoal font-medium">{r.project_number ?? "—"}</span>
                {r.title && <span className="text-muted-foreground"> — {r.title}</span>}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatCurrency(r.contract)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatCurrency(r.invoiced)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {r.billed_pct == null ? "—" : formatPercent(r.billed_pct)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {r.spent == null ? "—" : formatCurrency(r.spent)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right text-xs font-semibold tabular-nums",
                  r.margin != null && r.margin < 0 && "text-red-600"
                )}
              >
                {r.margin == null ? "—" : formatCurrency(r.margin)}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {r.po_committed == null ? "—" : formatCurrency(r.po_committed)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TAX (GST/HST)
// ────────────────────────────────────────────────────────────────────────────

export function TaxTab({ from, to }: TabProps) {
  const [summary, setSummary] = useState<TaxCollectedSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    getTaxCollectedSummaryAction({ from, to }).then((res) => {
      if (!active) return;
      if (!res.ok) return setError(res.error);
      setSummary(res.data);
    });
    return () => {
      active = false;
    };
  }, [from, to]);

  if (error) return <ErrorCard message={error} />;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="HST collected (range)" value={summary?.total ?? null} sub="Σ tax on issued invoices" />
        {summary?.byOpco.map((o) => (
          <KpiCard key={o.opco} label={`${opcoLabel(o.opco)} — HST collected`} value={o.taxCollected} />
        ))}
      </section>
      <Card className="p-4 shadow-sm">
        <p className="text-muted-foreground text-xs">
          Collected side only — input tax credits (HST paid on purchases) arrive
          with vendor bills (FIN-7). Ontario HST 13% is set per invoice; the
          rate and amount above are the real values stored on each invoice.
        </p>
      </Card>
    </div>
  );
}
