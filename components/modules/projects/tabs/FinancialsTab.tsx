"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/lib/role-context";
import { useThemeColors } from "@/lib/theme-context";
import { invoices } from "@/lib/mock-data/invoices";
import { products } from "@/lib/mock-data/products";
import { TODAY } from "@/lib/dashboard-data";
import { buildMaterials, buildPOs, buildTimeEntries } from "@/lib/project-data";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InvoiceStatus, Project } from "@/lib/types";

interface Props {
  project: Project;
}

const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Sent: "bg-brand-navy/10 text-brand-navy",
  Paid: "bg-emerald-50 text-emerald-700",
  Overdue: "bg-red-50 text-red-700",
  Void: "bg-slate-100 text-slate-400 line-through",
};

export function FinancialsTab({ project }: Props) {
  return (
    <Can
      resource="financials"
      action="view"
      fallback={
        <Card className="bg-muted/40 border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="bg-brand-charcoal/5 text-brand-charcoal/50 flex h-12 w-12 items-center justify-center rounded-full">
              <Lock className="h-5 w-5" />
            </div>
            <h3 className="text-brand-navy font-serif text-lg">
              Restricted
            </h3>
            <p className="text-muted-foreground max-w-md text-xs">
              Financial detail is hidden for the current role. Contact your
              administrator or switch to Admin / Project Manager / Accountant
              to view this tab.
            </p>
          </CardContent>
        </Card>
      }
    >
      <FinancialsContent project={project} />
    </Can>
  );
}

function FinancialsContent({ project }: { project: Project }) {
  const t = useThemeColors();
  const projectInvoices = useMemo(
    () => invoices.filter((i) => i.projectId === project.id),
    [project.id]
  );
  const materials = useMemo(() => buildMaterials(project), [project]);
  const pos = useMemo(() => buildPOs(project), [project]);
  const time = useMemo(() => buildTimeEntries(project), [project]);
  const productById = new Map(products.map((p) => [p.id, p]));

  const billed = projectInvoices.reduce((s, i) => s + i.total, 0);
  const collected = projectInvoices
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + i.total, 0);

  const materialsCost = materials.reduce((s, m) => {
    const prod = productById.get(m.productId);
    return s + (prod ? prod.cost * m.qtyUsed : 0);
  }, 0);
  const laborCost = time.reduce((s, t) => s + t.hours * t.costRate, 0);
  const subcontractorCost = pos.reduce(
    (s, po) => s + po.items.reduce((c, it) => c + it.qty * it.cost * 0.05, 0),
    0
  );
  const otherCost = project.spent * 0.08;
  const costToDate = materialsCost + laborCost + subcontractorCost + otherCost;
  const eac =
    project.progress > 0
      ? Math.round(costToDate / (project.progress / 100))
      : Math.round(project.budget * 0.78);
  const projectedMargin = project.budget === 0 ? 0 : (project.budget - eac) / project.budget;
  const cashPosition = collected - costToDate;

  const cards: Array<{ label: string; value: string; tone?: "good" | "bad" }> = [
    { label: "Contract value", value: formatCurrency(project.budget) },
    { label: "Change orders", value: formatCurrency(project.changeOrders ?? 0) },
    { label: "Total billed", value: formatCurrency(billed) },
    { label: "Total collected", value: formatCurrency(collected) },
    { label: "Costs to date", value: formatCurrency(costToDate) },
    { label: "Estimated cost @ completion", value: formatCurrency(eac) },
    {
      label: "Projected margin",
      value: formatPercent(projectedMargin),
      tone: projectedMargin >= 0.18 ? "good" : "bad",
    },
    {
      label: "Cash position",
      value: formatCurrency(cashPosition),
      tone: cashPosition >= 0 ? "good" : "bad",
    },
  ];

  // Cumulative billed vs. cost mini chart
  const trend = useMemo(() => buildCostTrend(project), [project]);

  const costRows = [
    { label: "Materials", budget: project.budget * 0.42, actual: materialsCost },
    { label: "Labor", budget: project.budget * 0.32, actual: laborCost },
    { label: "Subcontractor", budget: project.budget * 0.12, actual: subcontractorCost },
    { label: "Other", budget: project.budget * 0.06, actual: otherCost },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-t-2 border-t-[#C9A24B] p-4 shadow-sm">
            <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
              {c.label}
            </p>
            <p
              className={cn(
                "font-serif text-xl tabular-nums",
                c.tone === "good" && "text-emerald-600",
                c.tone === "bad" && "text-red-600",
                !c.tone && "text-brand-navy"
              )}
            >
              {c.value}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">
            Cumulative billed vs. cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke={t.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: t.chartTertiary, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: t.chartTertiary, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                  width={60}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: unknown) => formatCurrency(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="cost" name="Cumulative cost" fill={t.chartTertiary} radius={[3, 3, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="billed"
                  name="Cumulative billed"
                  stroke={t.accent}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: t.accent }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Costs by category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {costRows.map((c) => {
            const variance = c.budget - c.actual;
            const pct = c.budget === 0 ? 0 : Math.min(120, (c.actual / c.budget) * 100);
            return (
              <div key={c.label}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-brand-charcoal font-medium">{c.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatCurrency(c.actual)} of {formatCurrency(c.budget)}
                    <span
                      className={cn(
                        "ml-2 font-semibold",
                        variance >= 0 ? "text-emerald-600" : "text-red-600"
                      )}
                    >
                      {variance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(variance))}
                    </span>
                  </span>
                </div>
                <div className="bg-muted mt-1 h-2 w-full overflow-hidden rounded-full">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pct > 100 ? "bg-red-500" : "bg-brand-gold"
                    )}
                    style={{ width: `${Math.min(100, pct)}%`, transition: "width 0.4s ease" }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Invoices issued</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] uppercase">Invoice #</TableHead>
                <TableHead className="text-[11px] uppercase">Issued</TableHead>
                <TableHead className="text-[11px] uppercase">Due</TableHead>
                <TableHead className="text-right text-[11px] uppercase">Total</TableHead>
                <TableHead className="text-[11px] uppercase">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-6 text-center text-xs">
                    No invoices issued yet for this project.
                  </TableCell>
                </TableRow>
              )}
              {projectInvoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-brand-navy font-mono text-xs font-semibold">
                    {i.number}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(i.issuedAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(i.dueAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-brand-navy text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(i.total)}
                  </TableCell>
                  <TableCell>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", INVOICE_STATUS_STYLE[i.status])}>
                      {i.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface TrendPoint {
  label: string;
  cost: number;
  billed: number;
}

function buildCostTrend(project: Project): TrendPoint[] {
  const start = parseISO(project.startDate);
  const totalDays = Math.max(
    1,
    (parseISO(project.targetDate).getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const todayDays = Math.max(0, (TODAY.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const points: TrendPoint[] = [];
  for (let i = 0; i <= 6; i++) {
    const ratio = i / 6;
    const date = new Date(start.getTime() + ratio * totalDays * 24 * 60 * 60 * 1000);
    if (date > TODAY && i > 0 && (i - 1) / 6 > todayDays / totalDays) break;
    const fromToday = Math.min(1, (ratio * totalDays) / Math.max(1, todayDays));
    points.push({
      label: format(date, "MMM yyyy"),
      cost: Math.round(project.spent * fromToday * (0.9 + ratio * 0.1)),
      billed: Math.round(project.budget * fromToday * 0.92),
    });
  }
  return points;
}
