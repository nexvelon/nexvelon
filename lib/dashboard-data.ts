import { differenceInCalendarDays, parseISO } from "date-fns";
import { invoices } from "./mock-data/invoices";
import { quotes } from "./mock-data/quotes";
import { projects } from "./mock-data/projects";
import { clients } from "./mock-data/clients";
import { products } from "./mock-data/products";
import { users } from "./mock-data/users";
import type { Vendor } from "./types";

// Anchor "today" so the demo is deterministic regardless of when judges open it.
export const TODAY = new Date("2026-04-30T12:00:00");

export type RangeKey = "today" | "7d" | "mtd" | "qtd" | "ytd" | "custom";

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  "7d": "7d",
  mtd: "MTD",
  qtd: "QTD",
  ytd: "YTD",
  custom: "Custom",
};

interface Range {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

export function rangeFor(key: RangeKey, anchor: Date = TODAY): Range {
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);
  let start = new Date(anchor);
  start.setHours(0, 0, 0, 0);

  switch (key) {
    case "today":
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "mtd":
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      break;
    case "qtd": {
      const q = Math.floor(anchor.getMonth() / 3);
      start = new Date(anchor.getFullYear(), q * 3, 1);
      break;
    }
    case "ytd":
      start = new Date(anchor.getFullYear(), 0, 1);
      break;
    case "custom":
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      break;
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

// Mock operating-cost ratios held constant for demo purposes.
const COGS_RATIO = 0.62;
const OPEX_RATIO = 0.18;

interface KpiSnapshot {
  revenue: number;
  cogs: number;
  opex: number;
  ebitda: number;
  grossMargin: number;
  openQuotes: { count: number; total: number };
  activeProjects: {
    count: number;
    inProgress: number;
    onHold: number;
    atRisk: number;
  };
  overdueInvoices: { count: number; total: number };
}

function paidRevenue(start: Date, end: Date): number {
  return invoices
    .filter((i) => i.status === "Paid" && i.paidAt && within(i.paidAt, start, end))
    .reduce((s, i) => s + i.total, 0);
}

// "At Risk" can be either an explicit status the PM has set, or a derived
// flag based on schedule/budget pressure on a still-In-Progress project.
export function isAtRisk(p: (typeof projects)[number]): boolean {
  if (p.status === "At Risk") return true;
  if (p.status !== "In Progress") return false;
  const days = differenceInCalendarDays(parseISO(p.targetDate), TODAY);
  if (days < 30 && p.progress < 70) return true;
  if (p.budget > 0 && p.spent / p.budget > 0.85 && p.progress < 85) return true;
  return false;
}

export function buildKpis(rangeKey: RangeKey): {
  current: KpiSnapshot;
  previous: KpiSnapshot;
  delta: { revenue: number; ebitda: number; grossMargin: number };
} {
  const { start, end, prevStart, prevEnd } = rangeFor(rangeKey);

  const snap = (s: Date, e: Date): KpiSnapshot => {
    const revenue = paidRevenue(s, e);
    const cogs = revenue * COGS_RATIO;
    const opex = revenue * OPEX_RATIO;
    const ebitda = revenue - cogs - opex;
    const grossMargin = revenue === 0 ? 0 : (revenue - cogs) / revenue;

    const openStatuses = new Set(["Draft", "Sent"]);
    const open = quotes.filter((q) => openStatuses.has(q.status));

    const ACTIVE_STATUSES = new Set([
      "Planning",
      "Scheduled",
      "In Progress",
      "On Hold",
      "At Risk",
      "Commissioning",
    ]);
    const active = projects.filter((p) => ACTIVE_STATUSES.has(p.status));
    const inProgress = active.filter(
      (p) =>
        (p.status === "In Progress" || p.status === "Commissioning") &&
        !isAtRisk(p)
    ).length;
    const onHold = active.filter((p) => p.status === "On Hold").length;
    const atRisk = active.filter((p) => isAtRisk(p)).length;

    const overdue = invoices.filter((i) => i.status === "Overdue");

    return {
      revenue,
      cogs,
      opex,
      ebitda,
      grossMargin,
      openQuotes: { count: open.length, total: open.reduce((sum, q) => sum + q.total, 0) },
      activeProjects: { count: active.length, inProgress, onHold, atRisk },
      overdueInvoices: { count: overdue.length, total: overdue.reduce((s, i) => s + i.total, 0) },
    };
  };

  const current = snap(start, end);
  const previous = snap(prevStart, prevEnd);

  const pctDelta = (a: number, b: number) =>
    b === 0 ? (a === 0 ? 0 : 1) : (a - b) / Math.abs(b);

  return {
    current,
    previous,
    delta: {
      revenue: pctDelta(current.revenue, previous.revenue),
      ebitda: pctDelta(current.ebitda, previous.ebitda),
      grossMargin: current.grossMargin - previous.grossMargin,
    },
  };
}

export interface MonthlyTrendPoint {
  label: string;
  revenue: number;
  ebitda: number;
}

export function trailing12MonthsTrend(): MonthlyTrendPoint[] {
  const months: MonthlyTrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const revenue = paidRevenue(start, end);
    const ebitda = revenue * (1 - COGS_RATIO - OPEX_RATIO);
    const label = d.toLocaleString("en-US", { month: "short" });
    months.push({ label, revenue, ebitda });
  }
  return months;
}

export interface FunnelStage {
  name: string;
  value: number;
  fill: string;
}

export function pipelineFunnel(): FunnelStage[] {
  const quoted = quotes
    .filter((q) => q.status === "Sent" || q.status === "Draft")
    .reduce((s, q) => s + q.total, 0);
  const approved = quotes
    .filter((q) => q.status === "Approved")
    .reduce((s, q) => s + q.total, 0);
  const inProgress = projects
    .filter((p) => p.status === "In Progress" || p.status === "Planning")
    .reduce((s, p) => s + (p.budget - p.spent), 0);
  const completed = projects
    .filter((p) => p.status === "Completed")
    .reduce((s, p) => s + p.budget, 0);
  const lead = Math.round(quoted * 1.6 + 240000);

  return [
    { name: "Lead", value: lead, fill: "#1A2C57" },
    { name: "Quoted", value: Math.round(quoted), fill: "#0B1B3B" },
    { name: "Approved", value: Math.round(approved), fill: "#475569" },
    { name: "In Progress", value: Math.round(inProgress), fill: "#C9A24B" },
    { name: "Completed", value: Math.round(completed), fill: "#94835B" },
  ];
}

export interface ActivityEvent {
  id: string;
  kind: "quote" | "invoice" | "project" | "po";
  message: string;
  detail?: string;
  amount?: number;
  timestamp: Date;
}

export function recentActivity(limit = 10): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const q of quotes) {
    const client = clients.find((c) => c.id === q.clientId);
    if (q.status === "Sent" || q.status === "Approved") {
      events.push({
        id: `q-${q.id}-${q.status}`,
        kind: "quote",
        message:
          q.status === "Approved"
            ? `Quote ${q.number} accepted by ${client?.name}`
            : `Quote ${q.number} sent to ${client?.name}`,
        amount: q.total,
        timestamp: parseISO(q.createdAt),
      });
    }
  }

  for (const inv of invoices) {
    const client = clients.find((c) => c.id === inv.clientId);
    if (inv.status === "Paid" && inv.paidAt) {
      events.push({
        id: `i-${inv.id}-paid`,
        kind: "invoice",
        message: `Invoice ${inv.number} paid by ${client?.name}`,
        amount: inv.total,
        timestamp: parseISO(inv.paidAt),
      });
    } else if (inv.status === "Overdue") {
      events.push({
        id: `i-${inv.id}-over`,
        kind: "invoice",
        message: `Invoice ${inv.number} flagged overdue (${client?.name})`,
        amount: inv.total,
        timestamp: parseISO(inv.dueAt),
      });
    } else if (inv.status === "Sent") {
      events.push({
        id: `i-${inv.id}-sent`,
        kind: "invoice",
        message: `Invoice ${inv.number} issued to ${client?.name}`,
        amount: inv.total,
        timestamp: parseISO(inv.issuedAt),
      });
    }
  }

  for (const p of projects) {
    if (p.status === "Completed") {
      events.push({
        id: `p-${p.id}-comp`,
        kind: "project",
        message: `Project ${p.name} commissioned`,
        timestamp: parseISO(p.targetDate),
      });
    } else if (p.status === "In Progress" && p.progress >= 50) {
      events.push({
        id: `p-${p.id}-mile`,
        kind: "project",
        message: `${p.name} crossed ${p.progress}% completion`,
        timestamp: parseISO(p.startDate),
      });
    }
  }

  // A handful of synthetic PO receipts to round out the feed.
  events.push(
    {
      id: "po-1",
      kind: "po",
      message: "PO to Anixter received — 28 Avigilon H6A bullets",
      timestamp: new Date("2026-04-28T09:14:00"),
    },
    {
      id: "po-2",
      kind: "po",
      message: "PO to ADI received — Kantech ioSmart readers (×24)",
      timestamp: new Date("2026-04-26T15:32:00"),
    },
    {
      id: "po-3",
      kind: "po",
      message: "PO to CDW received — Axis Q6225-LE PTZ (×4)",
      timestamp: new Date("2026-04-22T11:08:00"),
    }
  );

  return events
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

export interface TopClientRow {
  id: string;
  name: string;
  type: string;
  projectCount: number;
  revenue: number;
  lastActivity: Date;
}

export function topClientsYTD(limit = 5): TopClientRow[] {
  const startOfYear = new Date(TODAY.getFullYear(), 0, 1);
  const rows: TopClientRow[] = clients.map((c) => {
    const ytdRevenue = invoices
      .filter(
        (i) =>
          i.clientId === c.id &&
          i.status === "Paid" &&
          i.paidAt &&
          parseISO(i.paidAt) >= startOfYear
      )
      .reduce((s, i) => s + i.total, 0);
    const projectCount = projects.filter((p) => p.clientId === c.id).length;
    const lastInvoice = invoices
      .filter((i) => i.clientId === c.id)
      .sort(
        (a, b) =>
          parseISO(b.issuedAt).getTime() - parseISO(a.issuedAt).getTime()
      )[0];
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      projectCount,
      revenue: ytdRevenue,
      lastActivity: lastInvoice ? parseISO(lastInvoice.issuedAt) : parseISO(c.createdAt),
    };
  });

  return rows
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export interface VendorStockSlice {
  vendor: Vendor;
  value: number;
  fill: string;
}

const VENDOR_FILL: Record<Vendor, string> = {
  ADI: "#0B1B3B",
  Anixter: "#C9A24B",
  Wesco: "#475569",
  CDW: "#94A3B8",
  Provo: "#1F2937",
};

export function inventoryByVendor(): VendorStockSlice[] {
  const map = new Map<Vendor, number>();
  for (const p of products) {
    map.set(p.vendor, (map.get(p.vendor) ?? 0) + p.cost * p.stock);
  }
  return [...map.entries()].map(([vendor, value]) => ({
    vendor,
    value: Math.round(value),
    fill: VENDOR_FILL[vendor],
  }));
}

export function lowStockAlerts(limit = 6): {
  id: string;
  sku: string;
  name: string;
  stock: number;
  reorderPoint: number;
  vendor: Vendor;
}[] {
  return products
    .filter((p) => p.stock <= p.reorderPoint)
    .sort((a, b) => a.stock / a.reorderPoint - b.stock / b.reorderPoint)
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock: p.stock,
      reorderPoint: p.reorderPoint,
      vendor: p.vendor,
    }));
}

export interface UtilizationRow {
  id: string;
  name: string;
  role: string;
  utilization: number;
  capacityHours: number;
  billableHours: number;
}

// Deterministic pseudo-utilization — anchored to user IDs so the demo
// is consistent across reloads without a separate timesheet table.
const FIELD_ROLES = new Set(["Technician", "Subcontractor", "ProjectManager"]);

export function technicianUtilization(): UtilizationRow[] {
  const seed = (s: string) =>
    [...s].reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) % 1000, 7);

  return users
    .filter((u) => FIELD_ROLES.has(u.role))
    .map((u) => {
      const capacity = 40;
      const utilization = 0.42 + (seed(u.id) / 1000) * 0.55;
      const clamped = Math.min(0.99, Math.max(0.32, utilization));
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        utilization: clamped,
        capacityHours: capacity,
        billableHours: Math.round(capacity * clamped),
      };
    })
    .sort((a, b) => b.utilization - a.utilization);
}
