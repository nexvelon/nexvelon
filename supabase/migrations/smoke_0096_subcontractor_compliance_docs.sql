-- smoke_0096_subcontractor_compliance_docs.sql
-- Verify: table + §3 clauses; bad doc_type rejected; expiry-before-issue
-- rejected; subcontractor delete CASCADEs its docs; attachment delete SET NULLs.

-- 1. Table + §3 clauses.
DO $$
DECLARE n int; b boolean;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'subcontractor_compliance_docs';
  ASSERT n = 1, 'smoke fail: subcontractor_compliance_docs table missing';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'subcontractor_compliance_docs';
  ASSERT n = 2, format('smoke fail: expected 2 policies, found %s', n);

  SELECT relrowsecurity INTO b FROM pg_class
   WHERE oid = 'public.subcontractor_compliance_docs'::regclass;
  ASSERT b, 'smoke fail: RLS not enabled';

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'subcontractor_compliance_docs'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  ASSERT n = 1, 'smoke fail: authenticated SELECT grant missing';
  RAISE NOTICE 'ok: compliance docs table + §3 clauses present';
END $$;

-- 2. doc_type CHECK + date-order CHECK + CASCADE on subcontractor delete.
DO $$
DECLARE v_sub uuid; v_doc uuid; n int;
BEGIN
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0096')
  RETURNING id INTO v_sub;

  -- bad doc_type rejected
  BEGIN
    INSERT INTO public.subcontractor_compliance_docs (subcontractor_id, doc_type)
    VALUES (v_sub, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad doc_type accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- expiry before issue rejected
  BEGIN
    INSERT INTO public.subcontractor_compliance_docs
      (subcontractor_id, doc_type, issued_date, expiry_date)
    VALUES (v_sub, 'wsib_clearance', CURRENT_DATE, CURRENT_DATE - 1);
    RAISE EXCEPTION 'smoke fail: expiry before issue accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a valid doc, then confirm CASCADE removes it with its subcontractor
  INSERT INTO public.subcontractor_compliance_docs
    (subcontractor_id, doc_type, issued_date, expiry_date)
  VALUES (v_sub, 'wsib_clearance', CURRENT_DATE, CURRENT_DATE + 90)
  RETURNING id INTO v_doc;

  DELETE FROM public.subcontractors WHERE id = v_sub;
  SELECT count(*) INTO n FROM public.subcontractor_compliance_docs WHERE id = v_doc;
  ASSERT n = 0, 'smoke fail: compliance doc not CASCADE-deleted with subcontractor';
  RAISE NOTICE 'ok: doc_type + date-order CHECKs + subcontractor CASCADE enforced';
END $$;

-- 3. attachment_id SET NULL when the linked attachment is deleted.
DO $$
DECLARE v_sub uuid; v_att uuid; v_doc uuid; v_link uuid;
BEGIN
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0096 B')
  RETURNING id INTO v_sub;

  INSERT INTO public.attachments (entity_type, entity_id, path, filename)
  VALUES ('subcontractor_doc', v_sub::text, 'subcontractor_doc/x/f.pdf', 'wsib.pdf')
  RETURNING id INTO v_att;

  INSERT INTO public.subcontractor_compliance_docs
    (subcontractor_id, doc_type, attachment_id)
  VALUES (v_sub, 'liability_insurance', v_att)
  RETURNING id INTO v_doc;

  DELETE FROM public.attachments WHERE id = v_att;
  SELECT attachment_id INTO v_link FROM public.subcontractor_compliance_docs WHERE id = v_doc;
  ASSERT v_link IS NULL, 'smoke fail: attachment_id not SET NULL on attachment delete';
  RAISE NOTICE 'ok: attachment_id SET NULL on attachment delete';

  DELETE FROM public.subcontractors WHERE id = v_sub;
END $$;
