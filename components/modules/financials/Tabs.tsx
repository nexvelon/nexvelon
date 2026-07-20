"use client";

// FIN-1 — the real Financials tabs. Five surfaces, all wired to live data via
// the financials:view-gated server actions (no mock, no fabricated ratios —
// the honest-data principle: a number renders only when it's a real
// transaction figure). The old ten-tab mock (ratio P&L, hardcoded balance
// sheet, fake bills, toast-only sync/report buttons) is gone; P&L returns for
// real as FIN-8, aging buckets as FIN-3, payables as FIN-7.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
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
import { OPCO_LABEL, STATUS_TONE } from "@/components/modules/invoices/shared";
import {
  getMonthlyRevenueAction,
  getProjectFinancialSummariesAction,
  getReceivablesByClientAction,
  getRevenueSummaryAction,
  getTaxCollectedSummaryAction,
  listFinancialInvoicesAction,
} from "@/app/(app)/financials/actions";
import type {
  MonthlyRevenuePoint,
  ProjectFinancialSummary,
  ReceivableClientRow,
  RevenueSummary,
  TaxCollectedSummary,
} from "@/lib/api/financials";
import type { InvoiceListRow } from "@/lib/api/invoices";
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

function KpiCard({ label, value, sub, format: fmt }: {
  label: string;
  value: number | null;
  sub?: string;
  format?: (n: number) => string;
}) {
  return (
    <Card className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md">
      <p className="text-muted-foreground font-serif text-[11px] tracking-wide">{label}</p>
      <p className="text-brand-navy text-xl font-semibold tabular-nums">
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([
      getRevenueSummaryAction({ from, to }),
      getRevenueSummaryAction({}),
      getMonthlyRevenueAction({ months: 12 }),
      getProjectFinancialSummariesAction(),
    ]).then(([ranged, pit, months, projs]) => {
      if (!active) return;
      if (!ranged.ok) return setError(ranged.error);
      if (!pit.ok) return setError(pit.error);
      setRangeSummary(ranged.data);
      setAllTime(pit.data);
      if (months.ok) setMonthly(months.data);
      if (projs.ok) setProjects(projs.data);
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
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Invoiced (range)" value={rangeSummary?.total ?? null} sub={`${rangeSummary?.invoiceCount ?? 0} invoices`} />
        <KpiCard label="Collected (range)" value={rangeSummary?.paidTotal ?? null} />
        <KpiCard label="Outstanding AR" value={allTime?.outstandingTotal ?? null} sub="All open invoices" />
        <KpiCard label="Holdback retained" value={allTime?.holdbackRetained ?? null} sub="All issued invoices" />
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
                <Bar dataKey="paid" name="Collected" fill={t.accent} radius={[3, 3, 0, 0]} />
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

const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
const OPCOS = ["integrated_solutions", "guardian"] as const;

export function InvoicesTab({ from, to }: TabProps) {
  const router = useRouter();
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
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
                {s.charAt(0).toUpperCase() + s.slice(1)}
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
            <TableHead className="text-right text-[11px] uppercase">Amount due</TableHead>
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
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                    STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {r.status}
                </span>
              </TableCell>
              <TableCell className="text-right text-xs font-semibold tabular-nums">
                {formatCurrency(Number(r.total))}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {formatCurrency(Number(r.amount_due))}
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

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - parseISO(iso).getTime()) / 86_400_000);
  return days < 0 ? 0 : days;
}

// Point-in-time surface — open balances don't range-filter, so no TabProps.
export function ReceivablesTab() {
  const [rows, setRows] = useState<ReceivableClientRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getReceivablesByClientAction().then((res) => {
      if (!active) return;
      if (!res.ok) return setError(res.error);
      setRows(res.data);
    });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <ErrorCard message={error} />;

  return (
    <Card className="p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-brand-navy font-serif text-lg">Open balances by client</h3>
        <p className="text-muted-foreground text-[11px]">
          Aging buckets arrive with payment tracking (FIN-2/3).
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Client</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Open balance</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Open invoices</TableHead>
            <TableHead className="text-right text-[11px] uppercase">
              Days outstanding (since issue)
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-6 text-center text-xs">
                No open invoices — nothing is owed right now.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const days = daysSince(r.oldest_issue_date);
            return (
              <TableRow key={r.client_id}>
                <TableCell className="text-brand-charcoal text-xs">{r.client_name}</TableCell>
                <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                  {formatCurrency(r.open_total)}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.invoice_count}</TableCell>
                <TableCell
                  className={cn(
                    "text-right text-xs tabular-nums",
                    days != null && days > 60 && "font-semibold text-red-600"
                  )}
                >
                  {days == null ? "—" : days}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PROJECTS (the 6b rollup surface)
// ────────────────────────────────────────────────────────────────────────────

// Point-in-time surface — the rollup is live state, not range history.
export function ProjectsFinTab() {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectFinancialSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getProjectFinancialSummariesAction().then((res) => {
      if (!active) return;
      if (!res.ok) return setError(res.error);
      setRows(res.data);
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
          Contract, billed, spent and margin from the live cost rollup.
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
