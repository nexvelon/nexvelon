-- ============================================================================
-- Nexvelon · POLISH-4 — Post-deploy Smoke Verification (0057)
-- ============================================================================
-- Run AFTER 0057_invite_type.sql. Pure-read → COMMIT.
-- Verifies: client_invitations.invite_type column (text NOT NULL, default
-- 'full') and its CHECK constraint allowing only 'full' / 'site_only'.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'client_invitations.invite_type is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='invite_type' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'invite_type default is ''full''',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='invite_type' AND column_default LIKE '%full%')
  THEN 'PASS' ELSE 'FAIL' END;

-- CHECK constraint exists on the table referencing invite_type and naming both
-- allowed values.
INSERT INTO smoke_results SELECT 'invite_type CHECK (full, site_only) exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'client_invitations'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%invite_type%'
      AND pg_get_constraintdef(c.oid) LIKE '%full%'
      AND pg_get_constraintdef(c.oid) LIKE '%site_only%')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
