-- ============================================================================
-- Nexvelon · POLISH-6 — Post-deploy Smoke Verification (0060)
-- ============================================================================
-- Run AFTER 0060_invite_snapshots_and_signatures.sql. Pure-read → COMMIT.
-- Verifies: the six new client_invitations columns + tier_requested CHECK; the
-- three sites GC columns; the two private Storage buckets.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ── client_invitations new columns ────────────────────────────────────────
INSERT INTO smoke_results SELECT 'client_invitations.submission_snapshot is jsonb',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='submission_snapshot' AND data_type='jsonb')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tc1_signature_image_path exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='tc1_signature_image_path' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tc2_signature_image_path exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='tc2_signature_image_path' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tc1_signed_pdf_path exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='tc1_signed_pdf_path' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tc2_signed_pdf_path exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_invitations'
      AND column_name='tc2_signed_pdf_path' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tier_requested CHECK (Platinum/Gold/Silver/Bronze) exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname='client_invitations' AND c.contype='c'
      AND pg_get_constraintdef(c.oid) LIKE '%tier_requested%'
      AND pg_get_constraintdef(c.oid) LIKE '%Platinum%'
      AND pg_get_constraintdef(c.oid) LIKE '%Bronze%')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── sites GC columns ──────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'sites.gc_name / gc_phone / gc_email exist',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name IN ('gc_name','gc_phone','gc_email')) = 3
  THEN 'PASS' ELSE 'FAIL' END;

-- ── storage buckets ───────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'bucket invitation-signatures exists (private)',
  CASE WHEN EXISTS (SELECT 1 FROM storage.buckets
    WHERE id='invitation-signatures' AND public=false)
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'bucket invitation-pdfs exists (private)',
  CASE WHEN EXISTS (SELECT 1 FROM storage.buckets
    WHERE id='invitation-pdfs' AND public=false)
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
