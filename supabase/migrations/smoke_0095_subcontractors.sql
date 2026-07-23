-- smoke_0095_subcontractors.sql
-- Verify: table + §3 clauses; status CHECK; case-insensitive name uniqueness;
-- vendor_id SET NULL on vendor delete; and the updated_at trigger firing.

-- 1. Table + §3 clauses (RLS on + 2 policies + GRANTs).
DO $$
DECLARE n int; b boolean;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'subcontractors';
  ASSERT n = 1, 'smoke fail: subcontractors table missing';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'subcontractors';
  ASSERT n = 2, format('smoke fail: expected 2 policies, found %s', n);

  SELECT relrowsecurity INTO b FROM pg_class
   WHERE oid = 'public.subcontractors'::regclass;
  ASSERT b, 'smoke fail: RLS not enabled on subcontractors';

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'subcontractors'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  ASSERT n = 1, 'smoke fail: authenticated SELECT grant missing';
  RAISE NOTICE 'ok: subcontractors table + §3 clauses present';
END $$;

-- 2. status CHECK + case-insensitive uniqueness + updated_at trigger.
DO $$
DECLARE v_id uuid; v_updated timestamptz;
BEGIN
  BEGIN
    INSERT INTO public.subcontractors (name, status)
    VALUES ('Smoke Sub 0095', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.subcontractors (name)
  VALUES ('Smoke Sub 0095')
  RETURNING id, updated_at INTO v_id, v_updated;

  -- duplicate name (different case) rejected by the lower(name) unique index
  BEGIN
    INSERT INTO public.subcontractors (name) VALUES ('smoke sub 0095');
    RAISE EXCEPTION 'smoke fail: case-insensitive duplicate name accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- updated_at trigger fires on update
  PERFORM pg_sleep(0.01);
  UPDATE public.subcontractors SET trade = 'Monitoring' WHERE id = v_id;
  ASSERT (SELECT updated_at FROM public.subcontractors WHERE id = v_id) > v_updated,
    'smoke fail: updated_at trigger did not fire';

  DELETE FROM public.subcontractors WHERE id = v_id;
  RAISE NOTICE 'ok: status CHECK + name uniqueness + updated_at trigger enforced';
END $$;

-- 3. vendor_id SET NULL when the linked vendor is deleted.
DO $$
DECLARE v_vendor uuid; v_sub uuid; v_link uuid;
BEGIN
  -- create a throwaway vendor to link + delete (don't disturb real data)
  INSERT INTO public.vendors (name) VALUES ('Smoke Vendor 0095')
  RETURNING id INTO v_vendor;

  INSERT INTO public.subcontractors (name, vendor_id)
  VALUES ('Smoke Linked Sub 0095', v_vendor)
  RETURNING id INTO v_sub;

  DELETE FROM public.vendors WHERE id = v_vendor;

  SELECT vendor_id INTO v_link FROM public.subcontractors WHERE id = v_sub;
  ASSERT v_link IS NULL, 'smoke fail: vendor_id not SET NULL on vendor delete';
  RAISE NOTICE 'ok: vendor_id SET NULL on vendor delete';

  DELETE FROM public.subcontractors WHERE id = v_sub;
END $$;
