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
  created_at: string;
  updated_at: string;
  created_by: string | null;
  deleted_at: string | null;
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
};

export type DbSiteUpdate = Partial<DbSiteInsert>;

// ----------------------------------------------------------------------------
// public.contacts
// ----------------------------------------------------------------------------
export interface DbContact {
  id: string;
  client_id: string | null;
  site_id: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  is_primary: boolean;
  is_billing: boolean;
  is_emergency: boolean;
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
  phone?: string | null;
  mobile?: string | null;
  is_primary?: boolean;
  is_billing?: boolean;
  is_emergency?: boolean;
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
