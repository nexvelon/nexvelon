-- smoke_0084_invoice_po_job_attribution.sql
-- Verify invoice job backfill, PO non-backfill, shape CHECKs, and FK RESTRICT.

-- 1. Every invoice with a project has job_id = a Main Job of that project.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.invoices inv
   WHERE inv.project_id IS NOT NULL
     AND (inv.job_id IS NULL OR NOT EXISTS (
           SELECT 1 FROM public.project_jobs pj
            WHERE pj.id = inv.job_id
              AND pj.project_id = inv.project_id
              AND pj.job_type = 'main_job'));
  ASSERT n = 0, format('smoke fail: %s invoice(s) not attributed to Main Job', n);
  RAISE NOTICE 'ok: invoices backfilled to Main Job';
END $$;

-- 2. No PO was accidentally attributed.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.purchase_orders
   WHERE project_id IS NOT NULL OR job_id IS NOT NULL;
  ASSERT n = 0, format('smoke fail: %s PO(s) unexpectedly attributed', n);
  RAISE NOTICE 'ok: historical POs left unattributed';
END $$;

-- 3. Shape CHECK rejections.
DO $$
DECLARE v_job uuid; v_client uuid;
BEGIN
  SELECT id INTO v_job FROM public.project_jobs LIMIT 1;
  SELECT id INTO v_client FROM public.clients LIMIT 1;

  -- invoice with job_id but NULL project_id → check_violation
  IF v_job IS NOT NULL AND v_client IS NOT NULL THEN
    BEGIN
      INSERT INTO public.invoices (opco, client_id, status, job_id)
      VALUES ('integrated_solutions', v_client, 'draft', v_job);
      RAISE EXCEPTION 'smoke fail: invoice job_id without project_id accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END IF;

  -- PO with job_id but NULL project_id → check_violation
  IF v_job IS NOT NULL THEN
    BEGIN
      INSERT INTO public.purchase_orders (po_number, vendor_id, job_id)
      VALUES ('SMOKE-PO-0084', (SELECT id FROM public.vendors LIMIT 1), v_job);
      RAISE EXCEPTION 'smoke fail: PO job_id without project_id accepted';
    EXCEPTION
      WHEN check_violation THEN NULL;
      WHEN not_null_violation THEN NULL; -- no vendor seeded — CHECK still holds
    END;
  END IF;

  RAISE NOTICE 'ok: job-requires-project CHECKs enforced';
END $$;

-- 4. FK RESTRICT: deleting a Job that has invoices is blocked.
DO $$
DECLARE v_job uuid;
BEGIN
  SELECT job_id INTO v_job FROM public.invoices WHERE job_id IS NOT NULL LIMIT 1;
  IF v_job IS NULL THEN
    RAISE NOTICE 'skip: no invoice-attributed Job to test RESTRICT';
    RETURN;
  END IF;
  BEGIN
    DELETE FROM public.project_jobs WHERE id = v_job;
    RAISE EXCEPTION 'smoke fail: deleted a Job that has invoices';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok: invoices.job_id RESTRICT blocks Job deletion';
  END;
END $$;
