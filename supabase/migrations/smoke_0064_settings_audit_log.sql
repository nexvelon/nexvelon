-- ============================================================================
-- Nexvelon · POLISH-17 — Post-deploy Smoke Verification (0064)
-- ============================================================================
-- Run AFTER 0064_settings_audit_log.sql. Pure-read → COMMIT.
-- Verifies: settings_audit_log table + columns + action_type CHECK + indexes +
-- RLS enabled + the two named policies (and NO delete policy — append-only).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

-- Table exists
INSERT INTO smoke_results SELECT 'settings_audit_log table exists',
  CASE WHEN to_regclass('public.settings_audit_log') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;

-- Required columns (name + type)
INSERT INTO smoke_results
SELECT 'column ' || c.col || ' is ' || c.typ,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='settings_audit_log'
      AND column_name=c.col AND data_type=c.typ
  ) THEN 'PASS' ELSE 'FAIL' END
FROM (VALUES
  ('id','uuid'),
  ('setting_key','text'),
  ('before_text','text'),
  ('after_text','text'),
  ('edited_by_user_id','uuid'),
  ('edited_by_email','text'),
  ('edited_by_name','text'),
  ('edited_at','timestamp with time zone'),
  ('action_type','text'),
  ('restored_from_audit_id','uuid'),
  ('change_summary','text')
) AS c(col, typ);

-- action_type CHECK constraint restricts to edit/restore
INSERT INTO smoke_results SELECT 'action_type CHECK (edit, restore)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.settings_audit_log'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%action_type%'
      AND pg_get_constraintdef(oid) ILIKE '%edit%'
      AND pg_get_constraintdef(oid) ILIKE '%restore%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Indexes
INSERT INTO smoke_results SELECT 'index ' || i,
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='settings_audit_log' AND indexname=i)
  THEN 'PASS' ELSE 'FAIL' END
FROM (VALUES ('settings_audit_log_setting_key_idx'), ('settings_audit_log_edited_at_idx')) AS x(i);

-- RLS enabled
INSERT INTO smoke_results SELECT 'RLS enabled',
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.settings_audit_log'::regclass)
  THEN 'PASS' ELSE 'FAIL' END;

-- Named policies present
INSERT INTO smoke_results SELECT 'policy ' || p,
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='settings_audit_log' AND policyname=p)
  THEN 'PASS' ELSE 'FAIL' END
FROM (VALUES ('settings_audit_log_select_authenticated'), ('settings_audit_log_insert_authenticated')) AS x(p);

-- Append-only: NO delete policy exists
INSERT INTO smoke_results SELECT 'no DELETE policy (append-only)',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='settings_audit_log' AND cmd='DELETE')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
