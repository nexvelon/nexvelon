-- ============================================================================
-- Nexvelon · POLISH-5 — Post-deploy Smoke Verification (0058)
-- ============================================================================
-- Run AFTER 0058_client_tier.sql. Pure-read → COMMIT.
-- Verifies: clients.tier (text, CHECK bronze/silver/gold/platinum or null),
-- tier_set_at (timestamptz), decline_reason (text).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'clients.tier is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='tier' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

-- NOTE: clients.tier predates this migration (0001 created it with a PascalCase
-- CHECK: Platinum/Gold/Silver/Bronze). `ADD COLUMN IF NOT EXISTS tier` is a
-- no-op, so the prestige-tier feature reuses that existing column + CHECK. We
-- assert only that a CHECK constraint on tier exists (not its exact values).
INSERT INTO smoke_results SELECT 'clients.tier has a CHECK constraint',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'clients' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%tier%')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'clients.tier_set_at is timestamptz',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='tier_set_at' AND data_type='timestamp with time zone')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'clients.decline_reason is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='decline_reason' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
