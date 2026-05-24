-- ============================================================================
-- Nexvelon · FIX-1 — Post-deploy Smoke Verification (migration 0017)
-- ============================================================================
-- Run AFTER 0017_hard_delete_cleanup.sql has been applied.
--
-- Confirms (a) no soft-deleted rows remain across the three tables,
-- (b) the deleted_at + deleted_by columns are preserved per §2.1
-- past-data preservation, and (c) the cascading FKs on sites + contacts
-- → clients are still in place.
--
-- 3 no-soft-delete checks + 4 column-preservation checks + 2 FK CASCADE
-- checks + 1 site→contacts SET NULL FK check = 10 checks total.
-- FAILs-first ordering. ROLLBACK so the TEMP table drops cleanly on
-- re-runs.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── NO SOFT-DELETED ROWS REMAIN (3) ─────────────────────────────────────

INSERT INTO smoke_results SELECT 'no soft-deleted clients remain',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.clients WHERE deleted_at IS NOT NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'no soft-deleted sites remain',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites WHERE deleted_at IS NOT NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'no soft-deleted contacts remain',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE deleted_at IS NOT NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── COLUMN PRESERVATION (§2.1) (4) ──────────────────────────────────────

INSERT INTO smoke_results SELECT 'clients.deleted_at column preserved',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='deleted_at'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'clients.deleted_by column preserved',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='deleted_by'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'sites.deleted_at column preserved',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='deleted_at'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'contacts.deleted_at column preserved',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contacts'
      AND column_name='deleted_at'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── CASCADING FKs (3) ───────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'sites.client_id FK ON DELETE CASCADE intact',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
     AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.table_schema='public' AND tc.table_name='sites'
      AND tc.constraint_type='FOREIGN KEY'
      AND kcu.column_name='client_id'
      AND rc.delete_rule='CASCADE'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'contacts.client_id FK ON DELETE CASCADE intact',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
     AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.table_schema='public' AND tc.table_name='contacts'
      AND tc.constraint_type='FOREIGN KEY'
      AND kcu.column_name='client_id'
      AND rc.delete_rule='CASCADE'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'contacts.site_id FK ON DELETE SET NULL intact',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
     AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    WHERE tc.table_schema='public' AND tc.table_name='contacts'
      AND tc.constraint_type='FOREIGN KEY'
      AND kcu.column_name='site_id'
      AND rc.delete_rule='SET NULL'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ──────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

ROLLBACK;
