-- ============================================================================
-- Nexvelon · POLISH-5 — Post-deploy Smoke Verification (0059)
-- ============================================================================
-- Run AFTER 0059_invitation_decision.sql. Pure-read → COMMIT.
-- Verifies: client_invitations.decision (text, CHECK approved/declined or null),
-- decided_at (timestamptz), decided_by (uuid).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'client_invitations.decision is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='decision' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'decision CHECK (approved/declined) exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'client_invitations' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%decision%'
      AND pg_get_constraintdef(c.oid) LIKE '%approved%'
      AND pg_get_constraintdef(c.oid) LIKE '%declined%')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations.decided_at is timestamptz',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='decided_at' AND data_type='timestamp with time zone')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations.decided_by is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='decided_by' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'client_invitations.decline_reason is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='decline_reason' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
