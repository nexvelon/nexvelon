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
import { InventoryPageClient } from "./InventoryPageClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [products, purchaseOrders, vendors, categories, movements, allocations] =
    await Promise.all([
      listProducts(),
      getPurchaseOrders(),
      getVendors(),
      listCategories(),
      listRecentMovements({ limit: 200 }),
      listStockAllocations(),
    ]);
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
