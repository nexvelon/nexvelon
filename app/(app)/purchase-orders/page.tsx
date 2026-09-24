// PO-2 — server component: fetches POs (list), active vendors (for the form's
// vendor select), and catalog products (for the line product picker), then
// hands off to the interactive PurchaseOrdersView.

import { PurchaseOrdersView } from "@/components/modules/purchase-orders/PurchaseOrdersView";
import { getPurchaseOrders } from "@/lib/api/purchase-orders";
import { getVendors } from "@/lib/api/vendors";
import { listProducts } from "@/lib/api/products";
import { listVocab } from "@/lib/api/inventory-vocab";
import { resolveFieldGates } from "@/lib/permissions/field-redaction";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const [ordersRaw, vendors, products, locations, gates] = await Promise.all([
    getPurchaseOrders(),
    getVendors(),
    listProducts(),
    listVocab("storage_location"),
    resolveFieldGates(),
  ]);

  // SEC-1 — the PO total is Σ qty×unit_cost; strip it from the wire when the
  // caller lacks inventory:viewCost (null, not zeroed §2.8), matching the
  // inventory PurchaseOrdersTab which already gates this column.
  const orders = gates.inventoryCost
    ? ordersRaw
    : ordersRaw.map((po) => ({ ...po, total: null }));

  // Vendor select offers active vendors only; product picker is sku/name/cost.
  const vendorOptions = vendors
    .filter((v) => v.is_active)
    .map((v) => ({ id: v.id, name: v.name }));
  // SEC-1 — PO default cost only for cost-trusted callers (createPO holders have
  // inventory:viewCost); redacted to null otherwise.
  const productOptions = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    cost: gates.inventoryCost ? p.cost : null,
    category: p.category || undefined,
    subcategory: p.subcategory,
    imageUrl: p.imageUrl,
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
