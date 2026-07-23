-- 0094_holdback_release.sql
-- FIN-9 — Ontario statutory holdback release. Tracks the 10% construction-lien
-- holdback retained across a project's invoices and the release event that
-- makes it collectible, 60 days after substantial completion.
--
-- §2.1: additive. One new table + one nullable-default column on invoices.
-- §2.2: retained holdback is NOT re-stored — it is Σ invoices.holdback_amount,
--     derived on read (the FIN-8 memo already does this). This table records the
--     RELEASE EVENT (dates, status, the invoice it generated), not the balance.
-- §3: holdback_releases is a NEW table → GRANTs + RLS + policies (0082 pattern).
--
-- HOW HOLDBACK WORKS HERE (from the 0043 money model, confirmed in the audit):
--   holdback_amount = subtotal · holdback_rate/100  (a slice of PRE-TAX value)
--   amount_due      = total − holdback_amount        (client pays the rest now)
-- Crucially, HST is charged on the FULL subtotal at original billing — the
-- holdback is a payment-TIMING reduction, NOT a tax deferral. So the retained
-- amount is already-taxed principal, and the release invoice must be
-- TAX-EXEMPT: re-taxing it would collect HST on the same dollars twice. (This
-- is why is_holdback_release exists — to mark those invoices and keep them out
-- of holdback accrual and out of a second tax charge.)
--
-- THE 60-DAY CLOCK is a simplification: real Ontario Construction Act timing
-- runs from PUBLICATION of the certificate of substantial completion, which
-- this system doesn't model. v1 keys off projects.actual_completion (set when
-- the project reaches substantially_complete). Flagged as a bookkeeping aid,
-- not legal advice.

BEGIN;

CREATE TABLE public.holdback_releases (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  amount                      numeric(14,2) NOT NULL CHECK (amount > 0),
  substantial_completion_date date NOT NULL,
  eligible_release_date       date NOT NULL,  -- substantial_completion + 60 days
  released_at                 date,           -- NULL until actually released
  release_invoice_id          uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','eligible','released','void')),
  notes                       text,
  created_by                  uuid,
  updated_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX holdback_releases_project_id_idx
  ON public.holdback_releases (project_id);

-- One live (non-void) release per project in v1 — partial releases can relax
-- this later, but today a project has at most one open release record.
CREATE UNIQUE INDEX holdback_releases_one_live_per_project
  ON public.holdback_releases (project_id)
  WHERE status <> 'void';

CREATE TRIGGER holdback_releases_set_updated_at
  BEFORE UPDATE ON public.holdback_releases
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdback_releases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdback_releases TO service_role;

ALTER TABLE public.holdback_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY holdback_releases_select_authenticated
  ON public.holdback_releases FOR SELECT
  TO authenticated USING (true);

CREATE POLICY holdback_releases_all_authenticated
  ON public.holdback_releases FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Marks the invoice that COLLECTS a holdback release. Keeps it out of holdback
-- accrual (it carries no holdback of its own) and flags it as the already-taxed
-- principal it is. Additive, non-null default (§2.1).
ALTER TABLE public.invoices
  ADD COLUMN is_holdback_release boolean NOT NULL DEFAULT false;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   ALTER TABLE public.invoices DROP COLUMN IF EXISTS is_holdback_release;
--   DROP TABLE IF EXISTS public.holdback_releases;  -- RESTRICT-by-intent on projects
--   COMMIT;
-- Dropping holdback_releases loses the release history; the underlying holdback
-- (invoices.holdback_amount) and any generated release invoices survive
-- independently. Intentional and called out.
-- ─────────────────────────────────────────────────────────────────────────────
