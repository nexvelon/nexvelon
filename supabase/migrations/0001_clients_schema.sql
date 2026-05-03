-- ============================================================================
-- Nexvelon · 0001 · Clients module schema
-- ============================================================================
-- Three tables (clients, sites, contacts) with relationships, indexes,
-- updated_at triggers, and permissive RLS policies for authenticated users.
-- The permissive policies will be replaced with role-aware ones once the
-- users module ships and we have a user_id ↔ role mapping in the database.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto (Supabase enables it by default, but
-- we declare the dependency explicitly so this script is self-contained).
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Shared trigger function: stamps updated_at on every UPDATE.
-- ----------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.handle_updated_at() is
  'BEFORE UPDATE trigger that stamps updated_at = now() on the row.';


-- ============================================================================
-- clients · master client directory
-- ============================================================================
create table public.clients (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  legal_name          text,
  client_code         text unique,                                                    -- e.g. "MCP-0017"
  type                text check (type in (
                        'Commercial','Industrial','Residential',
                        'Healthcare','Education','Government','Heritage'
                      )),
  tier                text check (tier in ('Platinum','Gold','Silver','Bronze')),
  status              text not null default 'Active'
                        check (status in ('Active','Inactive','Prospect','Lost')),
  account_manager_id  uuid,                                                           -- FK → users.id (added later)
  industry            text,
  notes               text,
  tags                text[],
  lifetime_value      numeric(14,2) not null default 0,
  ytd_revenue         numeric(14,2) not null default 0,
  nps_score           integer,
  last_nps_date       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,                                                           -- FK → users.id (added later)
  deleted_at          timestamptz                                                     -- soft delete
);

comment on table  public.clients              is 'Nexvelon · master client directory.';
comment on column public.clients.client_code  is 'Human-readable account number, e.g. "MCP-0017".';
comment on column public.clients.tags         is 'Free-form text tags for grouping / filtering.';
comment on column public.clients.deleted_at   is 'Non-null = soft-deleted. Hard delete only by admins.';

create        index clients_name_idx        on public.clients (name);
create        index clients_tier_idx        on public.clients (tier);
create        index clients_status_idx      on public.clients (status);
-- client_code's UNIQUE constraint already creates a btree index — no extra one needed.

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.handle_updated_at();


-- ============================================================================
-- sites · operating sites belonging to a client
-- ============================================================================
create table public.sites (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients(id) on delete cascade,
  name                text not null,                                                   -- e.g. "Bay 4 (Cleanroom)"
  site_code           text,
  address_line1       text,
  address_line2       text,
  city                text,
  province            text,
  postal_code         text,
  country             text not null default 'Canada',
  latitude            numeric(10,7),
  longitude           numeric(10,7),
  panel_system        text,                                                            -- e.g. "Genetec Synergis 4.3"
  cameras_count       integer not null default 0,
  controllers_count   integer not null default 0,
  doors_count         integer not null default 0,
  cards_issued        integer not null default 0,
  intrusion_system    text,
  site_lead_id        uuid,                                                            -- FK → users.id (added later)
  status              text not null default 'Active'
                        check (status in ('Active','In Project','Maintained','Decommissioned')),
  last_service_date   date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

comment on table  public.sites      is 'Nexvelon · operating sites belonging to a client.';
comment on column public.sites.name is 'Human-readable site label (e.g. "Headquarters", "Bay 4").';

create        index sites_client_id_idx on public.sites (client_id);
create        index sites_status_idx    on public.sites (status);

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.handle_updated_at();


-- ============================================================================
-- contacts · client / site personnel
-- ============================================================================
create table public.contacts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete cascade,
  site_id       uuid references public.sites(id)   on delete set null,
  first_name    text not null,
  last_name     text not null,
  title         text,
  department    text,
  email         text,
  phone         text,
  mobile        text,
  is_primary    boolean not null default false,
  is_billing    boolean not null default false,
  is_emergency  boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

comment on table public.contacts is 'Nexvelon · client- and site-level personnel contacts.';

create        index contacts_client_id_idx on public.contacts (client_id);
create        index contacts_site_id_idx   on public.contacts (site_id);
create        index contacts_email_idx     on public.contacts (email);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.handle_updated_at();


-- ============================================================================
-- Row-Level Security
-- ============================================================================
-- Phase 1: every authenticated user can read/write everything.
-- Phase 2 (after the users module ships): policies will look up the
-- caller's role and scope reads/writes accordingly.

alter table public.clients  enable row level security;
alter table public.sites    enable row level security;
alter table public.contacts enable row level security;

-- clients ---------------------------------------------------------------------
drop policy if exists "authenticated_all_clients" on public.clients;
create policy "authenticated_all_clients"
  on public.clients
  for all
  to authenticated
  using (true)
  with check (true);

-- sites -----------------------------------------------------------------------
drop policy if exists "authenticated_all_sites" on public.sites;
create policy "authenticated_all_sites"
  on public.sites
  for all
  to authenticated
  using (true)
  with check (true);

-- contacts --------------------------------------------------------------------
drop policy if exists "authenticated_all_contacts" on public.contacts;
create policy "authenticated_all_contacts"
  on public.contacts
  for all
  to authenticated
  using (true)
  with check (true);
