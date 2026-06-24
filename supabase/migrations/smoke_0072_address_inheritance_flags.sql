-- ============================================================================
-- Nexvelon · POLISH-54 — Post-deploy Smoke Verification (0072)
-- ============================================================================
-- Run AFTER 0072_address_inheritance_flags.sql. Pure-read → COMMIT.
-- Verifies: the three client flag columns exist as boolean NOT NULL, and that
-- the backfill left no client with an empty billing while a company address is
-- present (i.e. POLISH-53 NULL-billing rows were resolved).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'flag column ' || c.col || ' exists (boolean NOT NULL)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name=c.col AND data_type='boolean' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END
FROM (VALUES
  ('billing_same_as_company'),
  ('mailing_same_as_billing'),
  ('mailing_same_as_company')
) AS c(col);

-- Backfill heuristic: no client should have a company address but NULL billing.
INSERT INTO smoke_results
SELECT 'no client left with company address but NULL billing',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE company_address_line1 IS NOT NULL
      AND billing_street IS NULL AND billing_city IS NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
