// PO-2 — server component: fetches POs (list), active vendors (for the form's
// vendor select), and catalog products (for the line product picker), then
// hands off to the interactive PurchaseOrdersView.

import { PurchaseOrdersView } from "@/components/modules/purchase-orders/PurchaseOrdersView";
import { getPurchaseOrders } from "@/lib/api/purchase-orders";
import { getVendors } from "@/lib/api/vendors";
import { listProducts } from "@/lib/api/products";
import { listVocab } from "@/lib/api/inventory-vocab";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const [orders, vendors, products, locations] = await Promise.all([
    getPurchaseOrders(),
    getVendors(),
    listProducts(),
    listVocab("storage_location"),
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
  // Receive-to-location picker (active storage locations).
  const locationOptions = locations.map((l) => l.name);

  return (
    <PurchaseOrdersView
      orders={orders}
      vendorOptions={vendorOptions}
      productOptions={productOptions}
      locationOptions={locationOptions}
    />
  );
}
