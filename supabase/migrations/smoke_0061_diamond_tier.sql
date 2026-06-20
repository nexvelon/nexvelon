-- ============================================================================
-- Nexvelon · POLISH-7 — Post-deploy Smoke Verification (0061)
-- ============================================================================
-- Run AFTER 0061_diamond_tier.sql. Pure-read → COMMIT.
-- Verifies: both tier CHECK constraints exist by name and allow 'Diamond'.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'clients_tier_check allows Diamond',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'clients'
      AND c.conname = 'clients_tier_check'
      AND pg_get_constraintdef(c.oid) LIKE '%Diamond%'
      AND pg_get_constraintdef(c.oid) LIKE '%Platinum%')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations_tier_requested_check allows Diamond',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'client_invitations'
      AND c.conname = 'client_invitations_tier_requested_check'
      AND pg_get_constraintdef(c.oid) LIKE '%Diamond%'
      AND pg_get_constraintdef(c.oid) LIKE '%Bronze%')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
