// ============================================================================
// Database row types — mirror supabase/migrations/0001_clients_schema.sql 1:1.
// Update this file if the migration changes.
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
