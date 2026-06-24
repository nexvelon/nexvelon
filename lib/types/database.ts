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

// POLISH-7 — Diamond is the new top tier (Diamond > Platinum > Gold > Silver > Bronze).
export type DbClientTier = "Diamond" | "Platinum" | "Gold" | "Silver" | "Bronze";

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
  // POLISH-53 (migration 0071) — Company Address (top-level; billing inherits it).
  company_address_line1: string | null;
  company_address_line2: string | null;
  company_address_city: string | null;
  company_address_province: string | null;
  company_address_postal: string | null;
  company_address_country: string | null;
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
  // POLISH-3 (migration 0056) — invite-created clients land here for admin
  // review before joining the main directory.
  pending_review: boolean;
  invited_at: string | null;
  // POLISH-5 (migration 0058) — Prestige Tier reuses the existing `tier` column
  // (DbClientTier: Platinum/Gold/Silver/Bronze). These track when it was last
  // set and the reason a declined applicant was turned down.
  tier_set_at: string | null;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
}

// POLISH-3 (migration 0056) — a public client onboarding invitation. The token
// is the unguessable state holder; the client fills the four pieces (client
// form, site form, two T&C signatures) across sessions, then submits. On submit
// a pending_review client + site are created and the row is locked
// (submitted_at set; anon RLS blocks further updates).
export interface DbClientInvitation {
  id: string;
  token: string;
  email: string;
  client_id: string | null;
  created_by: string | null;
  // POLISH-4 (migration 0057) — 'full' (client + site + both T&Cs, new client)
  // or 'site_only' (site + both T&Cs added to an existing client_id).
  invite_type: "full" | "site_only";
  client_form_completed: boolean;
  site_form_completed: boolean;
  tc1_signed_at: string | null;
  tc1_signed_name: string | null;
  tc2_signed_at: string | null;
  tc2_signed_name: string | null;
  submitted_at: string | null;
  client_form_data: Record<string, unknown> | null;
  site_form_data: Record<string, unknown> | null;
  // POLISH-5 (migration 0059) — admin review decision, kept here so it survives
  // a hard-delete of a declined pending client.
  decision: "approved" | "declined" | null;
  decided_at: string | null;
  decided_by: string | null;
  decline_reason: string | null;
  // POLISH-6 (migration 0060) — snapshot of the exact text/tiers/disclaimer at
  // submit, drawn-signature image paths, generated signed-PDF paths, and the
  // optional tier the client opted in for.
  submission_snapshot: Record<string, unknown> | null;
  tc1_signature_image_path: string | null;
  tc2_signature_image_path: string | null;
  // POLISH-23 (migration 0065) — the raw base64 signature is stored inline here
  // at sign-time (no storage call) and uploaded to the signatures bucket at
  // submit, which sets *_image_path and clears these.
  tc1_signature_data_url: string | null;
  tc2_signature_data_url: string | null;
  tc1_signed_pdf_path: string | null;
  tc2_signed_pdf_path: string | null;
  // POLISH-38 (migration 0067) — generated client/site application-form PDFs.
  client_form_pdf_path: string | null;
  site_form_pdf_path: string | null;
  tier_requested: DbClientTier | null;
  // POLISH-9 (migration 0062) — when the client ticked the Payment Policies
  // acknowledgment on each form.
  client_form_payment_policies_acknowledged_at: string | null;
  site_form_payment_policies_acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
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
  // POLISH-53 (migration 0071) — Company Address (optional on insert/update).
  company_address_line1?: string | null;
  company_address_line2?: string | null;
  company_address_city?: string | null;
  company_address_province?: string | null;
  company_address_postal?: string | null;
  company_address_country?: string | null;
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
  // POLISH-3 (migration 0056) — invite-created clients awaiting admin review.
  pending_review?: boolean;
  invited_at?: string | null;
  // POLISH-5 (migration 0058) — tier audit + decline reason.
  tier_set_at?: string | null;
  decline_reason?: string | null;
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
  // POLISH-6 (migration 0060) — GC / Site Supervisor. POLISH-10 (migration 0063)
  // split the single gc_name into first + last name.
  gc_first_name: string | null;
  gc_last_name: string | null;
  gc_phone: string | null;
  gc_email: string | null;
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
  // POLISH-6 (migration 0060) — GC / Site Supervisor. POLISH-10 (migration 0063)
  // split the single gc_name into first + last name.
  gc_first_name?: string | null;
  gc_last_name?: string | null;
  gc_phone?: string | null;
  gc_email?: string | null;
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
    // POLISH-44 — non-null = the parent client was soft-deleted (archived). The
    // site stays visible; the UI labels the client name as "(deleted)".
    deleted_at: string | null;
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
  // POLISH-3 — when true, return ONLY invite-created clients awaiting review;
  // when false/omitted, the normal list EXCLUDES them.
  pending_review?: boolean;
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
  // PART-FORM B1 (migration 0044): free-text part notes (form bottom).
  notes: string | null;
  // SERIAL-1 (migration 0047): when true, each unit is tracked individually by
  // serial number (one stock row per unit, quantity 1). Drives serialization.
  is_serialized: boolean;
  // PART-FORM-2 (migration 0050): MSRP (reference only) + the quote-default
  // margin tier. Mode is derived: margin_tier_id → tier; else list_price →
  // fixed; else none.
  msrp: number | null;
  margin_tier_id: string | null;
  // PART-FIX-1 (migration 0051): pack-size + sub-allocate for non-"Each" UoM.
  pack_size: number | null;
  track_individual_units: boolean;
  // PART-FIX-2 (migration 0052): the leaf node in the hierarchical category
  // tree. The legacy free-text category / subcategory columns above are KEPT.
  category_id: string | null;
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
  // PART-FORM B1 (migration 0044): free-text part notes.
  notes?: string | null;
  // SERIAL-1 (migration 0047): per-part serialized toggle.
  is_serialized?: boolean;
  // PART-FORM-2 (migration 0050): MSRP + quote-default margin tier.
  msrp?: number | null;
  margin_tier_id?: string | null;
  // PART-FIX-1 (migration 0051): pack-size + sub-allocate.
  pack_size?: number | null;
  track_individual_units?: boolean;
  // PART-FIX-2 (migration 0052): hierarchical category leaf.
  category_id?: string | null;
};

export type DbInventoryProductUpdate = Partial<DbInventoryProductInsert>;

// PART-FIX-2 (migration 0052) — arbitrary-depth category tree. A node's parent
// is parent_id (null = root). UNIQUE(parent_id, name) keeps names unique within
// a branch, so sub-categories are local to each parent.
export interface DbInventoryCategory {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type DbInventoryCategoryInsert = {
  parent_id?: string | null;
  name: string;
  sort_order?: number;
};

export type DbInventoryCategoryUpdate = Partial<DbInventoryCategoryInsert>;

// PART-FORM B1 (migration 0044): managed manufacturers list (Settings →
// Manufacturers) feeding the part form's Manufacturer dropdown. The
// inventory_products.manufacturer column stays free text — this is options only.
export interface DbManufacturer {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type DbManufacturerInsert = {
  name: string;
};

// JC-1 (migration 0054) — admin-managed worker list. `default_cost_rate` is an
// optional hourly cost that prefills new labour entries; it is editable +
// snapshotted at entry time, so changing it here never rewrites history.
export interface DbTech {
  id: string;
  name: string;
  default_cost_rate: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// JC-1 (migration 0054) — hours logged against a project cost center.
// tech_name + cost_rate are SNAPSHOTS frozen at entry time; amount
// (= hours * cost_rate) is persisted for fast per-cost-center rollups.
export interface DbLabourEntry {
  id: string;
  cost_center_id: string;
  tech_id: string | null;
  tech_name: string;
  worked_on: string; // date (YYYY-MM-DD)
  hours: number;
  cost_rate: number;
  amount: number;
  note: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

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
  // MOVE-1 (migration 0046): where this row currently sits — EITHER a stock
  // location (warehouse/truck) OR a job (cost-center), never both.
  current_location_id: string | null;
  current_cost_center_id: string | null;
  // FIX-BATCH-O (migration 0053): the receive/intake batch a row was created in
  // (shared across one receiveStock / addManualStock call; null otherwise).
  receive_batch_id: string | null;
  // CUSTODY-1 (migration 0048): chain-of-custody for serialized units.
  //   custody_status: in_stock | delivered | installed | returned | lost | consumed
  custody_status: string;
  delivered_at: string | null;
  installed_at: string | null;
  lost_at: string | null;
  custody_proof_attachment_id: string | null;
  last_known_label: string | null;
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
  current_location_id?: string | null;
  current_cost_center_id?: string | null;
  // FIX-BATCH-O (migration 0053): receive/intake batch id.
  receive_batch_id?: string | null;
};

export type DbInventoryStockUpdate = Partial<DbInventoryStockInsert>;

// ----------------------------------------------------------------------------
// MOVE-1 (migration 0046) — stock locations + append-only movement ledger.
//   stock_locations  : warehouses + trucks (holder_name = the tech/sub a truck
//                      is assigned to). Managed in Settings → Locations.
//   stock_movements  : APPEND-ONLY ledger. from_/to_ carry a label snapshot so
//                      history survives later renames/deletes. movement `type`
//                      is one of 'warehouse'|'truck'|'job'|'vendor'|'manual'.
// ----------------------------------------------------------------------------
export type StockLocationType = "warehouse" | "truck";

export interface DbStockLocation {
  id: string;
  name: string;
  location_type: string; // 'warehouse' | 'truck'
  holder_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DbStockLocationInsert = {
  name: string;
  location_type?: string;
  holder_name?: string | null;
  is_active?: boolean;
};

export type DbStockLocationUpdate = Partial<DbStockLocationInsert>;

export type StockMovementEndpointType =
  | "warehouse"
  | "truck"
  | "job"
  | "vendor"
  | "manual";

export interface DbStockMovement {
  id: string;
  product_id: string;
  stock_id: string | null;
  quantity: number;
  from_type: string | null;
  from_id: string | null;
  from_label: string | null;
  to_type: string | null;
  to_id: string | null;
  to_label: string | null;
  moved_by: string | null;
  moved_by_name: string | null;
  note: string | null;
  created_at: string;
}

export type DbStockMovementInsert = {
  product_id: string;
  stock_id?: string | null;
  quantity?: number;
  from_type?: string | null;
  from_id?: string | null;
  from_label?: string | null;
  to_type?: string | null;
  to_id?: string | null;
  to_label?: string | null;
  moved_by?: string | null;
  moved_by_name?: string | null;
  note?: string | null;
};

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
  // INVOICE-1 (migration 0043) — the section's contracted value, seeded from
  // the originating quote section total. An invoice draw pulls a % of this.
  contract_value: number;
  created_at: string;
  updated_at: string;
}

export type DbProjectCostCenterInsert = {
  project_id: string;
  cc_number: string;
  name: string;
  sort_order?: number;
  source_quote_id?: string | null;
  contract_value?: number;
};

export type DbProjectCostCenterUpdate = Partial<
  Omit<DbProjectCostCenterInsert, "project_id">
>;

// ----------------------------------------------------------------------------
// Invoicing (INVOICE-1, migration 0043) — header + flexible lines.
//   invoices       — per-entity number (nullable until issued, then unique),
//                    project/client/site FKs (uuid), tax + holdback rates, and
//                    computed money columns recomputed on every line/setting
//                    change. opco drives the GIN-/NIS- number minted on issue.
//   invoice_lines  — manual OR sourced from a project_cost_centers row at a
//                    full/partial % (progress/deposit). Sourced lines stay
//                    editable; unlinking flips source_type back to 'manual'.
// ----------------------------------------------------------------------------
export type DbInvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface DbInvoice {
  id: string;
  invoice_number: string | null;
  opco: string;
  project_id: string | null;
  client_id: string;
  site_id: string | null;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  tax_rate: number;
  tax_exempt: boolean;
  holdback_rate: number;
  subtotal: number;
  tax_amount: number;
  holdback_amount: number;
  total: number;
  amount_due: number;
  notes: string | null;
  // MATERIALS-1 (migration 0049): which part identifiers compose a material
  // line's text — any combination of
  // 'master_part_number' | 'part_number' | 'name' | 'description'. Default {name}.
  line_identifier_fields: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DbInvoiceInsert = {
  invoice_number?: string | null;
  opco: string;
  project_id?: string | null;
  client_id: string;
  site_id?: string | null;
  status?: string;
  issue_date?: string | null;
  due_date?: string | null;
  currency?: string;
  tax_rate?: number;
  tax_exempt?: boolean;
  holdback_rate?: number;
  subtotal?: number;
  tax_amount?: number;
  holdback_amount?: number;
  total?: number;
  amount_due?: number;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type DbInvoiceUpdate = Partial<DbInvoiceInsert>;

export type DbInvoiceLineSourceType = "manual" | "cost_center";

export interface DbInvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  source_type: string; // 'manual' | 'cost_center' | 'material'
  source_id: string | null; // cost-center id for 'cost_center' AND 'material' lines
  source_pct: number | null;
  sort_order: number;
  // MATERIALS-1 (migration 0049): a material line bills a catalog part and
  // (for a single serialized unit) the specific stock row it came from.
  product_id: string | null;
  source_stock_id: string | null;
  created_at: string;
}

export type DbInvoiceLineInsert = {
  invoice_id: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  source_type?: string;
  source_id?: string | null;
  source_pct?: number | null;
  sort_order?: number;
  product_id?: string | null;
  source_stock_id?: string | null;
};

export type DbInvoiceLineUpdate = Partial<
  Omit<DbInvoiceLineInsert, "invoice_id">
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
