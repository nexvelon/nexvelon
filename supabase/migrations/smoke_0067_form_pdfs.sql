-- ============================================================================
-- Nexvelon · POLISH-38 — Post-deploy Smoke Verification (0067)
-- ============================================================================
-- Run AFTER 0067_form_pdfs.sql. Pure-read → COMMIT.
-- Verifies: the two form-PDF path columns exist as text.
-- NOTE: also create the private storage bucket "invitation-form-pdfs" in the
-- Supabase Dashboard (service-role only) — that is a Dashboard step, not SQL.
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
FROM (VALUES ('client_form_pdf_path'), ('site_form_pdf_path')) AS c(col);

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
