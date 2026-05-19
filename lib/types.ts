import type { QuoteScheduleInstance } from "@/lib/quote-schedules";
import type { QuoteThemeSlug } from "@/lib/quote-themes";
import type { QuoteTemplateSlug } from "@/lib/company-profile";

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

export type WarehouseLocation =
  | "Main Warehouse"
  | "Truck 1"
  | "Truck 2"
  | "Truck 3"
  | "Branch — Mississauga";
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
  category: ProductCategory;
  vendor: Vendor;
  cost: number;
  price: number;
  stock: number;
  reorderPoint: number;
  reorderQty?: number;
  avgCost?: number;
  upc?: string;
  lastReceived?: string;
  byLocation?: Partial<Record<WarehouseLocation, number>>;
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
  | "Rejected"
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
  description: string;
  classification?: string; // see lib/classifications.ts
  name: string;
  qty: number;
  unitCost: number;
  margin: number;
  unitPrice: number;
  notes?: string;
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
}

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
