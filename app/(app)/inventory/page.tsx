"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Layers,
  ListTree,
  PackageSearch,
  Truck,
  Warehouse,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/modules/dashboard/AnimatedNumber";
import { StockTab } from "@/components/modules/inventory/StockTab";
import { AllocationsTab } from "@/components/modules/inventory/AllocationsTab";
import { TransfersTab } from "@/components/modules/inventory/TransfersTab";
import { PurchaseOrdersTab } from "@/components/modules/inventory/PurchaseOrdersTab";
import { VendorsTab } from "@/components/modules/inventory/VendorsTab";
import { CategoriesTab } from "@/components/modules/inventory/CategoriesTab";
import { useRole } from "@/lib/role-context";
import { hasPermission } from "@/lib/permissions";
import {
  computeInventoryStats,
  isOpenPO,
  standalonePOs,
} from "@/lib/inventory-data";
import { projects } from "@/lib/mock-data/projects";
import { buildPOs } from "@/lib/project-data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "stock", label: "Stock", icon: PackageSearch },
  { key: "allocations", label: "Allocations", icon: ClipboardList },
  { key: "transfers", label: "Transfers", icon: Truck },
  { key: "pos", label: "Purchase Orders", icon: Warehouse },
  { key: "vendors", label: "Vendors", icon: Boxes },
  { key: "categories", label: "Categories", icon: ListTree },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function InventoryPage() {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");
  const [tab, setTab] = useState<TabKey>("stock");

  const stats = useMemo(() => {
    const allPOs = [
      ...projects.flatMap((p) => buildPOs(p)),
      ...standalonePOs,
    ];
    const openCount = allPOs.filter((po) => isOpenPO(po.status)).length;
    return computeInventoryStats(openCount);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`4 locations · ${stats.skusTracked.toLocaleString()} active SKUs`}
        title="Inventory & Warehouse"
        description="Stock levels, allocations, transfers, and purchasing across all locations."
        actions={
          <>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
            >
              Receive PO
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
            >
              Stock count
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              Adjust
            </button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat
          label="Total Stock Value"
          value={stats.stockValue}
          format={formatCurrency}
          icon={Layers}
          hidden={!showCost}
          fallback="—"
        />
        <Stat label="SKUs Tracked" value={stats.skusTracked} format={formatNumber} icon={Boxes} />
        <Stat
          label="Low Stock Alerts"
          value={stats.lowStock}
          format={formatNumber}
          icon={AlertTriangle}
          accent={stats.lowStock > 0 ? "danger" : "default"}
        />
        <Stat
          label="Items Allocated"
          value={stats.itemsAllocated}
          format={formatNumber}
          icon={ClipboardList}
        />
        <Stat label="Open POs" value={stats.openPOs} format={formatNumber} icon={Warehouse} />
      </section>

      <nav className="bg-card rounded-lg border border-[var(--border)] p-1 shadow-sm">
        <ul className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-brand-navy text-white"
                      : "text-muted-foreground hover:bg-muted hover:text-brand-charcoal"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === "stock" && <StockTab />}
      {tab === "allocations" && <AllocationsTab />}
      {tab === "transfers" && <TransfersTab />}
      {tab === "pos" && <PurchaseOrdersTab />}
      {tab === "vendors" && <VendorsTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}

interface StatProps {
  label: string;
  value: number;
  format: (n: number) => string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "default" | "danger";
  hidden?: boolean;
  fallback?: string;
}

function Stat({ label, value, format, icon: Icon, accent, hidden, fallback }: StatProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card
        className={cn(
          "border-t-2 flex h-full flex-col gap-1.5 p-4 shadow-sm transition-shadow hover:shadow-md",
          accent === "danger" ? "border-t-red-500" : "border-t-[#C9A24B]"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="font-serif text-xs tracking-wide text-brand-charcoal/70">{label}</span>
          <Icon
            className={cn(
              "h-4 w-4",
              accent === "danger" ? "text-red-500" : "text-brand-gold"
            )}
          />
        </div>
        <div className="text-brand-navy text-2xl font-semibold tracking-tight tabular-nums">
          {hidden ? (
            <span className="text-muted-foreground/60">{fallback ?? "—"}</span>
          ) : (
            <AnimatedNumber value={value} format={format} />
          )}
        </div>
      </Card>
    </motion.div>
  );
}
