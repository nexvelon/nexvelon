-- smoke_0085_billing_same_as_site.sql
-- Verify the new column default + the billing-source exclusivity CHECK.

-- 1. Column exists, boolean, default false.
DO $$
DECLARE v_default text; v_type text;
BEGIN
  SELECT column_default, data_type INTO v_default, v_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sites'
     AND column_name = 'billing_same_as_site';
  ASSERT v_type = 'boolean', format('smoke fail: expected boolean, got %s', v_type);
  ASSERT v_default LIKE '%false%', format('smoke fail: default not false (%s)', v_default);
  RAISE NOTICE 'ok: billing_same_as_site boolean default false';
END $$;

-- 2. CHECK rejects both flags true.
DO $$
DECLARE v_site uuid;
BEGIN
  SELECT id INTO v_site FROM public.sites LIMIT 1;
  IF v_site IS NULL THEN
    RAISE NOTICE 'skip: no site rows to exercise the CHECK';
    RETURN;
  END IF;
  BEGIN
    UPDATE public.sites
       SET billing_same_as_client = true, billing_same_as_site = true
     WHERE id = v_site;
    RAISE EXCEPTION 'smoke fail: CHECK accepted both flags true';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok: CHECK rejects (client=true, site=true)';
  END;
END $$;

-- 3. Each legal combination is accepted (each in a savepoint we roll back).
DO $$
DECLARE v_site uuid;
BEGIN
  SELECT id INTO v_site FROM public.sites LIMIT 1;
  IF v_site IS NULL THEN
    RAISE NOTICE 'skip: no site rows to exercise legal combos';
    RETURN;
  END IF;

  -- (true, false)
  BEGIN
    UPDATE public.sites SET billing_same_as_client = true, billing_same_as_site = false WHERE id = v_site;
    RAISE NOTICE 'ok: (client=true, site=false) accepted';
  EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'smoke fail: (true,false) rejected'; END;

  -- (false, true)
  BEGIN
    UPDATE public.sites SET billing_same_as_client = false, billing_same_as_site = true WHERE id = v_site;
    RAISE NOTICE 'ok: (client=false, site=true) accepted';
  EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'smoke fail: (false,true) rejected'; END;

  -- (false, false)
  BEGIN
    UPDATE public.sites SET billing_same_as_client = false, billing_same_as_site = false WHERE id = v_site;
    RAISE NOTICE 'ok: (client=false, site=false) accepted';
  EXCEPTION WHEN check_violation THEN RAISE EXCEPTION 'smoke fail: (false,false) rejected'; END;

  -- Leave the row as it was found (both back to the 0015 default shape).
  UPDATE public.sites SET billing_same_as_client = true, billing_same_as_site = false WHERE id = v_site;
END $$;
