-- 0087_job_line_items.sql
-- PROJ2-6a — every Job (Main or Change Order) carries its own line items (parts
-- + labour). At quote→project conversion the quote's section lines are copied
-- verbatim onto the target Job, snapshotting the QUOTED values immutably (§2.2).
-- Estimated (the live quantity/unit_cost/unit_price/discount) starts equal to
-- Quoted but is editable; the quoted_* columns are never mutated.
--
-- §2.1: additive new table; nothing existing narrowed.
-- §2.2: quoted_* snapshot columns are write-once (set at conversion / backfill,
--       never updated). Manual (non-quote) line items leave quoted_* NULL.
-- §3:   new table → GRANT + RLS + policy below.

BEGIN;

CREATE TABLE public.job_line_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL REFERENCES public.project_jobs(id)
                       ON DELETE CASCADE,
  -- Every line is attributed to a cost center within its job. Nullable so a
  -- manual line can exist before a CC is created; 6b makes this the pivot for
  -- cost-center contract_value sync.
  cost_center_id  uuid REFERENCES public.project_cost_centers(id)
                       ON DELETE SET NULL,

  line_kind       text NOT NULL CHECK (line_kind IN ('part','labour')),

  item_code       text,                 -- part number / SKU; NULL for labour
  description     text NOT NULL,        -- part or labour description
  category        text,                 -- mirrors the quote line's classification

  -- Quantity + pricing (unified for part and labour).
  quantity        numeric(14,4) NOT NULL DEFAULT 1,   -- labour: hours
  unit_cost       numeric(14,4) NOT NULL DEFAULT 0,   -- labour: cost per hour
  unit_price      numeric(14,4) NOT NULL DEFAULT 0,   -- labour: bill rate per hour
  discount_pct    numeric(9,4)  NOT NULL DEFAULT 0,   -- 0..100+ (no clamp)
  taxable         boolean       NOT NULL DEFAULT true,

  -- Snapshot (§2.2 — immutable after conversion). All-set for quote-copied
  -- rows; all-NULL for manual additions.
  quoted_quantity     numeric(14,4),
  quoted_unit_cost    numeric(14,4),
  quoted_unit_price   numeric(14,4),
  quoted_discount_pct numeric(9,4),

  sort_order      integer NOT NULL DEFAULT 0,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_line_items_job_id_idx         ON public.job_line_items (job_id);
CREATE INDEX job_line_items_cost_center_id_idx ON public.job_line_items (cost_center_id);
CREATE INDEX job_line_items_kind_idx           ON public.job_line_items (line_kind);

CREATE TRIGGER job_line_items_set_updated_at
  BEFORE UPDATE ON public.job_line_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3 GRANTs + RLS + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_line_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_line_items TO service_role;

ALTER TABLE public.job_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_line_items_select_authenticated
  ON public.job_line_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY job_line_items_all_authenticated
  ON public.job_line_items FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- BACKFILL — copy every existing quote's line items onto its target Job.
-- Original quotes (project_quotes.role='original') → the project's Main Job;
-- change_order quotes → the C.O Job whose source_quote_id = the quote.
--
-- The Quote lives in quotes.data (jsonb). Its shape (verified in the PROJ2-6a
-- audit): data.sections[] each { name, items[] }; each item { type
-- ('product'|'labor'|'misc'|'service'), name, description, classification, sku,
-- masterPartNumber, qty, unitCost, unitPrice, ... }. Labour lines are
-- type='labor' (qty=hours, unit_price=sell rate, unit_cost=cost/hr). Quote lines
-- carry no per-line discount or taxable flag → discount_pct 0, taxable true.
--
-- Cost center attribution: CCs were created per section in array order with
-- name=section.name, source_quote_id=quote.id, job_id=target job. We match by
-- name first, then fall back to the CC at the same ordinal position.
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE
  pq         RECORD;
  target_job uuid;
  qdata      jsonb;
  sec_rec    RECORD;
  li_rec     RECORD;
  cc         uuid;
  is_labour  boolean;
  sortn      int;
  proj_ins   int;
  total_ins  int := 0;
BEGIN
  FOR pq IN SELECT project_id, quote_id, role FROM public.project_quotes LOOP
    -- Resolve the target Job for this linked quote.
    IF pq.role = 'change_order' THEN
      SELECT id INTO target_job
        FROM public.project_jobs
       WHERE project_id = pq.project_id
         AND job_type = 'change_order'
         AND source_quote_id = pq.quote_id
       LIMIT 1;
    ELSE
      SELECT id INTO target_job
        FROM public.project_jobs
       WHERE project_id = pq.project_id
         AND job_type = 'main_job'
       LIMIT 1;
    END IF;
    IF target_job IS NULL THEN CONTINUE; END IF;

    -- Idempotency: never double-insert if this job already has line items.
    IF EXISTS (SELECT 1 FROM public.job_line_items WHERE job_id = target_job) THEN
      CONTINUE;
    END IF;

    SELECT data INTO qdata FROM public.quotes WHERE id = pq.quote_id;
    IF qdata IS NULL OR jsonb_typeof(qdata->'sections') <> 'array' THEN
      CONTINUE;
    END IF;

    sortn := 0;
    proj_ins := 0;

    FOR sec_rec IN
      SELECT value AS sec, ordinality AS ord
        FROM jsonb_array_elements(qdata->'sections') WITH ORDINALITY
    LOOP
      -- Match the cost center by section name (on this job + source quote).
      SELECT id INTO cc
        FROM public.project_cost_centers
       WHERE job_id = target_job
         AND source_quote_id = pq.quote_id
         AND name = COALESCE(sec_rec.sec->>'name', '')
       ORDER BY sort_order
       LIMIT 1;
      -- Fallback: the CC at the same ordinal position.
      IF cc IS NULL THEN
        SELECT id INTO cc
          FROM public.project_cost_centers
         WHERE job_id = target_job
           AND source_quote_id = pq.quote_id
         ORDER BY sort_order
         OFFSET (sec_rec.ord - 1)
         LIMIT 1;
      END IF;

      IF jsonb_typeof(sec_rec.sec->'items') = 'array' THEN
        FOR li_rec IN
          SELECT value AS li
            FROM jsonb_array_elements(sec_rec.sec->'items')
        LOOP
          is_labour := (li_rec.li->>'type') = 'labor';
          INSERT INTO public.job_line_items (
            job_id, cost_center_id, line_kind, item_code, description, category,
            quantity, unit_cost, unit_price, discount_pct, taxable,
            quoted_quantity, quoted_unit_cost, quoted_unit_price, quoted_discount_pct,
            sort_order
          ) VALUES (
            target_job,
            cc,
            CASE WHEN is_labour THEN 'labour' ELSE 'part' END,
            CASE WHEN is_labour THEN NULL
                 ELSE NULLIF(COALESCE(li_rec.li->>'sku', li_rec.li->>'masterPartNumber'), '')
            END,
            COALESCE(
              NULLIF(li_rec.li->>'name', ''),
              NULLIF(li_rec.li->>'description', ''),
              CASE WHEN is_labour THEN 'Labour' ELSE 'Item' END
            ),
            NULLIF(li_rec.li->>'classification', ''),
            COALESCE((li_rec.li->>'qty')::numeric, 1),
            COALESCE((li_rec.li->>'unitCost')::numeric, 0),
            COALESCE((li_rec.li->>'unitPrice')::numeric, 0),
            0,
            true,
            COALESCE((li_rec.li->>'qty')::numeric, 1),
            COALESCE((li_rec.li->>'unitCost')::numeric, 0),
            COALESCE((li_rec.li->>'unitPrice')::numeric, 0),
            0,
            sortn
          );
          sortn := sortn + 1;
          proj_ins := proj_ins + 1;
        END LOOP;
      END IF;
    END LOOP;

    total_ins := total_ins + proj_ins;
    IF proj_ins > 0 THEN
      RAISE NOTICE 'PROJ2-6a backfill: job % ← % line items (quote %)',
        target_job, proj_ins, pq.quote_id;
    END IF;
  END LOOP;

  RAISE NOTICE 'PROJ2-6a backfill complete: % job_line_items inserted total',
    total_ins;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS public.job_line_items;
