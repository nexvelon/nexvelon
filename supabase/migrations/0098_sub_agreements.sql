-- 0098_sub_agreements.sql
-- SUB-5 — subcontractor agreements / work orders. Issue a scoped work order to a
-- sub for a specific project/job, render a PDF, email it — and REFUSE to issue
-- when the sub's required compliance (WSIB clearance, liability insurance) is
-- expired or missing (the hard block lives in the API; this table just records
-- the agreement). A NEW table, NOT an overload of purchase_orders: POs are
-- receiving-oriented (integer quantities, receive-status enum) and don't fit a
-- scoped-value labour agreement.
--
-- §2.1 additive; §2.2 the issued PDF/scope is a snapshot (scope/value become
-- immutable once issued — enforced in the API). §3: GRANTs + RLS + policies,
-- mirroring project_jobs / the 0096 pattern.

BEGIN;

CREATE TABLE public.sub_agreements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_number   text NOT NULL UNIQUE,        -- e.g. WO-10000
  subcontractor_id   uuid NOT NULL REFERENCES public.subcontractors(id)
                          ON DELETE RESTRICT,
  project_id         uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_id             uuid REFERENCES public.project_jobs(id) ON DELETE SET NULL,
  title              text NOT NULL,
  scope_of_work      text,                         -- the work description
  agreed_value       numeric(14,2) NOT NULL DEFAULT 0,
  start_date         date,
  target_completion  date,
  status             text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','issued','in_progress',
                                       'completed','cancelled')),
  issued_at          timestamptz,
  issued_by          uuid,
  sent_to_email      text,
  pdf_path           text,                         -- storage path once issued
  notes              text,
  created_by         uuid,
  updated_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sub_agreements_subcontractor_idx
  ON public.sub_agreements (subcontractor_id);
CREATE INDEX sub_agreements_job_idx ON public.sub_agreements (job_id);
CREATE INDEX sub_agreements_project_idx ON public.sub_agreements (project_id);
CREATE INDEX sub_agreements_status_idx ON public.sub_agreements (status);

-- Shape guard, mirroring FIN/SUB-4: a job-scoped agreement needs a project too.
ALTER TABLE public.sub_agreements
  ADD CONSTRAINT sub_agreements_job_requires_project_check
  CHECK (job_id IS NULL OR project_id IS NOT NULL);

CREATE TRIGGER sub_agreements_set_updated_at
  BEFORE UPDATE ON public.sub_agreements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Sequential number generator, mirroring next_sequential_quote_number (0089):
-- scan the max existing WO-<digits> and return +1, starting at WO-10000.
CREATE OR REPLACE FUNCTION public.next_sub_agreement_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE max_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(agreement_number FROM 'WO-(\d+)$')
    AS integer)), 9999) INTO max_num
    FROM public.sub_agreements
   WHERE agreement_number ~ '^WO-\d+$';
  RETURN 'WO-' || (max_num + 1)::text;
END; $$;

-- §3: NEW table → GRANTs + RLS + policies (project_jobs pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_agreements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_agreements TO service_role;

ALTER TABLE public.sub_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_agreements_select_authenticated
  ON public.sub_agreements FOR SELECT
  TO authenticated USING (true);

CREATE POLICY sub_agreements_all_authenticated
  ON public.sub_agreements FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.next_sub_agreement_number();
--   DROP TABLE IF EXISTS public.sub_agreements;
--   COMMIT;
-- Self-contained. Issued work-order PDFs in the private bucket survive; clean
-- them up separately if the whole feature is being reverted.
-- ─────────────────────────────────────────────────────────────────────────────
