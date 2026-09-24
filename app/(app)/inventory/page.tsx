// INV-2a — server component entry for the inventory list page.
// (app)/layout.tsx already gates the route group on an authenticated session,
// so we don't re-check here. RSC-fetches real data and hands it to the client
// tab UI — mirroring the /clients/new RSC → "use client" precedent.
// INV-1a: POs / Vendors / Categories tabs read real DB. INV-1b: Transfers +
// Allocations now real too (via listRecentMovements + listStockAllocations), and
// the stat cards are computed from real data — the /inventory list view is now
// fully real. Stock + Reports were already real.

import { listProducts } from "@/lib/api/products";
import { getPurchaseOrders } from "@/lib/api/purchase-orders";
import { getVendors } from "@/lib/api/vendors";
import { listCategories } from "@/lib/api/categories";
import { listRecentMovements } from "@/lib/api/stock-movements";
import { listStockAllocations } from "@/lib/api/inventory-allocations";
import { resolveFieldGates } from "@/lib/permissions/field-redaction";
import { InventoryPageClient } from "./InventoryPageClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [
    productsRaw,
    purchaseOrdersRaw,
    vendors,
    categories,
    movements,
    allocationsRaw,
    gates,
  ] = await Promise.all([
    listProducts(),
    getPurchaseOrders(),
    getVendors(),
    listCategories(),
    listRecentMovements({ limit: 200 }),
    listStockAllocations(),
    resolveFieldGates(),
  ]);

  // SEC-1 — strip cost / value / margin from the wire when the caller lacks
  // inventory:viewCost. Redaction is null (never zeroed, §2.8); the client tabs
  // also hide these behind `showCost` (defence in depth). Applies to the product
  // catalog, PO totals, and the per-project allocation rollups.
  const products = gates.inventoryCost
    ? productsRaw
    : productsRaw.map((p) => ({
        ...p,
        cost: null,
        avgCost: null,
        quoteDefaultMargin: null,
      }));
  const purchaseOrders = gates.inventoryCost
    ? purchaseOrdersRaw
    : purchaseOrdersRaw.map((po) => ({ ...po, total: null }));
  const allocations = gates.inventoryCost
    ? allocationsRaw
    : allocationsRaw.map((proj) => ({
        ...proj,
        projectTotal: null,
        costCenters: proj.costCenters.map((cc) => ({
          ...cc,
          subtotal: null,
          stockRows: cc.stockRows.map((r) => ({ ...r, unitCost: null })),
        })),
      }));

  return (
    <InventoryPageClient
      products={products}
      purchaseOrders={purchaseOrders}
      vendors={vendors}
      categories={categories}
      movements={movements}
      allocations={allocations}
    />
  );
}
