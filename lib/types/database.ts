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

export type DbClientPaymentMethod =
  | "cheque"
  | "eft"
  | "credit_card"
  | "e_transfer"
  | "wire";

export type DbClientCurrency = "CAD" | "USD";

export type DbSiteStatus =
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

export type ActivityEntityType = "client" | "site" | "contact";
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
