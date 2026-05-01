import { addDays, parseISO, startOfMonth, startOfQuarter, startOfYear, subMonths } from "date-fns";
import { TODAY } from "./dashboard-data";
import { invoices } from "./mock-data/invoices";
import { projects } from "./mock-data/projects";
import { clients } from "./mock-data/clients";
import { VENDOR_DIRECTORY } from "./inventory-data";
import { buildPOs, buildTimeEntries } from "./project-data";

export type FinRange = "month" | "qtd" | "ytd" | "lastYear" | "custom";

export const FIN_RANGE_LABEL: Record<FinRange, string> = {
  month: "This Month",
  qtd: "QTD",
  ytd: "YTD",
  lastYear: "Last Year",
  custom: "Custom",
};

export function rangeBounds(r: FinRange): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const end = TODAY;
  let start: Date;
  switch (r) {
    case "month":
      start = startOfMonth(TODAY);
      break;
    case "qtd":
      start = startOfQuarter(TODAY);
      break;
    case "lastYear":
      start = new Date(TODAY.getFullYear() - 1, 0, 1);
      break;
    case "custom":
      start = subMonths(TODAY, 1);
      break;
    case "ytd":
    default:
      start = startOfYear(TODAY);
  }
  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - span);
  return { start, end, prevStart, prevEnd };
}

function within(iso: string, start: Date, end: Date): boolean {
  const t = parseISO(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export interface PnL {
  revenue: {
    installation: number;
    serviceContracts: number;
    monitoring: number;
    parts: number;
    total: number;
  };
  cogs: { materials: number; labor: number; subcontractor: number; total: number };
  grossProfit: number;
  opex: {
    salaries: number;
    vehicles: number;
    insurance: number;
    rent: number;
    utilities: number;
    software: number;
    marketing: number;
    admin: number;
    total: number;
  };
  ebitda: number;
  depreciation: number;
  ebit: number;
  interest: number;
  preTax: number;
  tax: number;
  netIncome: number;
}

export function buildPnL(start: Date, end: Date): PnL {
  const collected = invoices
    .filter((i) => i.status === "Paid" && i.paidAt && within(i.paidAt, start, end))
    .reduce((s, i) => s + i.total, 0);

  const installation = collected * 0.66;
  const serviceContracts = collected * 0.18;
  const monitoring = collected * 0.10;
  const parts = collected * 0.06;
  const totalRev = installation + serviceContracts + monitoring + parts;

  const materials = totalRev * 0.34;
  const labor = totalRev * 0.21;
  const subcontractor = totalRev * 0.07;
  const totalCogs = materials + labor + subcontractor;
  const grossProfit = totalRev - totalCogs;

  const salaries = totalRev * 0.18;
  const vehicles = totalRev * 0.025;
  const insurance = totalRev * 0.01;
  const rent = totalRev * 0.018;
  const utilities = totalRev * 0.006;
  const software = totalRev * 0.012;
  const marketing = totalRev * 0.011;
  const admin = totalRev * 0.014;
  const totalOpex = salaries + vehicles + insurance + rent + utilities + software + marketing + admin;

  const ebitda = grossProfit - totalOpex;
  const depreciation = totalRev * 0.014;
  const ebit = ebitda - depreciation;
  const interest = totalRev * 0.005;
  const preTax = ebit - interest;
  const tax = preTax > 0 ? preTax * 0.265 : 0;
  const netIncome = preTax - tax;

  return {
    revenue: { installation, serviceContracts, monitoring, parts, total: totalRev },
    cogs: { materials, labor, subcontractor, total: totalCogs },
    grossProfit,
    opex: { salaries, vehicles, insurance, rent, utilities, software, marketing, admin, total: totalOpex },
    ebitda,
    depreciation,
    ebit,
    interest,
    preTax,
    tax,
    netIncome,
  };
}

export interface KPIBlock {
  label: string;
  value: number;
  prior: number;
  format: "currency" | "percent";
}

export function buildKpiBlocks(range: FinRange): KPIBlock[] {
  const { start, end, prevStart, prevEnd } = rangeBounds(range);
  const cur = buildPnL(start, end);
  const prev = buildPnL(prevStart, prevEnd);
  return [
    { label: "Revenue", value: cur.revenue.total, prior: prev.revenue.total, format: "currency" },
    { label: "COGS", value: cur.cogs.total, prior: prev.cogs.total, format: "currency" },
    { label: "Gross Profit", value: cur.grossProfit, prior: prev.grossProfit, format: "currency" },
    { label: "Operating Expenses", value: cur.opex.total, prior: prev.opex.total, format: "currency" },
    { label: "EBITDA", value: cur.ebitda, prior: prev.ebitda, format: "currency" },
    { label: "Net Profit", value: cur.netIncome, prior: prev.netIncome, format: "currency" },
  ];
}

export interface RevenueTrendPoint {
  label: string;
  revenue: number;
  ebitda: number;
}

export function trailingRevenue(months = 12): RevenueTrendPoint[] {
  const out: RevenueTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
    const start = startOfMonth(d);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const collected = invoices
      .filter((inv) => inv.status === "Paid" && inv.paidAt && within(inv.paidAt, start, end))
      .reduce((s, inv) => s + inv.total, 0);
    out.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      revenue: Math.round(collected),
      ebitda: Math.round(collected * 0.20),
    });
  }
  return out;
}

export interface CashflowPoint {
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
}

export function cashflowTrend(months = 12): CashflowPoint[] {
  const out: CashflowPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
    const start = startOfMonth(d);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const cashIn = Math.round(
      invoices
        .filter((inv) => inv.status === "Paid" && inv.paidAt && within(inv.paidAt, start, end))
        .reduce((s, inv) => s + inv.total, 0)
    );
    const cashOut = Math.round(cashIn * 0.78);
    out.push({
      label: d.toLocaleString("en-US", { month: "short" }),
      cashIn,
      cashOut,
      net: cashIn - cashOut,
    });
  }
  return out;
}

export interface ARAgingBucket {
  bucket: string;
  current: number;
  past1_30: number;
  past31_60: number;
  past61_90: number;
  past90: number;
}

export function arAging(): ARAgingBucket[] {
  const buckets = [
    { name: "Total AR", values: [0, 0, 0, 0, 0] },
  ];
  const today = TODAY.getTime();
  for (const inv of invoices) {
    if (inv.status !== "Sent" && inv.status !== "Overdue") continue;
    const due = parseISO(inv.dueAt).getTime();
    const days = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    const idx = days < 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    buckets[0].values[idx] += inv.total;
  }
  return [
    {
      bucket: "Total AR",
      current: buckets[0].values[0],
      past1_30: buckets[0].values[1],
      past31_60: buckets[0].values[2],
      past61_90: buckets[0].values[3],
      past90: buckets[0].values[4],
    },
  ];
}

export interface TopClientRevenueRow {
  id: string;
  name: string;
  revenue: number;
  invoices: number;
}

export function topClientsByRevenue(start: Date, end: Date, limit = 10): TopClientRevenueRow[] {
  const map = new Map<string, { revenue: number; invoices: number }>();
  for (const inv of invoices) {
    if (inv.status !== "Paid") continue;
    if (!inv.paidAt) continue;
    if (!within(inv.paidAt, start, end)) continue;
    const cur = map.get(inv.clientId) ?? { revenue: 0, invoices: 0 };
    cur.revenue += inv.total;
    cur.invoices += 1;
    map.set(inv.clientId, cur);
  }
  return [...map.entries()]
    .map(([id, v]) => ({
      id,
      name: clients.find((c) => c.id === id)?.name ?? "—",
      revenue: v.revenue,
      invoices: v.invoices,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export interface ExpenseCategorySlice {
  name: string;
  value: number;
  fill: string;
}

export function topExpenseCategories(pnl: PnL): ExpenseCategorySlice[] {
  return [
    { name: "Materials", value: Math.round(pnl.cogs.materials), fill: "#0B1B3B" },
    { name: "Labor", value: Math.round(pnl.cogs.labor), fill: "#475569" },
    { name: "Subcontractor", value: Math.round(pnl.cogs.subcontractor), fill: "#94A3B8" },
    { name: "Salaries", value: Math.round(pnl.opex.salaries), fill: "#C9A24B" },
    { name: "Vehicles", value: Math.round(pnl.opex.vehicles), fill: "#1F2937" },
    { name: "Other OpEx", value: Math.round(pnl.opex.total - pnl.opex.salaries - pnl.opex.vehicles), fill: "#94835B" },
  ].filter((s) => s.value > 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Bills (AP)
// ────────────────────────────────────────────────────────────────────────────

export interface VendorBill {
  id: string;
  number: string;
  vendor: string;
  date: string;
  due: string;
  total: number;
  status: "Draft" | "Sent" | "Partially Paid" | "Paid" | "Overdue";
}

export function buildBills(): VendorBill[] {
  const out: VendorBill[] = [];
  let n = 0;
  for (const v of VENDOR_DIRECTORY) {
    for (let i = 0; i < 6; i++) {
      const date = addDays(TODAY, -i * 16 - (n % 5));
      const due = addDays(date, 30);
      const total = 4_000 + (((n + i) * 1731) % 18_000);
      const status: VendorBill["status"] =
        n % 7 === 0
          ? "Overdue"
          : n % 5 === 0
            ? "Partially Paid"
            : n % 3 === 0
              ? "Paid"
              : "Sent";
      out.push({
        id: `bill-${n}`,
        number: `BILL-${v.name.slice(0, 3).toUpperCase()}-${(1000 + n).toString()}`,
        vendor: v.name,
        date: date.toISOString().slice(0, 10),
        due: due.toISOString().slice(0, 10),
        total,
        status,
      });
      n++;
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ────────────────────────────────────────────────────────────────────────────
// Tax — Ontario HST 13%
// ────────────────────────────────────────────────────────────────────────────

export interface TaxSummary {
  hstCollected: number;
  hstPaid: number;
  net: number;
  filingPeriodLabel: string;
}

export function taxSummary(start: Date, end: Date): TaxSummary {
  const hstCollected = invoices
    .filter((inv) => inv.paidAt && within(inv.paidAt, start, end))
    .reduce((s, inv) => s + inv.tax, 0);
  // Estimate HST paid (ITCs) at 6% of materials+overhead.
  const allPOs = projects.flatMap((p) => buildPOs(p));
  const hstPaid =
    allPOs.reduce(
      (s, po) => s + po.items.reduce((c, it) => c + it.cost * it.qty, 0),
      0
    ) * 0.13;
  return {
    hstCollected: Math.round(hstCollected),
    hstPaid: Math.round(hstPaid),
    net: Math.round(hstCollected - hstPaid),
    filingPeriodLabel: `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Reports list
// ────────────────────────────────────────────────────────────────────────────

export const REPORT_CATALOG = [
  {
    id: "report-job-profit",
    name: "Job Profitability Report",
    description: "Per-project margin showing revenue, COGS, and net contribution.",
  },
  {
    id: "report-wip",
    name: "WIP Report",
    description: "Work-in-progress, billed-to-date, and earned revenue across active projects.",
  },
  {
    id: "report-margin",
    name: "Project Margin Analysis",
    description: "Margin trend by PM, system type, and client tier.",
  },
  {
    id: "report-sales-rep",
    name: "Sales by Rep",
    description: "Pipeline, closed-won and weighted forecast per sales representative.",
  },
  {
    id: "report-sales-system",
    name: "Sales by System Type",
    description: "Revenue mix across Access, CCTV, Intrusion, Intercom, and Fire.",
  },
  {
    id: "report-renewals",
    name: "Service Contract Renewals",
    description: "All recurring service agreements with renewal windows and ARR.",
  },
  {
    id: "report-sub-spend",
    name: "Subcontractor Spend",
    description: "YTD spend by subcontractor with project allocations.",
  },
  {
    id: "report-inventory",
    name: "Inventory Valuation",
    description: "Stock value at cost across all locations, by category and vendor.",
  },
  {
    id: "report-custom",
    name: "Custom Report Builder",
    description: "Drag fields, group, filter, and save your own report templates.",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Cash flow rows for the Cash Flow tab
// ────────────────────────────────────────────────────────────────────────────

export interface CashFlowSection {
  title: string;
  rows: { label: string; value: number }[];
}

export function buildCashFlow(start: Date, end: Date): CashFlowSection[] {
  const pnl = buildPnL(start, end);
  return [
    {
      title: "Operating Activities",
      rows: [
        { label: "Net income", value: pnl.netIncome },
        { label: "Depreciation & amortization", value: pnl.depreciation },
        { label: "Increase in accounts receivable", value: -pnl.revenue.total * 0.08 },
        { label: "Increase in inventory", value: -pnl.cogs.materials * 0.05 },
        { label: "Increase in accounts payable", value: pnl.cogs.materials * 0.04 },
        { label: "Cash from operating activities", value: pnl.netIncome + pnl.depreciation - pnl.revenue.total * 0.08 - pnl.cogs.materials * 0.01 },
      ],
    },
    {
      title: "Investing Activities",
      rows: [
        { label: "Equipment & vehicle purchases", value: -pnl.revenue.total * 0.025 },
        { label: "Software capitalisation", value: -pnl.revenue.total * 0.005 },
        { label: "Cash from investing", value: -pnl.revenue.total * 0.030 },
      ],
    },
    {
      title: "Financing Activities",
      rows: [
        { label: "Term loan repayment", value: -pnl.revenue.total * 0.012 },
        { label: "Owner distributions", value: -pnl.revenue.total * 0.008 },
        { label: "Cash from financing", value: -pnl.revenue.total * 0.020 },
      ],
    },
  ];
}

// Hint-only helper; signal that addDays is exported only for ts-rest reuse.
export { buildTimeEntries };
