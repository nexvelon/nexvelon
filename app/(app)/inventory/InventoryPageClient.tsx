"use client";

// INV-2a — full-screen inventory client view. Extracted from the old
// page.tsx so the route can become an RSC boundary that fetches real
// products (lib/api/products.ts) server-side and passes them in (CL-9
// RSC → "use client" precedent). The Stock tab + stat cards now run on
// the passed-in real products; the other five tabs stay on their mock
// arrays until their tables ship.

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  FileBarChart,
  Layers,
  ListTree,
  PackageSearch,
  Plus,
  Truck,
  Warehouse,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { AnimatedNumber } from "@/components/modules/dashboard/AnimatedNumber";
import { ImportProductsButton } from "@/components/modules/inventory/ImportProductsButton";
import { EmailLowStockButton } from "@/components/modules/inventory/EmailLowStockButton";
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
import type { Product } from "@/lib/types";
import type { PurchaseOrderListRow } from "@/lib/api/purchase-orders";
import type { DbVendor, DbInventoryCategory } from "@/lib/types/database";

// INV-6: code-split the Reports tab so its recharts dependency only loads when
// the operator opens Reports — keeps the default (Stock) inventory view light.
const ReportsTab = dynamic(
  () =>
    import("@/components/modules/inventory/ReportsTab").then((m) => m.ReportsTab),
  {
    loading: () => (
      <Card className="bg-card p-8 text-center shadow-sm">
        <p className="text-muted-foreground text-sm">Loading reports…</p>
      </Card>
    ),
  }
);

const TABS = [
  { key: "stock", label: "Stock", icon: PackageSearch },
  { key: "allocations", label: "Allocations", icon: ClipboardList },
  { key: "transfers", label: "Transfers", icon: Truck },
  { key: "pos", label: "Purchase Orders", icon: Warehouse },
  { key: "vendors", label: "Vendors", icon: Boxes },
  { key: "categories", label: "Categories", icon: ListTree },
  { key: "reports", label: "Reports", icon: FileBarChart },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function InventoryPageClient({
  products,
  purchaseOrders,
  vendors,
  categories,
}: {
  products: Product[];
  purchaseOrders: PurchaseOrderListRow[];
  vendors: DbVendor[];
  categories: DbInventoryCategory[];
}) {
  const { role } = useRole();
  const showCost = hasPermission(role, "inventory", "viewCost");
  const [tab, setTab] = useState<TabKey>("stock");

  const stats = useMemo(() => {
    const allPOs = [
      ...projects.flatMap((p) => buildPOs(p)),
      ...standalonePOs,
    ];
    const openCount = allPOs.filter((po) => isOpenPO(po.status)).length;
    return computeInventoryStats(products, openCount);
  }, [products]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`4 locations · ${stats.skusTracked.toLocaleString()} active parts`}
        title="Inventory & Warehouse"
        description="Stock levels, allocations, transfers, and purchasing across all locations."
        actions={
          <>
            <Link
              href="/inventory/new"
              className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12px] font-medium tracking-wide text-white"
              style={{ background: "var(--brand-primary)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add product
            </Link>
            <ImportProductsButton />
            <EmailLowStockButton />
            {/* FIX-BATCH-N: "Receive PO" is a real flow — receiving happens
                against a specific PO on the Purchase Orders page, so this links
                there rather than being a dead list-level button.
                "Stock count" (no such feature) and "Adjust" (adjustment is
                per-stock-row inside a part, via the unit action menu on the part
                detail) were dead placeholders with no handler and have been
                removed. */}
            <Link
              href="/purchase-orders"
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3.5 py-2 text-[12px] font-medium tracking-wide hover:bg-muted/40"
              style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
            >
              Receive PO
            </Link>
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
        <Stat label="Parts Tracked" value={stats.skusTracked} format={formatNumber} icon={Boxes} />
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

      {tab === "stock" && <StockTab products={products} />}
      {tab === "allocations" && <AllocationsTab />}
      {tab === "transfers" && <TransfersTab />}
      {tab === "pos" && <PurchaseOrdersTab purchaseOrders={purchaseOrders} />}
      {tab === "vendors" && <VendorsTab vendors={vendors} />}
      {tab === "categories" && (
        <CategoriesTab categories={categories} products={products} />
      )}
      {tab === "reports" && <ReportsTab />}
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
