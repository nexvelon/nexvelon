-- ============================================================================
-- Nexvelon · POLISH-53 — Post-deploy Smoke Verification (0071)
-- ============================================================================
-- Run AFTER 0071_client_company_address.sql. Pure-read → COMMIT.
-- Verifies the six company_address_* columns exist on public.clients as text.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'column ' || c.col || ' is text',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name=c.col AND data_type='text'
  ) THEN 'PASS' ELSE 'FAIL' END
FROM (VALUES
  ('company_address_line1'), ('company_address_line2'),
  ('company_address_city'), ('company_address_province'),
  ('company_address_postal'), ('company_address_country')
) AS c(col);

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
