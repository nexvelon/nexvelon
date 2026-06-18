-- ============================================================================
-- Nexvelon · POLISH-3 — Post-deploy Smoke Verification (0056)
-- ============================================================================
-- Run AFTER 0056_history_delete_and_invites.sql. Pure-read → COMMIT.
-- Verifies: DELETE policies on stock_movements + quote_audit_log; the
-- clients.pending_review / invited_at columns; the client_invitations table +
-- columns + RLS + four named policies + two indexes.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ── DELETE policies on the append-only tables ─────────────────────────────
INSERT INTO smoke_results SELECT 'policy stock_movements_delete_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stock_movements'
      AND policyname='stock_movements_delete_authenticated' AND cmd='DELETE')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy quote_audit_log_delete_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='quote_audit_log'
      AND policyname='quote_audit_log_delete_authenticated' AND cmd='DELETE')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── clients columns ───────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'clients.pending_review is boolean NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='pending_review' AND data_type='boolean' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'clients.invited_at is timestamptz nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='invited_at' AND data_type='timestamp with time zone'
      AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── client_invitations table + key columns ────────────────────────────────
INSERT INTO smoke_results SELECT 'table client_invitations exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='client_invitations')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations.token is text UNIQUE NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='token' AND data_type='text' AND is_nullable='NO')
  AND EXISTS (SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE t.relname='client_invitations' AND c.contype='u' AND a.attname='token')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations.email is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='email' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations.client_form_data is jsonb',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='client_form_data' AND data_type='jsonb')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations.submitted_at is timestamptz nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='submitted_at' AND data_type='timestamp with time zone')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── RLS + policies by name ────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'RLS enabled on client_invitations',
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='client_invitations' AND relrowsecurity)
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy client_invitations_select_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='client_invitations'
      AND policyname='client_invitations_select_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy client_invitations_write_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='client_invitations'
      AND policyname='client_invitations_write_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy client_invitations_anon_select_by_token exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='client_invitations'
      AND policyname='client_invitations_anon_select_by_token')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy client_invitations_anon_update_by_token exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='client_invitations'
      AND policyname='client_invitations_anon_update_by_token')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── indexes by name ───────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'index client_invitations_token_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='client_invitations_token_idx')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index client_invitations_email_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='client_invitations_email_idx')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
