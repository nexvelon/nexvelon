-- 0136_devreg1_device_register.sql
-- DEVREG-1 — the Device Register (Phase-2 foundation, docs/PHASE2_FEATURES.md §1/F).
--
-- Nothing in the ERP recorded the devices installed at a site. Inventory knows
-- CATALOG products and stock lots; commissioning_items are free-text checklist
-- rows with no device identity (no type, location, label or network fields). So
-- this is a NEW register, not a widening of an existing table. commissioning_items
-- is NOT modified here; linking a checklist item to a device is a later, additive
-- step.
--
-- THREE new tables, full §3 boilerplate on each (GRANT authenticated +
-- service_role, RLS, policies, never anon). ADDITIVE only (§1). The one change to
-- an existing table is the activity_log entity_type CHECK widening (the
-- established pattern, adding 'device' and 'device_floor').
--
--   device_types  — the type vocabulary, keyed by Riser Studio's catalog type id
--                   (text, NO CHECK on the id list: the catalog grows, §1). Ships
--                   EMPTY; the catalog is loaded by a later chunk (DEVREG-2). An id
--                   not in this table reads as "unmatched", never a guess (§2.8).
--   device_floors — per-site floor geometry: the external building/floor keys from
--                   each source, and the plan image's REAL-WORLD extent that
--                   converts metres ↔ normalised plan coordinates. Every scale
--                   column is nullable: an unknown scale stays unknown and the
--                   conversion refuses (never fabricated).
--   devices       — one row per physical device at a site.
--
-- POSITION (decision 2C): canonical = METRES on the authored floor (pos_x_m,
-- pos_z_m). The 0–1 normalised plan position (pos_u, pos_v) is ALSO stored when a
-- source supplied it, because it is authoritative for that source. NEITHER is ever
-- derived and written back: the other frame is computed on read, and only when the
-- floor's plan origin and extent are all known.
--
-- DESIGN vs AS-BUILT (decision 3b, §2.2): `design` holds the as-designed source
-- record verbatim (Riser Studio) and `as_built` the commissioned record verbatim
-- (3D System Design View). The application never writes as-built values into
-- `design`; a design is replaced only by a new design import, and the replaced
-- snapshot is preserved in the activity_log `changes` of that update.

BEGIN;

-- ── device_types ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_types (
  -- Riser Studio catalog type id, stored and returned byte-for-byte.
  id text PRIMARY KEY,
  name text NOT NULL,
  -- access | cctv | fire | intrusion | network | intercom | electrical | … (no CHECK, §1)
  system text,
  label_prefix text,
  default_mount_height_m numeric,
  default_cable_type text,
  homes_to text,
  -- [angle, range] for cameras; null otherwise.
  default_fov jsonb,
  -- [[name, qty], …] accessory pairs, verbatim. The catalog carries NO pricing.
  accessories jsonb,
  -- Where this vocabulary entry came from (e.g. 'riser_studio'). Free text.
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── device_floors ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  -- External keys, verbatim: Riser Studio building id `b` / floor id `f`, and the
  -- 3D viewer's floor `lvl`. Any may be null (a floor known to only one source).
  building_key text,
  building_name text,
  floor_key text,
  level_key text,
  label text,
  sort_order int NOT NULL DEFAULT 0,
  -- Riser Studio floor-to-floor height `h`, metres. Null = unknown.
  floor_height_m numeric,
  -- The floor plan image (an existing attachment), if one is linked.
  plan_attachment_id uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  -- Plan image aspect, width ÷ height (the viewer's floor w/h). Null = no plan.
  plan_aspect numeric,
  -- Real-world placement of the plan image on the authored floor, in metres:
  -- the floor coordinate of the image's top-left corner, and the real width and
  -- depth the image covers. ALL FOUR must be set for any metres ↔ 0–1 conversion;
  -- otherwise the conversion refuses with "scale unknown".
  plan_origin_x_m numeric,
  plan_origin_z_m numeric,
  plan_width_m numeric,
  plan_depth_m numeric,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT device_floors_extent_positive_chk CHECK (
    (plan_width_m IS NULL OR plan_width_m > 0) AND (plan_depth_m IS NULL OR plan_depth_m > 0)
    AND (plan_aspect IS NULL OR plan_aspect > 0)
  )
);

-- ── devices ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The device's home (decision 3a). A site outlives any project, so every device
  -- belongs to exactly one site. RESTRICT: a site with devices can't be hard-deleted.
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  -- The project it was designed/installed under, if known. Later projects that
  -- service it do NOT re-own it. It also carries the opco (decision 3e).
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  floor_id uuid REFERENCES public.device_floors(id) ON DELETE SET NULL,
  -- External keys, verbatim (Riser `b` / `f`), kept even when no floor row matches.
  building_key text,
  floor_key text,
  -- `lab` (CAM-01, D-003). Unique per site + building among live devices (3g).
  label text,
  -- Type id, verbatim from the source (Riser `t`, or the CSV "type" column). Never
  -- rewritten. "Matched" = present in device_types; otherwise it reads as unmatched.
  type_id text,
  system text,
  model text,
  -- Canonical position, metres on the authored floor (2C).
  pos_x_m numeric,
  pos_z_m numeric,
  -- Normalised 0–1 plan position, only when a source supplied it (2C).
  pos_u numeric,
  pos_v numeric,
  rotation_deg numeric,
  mount_height_m numeric,
  cable_type text,
  homes_to text,
  door_group text,
  -- Network fields (decision 3d) — ip, mask, gw, vlan, sw, swip, port, mbps, ch,
  -- nvr[], inj. NULL for a non-network device (a door contact stores nothing here).
  network jsonb,
  -- Conduit route polyline in normalised plan space [[u,v],…] (3D viewer `r`).
  route jsonb,
  install_detail text,
  notes text,
  -- Verbatim source records (3b). Unknown keys are preserved so both external
  -- models round-trip without loss.
  design jsonb,
  as_built jsonb,
  -- Where the record came from: 'manual' | 'csv_import' | 'riser_studio' |
  -- 'as_built_viewer'. No CHECK (§1); the app writes these values.
  source text NOT NULL DEFAULT 'manual',
  -- The source's own device id (Riser `id` / viewer `id`), for re-import matching.
  external_id text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT devices_pos_norm_range_chk CHECK (
    (pos_u IS NULL OR (pos_u >= 0 AND pos_u <= 1)) AND (pos_v IS NULL OR (pos_v >= 0 AND pos_v <= 1))
  )
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- 3g — a label is unique within one site + building among LIVE devices. Two
-- buildings may each have a CAM-01; a label-less device is never constrained.
CREATE UNIQUE INDEX IF NOT EXISTS devices_site_building_label_uniq
  ON public.devices (site_id, coalesce(building_key, ''), lower(label))
  WHERE deleted_at IS NULL AND label IS NOT NULL;
CREATE INDEX IF NOT EXISTS devices_site_idx ON public.devices (site_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS devices_project_idx ON public.devices (project_id);
CREATE INDEX IF NOT EXISTS devices_floor_idx ON public.devices (floor_id);
CREATE INDEX IF NOT EXISTS devices_type_idx ON public.devices (type_id);
-- Search by IP (3d trade-off: jsonb, with an expression index for the hot lookup).
CREATE INDEX IF NOT EXISTS devices_network_ip_idx ON public.devices ((network->>'ip'));
CREATE INDEX IF NOT EXISTS devices_external_idx ON public.devices (site_id, source, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS device_floors_site_keys_uniq
  ON public.device_floors (site_id, coalesce(building_key, ''), coalesce(floor_key, ''), coalesce(level_key, ''))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS device_floors_site_idx ON public.device_floors (site_id);

-- ── updated_at triggers ───────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON public.device_types;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.device_types
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.device_floors;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.device_floors
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.devices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── §3 boilerplate — GRANT + RLS + policies (never anon) ──────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_types TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_floors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_floors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO service_role;

ALTER TABLE public.device_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Row access open to authenticated (the projects/commissioning posture); the app
-- gates reads with projects:view and writes with projects:edit / projects:delete.
CREATE POLICY device_types_select_authenticated
  ON public.device_types FOR SELECT TO authenticated USING (true);
CREATE POLICY device_types_all_authenticated
  ON public.device_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY device_floors_select_authenticated
  ON public.device_floors FOR SELECT TO authenticated USING (true);
CREATE POLICY device_floors_all_authenticated
  ON public.device_floors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY devices_select_authenticated
  ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY devices_all_authenticated
  ON public.devices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── §5 — widen activity_log entity_type for 'device' + 'device_floor' ─────────
-- Reproduces the COMPLETE existing list (0135) + the new values. Keep in lockstep
-- with ACTIVITY_ENTITY_TYPES in lib/types/database.ts (the AUDIT-FIX-1 drift test).
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
    'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
    'ui_theme', 'inventory', 'attachment',
    'job', 'job_task', 'deficiency', 'commissioning_item',
    'subcontractor', 'subcontractor_compliance',
    'balance_snapshot',
    'service_contract',
    'saved_report',
    -- DEVREG-1 additions:
    'device', 'device_floor'
  ));

COMMIT;

-- ── Existence check (run after applying, every line should match its comment) ─
--   -- Tables (expect 3)
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--     AND table_name IN ('device_types','device_floors','devices');
--
--   -- RLS enabled on all three (expect 3 rows, all true)
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('device_types','device_floors','devices');
--
--   -- Policies (expect 6)
--   SELECT tablename, policyname FROM pg_policies
--     WHERE tablename IN ('device_types','device_floors','devices');
--
--   -- Grants to authenticated + service_role (expect 24 = 3 tables × 4 privileges × 2 roles)
--   SELECT count(*) FROM information_schema.role_table_grants
--     WHERE table_name IN ('device_types','device_floors','devices')
--       AND grantee IN ('authenticated','service_role')
--       AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');
--
--   -- anon: this migration grants nothing to anon. NOTE the project's default
--   -- privileges (pg_default_acl on public) give anon table privileges on EVERY new
--   -- table, as on clients/activity_log/saved_reports, so the grant count is NOT 0.
--   -- anon's effective access is nil because no policy names anon: RLS denies it.
--   -- Verify with (expect 0 rows): policies that apply to anon
--   SELECT tablename, policyname FROM pg_policies
--     WHERE tablename IN ('device_types','device_floors','devices')
--       AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
--
--   -- Named constraints (expect 3): device_floors_extent_positive_chk,
--   -- devices_pos_norm_range_chk, activity_log_entity_type_check
--   SELECT conname FROM pg_constraint WHERE conname IN (
--     'device_floors_extent_positive_chk','devices_pos_norm_range_chk','activity_log_entity_type_check');
--
--   -- Foreign keys (expect 5): device_floors.site_id, device_floors.plan_attachment_id,
--   -- devices.site_id, devices.project_id, devices.floor_id
--   SELECT conrelid::regclass, conname FROM pg_constraint WHERE contype='f'
--     AND conrelid IN ('public.device_floors'::regclass,'public.devices'::regclass) ORDER BY 1,2;
--
--   -- Unique indexes (expect 2): devices_site_building_label_uniq, device_floors_site_keys_uniq
--   SELECT indexname FROM pg_indexes WHERE indexname IN
--     ('devices_site_building_label_uniq','device_floors_site_keys_uniq');
--
--   -- activity_log CHECK now allows 'device' and 'device_floor' (expect true)
--   SELECT pg_get_constraintdef(oid) LIKE '%''device''%''device_floor''%'
--     FROM pg_constraint WHERE conname='activity_log_entity_type_check';

-- ── Rollback (reverse migration) ──────────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
-- ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--   CHECK (entity_type IN (
--     'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
--     'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
--     'ui_theme', 'inventory', 'attachment',
--     'job', 'job_task', 'deficiency', 'commissioning_item',
--     'subcontractor', 'subcontractor_compliance',
--     'balance_snapshot', 'service_contract', 'saved_report'));
--   -- (fails if 'device'/'device_floor' audit rows exist, by design: delete those
--   --  rows deliberately first, or keep the wider CHECK)
-- DROP TABLE IF EXISTS public.devices;
-- DROP TABLE IF EXISTS public.device_floors;
-- DROP TABLE IF EXISTS public.device_types;
-- COMMIT;
