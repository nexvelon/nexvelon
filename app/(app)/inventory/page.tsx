// INV-2a — server component entry for the inventory list page.
// (app)/layout.tsx already gates the route group on an authenticated session,
// so we don't re-check here. RSC-fetches real data and hands it to the client
// tab UI — mirroring the /clients/new RSC → "use client" precedent.
// INV-1a: POs / Vendors / Categories tabs now read real DB (were mock). Stock +
// Reports were already real. Transfers + Allocations remain mock until INV-1b
// ships their (new) list helpers.

import { listProducts } from "@/lib/api/products";
import { getPurchaseOrders } from "@/lib/api/purchase-orders";
import { getVendors } from "@/lib/api/vendors";
import { listCategories } from "@/lib/api/categories";
import { InventoryPageClient } from "./InventoryPageClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [products, purchaseOrders, vendors, categories] = await Promise.all([
    listProducts(),
    getPurchaseOrders(),
    getVendors(),
    listCategories(),
  ]);
  return (
    <InventoryPageClient
      products={products}
      purchaseOrders={purchaseOrders}
      vendors={vendors}
      categories={categories}
    />
  );
}
