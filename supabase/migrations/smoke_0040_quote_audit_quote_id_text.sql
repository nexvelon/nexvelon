-- ============================================================================
-- Nexvelon · AUDIT-FIX — Post-deploy Smoke Verification (migration 0040)
-- ============================================================================
-- Run AFTER 0040_quote_audit_quote_id_text.sql has been applied.
--
-- Verifies quote_audit_log.quote_id is now text (so app-minted "q-..." quote
-- ids can be stored) and the quote index still exists. Pure-read → COMMIT.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'quote_audit_log.quote_id is text NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quote_audit_log'
      AND column_name='quote_id' AND data_type='text' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'quote index still present',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='quote_audit_log'
      AND indexname='quote_audit_log_quote_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
