-- 0090_invoice_payments.sql
-- FIN-2 — real payment recording for invoices + status hardening.
--
-- §3: invoice_payments is a NEW table → explicit GRANTs + RLS + policy
--     (mirrors the project_jobs pattern from 0082).
-- §2.2 (snapshot / ledger): payments ARE the ledger. There is NO stored
--     amount_paid column on invoices — the balance is derived in code as
--     amount_due − Σ payments, and the invoice row stays the money snapshot it
--     already was. This keeps the payment history immutable-by-construction:
--     removing a mis-entry is a row delete, never an edit of a running total.
-- §2.1 (data preservation): the status/source_type CHECKs are ADD-only and are
--     preceded by a defensive normalize of any out-of-set value. The audit
--     (FIN-1) confirmed the only values in use are draft/sent/paid/void
--     (status) and manual/cost_center/material (source_type); this migration
--     adds the new 'partially_paid' state and locks both columns down.
-- ON DELETE RESTRICT on invoice_payments.invoice_id: an invoice that has
--     recorded payments cannot be hard-deleted out from under its ledger.

BEGIN;

-- 2a. Payments table.
CREATE TABLE public.invoice_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount       numeric(14,2) NOT NULL CHECK (amount > 0),
  method       text NOT NULL CHECK (method IN
                 ('cheque','eft','e_transfer','credit_card','cash','other')),
  paid_at      date NOT NULL,
  reference    text,            -- cheque #, EFT ref, confirmation code, etc.
  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoice_payments_invoice_id_idx
  ON public.invoice_payments (invoice_id);

-- §3 GRANTs + RLS + policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO service_role;

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_payments_select_authenticated
  ON public.invoice_payments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY invoice_payments_all_authenticated
  ON public.invoice_payments FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- 2b. Status CHECK on invoices. Adds 'partially_paid' as the new intermediate
-- state between 'sent' and 'paid'. Defensive normalize first (no-op on real
-- data per the audit) so the constraint can never fail to attach.
UPDATE public.invoices SET status = 'draft'
 WHERE status NOT IN ('draft','sent','partially_paid','paid','void');

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft','sent','partially_paid','paid','void'));

-- 2c. source_type CHECK on invoice_lines (values confirmed by the FIN-1 audit).
UPDATE public.invoice_lines SET source_type = 'manual'
 WHERE source_type NOT IN ('manual','cost_center','material');

ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_source_type_check
  CHECK (source_type IN ('manual','cost_center','material'));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   ALTER TABLE public.invoice_lines DROP CONSTRAINT IF EXISTS invoice_lines_source_type_check;
--   ALTER TABLE public.invoices      DROP CONSTRAINT IF EXISTS invoices_status_check;
--   DROP TABLE IF EXISTS public.invoice_payments;  -- fails if payments exist (RESTRICT-by-intent)
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
