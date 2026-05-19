-- ============================================================================
-- Nexvelon · Clients CL-2 — Post-deploy Smoke Verification (migration 0007)
-- ============================================================================
-- Run AFTER 0007_clients_cl2_form_expansion.sql has been applied.
--
-- Designed for the Supabase Dashboard SQL Editor, which only renders the
-- LAST query's result panel. Every check INSERTs one row into a TEMP table;
-- the single final SELECT returns one panel with all 27 checks.
--
-- Column shape matches the established smoke_chunk_01/02 convention
-- (ord, check_id, description, expected, actual, status). The final SELECT
-- orders FAIL rows to the top (Phase 7 spec Step 3) instead of the prior
-- ORDER BY ord, so any regression is immediately visible.
--
-- 22 column checks (existence + data_type + nullability + default) +
-- 4 CHECK-constraint checks + 1 FK check = 27 checks.
--
-- The TEMP table drops on COMMIT so re-runs are clean.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  ord         NUMERIC,
  check_id    TEXT,
  description TEXT,
  expected    TEXT,
  actual      TEXT,
  status      TEXT
) ON COMMIT DROP;

-- ----------------------------------------------------------------------------
-- Column checks — information_schema.columns
-- actual is "data_type | is_nullable | default". Default matching is
-- tolerant (substring / boolean literal) so the ::text / ::text[] cast
-- suffixes Postgres adds don't cause false FAILs; the raw default is still
-- shown in `actual` for eyeball confirmation.
-- ----------------------------------------------------------------------------

-- 1. billing_street  text NULL (no default)
INSERT INTO smoke_results
SELECT 1, 'C01', 'clients.billing_street = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='billing_street';
INSERT INTO smoke_results SELECT 1,'C01','clients.billing_street = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='billing_street');

-- 2. billing_unit  text NULL
INSERT INTO smoke_results
SELECT 2, 'C02', 'clients.billing_unit = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='billing_unit';
INSERT INTO smoke_results SELECT 2,'C02','clients.billing_unit = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='billing_unit');

-- 3. billing_city  text NULL
INSERT INTO smoke_results
SELECT 3, 'C03', 'clients.billing_city = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='billing_city';
INSERT INTO smoke_results SELECT 3,'C03','clients.billing_city = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='billing_city');

-- 4. billing_province  text NULL default 'ON'
INSERT INTO smoke_results
SELECT 4, 'C04', 'clients.billing_province = text, NULL, default ''ON''',
  'text | YES | default ~ ON',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default LIKE '%ON%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='billing_province';
INSERT INTO smoke_results SELECT 4,'C04','clients.billing_province = text, NULL, default ''ON''','text | YES | default ~ ON','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='billing_province');

-- 5. billing_postal  text NULL
INSERT INTO smoke_results
SELECT 5, 'C05', 'clients.billing_postal = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='billing_postal';
INSERT INTO smoke_results SELECT 5,'C05','clients.billing_postal = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='billing_postal');

-- 6. billing_country  text NULL default 'Canada'
INSERT INTO smoke_results
SELECT 6, 'C06', 'clients.billing_country = text, NULL, default ''Canada''',
  'text | YES | default ~ Canada',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default LIKE '%Canada%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='billing_country';
INSERT INTO smoke_results SELECT 6,'C06','clients.billing_country = text, NULL, default ''Canada''','text | YES | default ~ Canada','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='billing_country');

-- 7. billing_same_as_primary_site  boolean NOT NULL default false
INSERT INTO smoke_results
SELECT 7, 'C07', 'clients.billing_same_as_primary_site = boolean, NOT NULL, default false',
  'boolean | NO | default ~ false',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='boolean' AND is_nullable='NO' AND column_default LIKE '%false%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='billing_same_as_primary_site';
INSERT INTO smoke_results SELECT 7,'C07','clients.billing_same_as_primary_site = boolean, NOT NULL, default false','boolean | NO | default ~ false','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='billing_same_as_primary_site');

-- 8. default_opco  text NOT NULL default 'integrated_solutions'
INSERT INTO smoke_results
SELECT 8, 'C08', 'clients.default_opco = text, NOT NULL, default ''integrated_solutions''',
  'text | NO | default ~ integrated_solutions',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='NO' AND column_default LIKE '%integrated_solutions%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='default_opco';
INSERT INTO smoke_results SELECT 8,'C08','clients.default_opco = text, NOT NULL, default ''integrated_solutions''','text | NO | default ~ integrated_solutions','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='default_opco');

-- 9. allowed_opcos  ARRAY (text[]) NOT NULL default '{integrated_solutions}'
INSERT INTO smoke_results
SELECT 9, 'C09', 'clients.allowed_opcos = ARRAY/text[], NOT NULL, default ''{integrated_solutions}''',
  'ARRAY | NO | default ~ integrated_solutions',
  COALESCE(data_type,'(missing)') || ' (' || COALESCE(udt_name,'?') || ') | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='ARRAY' AND udt_name='_text' AND is_nullable='NO' AND column_default LIKE '%integrated_solutions%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='allowed_opcos';
INSERT INTO smoke_results SELECT 9,'C09','clients.allowed_opcos = ARRAY/text[], NOT NULL, default ''{integrated_solutions}''','ARRAY | NO | default ~ integrated_solutions','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='allowed_opcos');

-- 10. client_hst_gst_number  text NULL
INSERT INTO smoke_results
SELECT 10, 'C10', 'clients.client_hst_gst_number = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='client_hst_gst_number';
INSERT INTO smoke_results SELECT 10,'C10','clients.client_hst_gst_number = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='client_hst_gst_number');

-- 11. tax_exempt  boolean NOT NULL default false
INSERT INTO smoke_results
SELECT 11, 'C11', 'clients.tax_exempt = boolean, NOT NULL, default false',
  'boolean | NO | default ~ false',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='boolean' AND is_nullable='NO' AND column_default LIKE '%false%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='tax_exempt';
INSERT INTO smoke_results SELECT 11,'C11','clients.tax_exempt = boolean, NOT NULL, default false','boolean | NO | default ~ false','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='tax_exempt');

-- 12. tax_exempt_certificate_number  text NULL
INSERT INTO smoke_results
SELECT 12, 'C12', 'clients.tax_exempt_certificate_number = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='tax_exempt_certificate_number';
INSERT INTO smoke_results SELECT 12,'C12','clients.tax_exempt_certificate_number = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='tax_exempt_certificate_number');

-- 13. payment_terms  text NOT NULL default 'net_30'
INSERT INTO smoke_results
SELECT 13, 'C13', 'clients.payment_terms = text, NOT NULL, default ''net_30''',
  'text | NO | default ~ net_30',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='NO' AND column_default LIKE '%net_30%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='payment_terms';
INSERT INTO smoke_results SELECT 13,'C13','clients.payment_terms = text, NOT NULL, default ''net_30''','text | NO | default ~ net_30','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='payment_terms');

-- 14. payment_terms_custom  text NULL
INSERT INTO smoke_results
SELECT 14, 'C14', 'clients.payment_terms_custom = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='payment_terms_custom';
INSERT INTO smoke_results SELECT 14,'C14','clients.payment_terms_custom = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='payment_terms_custom');

-- 15. preferred_payment_method  text NOT NULL default 'eft'
INSERT INTO smoke_results
SELECT 15, 'C15', 'clients.preferred_payment_method = text, NOT NULL, default ''eft''',
  'text | NO | default ~ eft',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='NO' AND column_default LIKE '%eft%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='preferred_payment_method';
INSERT INTO smoke_results SELECT 15,'C15','clients.preferred_payment_method = text, NOT NULL, default ''eft''','text | NO | default ~ eft','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='preferred_payment_method');

-- 16. apply_cc_surcharge  boolean NOT NULL default true
INSERT INTO smoke_results
SELECT 16, 'C16', 'clients.apply_cc_surcharge = boolean, NOT NULL, default true',
  'boolean | NO | default ~ true',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='boolean' AND is_nullable='NO' AND column_default LIKE '%true%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='apply_cc_surcharge';
INSERT INTO smoke_results SELECT 16,'C16','clients.apply_cc_surcharge = boolean, NOT NULL, default true','boolean | NO | default ~ true','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='apply_cc_surcharge');

-- 17. credit_limit  numeric NULL
INSERT INTO smoke_results
SELECT 17, 'C17', 'clients.credit_limit = numeric, NULL, no default',
  'numeric | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='numeric' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='credit_limit';
INSERT INTO smoke_results SELECT 17,'C17','clients.credit_limit = numeric, NULL, no default','numeric | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='credit_limit');

-- 18. credit_hold  boolean NOT NULL default false
INSERT INTO smoke_results
SELECT 18, 'C18', 'clients.credit_hold = boolean, NOT NULL, default false',
  'boolean | NO | default ~ false',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='boolean' AND is_nullable='NO' AND column_default LIKE '%false%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='credit_hold';
INSERT INTO smoke_results SELECT 18,'C18','clients.credit_hold = boolean, NOT NULL, default false','boolean | NO | default ~ false','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='credit_hold');

-- 19. preferred_currency  text NOT NULL default 'CAD'
INSERT INTO smoke_results
SELECT 19, 'C19', 'clients.preferred_currency = text, NOT NULL, default ''CAD''',
  'text | NO | default ~ CAD',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='NO' AND column_default LIKE '%CAD%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='preferred_currency';
INSERT INTO smoke_results SELECT 19,'C19','clients.preferred_currency = text, NOT NULL, default ''CAD''','text | NO | default ~ CAD','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='preferred_currency');

-- 20. portal_access_enabled  boolean NOT NULL default false
INSERT INTO smoke_results
SELECT 20, 'C20', 'clients.portal_access_enabled = boolean, NOT NULL, default false',
  'boolean | NO | default ~ false',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='boolean' AND is_nullable='NO' AND column_default LIKE '%false%' THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='portal_access_enabled';
INSERT INTO smoke_results SELECT 20,'C20','clients.portal_access_enabled = boolean, NOT NULL, default false','boolean | NO | default ~ false','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='portal_access_enabled');

-- 21. portal_contact_email  text NULL
INSERT INTO smoke_results
SELECT 21, 'C21', 'clients.portal_contact_email = text, NULL, no default',
  'text | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='text' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='portal_contact_email';
INSERT INTO smoke_results SELECT 21,'C21','clients.portal_contact_email = text, NULL, no default','text | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='portal_contact_email');

-- 22. deleted_by  uuid NULL
INSERT INTO smoke_results
SELECT 22, 'C22', 'clients.deleted_by = uuid, NULL, no default',
  'uuid | YES | (none)',
  COALESCE(data_type,'(missing)') || ' | ' || COALESCE(is_nullable,'?') || ' | ' || COALESCE(column_default,'(none)'),
  CASE WHEN data_type='uuid' AND is_nullable='YES' AND column_default IS NULL THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='clients' AND column_name='deleted_by';
INSERT INTO smoke_results SELECT 22,'C22','clients.deleted_by = uuid, NULL, no default','uuid | YES | (none)','(column missing)','FAIL'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='deleted_by');

-- ----------------------------------------------------------------------------
-- CHECK-constraint checks — pg_constraint / pg_get_constraintdef
-- ----------------------------------------------------------------------------

-- 23. default_opco CHECK IN ('integrated_solutions','guardian')
INSERT INTO smoke_results
SELECT 23, 'K01', 'CHECK on default_opco allows exactly integrated_solutions, guardian',
  'check def references default_opco + both values',
  COALESCE((SELECT string_agg(pg_get_constraintdef(c.oid), ' || ')
            FROM pg_constraint c
            WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
              AND pg_get_constraintdef(c.oid) ILIKE '%default_opco%'),
           '(no matching CHECK)'),
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
      AND pg_get_constraintdef(c.oid) ILIKE '%default_opco%'
      AND pg_get_constraintdef(c.oid) ILIKE '%integrated_solutions%'
      AND pg_get_constraintdef(c.oid) ILIKE '%guardian%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- 24. payment_terms CHECK includes all 7 values
INSERT INTO smoke_results
SELECT 24, 'K02', 'CHECK on payment_terms includes all 7 values',
  'due_on_receipt, net_7, net_15, net_30, net_60, net_90, custom',
  COALESCE((SELECT string_agg(pg_get_constraintdef(c.oid), ' || ')
            FROM pg_constraint c
            WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
              AND pg_get_constraintdef(c.oid) ILIKE '%payment_terms%'
              AND pg_get_constraintdef(c.oid) NOT ILIKE '%payment_terms_custom%'),
           '(no matching CHECK)'),
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
      AND pg_get_constraintdef(c.oid) ILIKE '%payment_terms%'
      AND pg_get_constraintdef(c.oid) ILIKE '%due_on_receipt%'
      AND pg_get_constraintdef(c.oid) ILIKE '%net_7%'
      AND pg_get_constraintdef(c.oid) ILIKE '%net_15%'
      AND pg_get_constraintdef(c.oid) ILIKE '%net_30%'
      AND pg_get_constraintdef(c.oid) ILIKE '%net_60%'
      AND pg_get_constraintdef(c.oid) ILIKE '%net_90%'
      AND pg_get_constraintdef(c.oid) ILIKE '%custom%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- 25. preferred_payment_method CHECK includes all 5 values
INSERT INTO smoke_results
SELECT 25, 'K03', 'CHECK on preferred_payment_method includes all 5 values',
  'cheque, eft, credit_card, e_transfer, wire',
  COALESCE((SELECT string_agg(pg_get_constraintdef(c.oid), ' || ')
            FROM pg_constraint c
            WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
              AND pg_get_constraintdef(c.oid) ILIKE '%preferred_payment_method%'),
           '(no matching CHECK)'),
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
      AND pg_get_constraintdef(c.oid) ILIKE '%preferred_payment_method%'
      AND pg_get_constraintdef(c.oid) ILIKE '%cheque%'
      AND pg_get_constraintdef(c.oid) ILIKE '%eft%'
      AND pg_get_constraintdef(c.oid) ILIKE '%credit_card%'
      AND pg_get_constraintdef(c.oid) ILIKE '%e_transfer%'
      AND pg_get_constraintdef(c.oid) ILIKE '%wire%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- 26. preferred_currency CHECK includes both values
INSERT INTO smoke_results
SELECT 26, 'K04', 'CHECK on preferred_currency includes CAD, USD',
  'CAD, USD',
  COALESCE((SELECT string_agg(pg_get_constraintdef(c.oid), ' || ')
            FROM pg_constraint c
            WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
              AND pg_get_constraintdef(c.oid) ILIKE '%preferred_currency%'),
           '(no matching CHECK)'),
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.clients'::regclass AND c.contype='c'
      AND pg_get_constraintdef(c.oid) ILIKE '%preferred_currency%'
      AND pg_get_constraintdef(c.oid) ILIKE '%CAD%'
      AND pg_get_constraintdef(c.oid) ILIKE '%USD%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ----------------------------------------------------------------------------
-- FK check — clients.deleted_by → auth.users(id)
-- ----------------------------------------------------------------------------

-- 27. FK clients.deleted_by references auth.users(id)
INSERT INTO smoke_results
SELECT 27, 'F01', 'FK clients.deleted_by references auth.users(id)',
  'FOREIGN KEY (deleted_by) REFERENCES auth.users(id)',
  COALESCE((SELECT string_agg(pg_get_constraintdef(c.oid), ' || ')
            FROM pg_constraint c
            WHERE c.conrelid = 'public.clients'::regclass AND c.contype='f'
              AND pg_get_constraintdef(c.oid) ILIKE '%deleted_by%'),
           '(no matching FK)'),
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.clients'::regclass AND c.contype='f'
      AND pg_get_constraintdef(c.oid) ILIKE '%(deleted_by)%'
      AND pg_get_constraintdef(c.oid) ILIKE '%auth.users%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ----------------------------------------------------------------------------
-- Consolidated panel — FAIL rows first (Phase 7 spec Step 3), then ord.
-- ----------------------------------------------------------------------------
SELECT ord, check_id, description, expected, actual, status
FROM smoke_results
ORDER BY (status = 'PASS'), ord;

COMMIT;
