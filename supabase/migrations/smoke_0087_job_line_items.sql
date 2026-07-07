-- smoke_0087_job_line_items.sql
-- Verify attribution, snapshot consistency, the line_kind CHECK, and defaults.

-- 1. Informational — how many Jobs have zero line items (expected: Jobs whose
--    source quote had no sections/lines).
DO $$
DECLARE n_jobs int; n_empty int;
BEGIN
  SELECT count(*) INTO n_jobs FROM public.project_jobs;
  SELECT count(*) INTO n_empty FROM public.project_jobs pj
   WHERE NOT EXISTS (
     SELECT 1 FROM public.job_line_items jli WHERE jli.job_id = pj.id
   );
  RAISE NOTICE 'info: % of % jobs have no line items', n_empty, n_jobs;
END $$;

-- 2. Every non-NULL cost_center_id belongs to the SAME job. Expect 0.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.job_line_items jli
    JOIN public.project_cost_centers pcc ON pcc.id = jli.cost_center_id
   WHERE pcc.job_id IS DISTINCT FROM jli.job_id;
  ASSERT n = 0, format('smoke fail: %s line items attributed to a foreign job CC', n);
  RAISE NOTICE 'ok: every line item CC belongs to its own job';
END $$;

-- 3. line_kind CHECK rejects garbage (wrap + rollback).
DO $$
DECLARE v_job uuid;
BEGIN
  SELECT id INTO v_job FROM public.project_jobs LIMIT 1;
  IF v_job IS NULL THEN
    RAISE NOTICE 'skip: no job to exercise the line_kind CHECK';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.job_line_items (job_id, line_kind, description)
    VALUES (v_job, 'widget', 'bad kind');
    RAISE EXCEPTION 'smoke fail: line_kind CHECK accepted garbage';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ok: line_kind CHECK rejects invalid kinds';
  END;
END $$;

-- 4. Snapshot consistency — quoted_quantity / quoted_unit_cost / quoted_unit_price
--    are all-set or all-NULL together. Expect 0 inconsistent rows.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.job_line_items
   WHERE (quoted_quantity IS NULL) <> (quoted_unit_cost IS NULL)
      OR (quoted_quantity IS NULL) <> (quoted_unit_price IS NULL);
  ASSERT n = 0, format('smoke fail: %s rows with inconsistent quoted_* snapshot', n);
  RAISE NOTICE 'ok: quoted_* snapshot is all-set-or-all-null';
END $$;

-- 5. sort_order default is 0.
DO $$
DECLARE v_default text;
BEGIN
  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'job_line_items'
     AND column_name = 'sort_order';
  ASSERT v_default LIKE '%0%', format('smoke fail: sort_order default not 0 (%s)', v_default);
  RAISE NOTICE 'ok: sort_order default 0';
END $$;

-- 6. Backfilled rows carry the quoted snapshot EQUAL to their current values
--    (Estimated starts == Quoted). Expect 0 divergent snapshotted rows.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.job_line_items
   WHERE quoted_quantity IS NOT NULL
     AND (quoted_quantity   <> quantity
       OR quoted_unit_cost  <> unit_cost
       OR quoted_unit_price <> unit_price);
  ASSERT n = 0, format('smoke fail: %s backfilled rows diverge from their snapshot', n);
  RAISE NOTICE 'ok: backfilled Estimated == Quoted';
END $$;
