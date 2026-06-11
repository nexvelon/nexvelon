// PO-2 — server component: fetches POs (list), active vendors (for the form's
// vendor select), and catalog products (for the line product picker), then
// hands off to the interactive PurchaseOrdersView.

import { PurchaseOrdersView } from "@/components/modules/purchase-orders/PurchaseOrdersView";
import { getPurchaseOrders } from "@/lib/api/purchase-orders";
import { getVendors } from "@/lib/api/vendors";
import { listProducts } from "@/lib/api/products";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const [orders, vendors, products] = await Promise.all([
    getPurchaseOrders(),
    getVendors(),
    listProducts(),
  ]);

  // Vendor select offers active vendors only; product picker is sku/name/cost.
  const vendorOptions = vendors
    .filter((v) => v.is_active)
    .map((v) => ({ id: v.id, name: v.name }));
  const productOptions = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    cost: p.cost,
  }));

  return (
    <PurchaseOrdersView
      orders={orders}
      vendorOptions={vendorOptions}
      productOptions={productOptions}
    />
  );
}
