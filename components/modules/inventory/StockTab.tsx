"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { products } from "@/lib/mock-data/products";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  WAREHOUSE_LOCATIONS,
  locationBreakdown,
  movementHistory,
  stockStatus,
  totalAllocated,
} from "@/lib/inventory-data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  Product,
  ProductCategory,
  Vendor,
  WarehouseLocation,
} from "@/lib/types";

const VENDORS: ("All" | Vendor)[] = ["All", "ADI", "Anixter", "Wesco", "CDW", "Provo"];
const CATEGORIES: ("All" | ProductCategory)[] = [
  "All",
  "Access Control",
  "CCTV",
  "Intrusion",
  "Intercom",
  "Cabling",
  "Power",
  "Network",
  "Networking",
  "Racks",
  "Accessories",
];
const LOCATIONS: ("All" | WarehouseLocation)[] = ["All", ...WAREHOUSE_LOCATIONS];
const STATUSES = ["All", "In Stock", "Low", "Out", "Overstock"] as const;

export function StockTab() {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");

  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>("All");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [location, setLocation] = useState<(typeof LOCATIONS)[number]>("All");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All");
  const [sortKey, setSortKey] = useState<"sku" | "available" | "value">("sku");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const dirty =
    search !== "" ||
    vendor !== "All" ||
    category !== "All" ||
    location !== "All" ||
    status !== "All";

  const rows = useMemo(() => {
    const out = products.filter((p) => {
      if (vendor !== "All" && p.vendor !== vendor) return false;
      if (category !== "All" && p.category !== category) return false;
      if (location !== "All") {
        const breakdown = locationBreakdown(p);
        if ((breakdown[location] ?? 0) === 0) return false;
      }
      if (status !== "All" && stockStatus(p) !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.sku.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
    return [...out].sort((a, b) => {
      if (sortKey === "available") {
        return (b.stock - totalAllocated(b.id)) - (a.stock - totalAllocated(a.id));
      }
      if (sortKey === "value") {
        return b.stock * b.cost - a.stock * a.cost;
      }
      return a.sku.localeCompare(b.sku);
    });
  }, [search, vendor, category, location, status, sortKey]);

  const reorder = (p: Product) =>
    toast.success(`Drafted PO for ${p.sku}`, {
      description: `Reorder qty ${p.reorderQty ?? p.reorderPoint * 2} → ${p.vendor}.`,
    });

  return (
    <div className="space-y-4">
      <Card className="bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search SKU or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="md:col-span-2">
            <Select value={vendor} onValueChange={(v) => setVendor((v ?? "All") as typeof vendor)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENDORS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v === "All" ? "All vendors" : v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={category} onValueChange={(v) => setCategory((v ?? "All") as typeof category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === "All" ? "All categories" : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={location} onValueChange={(v) => setLocation((v ?? "All") as typeof location)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l === "All" ? "All locations" : l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Select value={status} onValueChange={(v) => setStatus((v ?? "All") as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "All" ? "All stock states" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {dirty && (
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setVendor("All");
                setCategory("All");
                setLocation("All");
                setStatus("All");
              }}
              className="text-muted-foreground hover:text-brand-charcoal inline-flex items-center gap-1 text-xs"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          </div>
        )}
      </Card>

      <Card className="bg-card overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-7"></TableHead>
              <TableHead className="text-[11px] uppercase">SKU</TableHead>
              <TableHead className="text-[11px] uppercase">Description</TableHead>
              <TableHead className="text-[11px] uppercase">Vendor</TableHead>
              <TableHead className="text-[11px] uppercase">Category</TableHead>
              <TableHead className="text-[11px] uppercase">Mfr</TableHead>
              <TableHead className="text-right text-[11px] uppercase">On Hand</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Allocated</TableHead>
              <TableHead className="cursor-pointer text-right text-[11px] uppercase" onClick={() => setSortKey("available")}>Available</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Reorder Pt</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Reorder Qty</TableHead>
              {showCost && <TableHead className="text-right text-[11px] uppercase">Avg Cost</TableHead>}
              {showCost && <TableHead className="cursor-pointer text-right text-[11px] uppercase" onClick={() => setSortKey("value")}>Total Value</TableHead>}
              <TableHead className="text-[11px] uppercase">Last Received</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={showCost ? 15 : 13} className="text-muted-foreground py-8 text-center text-sm">
                  No items match the current filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => {
              const allocated = totalAllocated(p.id);
              const available = p.stock - allocated;
              const isLow = stockStatus(p) === "Low" || stockStatus(p) === "Out";
              const isOpen = expanded[p.id];
              return (
                <FragmentRow
                  key={p.id}
                  p={p}
                  isOpen={isOpen}
                  isLow={isLow}
                  showCost={showCost}
                  allocated={allocated}
                  available={available}
                  onToggle={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  onReorder={() => reorder(p)}
                />
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FragmentRow({
  p,
  isOpen,
  isLow,
  showCost,
  allocated,
  available,
  onToggle,
  onReorder,
}: {
  p: Product;
  isOpen: boolean;
  isLow: boolean;
  showCost: boolean;
  allocated: number;
  available: number;
  onToggle: () => void;
  onReorder: () => void;
}) {
  const breakdown = locationBreakdown(p);
  const movements = movementHistory(p, 8);
  return (
    <>
      <TableRow className={cn(isLow && "bg-amber-50/60 hover:bg-amber-50")}>
        <TableCell>
          <button
            type="button"
            onClick={onToggle}
            className="text-muted-foreground hover:text-brand-charcoal"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </TableCell>
        <TableCell className="text-brand-navy font-mono text-xs font-semibold">{p.sku}</TableCell>
        <TableCell className="max-w-[280px] text-xs">{p.name}</TableCell>
        <TableCell className="text-xs">{p.vendor}</TableCell>
        <TableCell className="text-xs">{p.category}</TableCell>
        <TableCell className="text-muted-foreground text-xs">{p.manufacturer}</TableCell>
        <TableCell className="text-right text-xs tabular-nums">{formatNumber(p.stock)}</TableCell>
        <TableCell className="text-right text-xs tabular-nums">{formatNumber(allocated)}</TableCell>
        <TableCell className="text-brand-navy text-right text-sm font-bold tabular-nums">
          {formatNumber(available)}
        </TableCell>
        <TableCell className="text-muted-foreground text-right text-xs tabular-nums">{p.reorderPoint}</TableCell>
        <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
          {p.reorderQty ?? "—"}
        </TableCell>
        {showCost && (
          <TableCell className="text-right text-xs tabular-nums">
            {formatCurrency(p.avgCost ?? p.cost)}
          </TableCell>
        )}
        {showCost && (
          <TableCell className="text-brand-charcoal text-right text-xs font-semibold tabular-nums">
            {formatCurrency(p.stock * p.cost)}
          </TableCell>
        )}
        <TableCell className="text-muted-foreground text-xs">
          {p.lastReceived ? format(parseISO(p.lastReceived), "MMM d, yyyy") : "—"}
        </TableCell>
        <TableCell>
          {isLow && (
            <button
              type="button"
              onClick={onReorder}
              className="border-brand-gold/40 bg-brand-gold/10 text-amber-900 hover:bg-brand-gold/20 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            >
              <RotateCcw className="h-3 w-3" />
              Reorder
            </button>
          )}
        </TableCell>
      </TableRow>
      {isOpen && (
        <TableRow className="bg-muted/40">
          <TableCell></TableCell>
          <TableCell colSpan={showCost ? 14 : 12} className="px-4 py-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <p className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase tracking-wider">
                  Location breakdown
                </p>
                <ul className="space-y-1 text-xs">
                  {WAREHOUSE_LOCATIONS.map((l) => (
                    <li key={l} className="flex items-center justify-between">
                      <span className="text-brand-charcoal">{l}</span>
                      <span className="text-brand-charcoal font-semibold tabular-nums">
                        {breakdown[l] ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase tracking-wider">
                  Lots / serials
                </p>
                <ul className="space-y-1 text-xs">
                  <li className="text-muted-foreground">Lot {p.id.toUpperCase().slice(-4)}-A — qty {Math.max(1, Math.floor(p.stock * 0.4))} · received {p.lastReceived ?? "—"}</li>
                  <li className="text-muted-foreground">Lot {p.id.toUpperCase().slice(-4)}-B — qty {Math.max(1, Math.floor(p.stock * 0.35))}</li>
                  {p.upc && (
                    <li className="text-brand-charcoal/80 font-mono">UPC {p.upc}</li>
                  )}
                </ul>
              </div>

              <div>
                <p className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase tracking-wider">
                  Recent movement
                </p>
                <ul className="divide-y divide-[var(--border)] text-[11px]">
                  {movements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-1">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                            m.kind === "Receipt"
                              ? "bg-emerald-100 text-emerald-700"
                              : m.kind === "Pick"
                                ? "bg-amber-50 text-amber-800"
                                : m.kind === "Transfer"
                                  ? "bg-sky-50 text-sky-700"
                                  : m.kind === "Return"
                                    ? "bg-slate-100 text-slate-700"
                                    : "bg-red-50 text-red-700"
                          )}
                        >
                          {m.kind}
                        </span>
                        <span className="text-muted-foreground ml-2 text-[10px]">
                          {format(parseISO(m.date), "MMM d")} · {m.user}
                        </span>
                        <p className="text-brand-charcoal truncate">{m.reference}</p>
                      </div>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          m.qty > 0 ? "text-emerald-600" : "text-red-600"
                        )}
                      >
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
