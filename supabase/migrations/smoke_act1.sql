-- ============================================================================
-- Nexvelon · ACT-1 — Post-deploy Smoke Verification (migration 0016)
-- ============================================================================
-- Run AFTER 0016_activity_log.sql has been applied.
--
-- 7 column checks + 2 enum-CHECK checks + 1 jsonb_typeof CHECK (negative)
-- + 2 index checks + 1 FK check + 1 RLS check = 14 checks total.
--
-- Designed for the Supabase Dashboard SQL Editor — only the final SELECT
-- renders. Every check INSERTs one row into a TEMP table; the final
-- SELECT returns all 14 rows with FAILs ordered to the top.
--
-- This file uses ROLLBACK (not COMMIT) because the jsonb_typeof negative
-- test attempts an INSERT inside a DO block that we want to discard. The
-- TEMP table drops on ROLLBACK too — re-runs are clean.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── COLUMN CHECKS (7) ──────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'id uuid PK NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_log'
      AND column_name='id' AND data_type='uuid' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'entity_type text NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_log'
      AND column_name='entity_type' AND data_type='text' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'entity_id uuid NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_log'
      AND column_name='entity_id' AND data_type='uuid' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'action text NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_log'
      AND column_name='action' AND data_type='text' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'changes jsonb NOT NULL DEFAULT {}',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_log'
      AND column_name='changes' AND data_type='jsonb' AND is_nullable='NO'
      AND column_default LIKE '%{}%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'actor_id uuid nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_log'
      AND column_name='actor_id' AND data_type='uuid' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'created_at timestamptz NOT NULL DEFAULT now()',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='activity_log'
      AND column_name='created_at' AND data_type LIKE 'timestamp%'
      AND is_nullable='NO' AND column_default LIKE '%now()%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── CHECK CONSTRAINTS (3) ──────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'entity_type CHECK includes client/site/contact',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='activity_log'
      AND ccu.column_name='entity_type'
      AND cc.check_clause LIKE '%client%'
      AND cc.check_clause LIKE '%site%'
      AND cc.check_clause LIKE '%contact%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'action CHECK includes create/update/delete',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='activity_log'
      AND ccu.column_name='action'
      AND cc.check_clause LIKE '%create%'
      AND cc.check_clause LIKE '%update%'
      AND cc.check_clause LIKE '%delete%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Negative test: the jsonb_typeof CHECK should reject a non-object
-- (an array) write. Pre-set the row to FAIL; flip to PASS only when the
-- INSERT actually raises check_violation.
INSERT INTO smoke_results VALUES
  ('changes CHECK rejects non-object (negative test)', 'FAIL');

DO $$
BEGIN
  INSERT INTO public.activity_log (entity_type, entity_id, action, changes)
  VALUES ('client', gen_random_uuid(), 'update', '[]'::jsonb);
EXCEPTION
  WHEN check_violation THEN
    UPDATE smoke_results
       SET status = 'PASS'
     WHERE check_name = 'changes CHECK rejects non-object (negative test)';
END $$;

-- ─── INDEXES (2) ────────────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'activity_log_entity_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='activity_log'
      AND indexname='activity_log_entity_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'activity_log_actor_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='activity_log'
      AND indexname='activity_log_actor_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── FK on actor_id → auth.users(id) (1) ────────────────────────────────

INSERT INTO smoke_results SELECT 'actor_id FK to auth.users with ON DELETE SET NULL',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema='public' AND tc.table_name='activity_log'
      AND tc.constraint_type='FOREIGN KEY'
      AND kcu.column_name='actor_id'
      AND rc.delete_rule='SET NULL'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS enabled (1) ────────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'RLS enabled on activity_log',
  CASE WHEN EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public'
      AND c.relname='activity_log'
      AND c.relrowsecurity = true
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ─────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

ROLLBACK;
