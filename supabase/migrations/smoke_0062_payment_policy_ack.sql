-- ============================================================================
-- Nexvelon · POLISH-9 — Post-deploy Smoke Verification (0062)
-- ============================================================================
-- Run AFTER 0062_payment_policy_ack.sql. Pure-read → COMMIT.
-- Verifies: the two payment-policy acknowledgment timestamp columns exist.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'client_form_payment_policies_acknowledged_at is timestamptz',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='client_form_payment_policies_acknowledged_at'
      AND data_type='timestamp with time zone')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'site_form_payment_policies_acknowledged_at is timestamptz',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='site_form_payment_policies_acknowledged_at'
      AND data_type='timestamp with time zone')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
