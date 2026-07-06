-- smoke_0082_project_jobs.sql
-- Verify project_jobs table, backfill correctness, CHECK/unique rejections, and
-- Job↔cost-center contract reconciliation. Pure-read except transient
-- insert/rollback probes that leave data unchanged.

-- 1. Exactly one main_job per project.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT project_id FROM public.project_jobs
    WHERE job_type='main_job' GROUP BY project_id HAVING count(*) <> 1
  ) t;
  ASSERT n = 0, format('smoke fail: %s project(s) without exactly one main_job', n);
  RAISE NOTICE 'ok: every project has exactly one main_job';
END $$;

-- 2. Every change_order project_quote has a matching change_order Job.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.project_quotes pq
  WHERE pq.role='change_order'
    AND NOT EXISTS (
      SELECT 1 FROM public.project_jobs pj
      WHERE pj.project_id = pq.project_id
        AND pj.job_type='change_order'
        AND pj.source_quote_id = pq.quote_id
    );
  ASSERT n = 0, format('smoke fail: %s change_order quote(s) without a matching C.O Job', n);
  RAISE NOTICE 'ok: every change_order quote has a matching C.O Job';
END $$;

-- 3. Zero cost centers with NULL job_id after backfill.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.project_cost_centers WHERE job_id IS NULL;
  ASSERT n = 0, format('smoke fail: %s cost center(s) with NULL job_id', n);
  RAISE NOTICE 'ok: no cost centers with NULL job_id';
END $$;

-- 4. CHECK rejections (each in its own block; nothing persisted).
DO $$
DECLARE v_project uuid;
BEGIN
  SELECT id INTO v_project FROM public.projects LIMIT 1;
  IF v_project IS NULL THEN RAISE NOTICE 'skip: no projects for CHECK probes'; RETURN; END IF;

  -- co_number on main_job → shape CHECK
  BEGIN
    INSERT INTO public.project_jobs (project_id, job_type, co_number, title)
    VALUES (v_project, 'main_job', 5, 'bad');
    RAISE EXCEPTION 'smoke fail: main_job with co_number accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- co_number NULL on change_order → shape CHECK
  BEGIN
    INSERT INTO public.project_jobs (project_id, job_type, co_number, title)
    VALUES (v_project, 'change_order', NULL, 'bad');
    RAISE EXCEPTION 'smoke fail: change_order without co_number accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bad job_type
  BEGIN
    INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_project, 'garbage', 'bad');
    RAISE EXCEPTION 'smoke fail: bad job_type accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bad status
  BEGIN
    INSERT INTO public.project_jobs (project_id, job_type, title, status)
    VALUES (v_project, 'main_job', 'bad', 'garbage');
    RAISE EXCEPTION 'smoke fail: bad status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  RAISE NOTICE 'ok: CHECK constraints reject bad shape/type/status';
END $$;

-- 5. Uniqueness rejections (transactional probes, rolled back).
DO $$
DECLARE v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM public.project_jobs WHERE job_type='main_job' LIMIT 1;
  IF v_project IS NULL THEN RAISE NOTICE 'skip: no main_job for unique probes'; RETURN; END IF;

  -- second main_job on the same project → unique_violation
  BEGIN
    INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_project, 'main_job', 'dupe main');
    RAISE EXCEPTION 'smoke fail: second main_job accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- duplicate (project_id, co_number) change_order → unique_violation
  BEGIN
    INSERT INTO public.project_jobs (project_id, job_type, co_number, title)
    VALUES (v_project, 'change_order', 999, 'co a');
    INSERT INTO public.project_jobs (project_id, job_type, co_number, title)
    VALUES (v_project, 'change_order', 999, 'co b');
    RAISE EXCEPTION 'smoke fail: duplicate co_number accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  RAISE NOTICE 'ok: unique indexes reject dup main_job + dup co_number';
END $$;

-- 6. Contract reconciliation: each Job's contract_value = sum of its cost
--    centers' contract_value.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM public.project_jobs pj
  LEFT JOIN (
    SELECT job_id, sum(contract_value) AS s
    FROM public.project_cost_centers GROUP BY job_id
  ) x ON x.job_id = pj.id
  WHERE round(pj.contract_value, 2) <> round(coalesce(x.s, 0), 2);
  ASSERT n = 0, format('smoke fail: %s job(s) whose contract_value <> sum of cost centers', n);
  RAISE NOTICE 'ok: job contract_value reconciles with its cost centers';
END $$;
