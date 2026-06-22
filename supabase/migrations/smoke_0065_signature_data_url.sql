-- ============================================================================
-- Nexvelon · POLISH-23 — Post-deploy Smoke Verification (0065)
-- ============================================================================
-- Run AFTER 0065_signature_data_url.sql. Pure-read → COMMIT.
-- Verifies: the two temporary signature-data-url columns exist as text.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'column ' || c.col || ' is text',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name=c.col AND data_type='text'
  ) THEN 'PASS' ELSE 'FAIL' END
FROM (VALUES ('tc1_signature_data_url'), ('tc2_signature_data_url')) AS c(col);

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
