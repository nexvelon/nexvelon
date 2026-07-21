-- 0091_project_deposits.sql
-- FIN-4 — deposits & retainers: cash collected up-front on a project, held as
-- an unapplied credit, then applied against that project's invoices.
--
-- §3: project_deposits and deposit_applications are NEW tables → explicit
--     GRANTs + RLS + policies on BOTH (project_jobs pattern from 0082).
-- §2.2 (derive, don't store): NO remaining/available columns. A deposit's
--     remaining balance is amount − Σ its applications; an invoice's deposit
--     credit is Σ applications against it. Same rule FIN-2 used for payments.
-- §2.1 (widen-only): the FIN-2 invoice_payments.method CHECK gains
--     'deposit_applied'. Nothing is narrowed and no existing row changes.
--
-- WHY a deposit application also writes an invoice_payments row:
-- FIN-2 made the payment ledger the single source of truth for an invoice's
-- balance AND its derived status (sent → partially_paid → paid). Applying a
-- deposit IS a settlement of that invoice, so it must flow through the same
-- ledger or every downstream number (balance, aging bucket, statement,
-- outstanding AR) would silently disagree with the invoice's own status.
-- The paired row carries method='deposit_applied' + deposit_application_id so
-- it stays distinguishable from cash — see the cash-collected metric in
-- lib/api/financials.ts, which must never count a deposit twice (once when
-- received, again when applied).

BEGIN;

-- ─── Deposits held against a project ─────────────────────────────────────────
CREATE TABLE public.project_deposits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  method        text NOT NULL CHECK (method IN
                  ('cheque','eft','e_transfer','credit_card','cash','other')),
  received_at   date NOT NULL,
  reference     text,
  notes         text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_deposits_project_id_idx
  ON public.project_deposits (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_deposits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_deposits TO service_role;

ALTER TABLE public.project_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_deposits_select_authenticated
  ON public.project_deposits FOR SELECT
  TO authenticated USING (true);

CREATE POLICY project_deposits_all_authenticated
  ON public.project_deposits FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ─── Applications: which deposit paid down which invoice, and by how much ────
-- RESTRICT on both FKs: neither a deposit nor an invoice can be deleted out
-- from under an application that references it.
CREATE TABLE public.deposit_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id    uuid NOT NULL REFERENCES public.project_deposits(id) ON DELETE RESTRICT,
  invoice_id    uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  applied_at    date NOT NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deposit_applications_deposit_id_idx
  ON public.deposit_applications (deposit_id);
CREATE INDEX deposit_applications_invoice_id_idx
  ON public.deposit_applications (invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_applications TO service_role;

ALTER TABLE public.deposit_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY deposit_applications_select_authenticated
  ON public.deposit_applications FOR SELECT
  TO authenticated USING (true);

CREATE POLICY deposit_applications_all_authenticated
  ON public.deposit_applications FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- ─── FIN-2 payment ledger: admit the non-cash settlement ─────────────────────
-- Widen-only (§2.1). Postgres named the 0090 inline CHECK
-- `invoice_payments_method_check`.
ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS invoice_payments_method_check;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_method_check
  CHECK (method IN ('cheque','eft','e_transfer','credit_card','cash','other',
                    'deposit_applied'));

-- The back-link. CASCADE so un-applying a deposit (deleting the application)
-- takes its paired settlement row with it in one step — the ledger can never
-- be left holding a settlement whose application is gone.
ALTER TABLE public.invoice_payments
  ADD COLUMN deposit_application_id uuid
    REFERENCES public.deposit_applications(id) ON DELETE CASCADE;

CREATE INDEX invoice_payments_deposit_application_id_idx
  ON public.invoice_payments (deposit_application_id);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP INDEX IF EXISTS public.invoice_payments_deposit_application_id_idx;
--   ALTER TABLE public.invoice_payments DROP COLUMN IF EXISTS deposit_application_id;
--   ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_method_check;
--   ALTER TABLE public.invoice_payments
--     ADD CONSTRAINT invoice_payments_method_check
--     CHECK (method IN ('cheque','eft','e_transfer','credit_card','cash','other'));
--   -- NOTE: re-narrowing fails if any deposit_applied rows survive. Delete
--   -- those settlements (and their applications) first — intentional, so the
--   -- reversal can't silently drop real settlement history.
--   DROP TABLE IF EXISTS public.deposit_applications;
--   DROP TABLE IF EXISTS public.project_deposits;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
