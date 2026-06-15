-- ============================================================================
-- Nexvelon · AUDIT-1 — Post-deploy Smoke Verification (migration 0038)
-- ============================================================================
-- Run AFTER 0038_quote_audit_log.sql has been applied.
--
-- Verifies the quote_audit_log table + columns + index exist, RLS is enabled,
-- and immutability holds: EXACTLY ONE policy (admin SELECT via is_admin()) and
-- NO insert/update/delete policy. Pure-read → COMMIT.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- 1 — all seven columns exist with the expected core types.
INSERT INTO smoke_results SELECT 'quote_audit_log has all 7 columns',
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quote_audit_log'
      AND column_name IN ('id','quote_id','actor_id','actor_name','event_type','changes','created_at')
  ) = 7 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'event_type text NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quote_audit_log'
      AND column_name='event_type' AND data_type='text' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'changes is jsonb NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quote_audit_log'
      AND column_name='changes' AND data_type='jsonb' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- 2 — the (quote_id, created_at) index exists.
INSERT INTO smoke_results SELECT 'quote_audit_log_quote_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='quote_audit_log'
      AND indexname='quote_audit_log_quote_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- 3 — RLS enabled.
INSERT INTO smoke_results SELECT 'RLS enabled on quote_audit_log',
  CASE WHEN (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.quote_audit_log'::regclass
  ) THEN 'PASS' ELSE 'FAIL' END;

-- 4 — EXACTLY ONE policy, and it is a SELECT policy (immutability).
INSERT INTO smoke_results SELECT 'exactly one policy on quote_audit_log',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='quote_audit_log'
  ) = 1 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'the only policy is admin SELECT (no write policies)',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='quote_audit_log'
      AND cmd='SELECT' AND qual ILIKE '%is_admin%'
  ) = 1 AND (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='quote_audit_log'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ) = 0 THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
