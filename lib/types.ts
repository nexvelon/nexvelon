import type { QuoteScheduleInstance } from "@/lib/quote-schedules";
import type { QuoteThemeSlug } from "@/lib/quote-themes";
import type { QuoteTemplateSlug } from "@/lib/company-profile";
import type { AddonEntry } from "@/lib/types/database";

export type ID = string;

export type ClientType = "Commercial" | "Industrial" | "Residential";
export type ClientStatus = "Active" | "Prospect" | "Dormant";

export interface Client {
  id: ID;
  name: string;
  type: ClientType;
  status: ClientStatus;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  createdAt: string;
  totalRevenue: number;
}

export type Vendor = "ADI" | "Anixter" | "Wesco" | "CDW" | "Provo";

// B-3: storage locations are operator-managed (inventory_vocab, kind
// 'storage_location') + free-text, so this is a plain string alias rather than
// a strict union. The name is kept so existing imports compile unchanged.
export type WarehouseLocation = string;
export type ProductManufacturer =
  | "Kantech"
  | "Genetec"
  | "Avigilon"
  | "DSC"
  | "Hanwha"
  | "ICT"
  | "Hartmann"
  | "Keyscan"
  | "C-CURE"
  | "Lenel"
  | "Axis"
  | "Uniview"
  | "Vivotek";
export type ProductCategory =
  | "Access Control"
  | "CCTV"
  | "Video Surveillance"
  | "Intrusion"
  | "Intercom"
  | "Networking"
  | "Network"
  | "Power"
  | "Cabling"
  | "Racks"
  | "Accessories";

export interface Product {
  id: ID;
  sku: string;
  name: string;
  manufacturer: ProductManufacturer;
  category: ProductCategory; // legacy free-text category string (preserved)
  subcategory?: string; // CAT-3b: legacy free-text sub-category name
  // PART-FIX-2: the hierarchical category leaf + its root→leaf name path
  // (e.g. ["Access Control","Cables","FT6"]). Present only when category_id is
  // set. The tree-aware filter matches any ancestor name in this path.
  categoryId?: string;
  categoryPath?: string[];
  vendor: Vendor;
  cost: number;
  price: number; // = list_price (the part's "fixed price" quote default, if any)
  // PART-FORM-2: MSRP (reference only) + the resolved quote-default margin. When
  // the part uses a margin tier, quoteDefaultMargin is that tier's markup %;
  // otherwise undefined (the quote builder then falls back to price → blank).
  msrp?: number;
  marginTierId?: string;
  quoteDefaultMargin?: number;
  stock: number;
  reorderPoint: number;
  reorderQty?: number;
  avgCost?: number;
  upc?: string;
  masterPartNumber?: string; // CAT-2: snapshotted onto quote lines
  imageUrl?: string; // IMG-1: public URL when the product has an image
  lastReceived?: string;
  byLocation?: Partial<Record<string, number>>;
  searchAliases?: string[];
  notifyAddons?: boolean;
  addons?: AddonEntry[];
}

export type ProjectStatus =
  | "Planning"
  | "Scheduled"
  | "In Progress"
  | "On Hold"
  | "At Risk"
  | "Commissioning"
  | "Completed"
  | "Closed";

export type SystemType =
  | "Access Control"
  | "CCTV"
  | "Intrusion"
  | "Intercom"
  | "Fire Monitoring";

export interface Project {
  id: ID;
  code: string;
  name: string;
  clientId: ID;
  siteId?: ID;
  status: ProjectStatus;
  startDate: string;
  targetDate: string;
  managerId: ID;
  leadTechId?: ID;
  salesRepId?: ID;
  systemTypes: SystemType[];
  panelModel?: string;
  budget: number;
  spent: number;
  progress: number;
  description: string;
  scope?: string;
  quoteId?: ID;
  changeOrders?: number;
}

export type QuoteStatus =
  | "Draft"
  | "Sent"
  | "Approved"
  // POLISH-2: "Revision" (was "Rejected") — the client wants the quote
  // updated, not a lost deal. Same dialog + storage as before (the JSONB
  // rejection* fields are kept as stable storage names). "Closed" — a deal
  // that didn't proceed; admin-only, reopenable to Sent, excluded from the
  // weighted pipeline.
  | "Revision"
  | "Closed"
  | "Expired"
  | "Converted";

export type QuoteProjectType =
  | "New Install"
  | "Service"
  | "Upgrade"
  | "Maintenance Contract";

export type PaymentTerms = "Net 15" | "Net 30" | "Net 60";

export interface QuoteLineItem {
  productId: ID;
  qty: number;
  unitPrice: number;
}

export type BuilderLineItemType = "product" | "labor" | "misc" | "service";

export interface BuilderLineItem {
  id: ID;
  type: BuilderLineItemType;
  vendor?: Vendor;
  productId?: ID;
  sku?: string;
  // CAT-2: part-identifier snapshots captured from the product at add-time
  // (§2.2 snapshot — not recalculated later).
  upc?: string;
  masterPartNumber?: string;
  description: string;
  classification?: string; // see lib/classifications.ts
  name: string;
  qty: number;
  unitCost: number;
  margin: number;
  unitPrice: number;
  notes?: string;
  // F-2: when set, this line's unitCost is pinned to a specific inventory_stock
  // unit/lot (snapshot per §2.2). Cleared = uses the product default cost.
  stockUnitId?: string;
  // F-3b: the stock unit id that was committed (consumed) for this line. Its
  // presence marks the line committed — guards against double-decrement. Lives
  // in the quote jsonb blob; forward-only (no auto-return).
  committedStockId?: string;
  // QUOTE-LABOUR: optional labour metadata. PRESENCE of this object marks a line
  // as a managed labour line (the line still carries type "labor"); its absence
  // means a plain part/service/misc line that renders exactly as before. All
  // fields jsonb-stored — no migration. hours/sellRate are kept in sync with
  // qty/unitPrice so the existing totals engine (qty × unitPrice) treats a
  // labour line identically to a part. The `show` flags are PER-LINE PDF
  // visibility — they affect ONLY the client-facing document, never the
  // builder, which always shows full internal detail. The line total is always
  // shown to the client; everything else defaults to hidden.
  labour?: {
    hours: number; // internal, always stored (mirrors qty)
    sellRate: number; // internal, always stored (mirrors unitPrice)
    techName?: string; // optional internal note — never rendered on the PDF
    show?: {
      description?: boolean; // show the description text on the client PDF
      hours?: boolean; // show the hours value in the qty column
      rate?: boolean; // show the sell rate in the unit-price column
    };
  };
}

export interface QuoteSection {
  id: ID;
  name: string;
  items: BuilderLineItem[];
}

export interface Quote {
  id: ID;
  number: string;
  name?: string;
  clientId: ID;
  siteId?: ID;
  projectId?: ID;
  projectType?: QuoteProjectType;
  status: QuoteStatus;
  createdAt: string;
  expiresAt: string;
  ownerId: ID;
  // Editable display override for the "Prepared By" line on the document.
  // Falls back to the owner's name when unset (backward compatible). Display
  // only — does NOT change ownerId / ownership.
  preparedBy?: string;
  paymentTerms?: PaymentTerms;
  taxRate?: number;
  items: QuoteLineItem[];
  sections?: QuoteSection[];
  terms?: string;
  internalNotes?: string;
  discount?: number;
  discountType?: "pct" | "amount";
  subtotal: number;
  tax: number;
  total: number;
  // Chunk C extensions — optional for backward compatibility with quotes
  // already in localStorage. Consumers in Chunks D/E fall back to defaults
  // via `??` when undefined.
  schedules?: QuoteScheduleInstance[];
  themeSlug?: QuoteThemeSlug;
  templateSlug?: QuoteTemplateSlug;
  showUnitPrice?: boolean;
  showVendor?: boolean; // QB-4: visibility toggle
  showSku?: boolean; // QB-4
  showName?: boolean; // QB-4
  showDescription?: boolean; // QB-4
  showUpc?: boolean; // CAT-2: show line UPC
  showMasterPart?: boolean; // CAT-2: show master part # as the line part number
  // Captured by "Move to Revision". All optional + jsonb-stored (no migration);
  // surfaced in a banner when status === "Revision".
  // POLISH-2 note: these JSONB fields back the "Revision" status (renamed from
  // the former "Rejected"). Storage names are intentionally unchanged — only
  // display copy says "Revision".
  rejectionReason?: string;
  rejectionSource?: QuoteRejectionSource;
  rejectedAt?: string; // ISO timestamp
  rejectedByUser?: string; // display name of who marked it rejected
  // POLISH-2 — "Closed" status metadata (optional jsonb extension; closing
  // reason is OPTIONAL, unlike a revision reason).
  closingReason?: string;
  closedAt?: string; // ISO timestamp
  closedByUser?: string; // display name of who closed it
}

export type QuoteRejectionSource = "Client" | "Approver" | "Other";

export interface Site {
  id: ID;
  clientId: ID;
  name: string;
  address: string;
  city: string;
  state: string;
}

export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue" | "Void";

export interface Invoice {
  id: ID;
  number: string;
  clientId: ID;
  projectId?: ID;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  subtotal: number;
  tax: number;
  total: number;
}

export type Role =
  | "Admin"
  | "SalesRep"
  | "ProjectManager"
  | "Technician"
  | "Subcontractor"
  | "Accountant"
  | "ViewOnly";

export interface User {
  id: ID;
  name: string;
  email: string;
  role: Role;
  phone: string;
  hiredAt: string;
  avatarColor: string;
  active: boolean;
}
