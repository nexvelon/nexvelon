// PROJ2-4b — the 19 default subfolders scaffolded under every Job (Main Job and
// each Change Order). Order is authoritative for UI sort. This mirrors the array
// baked into migration 0083; the two are kept in sync by hand (SQL scaffolds the
// DB; this drives display order) — do not cross-fetch.

export const DEFAULT_SUBFOLDERS: ReadonlyArray<{
  name: string;
  slug: string;
}> = [
  { name: "Requests", slug: "requests" },
  { name: "Supplier Quotes", slug: "supplier_quotes" },
  { name: "Contract Documentation", slug: "contract_documentation" },
  { name: "Proposals", slug: "proposals" },
  { name: "Approvals", slug: "approvals" },
  { name: "Site Drawings", slug: "site_drawings" },
  { name: "Take-offs", slug: "take_offs" },
  { name: "Checklist", slug: "checklist" },
  { name: "Photos", slug: "photos" },
  { name: "Videos", slug: "videos" },
  { name: "Data Sheets", slug: "data_sheets" },
  { name: "Shop Drawings", slug: "shop_drawings" },
  { name: "Invoices", slug: "invoices" },
  { name: "Purchase Orders", slug: "purchase_orders" },
  { name: "Pickup Slips", slug: "pickup_slips" },
  { name: "Commissioning Files", slug: "commissioning_files" },
  { name: "User/Operations & Maintenance Docs", slug: "user_ops_maintenance_docs" },
  { name: "Warranty Letter", slug: "warranty_letter" },
  { name: "Other Docs", slug: "other_docs" },
];
