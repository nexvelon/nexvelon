-- ============================================================================
-- Nexvelon · Permissions Chunk 1 — Post-deploy Smoke Verification
-- ============================================================================
-- Run AFTER 0005_permissions_chunk_01_catalog_tables.sql has been applied
-- to staging or production. These queries are READ-ONLY and produce the
-- evidence the operator needs to verify the chunk landed cleanly.
--
-- Expected outcomes are noted inline. Diff each column-list block against
-- NEXVELON_PERMISSIONS_DESIGN.md (Pass 2 / Pass 4 / Pass 5 / Pass 11).
--
-- USAGE:
--   psql "$DB_URL" -f supabase/migrations/smoke_chunk_01.sql
-- ============================================================================

\echo
\echo === Check 1: All 11 tables exist (expect count = 11) ===
\echo

SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'permission_definitions',
    'field_visibility_definitions',
    'data_scope_definitions',
    'separation_of_duties_constraints',
    'geolocation_retention_policies',
    'feature_flags',
    'role_permissions',
    'role_field_visibility',
    'role_data_scopes',
    'status_behavior_bindings',
    'status_transition_definitions'
  );

\echo
\echo === Check 2: Column-list per table (diff against design doc) ===
\echo

\echo --- 2.1 permission_definitions ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'permission_definitions'
ORDER BY ordinal_position;

\echo --- 2.2 field_visibility_definitions ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'field_visibility_definitions'
ORDER BY ordinal_position;

\echo --- 2.3 data_scope_definitions ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'data_scope_definitions'
ORDER BY ordinal_position;

\echo --- 2.4 separation_of_duties_constraints ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'separation_of_duties_constraints'
ORDER BY ordinal_position;

\echo --- 2.5 geolocation_retention_policies ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'geolocation_retention_policies'
ORDER BY ordinal_position;

\echo --- 2.6 feature_flags ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'feature_flags'
ORDER BY ordinal_position;

\echo --- 2.7 role_permissions ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'role_permissions'
ORDER BY ordinal_position;

\echo --- 2.8 role_field_visibility ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'role_field_visibility'
ORDER BY ordinal_position;

\echo --- 2.9 role_data_scopes ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'role_data_scopes'
ORDER BY ordinal_position;

\echo --- 2.10 status_behavior_bindings ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'status_behavior_bindings'
ORDER BY ordinal_position;

\echo --- 2.11 status_transition_definitions ---
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'status_transition_definitions'
ORDER BY ordinal_position;

\echo
\echo === Check 3: Constraints per table (FKs, CHECKs, UNIQUEs, PKs) ===
\echo === Confirm role_id FK is ABSENT on role_permissions /             ===
\echo === role_field_visibility / role_data_scopes per Decision 2.       ===
\echo

SELECT
  c.conrelid::regclass::text AS table_name,
  c.conname                  AS constraint_name,
  CASE c.contype
    WHEN 'c' THEN 'CHECK'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    ELSE c.contype::text
  END                        AS constraint_type,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class      t ON t.oid = c.conrelid
JOIN pg_namespace  n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN (
    'permission_definitions',
    'field_visibility_definitions',
    'data_scope_definitions',
    'separation_of_duties_constraints',
    'geolocation_retention_policies',
    'feature_flags',
    'role_permissions',
    'role_field_visibility',
    'role_data_scopes',
    'status_behavior_bindings',
    'status_transition_definitions'
  )
ORDER BY t.relname, c.contype, c.conname;

\echo
\echo === Check 4: Indexes per table ===
\echo

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'permission_definitions',
    'field_visibility_definitions',
    'data_scope_definitions',
    'separation_of_duties_constraints',
    'geolocation_retention_policies',
    'feature_flags',
    'role_permissions',
    'role_field_visibility',
    'role_data_scopes',
    'status_behavior_bindings',
    'status_transition_definitions'
  )
ORDER BY tablename, indexname;

\echo
\echo === Check 5: Row counts — every table must be 0 (no seed in this chunk) ===
\echo

SELECT 'permission_definitions'           AS table_name, COUNT(*) AS row_count FROM public.permission_definitions
UNION ALL SELECT 'field_visibility_definitions',     COUNT(*) FROM public.field_visibility_definitions
UNION ALL SELECT 'data_scope_definitions',           COUNT(*) FROM public.data_scope_definitions
UNION ALL SELECT 'separation_of_duties_constraints', COUNT(*) FROM public.separation_of_duties_constraints
UNION ALL SELECT 'geolocation_retention_policies',   COUNT(*) FROM public.geolocation_retention_policies
UNION ALL SELECT 'feature_flags',                    COUNT(*) FROM public.feature_flags
UNION ALL SELECT 'role_permissions',                 COUNT(*) FROM public.role_permissions
UNION ALL SELECT 'role_field_visibility',            COUNT(*) FROM public.role_field_visibility
UNION ALL SELECT 'role_data_scopes',                 COUNT(*) FROM public.role_data_scopes
UNION ALL SELECT 'status_behavior_bindings',         COUNT(*) FROM public.status_behavior_bindings
UNION ALL SELECT 'status_transition_definitions',    COUNT(*) FROM public.status_transition_definitions
ORDER BY table_name;

\echo
\echo === Check 6: No triggers exist on any of the 11 tables ===
\echo === (Triggers ship in Chunks 3 and 4.)                ===
\echo

SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN (
    'permission_definitions',
    'field_visibility_definitions',
    'data_scope_definitions',
    'separation_of_duties_constraints',
    'geolocation_retention_policies',
    'feature_flags',
    'role_permissions',
    'role_field_visibility',
    'role_data_scopes',
    'status_behavior_bindings',
    'status_transition_definitions'
  );
-- Expected: 0 rows.

\echo
\echo === Smoke verification complete. ===
\echo === Diff outputs against NEXVELON_PERMISSIONS_DESIGN.md ===
\echo === Pass 2 §11.1, §11.3, §12.1-2, §13.1-2, §15.1, §15.3 ===
\echo === Pass 5 §13.1-2; Pass 11 §13.                       ===
