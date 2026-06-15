// ============================================================================
// Database row types — mirror supabase/migrations/0001_*, 0002_*, 0003_* 1:1.
// Update this file when migrations change.
// ============================================================================

export type DbClientType =
  | "Commercial"
  | "Industrial"
  | "Residential"
  | "Healthcare"
  | "Education"
  | "Government"
  | "Heritage";

export type DbClientTier = "Platinum" | "Gold" | "Silver" | "Bronze";

export type DbClientStatus = "Active" | "Inactive" | "Prospect" | "Lost";

// CL-2 expansion (migration 0007) — billing / OpCo / tax / payment /
// portal fields. Enum aliases shared by the Phase 4 form UI.
export type DbClientOpco = "integrated_solutions" | "guardian";

export type DbClientPaymentTerms =
  | "due_on_receipt"
  | "net_7"
  | "net_15"
  | "net_30"
  | "net_60"
  | "net_90"
  | "custom";

// CL-11: 'cash' added to the allow-list. 'cheque' kept dormant for
// §2.1 past-data preservation — DB still accepts it and existing rows
// render as "Cheque (legacy)" in the form dropdowns, but new
// selections route through the 5 active options (eft / e_transfer /
// wire / credit_card / cash). Migration 0018 mirrors this on the DB
// CHECK constraint for both clients + sites tables.
export type DbClientPaymentMethod =
  | "cheque"
  | "eft"
  | "credit_card"
  | "e_transfer"
  | "wire"
  | "cash";

// CL-20: expanded for the 5 ADDR-1 countries. CAD + USD preserved per
// §2.1; AED (UAE Dirham), INR (Indian Rupee), EUR (Euro) added.
export type DbClientCurrency = "CAD" | "USD" | "AED" | "INR" | "EUR";

export type DbSiteStatus =
  | "In Quote"
  | "Active"
  | "In Project"
  | "Maintained"
  | "Decommissioned";

// ----------------------------------------------------------------------------
// public.clients
// ----------------------------------------------------------------------------
export interface DbClient {
  id: string;
  name: string;
  legal_name: string | null;
  client_code: string | null;
  type: DbClientType | null;
  tier: DbClientTier | null;
  status: DbClientStatus;
  account_manager_id: string | null;
  industry: string | null;
  notes: string | null;
  tags: string[] | null;
  lifetime_value: number;
  ytd_revenue: number;
  nps_score: number | null;
  last_nps_date: string | null;
  // CL-2 expansion (migration 0007)
  billing_street: string | null;
  billing_unit: string | null;
  billing_city: string | null;
  billing_province: string | null;
  billing_postal: string | null;
  billing_country: string | null;
  billing_same_as_primary_site: boolean | null;
  // CL-5b (migration 0012):
  mailing_street: string | null;
  mailing_unit: string | null;
  mailing_city: string | null;
  mailing_province: string | null;
  mailing_postal: string | null;
  mailing_country: string | null;
  mailing_same_as_billing: boolean | null;
  default_opco: DbClientOpco | null;
  allowed_opcos: string[] | null;
  client_hst_gst_number: string | null;
  tax_exempt: boolean | null;
  tax_exempt_certificate_number: string | null;
  payment_terms: DbClientPaymentTerms | null;
  payment_terms_custom: string | null;
  preferred_payment_method: DbClientPaymentMethod | null;
  apply_cc_surcharge: boolean | null;
  credit_limit: number | null;
  credit_hold: boolean | null;
  preferred_currency: DbClientCurrency | null;
  portal_access_enabled: boolean | null;
  portal_contact_email: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

/** Payload for creating a client. id / timestamps / soft-delete are server-managed. */
export type DbClientInsert = {
  name: string;
  legal_name?: string | null;
  client_code?: string | null;
  type?: DbClientType | null;
  tier?: DbClientTier | null;
  status?: DbClientStatus;
  account_manager_id?: string | null;
  industry?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  lifetime_value?: number;
  ytd_revenue?: number;
  nps_score?: number | null;
  last_nps_date?: string | null;
  // CL-2 expansion (migration 0007) — all optional on insert/update.
  billing_street?: string | null;
  billing_unit?: string | null;
  billing_city?: string | null;
  billing_province?: string | null;
  billing_postal?: string | null;
  billing_country?: string | null;
  billing_same_as_primary_site?: boolean | null;
  // CL-5b (migration 0012):
  mailing_street?: string | null;
  mailing_unit?: string | null;
  mailing_city?: string | null;
  mailing_province?: string | null;
  mailing_postal?: string | null;
  mailing_country?: string | null;
  mailing_same_as_billing?: boolean | null;
  default_opco?: DbClientOpco | null;
  allowed_opcos?: string[] | null;
  client_hst_gst_number?: string | null;
  tax_exempt?: boolean | null;
  tax_exempt_certificate_number?: string | null;
  payment_terms?: DbClientPaymentTerms | null;
  payment_terms_custom?: string | null;
  preferred_payment_method?: DbClientPaymentMethod | null;
  apply_cc_surcharge?: boolean | null;
  credit_limit?: number | null;
  credit_hold?: boolean | null;
  preferred_currency?: DbClientCurrency | null;
  portal_access_enabled?: boolean | null;
  portal_contact_email?: string | null;
  created_by?: string | null;
};

/** Payload for partial-update — every column optional. */
export type DbClientUpdate = Partial<DbClientInsert>;

// ----------------------------------------------------------------------------
// public.sites
// ----------------------------------------------------------------------------
export interface DbSite {
  id: string;
  client_id: string;
  name: string;
  site_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  panel_system: string | null;
  cameras_count: number;
  controllers_count: number;
  doors_count: number;
  cards_issued: number;
  intrusion_system: string | null;
  site_lead_id: string | null;
  status: DbSiteStatus;
  last_service_date: string | null;
  notes: string | null;
  // SITES-2a (migration 0015) — billing address
  billing_street: string | null;
  billing_unit: string | null;
  billing_city: string | null;
  billing_province: string | null;
  billing_postal: string | null;
  billing_country: string | null;
  billing_same_as_client: boolean;
  // mailing address
  mailing_street: string | null;
  mailing_unit: string | null;
  mailing_city: string | null;
  mailing_province: string | null;
  mailing_postal: string | null;
  mailing_country: string | null;
  mailing_same_as_billing: boolean;
  // tax
  site_hst_gst_number: string | null;
  tax_exempt: boolean;
  tax_exempt_certificate_number: string | null;
  tax_rate: number | null;
  // payment — reuses the client enum types (same CHECK values on both tables)
  payment_terms: DbClientPaymentTerms;
  payment_terms_custom: string | null;
  preferred_payment_method: DbClientPaymentMethod;
  apply_cc_surcharge: boolean;
  credit_limit: number | null;
  credit_hold: boolean;
  preferred_currency: DbClientCurrency;
  // portal
  portal_access_enabled: boolean;
  portal_contact_email: string | null;
  // inheritance — UI flag: when true the site reads payment/tax/portal from
  // its parent client; when false the site's own values above are used.
  inherit_payment_terms_from_client: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type DbSiteInsert = {
  client_id: string;
  name: string;
  site_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  panel_system?: string | null;
  cameras_count?: number;
  controllers_count?: number;
  doors_count?: number;
  cards_issued?: number;
  intrusion_system?: string | null;
  site_lead_id?: string | null;
  status?: DbSiteStatus;
  last_service_date?: string | null;
  notes?: string | null;
  // SITES-2a (migration 0015) — all new columns optional on insert/update
  // since the DB applies defaults. Booleans are `boolean | undefined` (no
  // `| null`) since the columns are NOT NULL.
  billing_street?: string | null;
  billing_unit?: string | null;
  billing_city?: string | null;
  billing_province?: string | null;
  billing_postal?: string | null;
  billing_country?: string | null;
  billing_same_as_client?: boolean;
  mailing_street?: string | null;
  mailing_unit?: string | null;
  mailing_city?: string | null;
  mailing_province?: string | null;
  mailing_postal?: string | null;
  mailing_country?: string | null;
  mailing_same_as_billing?: boolean;
  site_hst_gst_number?: string | null;
  tax_exempt?: boolean;
  tax_exempt_certificate_number?: string | null;
  tax_rate?: number | null;
  payment_terms?: DbClientPaymentTerms;
  payment_terms_custom?: string | null;
  preferred_payment_method?: DbClientPaymentMethod;
  apply_cc_surcharge?: boolean;
  credit_limit?: number | null;
  credit_hold?: boolean;
  preferred_currency?: DbClientCurrency;
  portal_access_enabled?: boolean;
  portal_contact_email?: string | null;
  inherit_payment_terms_from_client?: boolean;
};

export type DbSiteUpdate = Partial<DbSiteInsert>;

// SITES-1 — a site row joined with a thin slice of its parent client, so the
// cross-client Sites page can show the client column without an N+1 query.
export interface DbSiteWithClient extends DbSite {
  client: {
    id: string;
    name: string;
    client_code: string | null;
    default_opco: DbClientOpco | null;
  };
}

// ----------------------------------------------------------------------------
// public.contacts
// ----------------------------------------------------------------------------

// CL-5c (migration 0013): per-contact phone with a label.
export interface ContactPhone {
  label: string; // "Office" | "Personal" | "Mobile" | "Emergency" | "Fax" | "Other"
  number: string;
}

export interface DbContact {
  id: string;
  client_id: string | null;
  site_id: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  department: string | null;
  email: string | null;
  phones: ContactPhone[];
  is_primary: boolean;
  is_billing: boolean;
  is_emergency: boolean;
  // CL-7 (migration 0014)
  is_accounts_payable: boolean;
  contact_type_custom: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type DbContactInsert = {
  client_id?: string | null;
  site_id?: string | null;
  first_name: string;
  last_name: string;
  title?: string | null;
  department?: string | null;
  email?: string | null;
  phones?: ContactPhone[];
  is_primary?: boolean;
  is_billing?: boolean;
  is_emergency?: boolean;
  // CL-7 (migration 0014)
  is_accounts_payable?: boolean;
  contact_type_custom?: string | null;
  notes?: string | null;
};

export type DbContactUpdate = Partial<DbContactInsert>;

// ----------------------------------------------------------------------------
// View-model: a client with its rolled-up site / contact counts.
// Used by the listing page.
// ----------------------------------------------------------------------------
export interface DbClientWithCounts extends DbClient {
  site_count: number;
  contact_count: number;
}

// ----------------------------------------------------------------------------
// Filter shape used by getClients() — kept in this file so server and client
// components share the type without circular imports.
// ----------------------------------------------------------------------------
export interface ClientListFilters {
  search?: string;
  tier?: DbClientTier;
  status?: DbClientStatus;
  type?: DbClientType;
}

// ============================================================================
// Auth schema (migration 0002_auth_and_users_schema.sql)
// ============================================================================

/** Application role — mirrors profiles.role check constraint. 11 values. */
export type DbRole =
  | "Admin"
  | "ProjectManager"
  | "SalesRep"
  | "LeadTechnician"
  | "Technician"
  | "Dispatcher"
  | "Warehouse"
  | "Accountant"
  | "Subcontractor"
  | "ViewOnly"
  | "ClientPortal";

export type DbEmployeeType = "Employee" | "Subcontractor" | "Contractor";

export type DbProfileStatus =
  | "Active"
  | "Invited"
  | "Suspended"
  | "Terminated";

// ----------------------------------------------------------------------------
// public.profiles
// ----------------------------------------------------------------------------
export interface DbProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  mobile: string | null;
  title: string | null;
  department: string | null;
  employee_type: DbEmployeeType;
  role: DbRole;
  status: DbProfileStatus;
  last_login_at: string | null;
  last_login_ip: string | null;
  mfa_enrolled: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  terminated_at: string | null;
  notes: string | null;
}

/** Payload for non-Admin self-edits (only the fields the trigger allows). */
export type DbProfileSelfUpdate = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  mobile?: string | null;
  title?: string | null;
  department?: string | null;
  notes?: string | null;
};

/** Payload an Admin (or service role) may apply. */
export type DbProfileAdminUpdate = DbProfileSelfUpdate & {
  email?: string;
  role?: DbRole;
  status?: DbProfileStatus;
  employee_type?: DbEmployeeType;
  mfa_enrolled?: boolean;
  last_login_at?: string | null;
  last_login_ip?: string | null;
  terminated_at?: string | null;
};

// ----------------------------------------------------------------------------
// public.auth_audit_log
// ----------------------------------------------------------------------------
export type AuthAuditEvent =
  | "login_success"
  | "login_failed"
  | "mfa_challenge_sent"
  | "mfa_challenge_verified"
  | "mfa_challenge_failed"
  | "password_changed"
  | "password_reset_requested"
  | "user_invited"
  | "user_suspended"
  | "user_reactivated"
  | "user_terminated"
  | "session_revoked"
  | "email_changed";

export interface DbAuthAuditLog {
  id: string;
  user_id: string | null;
  email: string | null;
  event: AuthAuditEvent;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type DbAuthAuditLogInsert = {
  user_id?: string | null;
  email?: string | null;
  event: AuthAuditEvent;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
};

// ----------------------------------------------------------------------------
// public.auth_otp
// ----------------------------------------------------------------------------
export interface DbAuthOtp {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: string;
  used_at: string | null;
  attempts: number;
  created_at: string;
}

// ============================================================================
// ACT-1 (migration 0016): activity log
// ============================================================================

export type ActivityEntityType =
  | "client"
  | "site"
  | "contact"
  | "inventory"
  | "vendor"
  | "purchase_order"
  | "attachment";
export type ActivityAction = "create" | "update" | "delete";

/** One field-level change inside a `changes` JSONB blob. */
export interface ActivityChange {
  from: unknown;
  to: unknown;
}

/**
 * The shape of activity_log.changes — a flat object keyed by column name,
 * each value a {from, to} pair. Empty `{}` for create / delete entries
 * (the action itself implies what happened).
 */
export type ActivityChanges = Record<string, ActivityChange>;

export interface DbActivityLog {
  id: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  action: ActivityAction;
  changes: ActivityChanges;
  actor_id: string | null;
  created_at: string;
}

// AUDIT-1 — one row in public.quote_audit_log (migration 0038). Immutable,
// append-only; written by the service-role client, read admin-only via RLS.
// 1:1 with the table. `event_type` is "created" | "status_changed" (more in
// AUDIT-2); `changes` holds { from, to } and, for rejections, reason/source.
export interface DbQuoteAuditLog {
  id: string;
  quote_id: string;
  actor_id: string | null;
  actor_name: string | null;
  event_type: string;
  changes: Record<string, unknown>;
  created_at: string;
}

/**
 * Activity log row enriched with the actor's profile slice (for display).
 * `actor` is null when actor_id is null (system action) OR when the
 * referenced profile no longer exists.
 */
export interface DbActivityLogWithActor extends DbActivityLog {
  actor: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

// ----------------------------------------------------------------------------
// Inventory (INV-1, migration 0021) — specific-identification cost tracking
// (lock §2.4). Two tables: inventory_products (catalog) + inventory_stock
// (one row per physical unit / bulk lot, each with its own unit_cost).
// Aggregates (on-hand, avg cost, by-location) are COMPUTED at the API layer
// in INV-2 — never stored. category / manufacturer / vendor are free-text
// (schema-flexibility precedent §2.1); the lib/types.ts UI unions stay the
// typed surface and can grow without a migration.
// ----------------------------------------------------------------------------
export type InventoryTrackingMode = "serialized" | "bulk" | "non_serialized";

// D-1: a single companion add-on. 'part' value = an inventory_products UUID
// (resolved to sku/name at render; skipped if the part was deleted — no FK on
// the JSON ref). 'text' value = a free-text reminder.
export interface AddonEntry {
  kind: "part" | "text";
  value: string;
}

export type InventoryStockStatus =
  | "in_stock"
  | "allocated"
  | "consumed"
  | "retired";

export interface DbInventoryProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  manufacturer: string | null;
  vendor: string | null;
  tracking_mode: InventoryTrackingMode;
  unit_of_measure: string;
  default_unit_cost: number | null;
  list_price: number | null;
  reorder_point: number | null;
  reorder_qty: number | null;
  // C-1 (migration 0024): alternate search terms (old part #s, nicknames,
  // misspellings). NOT NULL DEFAULT '{}' in the DB → always an array.
  search_aliases: string[];
  // D-1 (migration 0026): companion add-ons.
  notify_addons: boolean;
  addons: AddonEntry[];
  // CAT-1 (migration 0032): additional part-number identifiers (free-text, nullable).
  upc: string | null;
  master_part_number: string | null;
  replacement_part_number: string | null;
  // CAT-3 (migration 0033): sub-category (free-text name, mirrors `category`).
  subcategory: string | null;
  // IMG-1 (migration 0034): storage path in the public "product-images" bucket.
  image_path: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload for creating a product. id / timestamps are server-managed; columns
 *  with DB defaults (tracking_mode, unit_of_measure) are optional. */
export type DbInventoryProductInsert = {
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  manufacturer?: string | null;
  vendor?: string | null;
  tracking_mode?: InventoryTrackingMode;
  unit_of_measure?: string;
  default_unit_cost?: number | null;
  list_price?: number | null;
  reorder_point?: number | null;
  reorder_qty?: number | null;
  search_aliases?: string[];
  notify_addons?: boolean;
  addons?: AddonEntry[];
  // CAT-1 (migration 0032): additional part-number identifiers.
  upc?: string | null;
  master_part_number?: string | null;
  replacement_part_number?: string | null;
  // CAT-3 (migration 0033): sub-category.
  subcategory?: string | null;
  // IMG-1 (migration 0034): product image storage path.
  image_path?: string | null;
};

export type DbInventoryProductUpdate = Partial<DbInventoryProductInsert>;

export interface DbInventoryStock {
  id: string;
  product_id: string;
  serial_number: string | null;
  unit_cost: number;
  quantity: number;
  location: string | null;
  supplier: string | null;
  status: InventoryStockStatus;
  // INV-3b (migration 0022): set when status='allocated' (FK -> sites).
  site_id: string | null;
  // C-2a (migration 0025): purchase-order number stamped at receipt time.
  po_number: string | null;
  acquired_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload for creating a stock row. id / timestamps are server-managed;
 *  columns with DB defaults (quantity, status) are optional. */
export type DbInventoryStockInsert = {
  product_id: string;
  unit_cost: number;
  serial_number?: string | null;
  quantity?: number;
  location?: string | null;
  supplier?: string | null;
  status?: InventoryStockStatus;
  site_id?: string | null;
  po_number?: string | null;
  acquired_at?: string | null;
  notes?: string | null;
};

export type DbInventoryStockUpdate = Partial<DbInventoryStockInsert>;

// ----------------------------------------------------------------------------
// Vendors (PO-1, migration 0030) — supplier master records. Mirrors the
// clients posture: free-text fields, is_active soft-state, created_by/updated_by
// audit uids, shared handle_updated_at() trigger, RLS authenticated read+write
// (mutations additionally gated by hasPermission(inventory) at the action
// layer). Independent of the hardcoded lib/types.ts Vendor union and the
// free-text inventory_products.vendor column — both left untouched.
// ----------------------------------------------------------------------------
export interface DbVendor {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  account_number: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  // PARTS-4 (migration 0039) — purchasing fields.
  min_order_amount: number | null; // minimum / free-shipping threshold ($)
  excluded_parts: string[]; // part numbers this vendor does NOT carry (jsonb)
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** Payload for creating a vendor. id / timestamps / audit uids are
 *  server-managed; is_active has a DB default. Only `name` is required. */
export type DbVendorInsert = {
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  account_number?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  is_active?: boolean;
  // PARTS-4 — excluded_parts has a DB default ([]); both optional on write.
  min_order_amount?: number | null;
  excluded_parts?: string[];
};

export type DbVendorUpdate = Partial<DbVendorInsert>;

// ----------------------------------------------------------------------------
// Projects (PROJ-1, migration 0041) — projects + project_quotes +
// project_cost_centers. originating_quote_id / quote_id are TEXT (quotes.id is
// text); client_id / site_id are uuid. 1:1 with the 0041 columns.
// ----------------------------------------------------------------------------
export interface DbProject {
  id: string;
  project_number: string;
  opco: string;
  client_id: string;
  site_id: string | null;
  title: string | null;
  status: string;
  originating_quote_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DbProjectInsert = {
  project_number: string;
  opco: string;
  client_id: string;
  site_id?: string | null;
  title?: string | null;
  status?: string;
  originating_quote_id?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type DbProjectUpdate = Partial<DbProjectInsert>;

export interface DbProjectQuote {
  id: string;
  project_id: string;
  quote_id: string;
  role: string; // 'original' | 'change_order'
  created_at: string;
}

export type DbProjectQuoteInsert = {
  project_id: string;
  quote_id: string;
  role?: string;
};

export interface DbProjectCostCenter {
  id: string;
  project_id: string;
  cc_number: string;
  name: string;
  sort_order: number;
  // PROJ-2 (migration 0042) — the quote this cost center came from (original
  // or change-order). text FK to quotes.id.
  source_quote_id: string | null;
  created_at: string;
  updated_at: string;
}

export type DbProjectCostCenterInsert = {
  project_id: string;
  cc_number: string;
  name: string;
  sort_order?: number;
  source_quote_id?: string | null;
};

export type DbProjectCostCenterUpdate = Partial<
  Omit<DbProjectCostCenterInsert, "project_id">
>;

// ----------------------------------------------------------------------------
// Purchase orders (PO-2, migration 0031) — header + lines. Header FKs vendors
// (ON DELETE RESTRICT — a vendor with POs can't be deleted). Lines cascade on
// PO delete and FK inventory_products (RESTRICT). received_qty is reserved for
// the PO-4 receiving flow; this chunk only reads/writes draft headers + lines.
// ----------------------------------------------------------------------------
export type DbPurchaseOrderStatus =
  | "draft"
  | "issued"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export interface DbPurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  status: DbPurchaseOrderStatus;
  order_date: string | null;
  expected_date: string | null;
  reference: string | null;
  ship_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

/** Header insert payload. id / po_number / status / timestamps / audit uids are
 *  server-managed (status defaults to 'draft'). */
export type DbPurchaseOrderInsert = {
  po_number: string;
  vendor_id: string;
  status?: DbPurchaseOrderStatus;
  order_date?: string | null;
  expected_date?: string | null;
  reference?: string | null;
  ship_to?: string | null;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type DbPurchaseOrderUpdate = Partial<DbPurchaseOrderInsert>;

export interface DbPurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_cost: number;
  received_qty: number;
  line_no: number;
  created_at: string;
  updated_at: string;
}

/** Line insert payload. id / timestamps server-managed; received_qty defaults 0. */
export type DbPurchaseOrderLineInsert = {
  purchase_order_id: string;
  product_id?: string | null;
  description?: string | null;
  quantity: number;
  unit_cost?: number;
  received_qty?: number;
  line_no?: number;
};

// ----------------------------------------------------------------------------
// Attachments (ATTACH-1, migration 0035) — generic, table-backed file records
// keyed by (entity_type, entity_id). Files live in the PRIVATE "attachments"
// Storage bucket (signed URLs only). entity_type is free-text (no CHECK) so new
// entity kinds need no migration.
// ----------------------------------------------------------------------------
export interface DbAttachment {
  id: string;
  entity_type: string;
  entity_id: string;
  folder: string;
  bucket: string;
  path: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Insert payload. id / timestamps server-managed; folder/bucket have DB defaults. */
export type DbAttachmentInsert = {
  entity_type: string;
  entity_id: string;
  folder?: string;
  bucket?: string;
  path: string;
  filename: string;
  content_type?: string | null;
  size_bytes?: number | null;
  uploaded_by?: string | null;
};

export type DbAttachmentUpdate = Partial<DbAttachmentInsert>;
