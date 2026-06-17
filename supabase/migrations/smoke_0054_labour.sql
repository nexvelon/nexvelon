-- ============================================================================
-- Nexvelon · JC-1 — Post-deploy Smoke Verification (0054)
-- ============================================================================
-- Run AFTER 0054_labour.sql. Pure-read → COMMIT.
-- Verifies: techs + labour_entries tables/columns; the two FKs with their
-- delete rules (cost_center_id → project_cost_centers RESTRICT, tech_id →
-- techs SET NULL); RLS enabled on both; four named policies; three indexes.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ── tables ────────────────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'table techs exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='techs')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'table labour_entries exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='labour_entries')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── techs columns ─────────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'techs.name is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='techs'
      AND column_name='name' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'techs.default_cost_rate is numeric nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='techs'
      AND column_name='default_cost_rate' AND data_type='numeric' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'techs.is_active is boolean NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='techs'
      AND column_name='is_active' AND data_type='boolean' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'techs.name has UNIQUE constraint',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE t.relname='techs' AND c.contype='u' AND a.attname='name')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── labour_entries columns ────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'labour_entries.cost_center_id is uuid NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='labour_entries'
      AND column_name='cost_center_id' AND data_type='uuid' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'labour_entries.tech_id is uuid nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='labour_entries'
      AND column_name='tech_id' AND data_type='uuid' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'labour_entries.tech_name is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='labour_entries'
      AND column_name='tech_name' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'labour_entries.worked_on is date NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='labour_entries'
      AND column_name='worked_on' AND data_type='date' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'labour_entries.hours is numeric NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='labour_entries'
      AND column_name='hours' AND data_type='numeric' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'labour_entries.cost_rate is numeric NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='labour_entries'
      AND column_name='cost_rate' AND data_type='numeric' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'labour_entries.amount is numeric NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='labour_entries'
      AND column_name='amount' AND data_type='numeric' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── foreign keys + delete rules (confdeltype: 'r'=RESTRICT, 'n'=SET NULL) ──
INSERT INTO smoke_results SELECT 'FK cost_center_id -> project_cost_centers ON DELETE RESTRICT',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint c
    JOIN pg_class t  ON t.oid=c.conrelid
    JOIN pg_class rt ON rt.oid=c.confrelid
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype='f' AND t.relname='labour_entries'
      AND rt.relname='project_cost_centers' AND a.attname='cost_center_id'
      AND c.confdeltype='r')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'FK tech_id -> techs ON DELETE SET NULL',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint c
    JOIN pg_class t  ON t.oid=c.conrelid
    JOIN pg_class rt ON rt.oid=c.confrelid
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype='f' AND t.relname='labour_entries'
      AND rt.relname='techs' AND a.attname='tech_id'
      AND c.confdeltype='n')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── RLS enabled ───────────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'RLS enabled on techs',
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='techs' AND relrowsecurity)
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'RLS enabled on labour_entries',
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='labour_entries' AND relrowsecurity)
  THEN 'PASS' ELSE 'FAIL' END;

-- ── policies by name ──────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'policy techs_select_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='techs' AND policyname='techs_select_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy techs_write_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='techs' AND policyname='techs_write_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy labour_entries_select_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='labour_entries' AND policyname='labour_entries_select_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy labour_entries_write_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='labour_entries' AND policyname='labour_entries_write_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── indexes by name ───────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'index labour_entries_cost_center_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='labour_entries_cost_center_idx')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index labour_entries_tech_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='labour_entries_tech_idx')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index labour_entries_worked_on_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='labour_entries_worked_on_idx')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
