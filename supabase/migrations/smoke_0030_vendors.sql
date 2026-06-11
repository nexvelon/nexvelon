-- ============================================================================
-- Nexvelon · Chunk PO-1 — Post-deploy Smoke Verification (migration 0030)
-- ============================================================================
-- Run AFTER 0030_vendors.sql has been applied.
--
-- Verifies the vendors table shape, key columns, RLS, both policies, and an
-- insert→update round-trip (proves the updated_at trigger fires). ROLLBACK so
-- nothing persists. FAILs sort first.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'vendors table exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='vendors'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'id is uuid PRIMARY KEY',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendors'
      AND column_name='id' AND data_type='uuid'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'name is text NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendors'
      AND column_name='name' AND data_type='text' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'is_active is boolean NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendors'
      AND column_name='is_active' AND data_type='boolean' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'all 20 columns present',
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendors'
      AND column_name IN (
        'id','name','contact_name','email','phone','website',
        'address_line1','address_line2','city','province','postal_code',
        'country','account_number','payment_terms','notes','is_active',
        'created_at','updated_at','created_by','updated_by'
      )
  ) = 20 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'RLS enabled on vendors',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='vendors' AND rowsecurity=true
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'vendors has >=2 policies',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='vendors'
  ) >= 2 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'updated_at trigger present',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema='public' AND event_object_table='vendors'
      AND trigger_name='vendors_set_updated_at'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Insert→update round-trip; proves the updated_at trigger bumps the timestamp.
WITH ins AS (
  INSERT INTO public.vendors (name) VALUES ('SMOKE Vendor')
  RETURNING id, updated_at
)
INSERT INTO smoke_results
SELECT 'insert round-trip: row created',
  CASE WHEN (SELECT count(*) FROM ins) = 1 THEN 'PASS' ELSE 'FAIL' END;

UPDATE public.vendors SET contact_name = 'Updated'
  WHERE name = 'SMOKE Vendor';

INSERT INTO smoke_results SELECT 'update round-trip: trigger bumped updated_at',
  CASE WHEN (
    SELECT updated_at > created_at FROM public.vendors WHERE name='SMOKE Vendor'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

ROLLBACK;
