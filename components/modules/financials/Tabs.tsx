"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSignature,
  Mail,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  arAging,
  buildBills,
  buildCashFlow,
  buildKpiBlocks,
  buildPnL,
  cashflowTrend,
  rangeBounds,
  REPORT_CATALOG,
  taxSummary,
  topClientsByRevenue,
  topExpenseCategories,
  trailingRevenue,
  type FinRange,
  type PnL,
} from "@/lib/financials-data";
import { invoices } from "@/lib/mock-data/invoices";
import { clients } from "@/lib/mock-data/clients";
import { projects } from "@/lib/mock-data/projects";
import { AnimatedNumber } from "@/components/modules/dashboard/AnimatedNumber";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
} from "@/lib/format";
import { useThemeColors } from "@/lib/theme-context";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/types";

const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Sent: "bg-brand-navy/10 text-brand-navy",
  Paid: "bg-emerald-50 text-emerald-700",
  Overdue: "bg-red-50 text-red-700",
  Void: "bg-slate-100 text-slate-400 line-through",
};

interface TabProps {
  range: FinRange;
}

// ────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ────────────────────────────────────────────────────────────────────────────

export function OverviewTab({ range }: TabProps) {
  const t = useThemeColors();
  const { start, end, prevStart, prevEnd } = rangeBounds(range);
  const kpis = useMemo(() => buildKpiBlocks(range), [range]);
  const trend = useMemo(() => trailingRevenue(12), []);
  const cashflow = useMemo(() => cashflowTrend(12), []);
  const aging = useMemo(() => arAging(), []);
  const topClients = useMemo(() => topClientsByRevenue(start, end, 10), [start, end]);
  const cur = buildPnL(start, end);
  const expenses = topExpenseCategories(cur).map((e, i) => ({
    ...e,
    fill: t.charts[i % t.charts.length],
  }));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k, idx) => {
          const delta = k.prior === 0 ? 0 : (k.value - k.prior) / Math.abs(k.prior);
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: idx * 0.04 }}
            >
              <Card className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md">
                <p className="text-muted-foreground font-serif text-[11px] tracking-wide">
                  {k.label}
                </p>
                <p className="text-brand-navy text-xl font-semibold tabular-nums">
                  <AnimatedNumber value={k.value} format={formatCurrency} />
                </p>
                <p
                  className={cn(
                    "text-[11px] font-medium",
                    delta >= 0 ? "text-emerald-600" : "text-red-600"
                  )}
                >
                  {delta >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(delta))} vs prev
                </p>
              </Card>
            </motion.div>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="p-4 shadow-sm transition-shadow hover:shadow-md lg:col-span-8">
          <h3 className="text-brand-navy mb-3 font-serif text-lg">
            Revenue & EBITDA — Trailing 12 months
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
                <Bar dataKey="revenue" name="Revenue" fill={t.primary} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke={t.accent} strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 shadow-sm transition-shadow hover:shadow-md lg:col-span-4">
          <h3 className="text-brand-navy mb-3 font-serif text-lg">Cash Flow</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashflow} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke={t.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: t.chartTertiary, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: t.chartTertiary, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                  width={56}
                />
                <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} />
                <Line dataKey="cashIn" name="Cash in" stroke={t.primary} strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="cashOut" name="Cash out" stroke={t.chartQuaternary} strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="net" name="Net" stroke={t.accent} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-4 shadow-sm">
          <h3 className="text-brand-navy mb-3 font-serif text-lg">AR Aging</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={aging}
                stackOffset="none"
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid stroke={t.border} vertical={false} />
                <XAxis dataKey="bucket" tick={{ fill: t.chartTertiary, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: t.chartTertiary, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                  width={64}
                />
                <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} />
                <Bar dataKey="current" name="Current" stackId="a" fill={t.primary} />
                <Bar dataKey="past1_30" name="1-30" stackId="a" fill={t.chartTertiary} />
                <Bar dataKey="past31_60" name="31-60" stackId="a" fill={t.chartQuaternary} />
                <Bar dataKey="past61_90" name="61-90" stackId="a" fill={t.accent} />
                <Bar dataKey="past90" name="90+" stackId="a" fill="#DC2626" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 shadow-sm">
          <h3 className="text-brand-navy mb-3 font-serif text-lg">Top Expense Categories</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} />
                <Pie data={expenses} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2}>
                  {expenses.map((e) => (
                    <Cell key={e.name} fill={e.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 text-[11px]">
            {expenses.map((e) => (
              <li key={e.name} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: e.fill }} />
                  <span className="text-brand-charcoal">{e.name}</span>
                </span>
                <span className="text-brand-charcoal tabular-nums">
                  {formatCurrency(e.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-4 shadow-sm">
        <h3 className="text-brand-navy mb-3 font-serif text-lg">Top 10 Clients by Revenue</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Rank</TableHead>
              <TableHead className="text-[11px] uppercase">Client</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Invoices</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topClients.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-6 text-center text-xs">
                  No paid invoices in the selected range.
                </TableCell>
              </TableRow>
            )}
            {topClients.map((c, idx) => (
              <TableRow key={c.id}>
                <TableCell className="text-muted-foreground text-[11px] tabular-nums">{idx + 1}</TableCell>
                <TableCell className="text-brand-charcoal text-xs">{c.name}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{c.invoices}</TableCell>
                <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                  {formatCurrency(c.revenue)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PROFIT & LOSS
// ────────────────────────────────────────────────────────────────────────────

export function PLTab({ range }: TabProps) {
  const { start, end, prevStart, prevEnd } = rangeBounds(range);
  const cur = buildPnL(start, end);
  const prev = buildPnL(prevStart, prevEnd);

  const sections = pnlSections(cur, prev);

  return (
    <Card className="bg-card p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Line Item</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Current</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Prior</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Variance %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map((s) => (
            <PnLSectionRows key={s.title} section={s} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

interface PnLSection {
  title: string;
  rows: { label: string; value: number; prior: number; bold?: boolean; highlight?: boolean }[];
}

function pnlSections(cur: PnL, prev: PnL): PnLSection[] {
  return [
    {
      title: "Revenue",
      rows: [
        { label: "Installation", value: cur.revenue.installation, prior: prev.revenue.installation },
        { label: "Service Contracts", value: cur.revenue.serviceContracts, prior: prev.revenue.serviceContracts },
        { label: "Monitoring", value: cur.revenue.monitoring, prior: prev.revenue.monitoring },
        { label: "Parts", value: cur.revenue.parts, prior: prev.revenue.parts },
        { label: "Total Revenue", value: cur.revenue.total, prior: prev.revenue.total, bold: true },
      ],
    },
    {
      title: "COGS",
      rows: [
        { label: "Materials", value: cur.cogs.materials, prior: prev.cogs.materials },
        { label: "Labor", value: cur.cogs.labor, prior: prev.cogs.labor },
        { label: "Subcontractor", value: cur.cogs.subcontractor, prior: prev.cogs.subcontractor },
        { label: "Total COGS", value: cur.cogs.total, prior: prev.cogs.total, bold: true },
      ],
    },
    {
      title: "Gross Profit",
      rows: [{ label: "Gross Profit", value: cur.grossProfit, prior: prev.grossProfit, bold: true, highlight: true }],
    },
    {
      title: "Operating Expenses",
      rows: [
        { label: "Salaries", value: cur.opex.salaries, prior: prev.opex.salaries },
        { label: "Vehicles", value: cur.opex.vehicles, prior: prev.opex.vehicles },
        { label: "Insurance", value: cur.opex.insurance, prior: prev.opex.insurance },
        { label: "Rent", value: cur.opex.rent, prior: prev.opex.rent },
        { label: "Utilities", value: cur.opex.utilities, prior: prev.opex.utilities },
        { label: "Software", value: cur.opex.software, prior: prev.opex.software },
        { label: "Marketing", value: cur.opex.marketing, prior: prev.opex.marketing },
        { label: "Admin", value: cur.opex.admin, prior: prev.opex.admin },
        { label: "Total Operating Expenses", value: cur.opex.total, prior: prev.opex.total, bold: true },
      ],
    },
    {
      title: "Operating Income",
      rows: [
        { label: "EBITDA", value: cur.ebitda, prior: prev.ebitda, bold: true, highlight: true },
        { label: "Depreciation & Amortization", value: cur.depreciation, prior: prev.depreciation },
        { label: "EBIT", value: cur.ebit, prior: prev.ebit, bold: true },
        { label: "Interest", value: cur.interest, prior: prev.interest },
        { label: "Pre-Tax Income", value: cur.preTax, prior: prev.preTax, bold: true },
        { label: "Tax", value: cur.tax, prior: prev.tax },
        { label: "Net Income", value: cur.netIncome, prior: prev.netIncome, bold: true, highlight: true },
      ],
    },
  ];
}

function PnLSectionRows({ section }: { section: PnLSection }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <TableRow className="bg-muted/40">
        <TableCell colSpan={4} className="px-4 py-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-brand-navy inline-flex items-center gap-1 font-serif text-sm"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {section.title}
          </button>
        </TableCell>
      </TableRow>
      {open &&
        section.rows.map((r) => {
          const variance = r.prior === 0 ? 0 : (r.value - r.prior) / Math.abs(r.prior);
          return (
            <TableRow
              key={r.label}
              className={cn(r.highlight && "bg-brand-gold/5")}
            >
              <TableCell
                className={cn(
                  "text-xs",
                  r.bold ? "text-brand-navy font-semibold" : "text-brand-charcoal"
                )}
              >
                {r.label}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right text-xs tabular-nums",
                  r.bold && "text-brand-navy font-semibold"
                )}
              >
                {formatCurrency(r.value)}
              </TableCell>
              <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                {formatCurrency(r.prior)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right text-xs tabular-nums",
                  variance >= 0 ? "text-emerald-600" : "text-red-600"
                )}
              >
                {variance >= 0 ? "+" : ""}
                {(variance * 100).toFixed(1)}%
              </TableCell>
            </TableRow>
          );
        })}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BALANCE SHEET
// ────────────────────────────────────────────────────────────────────────────

export function BalanceSheetTab() {
  const sections = [
    {
      title: "Assets",
      groups: [
        {
          label: "Current",
          rows: [
            { label: "Cash & equivalents", value: 412_800, prior: 380_400 },
            { label: "Accounts receivable", value: 384_200, prior: 348_900 },
            { label: "Inventory", value: 268_400, prior: 250_120 },
            { label: "Prepaid expenses", value: 48_900, prior: 42_100 },
          ],
        },
        {
          label: "Non-current",
          rows: [
            { label: "Equipment & tools", value: 165_400, prior: 174_800 },
            { label: "Vehicles", value: 232_400, prior: 248_900 },
            { label: "Goodwill", value: 84_000, prior: 84_000 },
          ],
        },
      ],
    },
    {
      title: "Liabilities",
      groups: [
        {
          label: "Current",
          rows: [
            { label: "Accounts payable", value: 218_400, prior: 232_900 },
            { label: "Accrued expenses", value: 64_200, prior: 58_400 },
            { label: "Short-term debt", value: 84_000, prior: 96_000 },
            { label: "Tax payable", value: 38_900, prior: 42_400 },
          ],
        },
        {
          label: "Non-current",
          rows: [
            { label: "Long-term debt", value: 348_000, prior: 384_000 },
          ],
        },
      ],
    },
    {
      title: "Equity",
      groups: [
        {
          label: "—",
          rows: [
            { label: "Common stock", value: 100_000, prior: 100_000 },
            { label: "Retained earnings", value: 542_600, prior: 412_700 },
          ],
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <Card key={s.title} className="bg-card p-0 shadow-sm">
          <div className="border-b border-[var(--border)] bg-muted/40 px-4 py-2">
            <h3 className="text-brand-navy font-serif text-sm uppercase tracking-wider">
              {s.title}
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">Line</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Current</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Prior</TableHead>
                <TableHead className="text-right text-[10px] uppercase">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.groups.flatMap((g) => [
                <TableRow key={`g-${g.label}`} className="bg-muted/30">
                  <TableCell colSpan={4} className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </TableCell>
                </TableRow>,
                ...g.rows.map((r) => (
                  <TableRow key={`${g.label}-${r.label}`}>
                    <TableCell className="text-brand-charcoal text-xs">{r.label}</TableCell>
                    <TableCell className="text-brand-charcoal text-right text-xs tabular-nums">
                      {formatCurrency(r.value)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                      {formatCurrency(r.prior)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs tabular-nums",
                        r.value - r.prior >= 0 ? "text-emerald-600" : "text-red-600"
                      )}
                    >
                      {r.value - r.prior >= 0 ? "+" : ""}
                      {formatCurrency(r.value - r.prior)}
                    </TableCell>
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CASH FLOW
// ────────────────────────────────────────────────────────────────────────────

export function CashFlowTab({ range }: TabProps) {
  const theme = useThemeColors();
  const { start, end } = rangeBounds(range);
  const sections = useMemo(() => buildCashFlow(start, end), [range]);
  const trend = useMemo(() => cashflowTrend(12), []);

  let runningCash = 380_400;
  const trendData = trend.map((point) => {
    runningCash += point.net;
    return { ...point, balance: runningCash };
  });

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <Card key={s.title} className="bg-card p-0 shadow-sm">
          <div className="border-b border-[var(--border)] bg-muted/40 px-4 py-2">
            <h3 className="text-brand-navy font-serif text-sm uppercase tracking-wider">
              {s.title}
            </h3>
          </div>
          <Table>
            <TableBody>
              {s.rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="text-brand-charcoal text-xs">{r.label}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-xs tabular-nums",
                      r.value >= 0 ? "text-emerald-700" : "text-red-700"
                    )}
                  >
                    {formatCurrency(r.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}

      <Card className="p-4 shadow-sm">
        <h3 className="text-brand-navy mb-3 font-serif text-lg">Running Cash Position</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={theme.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: theme.chartTertiary, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: theme.chartTertiary, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                width={64}
              />
              <Tooltip formatter={(v: unknown) => formatCurrency(Number(v))} />
              <Line dataKey="balance" name="Cash balance" stroke={theme.accent} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// INVOICES
// ────────────────────────────────────────────────────────────────────────────

export function InvoicesTab() {
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [search, setSearch] = useState("");
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const cn = clientById.get(i.clientId)?.name.toLowerCase() ?? "";
        if (!i.number.toLowerCase().includes(q) && !cn.includes(q)) return false;
      }
      return true;
    });
  }, [statusFilter, search, clientById]);

  return (
    <div className="space-y-4">
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-3 shadow-sm">
        <Input
          placeholder="Search invoice # or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v ?? "all") as typeof statusFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Sent">Sent</SelectItem>
            <SelectItem value="Paid">Paid</SelectItem>
            <SelectItem value="Overdue">Overdue</SelectItem>
            <SelectItem value="Void">Void</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs ml-auto">
          {filtered.length} invoices · total{" "}
          <span className="text-brand-charcoal font-semibold">
            {formatCurrency(filtered.reduce((s, i) => s + i.total, 0))}
          </span>
        </span>
        <div className="inline-flex items-center gap-1">
          <Button size="xs" variant="outline" onClick={() => toast.success("Invoices sent")}>
            <Mail className="mr-1 h-3 w-3" />
            Send
          </Button>
          <Button size="xs" variant="outline" onClick={() => toast.success("Marked paid")}>
            Mark Paid
          </Button>
          <Button size="xs" variant="outline" onClick={() => toast.success("Exported CSV")}>
            <Download className="mr-1 h-3 w-3" />
            Export
          </Button>
        </div>
      </div>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase">Invoice #</TableHead>
              <TableHead className="text-[11px] uppercase">Client</TableHead>
              <TableHead className="text-[11px] uppercase">Project</TableHead>
              <TableHead className="text-[11px] uppercase">Issued</TableHead>
              <TableHead className="text-[11px] uppercase">Due</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Subtotal</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Tax</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Paid</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Balance</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((i) => {
              const paid = i.status === "Paid" ? i.total : 0;
              const balance = i.total - paid;
              return (
                <TableRow key={i.id}>
                  <TableCell className="text-brand-navy font-mono text-xs font-semibold">{i.number}</TableCell>
                  <TableCell className="text-xs">{clientById.get(i.clientId)?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {i.projectId ? projectById.get(i.projectId)?.code ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(i.issuedAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(i.dueAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{formatCurrency(i.subtotal)}</TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                    {formatCurrency(i.tax)}
                  </TableCell>
                  <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(i.total)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{formatCurrency(paid)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right text-xs tabular-nums",
                      balance > 0 ? "text-red-600 font-semibold" : "text-emerald-600"
                    )}
                  >
                    {formatCurrency(balance)}
                  </TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", INVOICE_STATUS_STYLE[i.status])}>
                      {i.status}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BILLS
// ────────────────────────────────────────────────────────────────────────────

export function BillsTab() {
  const bills = useMemo(() => buildBills(), []);
  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Bill #</TableHead>
            <TableHead className="text-[11px] uppercase">Vendor</TableHead>
            <TableHead className="text-[11px] uppercase">Date</TableHead>
            <TableHead className="text-[11px] uppercase">Due</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
            <TableHead className="text-[11px] uppercase">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="text-brand-navy font-mono text-xs font-semibold">{b.number}</TableCell>
              <TableCell className="text-xs">{b.vendor}</TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {format(parseISO(b.date), "MMM d, yyyy")}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {format(parseISO(b.due), "MMM d, yyyy")}
              </TableCell>
              <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                {formatCurrency(b.total)}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    b.status === "Paid"
                      ? "bg-emerald-50 text-emerald-700"
                      : b.status === "Overdue"
                        ? "bg-red-50 text-red-700"
                        : b.status === "Partially Paid"
                          ? "bg-amber-50 text-amber-800"
                          : b.status === "Sent"
                            ? "bg-brand-navy/10 text-brand-navy"
                            : "bg-slate-100 text-slate-600"
                  )}
                >
                  {b.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RECEIVABLES (per client)
// ────────────────────────────────────────────────────────────────────────────

export function ReceivablesTab() {
  const today = Date.now();
  const rows = clients
    .map((c) => {
      const open = invoices.filter((i) => i.clientId === c.id && (i.status === "Sent" || i.status === "Overdue"));
      let current = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0;
      for (const inv of open) {
        const days = Math.floor((today - parseISO(inv.dueAt).getTime()) / (1000 * 60 * 60 * 24));
        if (days < 0) current += inv.total;
        else if (days <= 30) b1 += inv.total;
        else if (days <= 60) b2 += inv.total;
        else if (days <= 90) b3 += inv.total;
        else b4 += inv.total;
      }
      return { id: c.id, name: c.name, current, b1, b2, b3, b4, total: current + b1 + b2 + b3 + b4 };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Client</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Current</TableHead>
            <TableHead className="text-right text-[11px] uppercase">1-30</TableHead>
            <TableHead className="text-right text-[11px] uppercase">31-60</TableHead>
            <TableHead className="text-right text-[11px] uppercase">61-90</TableHead>
            <TableHead className="text-right text-[11px] uppercase">90+</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Total Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-xs">
                No open receivables.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{r.name}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.current)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.b1)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.b2)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.b3)}</TableCell>
              <TableCell className={cn("text-right text-xs tabular-nums", r.b4 > 0 && "text-red-600 font-semibold")}>
                {formatCurrency(r.b4)}
              </TableCell>
              <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                {formatCurrency(r.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PAYABLES (per vendor)
// ────────────────────────────────────────────────────────────────────────────

export function PayablesTab() {
  const bills = useMemo(() => buildBills(), []);
  const today = Date.now();
  const map = new Map<string, { current: number; b1: number; b2: number; b3: number; b4: number }>();
  for (const b of bills) {
    if (b.status === "Paid") continue;
    const days = Math.floor((today - parseISO(b.due).getTime()) / (1000 * 60 * 60 * 24));
    const cur = map.get(b.vendor) ?? { current: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    if (days < 0) cur.current += b.total;
    else if (days <= 30) cur.b1 += b.total;
    else if (days <= 60) cur.b2 += b.total;
    else if (days <= 90) cur.b3 += b.total;
    else cur.b4 += b.total;
    map.set(b.vendor, cur);
  }
  const rows = [...map.entries()].map(([vendor, v]) => ({ vendor, ...v, total: v.current + v.b1 + v.b2 + v.b3 + v.b4 }));
  return (
    <Card className="bg-card overflow-hidden p-0 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[11px] uppercase">Vendor</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Current</TableHead>
            <TableHead className="text-right text-[11px] uppercase">1-30</TableHead>
            <TableHead className="text-right text-[11px] uppercase">31-60</TableHead>
            <TableHead className="text-right text-[11px] uppercase">61-90</TableHead>
            <TableHead className="text-right text-[11px] uppercase">90+</TableHead>
            <TableHead className="text-right text-[11px] uppercase">Total Owed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.vendor}>
              <TableCell className="text-xs">{r.vendor}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.current)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.b1)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.b2)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{formatCurrency(r.b3)}</TableCell>
              <TableCell className={cn("text-right text-xs tabular-nums", r.b4 > 0 && "text-red-600 font-semibold")}>
                {formatCurrency(r.b4)}
              </TableCell>
              <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                {formatCurrency(r.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TAX
// ────────────────────────────────────────────────────────────────────────────

export function TaxTab({ range }: TabProps) {
  const { start, end } = rangeBounds(range);
  const tax = useMemo(() => taxSummary(start, end), [range]);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px]">HST Collected</p>
          <p className="text-brand-navy font-serif text-2xl tabular-nums">
            {formatCurrency(tax.hstCollected)}
          </p>
        </Card>
        <Card className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px]">HST Paid (ITCs)</p>
          <p className="text-brand-navy font-serif text-2xl tabular-nums">
            {formatCurrency(tax.hstPaid)}
          </p>
        </Card>
        <Card className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm">
          <p className="text-muted-foreground font-serif text-[11px]">Net HST Payable</p>
          <p
            className={cn(
              "font-serif text-2xl tabular-nums",
              tax.net >= 0 ? "text-red-700" : "text-emerald-700"
            )}
          >
            {formatCurrency(tax.net)}
          </p>
        </Card>
      </div>

      <Card className="p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
              Filing period
            </p>
            <p className="text-brand-navy font-serif text-lg">{tax.filingPeriodLabel}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Ontario HST 13% · CRA Business # 81245-6709 RT0001
            </p>
          </div>
          <Button onClick={() => toast.success("HST return PDF generated")}>
            <FileSignature className="mr-1 h-3.5 w-3.5" />
            Generate HST Return
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// REPORTS
// ────────────────────────────────────────────────────────────────────────────

export function ReportsTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {REPORT_CATALOG.map((r) => (
        <Card key={r.id} className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm transition-shadow hover:shadow-md">
          <h3 className="text-brand-navy font-serif text-base">{r.name}</h3>
          <p className="text-muted-foreground mt-1 text-xs">{r.description}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="xs" onClick={() => toast.success(`${r.name} generated`)}>
              <Printer className="mr-1 h-3 w-3" />
              Generate
            </Button>
            <Button size="xs" variant="outline" onClick={() => toast.info(`${r.name} scheduled`)}>
              Schedule
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sync footer
// ────────────────────────────────────────────────────────────────────────────

export function SyncFooter() {
  return (
    <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3 shadow-sm">
      <p className="text-muted-foreground text-xs">
        Connected accounting · last sync 2 hours ago
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            toast.success("Synced 47 records to QuickBooks Online", {
              description: "Invoices, bills, and tax mappings updated.",
            })
          }
        >
          Sync with QuickBooks
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            toast.success("Synced 31 records to Xero")
          }
        >
          Sync with Xero
        </Button>
      </div>
    </div>
  );
}
