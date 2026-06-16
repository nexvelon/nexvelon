// INV-2b — server component for a single product's detail page. Fetches the
// raw catalog row (for display + edit) and its stock units, then hands off to
// the interactive ProductDetailClient. Mirrors the /clients/[id] RSC pattern.

import Link from "next/link";
import { getProductRowById, listStockForProduct } from "@/lib/api/products";
import { listSites } from "@/lib/api/clients";
import { getPurchaseOrdersByProduct } from "@/lib/api/purchase-orders";
import { listStockLocations } from "@/lib/api/stock-locations";
import {
  getCurrentLocationLabels,
  listMovementsByProduct,
} from "@/lib/api/stock-movements";
import { listInvoicesForProduct } from "@/lib/api/invoices";
import { ProductDetailClient } from "./ProductDetailClient";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductRowById(id);

  if (!product) {
    return (
      <div className="space-y-4 p-8">
        <Link href="/inventory" className="text-brand-text text-sm underline">
          ← Back to Inventory
        </Link>
        <p className="text-muted-foreground">
          Product not found. It may have been deleted or you may not have
          access.
        </p>
      </div>
    );
  }

  const [stock, sites, poHistory, locations, movements, invoices] =
    await Promise.all([
      listStockForProduct(id),
      listSites(),
      getPurchaseOrdersByProduct(id),
      listStockLocations(),
      listMovementsByProduct(id),
      listInvoicesForProduct(id),
    ]);

  // MOVE-1: resolve each stock row's current warehouse/truck/job label.
  const currentLabels = await getCurrentLocationLabels(stock);

  return (
    <ProductDetailClient
      product={product}
      stock={stock}
      sites={sites}
      poHistory={poHistory}
      locations={locations}
      movements={movements}
      currentLabels={currentLabels}
      invoices={invoices}
    />
  );
}
