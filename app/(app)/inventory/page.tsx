// INV-2a — server component entry for the inventory list page.
// (app)/layout.tsx already gates the route group on an authenticated session,
// so we don't re-check here. RSC-fetches real products via the products API
// (catalog + in-stock rollup) and hands them to the client tab UI — mirroring
// the /clients/new RSC → "use client" precedent. The other five inventory tabs
// remain on mock data until their tables ship.

import { listProducts } from "@/lib/api/products";
import { InventoryPageClient } from "./InventoryPageClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const products = await listProducts();
  return <InventoryPageClient products={products} />;
}
