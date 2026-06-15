"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, ImageIcon, Search, X } from "lucide-react";
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
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  WAREHOUSE_LOCATIONS,
  locationBreakdown,
  movementHistory,
  stockStatus,
  totalAllocated,
} from "@/lib/inventory-data";
import {
  listInventoryVocabAction,
  listSubcategoriesAction,
} from "@/app/(app)/settings/inventory-vocab-actions";
import type { DbInventoryVocab } from "@/lib/api/inventory-vocab";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product, ProductCategory, Vendor } from "@/lib/types";

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
const STATUSES = ["All", "In Stock", "Low", "Out", "Overstock"] as const;

export function StockTab({ products }: { products: Product[] }) {
  const router = useRouter();
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");

  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState<(typeof VENDORS)[number]>("All");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  // CAT-3b: dependent sub-category filter ("All" = no sub-filter).
  const [subcategory, setSubcategory] = useState<string>("All");
  const [catRows, setCatRows] = useState<DbInventoryVocab[]>([]);
  const [subRows, setSubRows] = useState<DbInventoryVocab[]>([]);
  const [location, setLocation] = useState<string>("All");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All");
  const [sortKey, setSortKey] = useState<"sku" | "available" | "value">("sku");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // B-3: managed storage-location list (active), fetched like the B-2 forms.
  const [vocabLocations, setVocabLocations] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    listInventoryVocabAction("storage_location")
      .then((res) => {
        if (active && res.ok && res.data.length) {
          setVocabLocations(res.data.map((r) => r.name));
        }
      })
      .catch(() => {
        // fall back to data-present / WAREHOUSE_LOCATIONS below
      });
    return () => {
      active = false;
    };
  }, []);

  // CAT-3b: categories (with ids) + active subcategories for the dependent filter.
  useEffect(() => {
    let active = true;
    Promise.all([
      listInventoryVocabAction("category"),
      listSubcategoriesAction(),
    ])
      .then(([cat, sub]) => {
        if (!active) return;
        if (cat.ok) setCatRows(cat.data);
        if (sub.ok) setSubRows(sub.data);
      })
      .catch(() => {
        // leave empty — sub-category filter simply offers "All".
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedCatId = catRows.find((c) => c.name === category)?.id;
  const availableSubs = useMemo(
    () => subRows.filter((s) => s.parent_id === selectedCatId),
    [subRows, selectedCatId]
  );
  // Reset the sub-category when it no longer belongs to the selected category.
  useEffect(() => {
    if (
      subcategory !== "All" &&
      !availableSubs.some((s) => s.name === subcategory)
    ) {
      setSubcategory("All");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subRows, catRows]);

  // Dynamic location set = managed vocab ∪ locations actually present in the
  // data (deduped, managed order first), so stock in 'Default' or any operator-
  // added location is never hidden. Falls back to WAREHOUSE_LOCATIONS if the
  // vocab is unavailable.
  const locationList = useMemo(() => {
    const present = new Set<string>();
    for (const p of products) {
      for (const loc of Object.keys(p.byLocation ?? {})) present.add(loc);
    }
    const base = vocabLocations.length > 0 ? vocabLocations : WAREHOUSE_LOCATIONS;
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const l of [...base, ...present]) {
      if (!seen.has(l)) {
        seen.add(l);
        ordered.push(l);
      }
    }
    return ordered;
  }, [products, vocabLocations]);

  const LOCATIONS = useMemo<string[]>(() => ["All", ...locationList], [locationList]);

  const dirty =
    search !== "" ||
    vendor !== "All" ||
    category !== "All" ||
    subcategory !== "All" ||
    location !== "All" ||
    status !== "All";

  const rows = useMemo(() => {
    const out = products.filter((p) => {
      if (vendor !== "All" && p.vendor !== vendor) return false;
      if (category !== "All" && p.category !== category) return false;
      if (subcategory !== "All" && (p.subcategory ?? "") !== subcategory)
        return false;
      if (location !== "All") {
        const breakdown = locationBreakdown(p);
        if ((breakdown[location] ?? 0) === 0) return false;
      }
      if (status !== "All" && stockStatus(p) !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchesAlias = (p.searchAliases ?? []).some((a) =>
          a.toLowerCase().includes(q)
        );
        if (
          !p.sku.toLowerCase().includes(q) &&
          !p.name.toLowerCase().includes(q) &&
          !matchesAlias
        )
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
  }, [products, search, vendor, category, subcategory, location, status, sortKey]);

  return (
    <div className="space-y-4">
      <Card className="bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search Part # or description…"
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
          {/* CAT-3b: dependent sub-category filter. */}
          <div className="md:col-span-2">
            <Select
              value={subcategory}
              onValueChange={(v) => setSubcategory(v ?? "All")}
              disabled={category === "All" || availableSubs.length === 0}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All sub-categories</SelectItem>
                {availableSubs.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
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
                setSubcategory("All");
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
              <TableHead className="text-[11px] uppercase">Part #</TableHead>
              <TableHead className="text-[11px] uppercase">Description</TableHead>
              <TableHead className="text-[11px] uppercase">Vendor</TableHead>
              <TableHead className="text-[11px] uppercase">Category</TableHead>
              <TableHead className="text-[11px] uppercase">Mfr</TableHead>
              <TableHead className="text-[11px] uppercase">Status</TableHead>
              <TableHead className="text-right text-[11px] uppercase">On Hand</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Allocated</TableHead>
              <TableHead className="cursor-pointer text-right text-[11px] uppercase" onClick={() => setSortKey("available")}>Available</TableHead>
              <TableHead className="text-right text-[11px] uppercase">Low-stock at</TableHead>
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
                  locations={locationList}
                  onToggle={() => setExpanded((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  onOpen={() => router.push(`/inventory/${p.id}`)}
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
  locations,
  onToggle,
  onOpen,
}: {
  p: Product;
  isOpen: boolean;
  isLow: boolean;
  showCost: boolean;
  allocated: number;
  available: number;
  locations: string[];
  onToggle: () => void;
  onOpen: () => void;
}) {
  const breakdown = locationBreakdown(p, locations);
  const movements = movementHistory(p, 8);
  return (
    <>
      {/* PARTS-1: the row opens the part detail (Edit/Delete live there). The
          chevron stops propagation so it only toggles the inline breakdown. */}
      <TableRow
        onClick={onOpen}
        className={cn(
          "cursor-pointer",
          isLow && "bg-amber-50/60 hover:bg-amber-50"
        )}
      >
        <TableCell>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="text-muted-foreground hover:text-brand-charcoal"
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </TableCell>
        <TableCell className="text-brand-navy font-mono text-xs font-semibold">{p.sku}</TableCell>
        <TableCell className="max-w-[280px] text-xs">
          <div className="flex items-center gap-2">
            {/* IMG-1: row thumbnail / neutral placeholder */}
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded border border-[var(--border)] object-cover"
              />
            ) : (
              <span className="bg-muted/40 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--border)]">
                <ImageIcon className="text-muted-foreground h-3.5 w-3.5" />
              </span>
            )}
            <span className="truncate">{p.name}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs">{p.vendor}</TableCell>
        <TableCell className="text-xs">{p.category}</TableCell>
        <TableCell className="text-muted-foreground text-xs">{p.manufacturer}</TableCell>
        <TableCell>
          <StatusBadge status={stockStatus(p)} />
        </TableCell>
        <TableCell className="text-right text-xs tabular-nums">{formatNumber(p.stock)}</TableCell>
        <TableCell className="text-right text-xs tabular-nums">{formatNumber(allocated)}</TableCell>
        <TableCell className="text-brand-navy text-right text-sm font-bold tabular-nums">
          {formatNumber(available)}
        </TableCell>
        <TableCell className="text-muted-foreground text-right text-xs tabular-nums">{p.reorderPoint}</TableCell>
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
        <TableCell />
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
                  {locations.length === 0 && (
                    <li className="text-muted-foreground">No stock locations.</li>
                  )}
                  {locations.map((l) => (
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

// INV-5: explicit per-row stock-status badge (complements the existing row
// tint + status filter). Colors: Out=red, Low=amber, Overstock=blue,
// In Stock=neutral.
function StatusBadge({
  status,
}: {
  status: "Out" | "Low" | "In Stock" | "Overstock";
}) {
  const styles: Record<typeof status, string> = {
    Out: "bg-red-50 text-red-700",
    Low: "bg-amber-50 text-amber-800",
    "In Stock": "bg-slate-100 text-slate-600",
    Overstock: "bg-sky-50 text-sky-700",
  };
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}
