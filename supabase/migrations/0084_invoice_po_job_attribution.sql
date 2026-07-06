-- 0084_invoice_po_job_attribution.sql
-- PROJ2-4c — complete per-Job P&L. Invoices roll up to a Job (backfilled to the
-- project's Main Job); POs can optionally be attributed to a Project + Job.
--
-- §2.1: additive nullable columns, no CHECK narrowing.
-- §2.2: existing invoice/PO totals untouched.
-- §3: no new tables → no GRANTs/RLS changes.

BEGIN;

-- 3.1 invoices.job_id (RESTRICT — a Job with invoices can't be deleted).
ALTER TABLE public.invoices
  ADD COLUMN job_id uuid REFERENCES public.project_jobs(id) ON DELETE RESTRICT;
CREATE INDEX invoices_job_id_idx ON public.invoices (job_id);

-- 3.2 Backfill: every invoice's job_id = the Main Job of its project. Every
-- project has exactly one main_job (PROJ2-4a). Invoices with a NULL project_id
-- (if any) are left NULL.
UPDATE public.invoices inv
   SET job_id = pj.id
  FROM public.project_jobs pj
 WHERE pj.project_id = inv.project_id
   AND pj.job_type = 'main_job'
   AND inv.job_id IS NULL;

-- 3.3 purchase_orders.project_id + job_id (both nullable, SET NULL — historical
-- POs stay unattributed; there is no accurate backfill source).
ALTER TABLE public.purchase_orders
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders
  ADD COLUMN job_id uuid REFERENCES public.project_jobs(id) ON DELETE SET NULL;
CREATE INDEX purchase_orders_project_id_idx ON public.purchase_orders (project_id);
CREATE INDEX purchase_orders_job_id_idx ON public.purchase_orders (job_id);

-- 3.4 Shape CHECK: a Job attribution requires a Project (the app also validates
-- that the job actually belongs to that project — the DB can't cross-reference
-- in a CHECK).
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_job_requires_project_check
  CHECK (job_id IS NULL OR project_id IS NOT NULL);

-- 3.5 Same safeguard on invoices.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_job_requires_project_check
  CHECK (job_id IS NULL OR project_id IS NOT NULL);

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_job_requires_project_check;
-- ALTER TABLE public.invoices DROP COLUMN IF EXISTS job_id;
-- ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_job_requires_project_check;
-- ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS job_id;
-- ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS project_id;
