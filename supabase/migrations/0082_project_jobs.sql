-- 0082_project_jobs.sql
-- PROJ2-4a — the Job container model. Every Project gets exactly one Main Job
-- plus zero or more Change Order Jobs; each Job is first-class and cost centers
-- hang off it. Existing cost centers are backfilled under the Main Job (per
-- Jay's decision); role='change_order' quotes become C.O Jobs.
--
-- §3: project_jobs is a NEW table → explicit GRANTs + RLS + policy.
-- §2.1: project_cost_centers.job_id is an additive nullable column.
-- §2.2: existing cost-center contract_values are untouched; Job contract_value
--       is derived by SUM, so nothing historical is overwritten.
--
-- Deviation from the spec's backfill (flagged): Main Job title uses
-- COALESCE(p.title, p.project_number) because projects.title is nullable but
-- project_jobs.title is NOT NULL — a null project title would otherwise violate.

BEGIN;

CREATE TABLE public.project_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_type        text NOT NULL CHECK (job_type IN ('main_job','change_order')),
  co_number       integer,                       -- NULL for main_job; 1,2,… for change_order
  title           text NOT NULL,
  source_quote_id text REFERENCES public.quotes(id) ON DELETE SET NULL,
  contract_value  numeric(14,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN (
                    'active','on_hold','substantially_complete','closed','cancelled'
                  )),
  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Exactly one main_job per project.
CREATE UNIQUE INDEX project_jobs_main_job_unique
  ON public.project_jobs (project_id)
  WHERE job_type = 'main_job';

-- co_number uniqueness per project (change_order rows only).
CREATE UNIQUE INDEX project_jobs_co_number_unique
  ON public.project_jobs (project_id, co_number)
  WHERE job_type = 'change_order';

-- co_number required for change_order, forbidden for main_job.
ALTER TABLE public.project_jobs
  ADD CONSTRAINT project_jobs_co_number_shape
  CHECK (
    (job_type = 'main_job'     AND co_number IS NULL) OR
    (job_type = 'change_order' AND co_number IS NOT NULL AND co_number > 0)
  );

CREATE INDEX project_jobs_project_id_idx ON public.project_jobs (project_id);

-- Standard updated_at trigger (mirrors project_cost_centers).
CREATE TRIGGER project_jobs_set_updated_at
  BEFORE UPDATE ON public.project_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3 GRANTs + RLS + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_jobs TO service_role;

ALTER TABLE public.project_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_jobs_select_authenticated
  ON public.project_jobs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY project_jobs_all_authenticated
  ON public.project_jobs FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Cost center job_id (nullable, §2.1).
ALTER TABLE public.project_cost_centers
  ADD COLUMN job_id uuid REFERENCES public.project_jobs(id) ON DELETE SET NULL;

CREATE INDEX project_cost_centers_job_id_idx
  ON public.project_cost_centers (job_id);

-- ═══════════════════════════════════════════════════════════
-- BACKFILL
-- ═══════════════════════════════════════════════════════════

-- Step 1: one Main Job per project. contract_value = sum of cost centers that
-- are NOT attached to a change_order quote (i.e. original / null / unmatched).
INSERT INTO public.project_jobs (
  project_id, job_type, co_number, title, source_quote_id,
  contract_value, status, sort_order, created_at, updated_at
)
SELECT
  p.id,
  'main_job',
  NULL,
  COALESCE(p.title, p.project_number),
  (SELECT pq.quote_id
     FROM public.project_quotes pq
     WHERE pq.project_id = p.id AND pq.role = 'original'
     ORDER BY pq.id LIMIT 1),
  COALESCE((
    SELECT sum(pcc.contract_value)
      FROM public.project_cost_centers pcc
      LEFT JOIN public.project_quotes pq
        ON pq.project_id = p.id
       AND pq.quote_id = pcc.source_quote_id
       AND pq.role = 'change_order'
     WHERE pcc.project_id = p.id
       AND pq.id IS NULL
  ), 0),
  p.status,
  0,
  p.created_at,
  p.created_at
FROM public.projects p;

-- Step 2: one C.O Job per change_order project_quotes row, numbered by pq.id.
WITH ordered_cos AS (
  SELECT
    pq.id,
    pq.project_id,
    pq.quote_id,
    row_number() OVER (PARTITION BY pq.project_id ORDER BY pq.id) AS co_num
  FROM public.project_quotes pq
  WHERE pq.role = 'change_order'
)
INSERT INTO public.project_jobs (
  project_id, job_type, co_number, title, source_quote_id,
  contract_value, status, sort_order, created_at, updated_at
)
SELECT
  o.project_id,
  'change_order',
  o.co_num,
  COALESCE(
    (SELECT q.name FROM public.quotes q WHERE q.id = o.quote_id),
    'Change Order ' || o.co_num::text
  ),
  o.quote_id,
  COALESCE((
    SELECT sum(pcc.contract_value)
      FROM public.project_cost_centers pcc
     WHERE pcc.project_id = o.project_id
       AND pcc.source_quote_id = o.quote_id
  ), 0),
  'active',
  o.co_num,
  now(),
  now()
FROM ordered_cos o;

-- Step 3a: change-order cost centers → their C.O Job.
UPDATE public.project_cost_centers pcc
   SET job_id = pj.id
  FROM public.project_jobs pj
 WHERE pj.project_id = pcc.project_id
   AND pj.job_type = 'change_order'
   AND pj.source_quote_id = pcc.source_quote_id
   AND pcc.job_id IS NULL;

-- Step 3b: everything else → the Main Job.
UPDATE public.project_cost_centers pcc
   SET job_id = pj.id
  FROM public.project_jobs pj
 WHERE pj.project_id = pcc.project_id
   AND pj.job_type = 'main_job'
   AND pcc.job_id IS NULL;

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE public.project_cost_centers DROP COLUMN IF EXISTS job_id;
-- DROP TABLE IF EXISTS public.project_jobs;
