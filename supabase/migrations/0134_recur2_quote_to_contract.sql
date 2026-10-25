-- 0134_recur2_quote_to_contract.sql
-- RECUR-2 — quote → service contract conversion, late fees, cancellation credits.
-- The three items RECUR-1 (PR #396, migration 0128) deliberately deferred.
--
--   1. quotes.intended_target_kind gains 'service_contract' (the existing PROJ2-5
--      flag is EXTENDED — no parallel concept). Widen-only.
--   2. service_contracts gains (a) a durable link back to the accepted quote, its
--      portal send and its acceptance record, plus a frozen copy of the signed
--      evidence and terms; (b) per-contract payment terms + late-fee terms; (c) the
--      cancellation effective date. All additive, nullable or defaulted.
--   3. NEW service_contract_late_fees — proposed / approved / waived late fees.
--   4. NEW service_contract_credits — pro-rated mid-cycle cancellation credits.
--   5. invoice_payments.method gains the NON-CASH 'credit_applied' settlement (the
--      FIN-4 'deposit_applied' pattern) + a back-link to the credit. Widen-only.
--
-- §1: ADDITIVE ONLY. The two CHECK replacements (quotes target kind + shape;
--     invoice_payments.method) are strict WIDENINGS — every value allowed before is
--     still allowed; no existing row can fail. Rollback block at the bottom.
-- §3: both new tables carry the full boilerplate (GRANT authenticated +
--     service_role, RLS, policies; never anon).
-- Apply BEFORE merging the RECUR-2 PR.

BEGIN;

-- ── 1. quotes: intended_target_kind += 'service_contract' ────────────────────
-- 0086 declared the kind CHECK inline, so Postgres named it
-- quotes_intended_target_kind_check. Drop whatever narrow kind-CHECK exists
-- (by definition, not just by name, so an unexpected auto-name can't survive and
-- keep rejecting the new value), then add the widened one under a fixed name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.quotes'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%intended_target_kind%'
       AND pg_get_constraintdef(oid) NOT LIKE '%intended_target_project_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.quotes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_intended_target_kind_check
  CHECK (intended_target_kind IN ('new_project','change_order','service_contract'));

-- Shape: a service_contract intent, like new_project, never carries a project id.
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_intended_target_shape_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_intended_target_shape_check
  CHECK (
    (intended_target_kind IS NULL AND intended_target_project_id IS NULL)
    OR (intended_target_kind IN ('new_project','service_contract') AND intended_target_project_id IS NULL)
    OR (intended_target_kind = 'change_order' AND intended_target_project_id IS NOT NULL)
  );

-- ── 2. service_contracts: source link, payment + late-fee terms, cancellation ─
-- 2a. Durable link to the accepted quote (2d). RESTRICT on all three so the
--     evidence a contract was built from cannot be deleted out from under it (the
--     app also refuses those deletes with a plain reason). quotes.id is TEXT (0027).
ALTER TABLE public.service_contracts
  ADD COLUMN IF NOT EXISTS source_quote_id text
    REFERENCES public.quotes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_send_id uuid
    REFERENCES public.quote_portal_sends(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_acceptance_id uuid
    REFERENCES public.quote_acceptances(id) ON DELETE RESTRICT,
  -- Frozen copies of the signed evidence (§2.2): readable even if a reference is
  -- ever severed, and never re-derived from the live (editable) quote.
  ADD COLUMN IF NOT EXISTS source_quote_number text,
  ADD COLUMN IF NOT EXISTS source_signed_by text,
  ADD COLUMN IF NOT EXISTS source_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_signed_pdf_path text,
  ADD COLUMN IF NOT EXISTS source_record_hash text,
  -- The recurring terms exactly as signed (RecurringTermsSnapshot jsonb).
  ADD COLUMN IF NOT EXISTS source_terms jsonb;

-- One contract per quote — the DATABASE backstop against a double conversion.
CREATE UNIQUE INDEX IF NOT EXISTS service_contracts_source_quote_uniq
  ON public.service_contracts(source_quote_id)
  WHERE source_quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_contracts_source_acceptance_idx
  ON public.service_contracts(source_acceptance_id);

-- 2b. Payment terms (days after the billing date the invoice is due). NULL keeps
--     RECUR-1 behaviour: no due date → an invoice is never overdue.
ALTER TABLE public.service_contracts
  ADD COLUMN IF NOT EXISTS payment_terms_days int;
ALTER TABLE public.service_contracts DROP CONSTRAINT IF EXISTS service_contracts_payment_terms_chk;
ALTER TABLE public.service_contracts
  ADD CONSTRAINT service_contracts_payment_terms_chk
  CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0);

-- 2c. Late-fee terms (2f). Opt-in per contract; DEFAULT 'none' — no rate is
--     hardcoded anywhere. Fixed enum (a CHECK is safe — fee types don't grow
--     without a design change).
ALTER TABLE public.service_contracts
  ADD COLUMN IF NOT EXISTS late_fee_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS late_fee_monthly_pct numeric(6,3),
  ADD COLUMN IF NOT EXISTS late_fee_flat_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS late_fee_grace_days int NOT NULL DEFAULT 0;
ALTER TABLE public.service_contracts DROP CONSTRAINT IF EXISTS service_contracts_late_fee_chk;
ALTER TABLE public.service_contracts
  ADD CONSTRAINT service_contracts_late_fee_chk
  CHECK (
    late_fee_grace_days >= 0
    AND (
      late_fee_mode = 'none'
      OR (late_fee_mode = 'percent_monthly' AND late_fee_monthly_pct > 0)
      OR (late_fee_mode = 'flat' AND late_fee_flat_amount > 0)
    )
  );
ALTER TABLE public.service_contracts DROP CONSTRAINT IF EXISTS service_contracts_late_fee_mode_chk;
ALTER TABLE public.service_contracts
  ADD CONSTRAINT service_contracts_late_fee_mode_chk
  CHECK (late_fee_mode IN ('none','percent_monthly','flat'));

-- 2d. The last day of service when cancelled mid-cycle (2g).
ALTER TABLE public.service_contracts
  ADD COLUMN IF NOT EXISTS cancelled_effective_date date;

-- ── 3. service_contract_late_fees ────────────────────────────────────────────
-- One row per (overdue invoice, 30-day block). The daily job PROPOSES; a person
-- approves (→ a fee invoice is issued, fee_invoice_id) or waives. Never automatic.
-- UNIQUE (source_invoice_id, block_index) is the double-charge guard.
CREATE TABLE IF NOT EXISTS public.service_contract_late_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE RESTRICT,
  source_invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  block_index int NOT NULL CHECK (block_index > 0),
  days_overdue int NOT NULL,
  basis_balance numeric(12,2) NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  mode text NOT NULL,                       -- snapshot of the contract's mode
  rate_pct numeric(6,3),                    -- snapshot (percent_monthly)
  -- proposed | approved | waived. No CHECK (§1 — states may grow).
  status text NOT NULL DEFAULT 'proposed',
  fee_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  decided_by uuid,
  decided_at timestamptz,
  waive_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_contract_late_fees_block_uniq UNIQUE (source_invoice_id, block_index)
);
CREATE INDEX IF NOT EXISTS service_contract_late_fees_contract_idx
  ON public.service_contract_late_fees(contract_id);
CREATE INDEX IF NOT EXISTS service_contract_late_fees_status_idx
  ON public.service_contract_late_fees(status);

-- ── 4. service_contract_credits ──────────────────────────────────────────────
-- One row per billed period credited at cancellation. The arithmetic is frozen on
-- the row (§2.2). UNIQUE (contract_id, period_start) = a period is credited once.
CREATE TABLE IF NOT EXISTS public.service_contract_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE RESTRICT,
  source_invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  effective_date date NOT NULL,
  days_in_period int NOT NULL,
  days_used int NOT NULL,
  period_subtotal numeric(12,2) NOT NULL,
  earned_subtotal numeric(12,2) NOT NULL,
  credit_subtotal numeric(12,2) NOT NULL CHECK (credit_subtotal > 0),
  credit_tax numeric(12,2) NOT NULL,
  credit_total numeric(12,2) NOT NULL,
  applied_amount numeric(12,2) NOT NULL DEFAULT 0,
  refund_due numeric(12,2) NOT NULL DEFAULT 0,
  -- reduce_draft | apply_to_balance | refund_due | split. No CHECK (§1).
  disposition text NOT NULL,
  refunded_at timestamptz,                  -- recorded when the refund is paid out
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_contract_credits_period_uniq UNIQUE (contract_id, period_start)
);
CREATE INDEX IF NOT EXISTS service_contract_credits_contract_idx
  ON public.service_contract_credits(contract_id);

-- ── 5. invoice_payments: the non-cash 'credit_applied' settlement ─────────────
-- Widen-only. Reproduces the complete 0091 list + the new value.
ALTER TABLE public.invoice_payments
  DROP CONSTRAINT IF EXISTS invoice_payments_method_check;
ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_method_check
  CHECK (method IN ('cheque','eft','e_transfer','credit_card','cash','other',
                    'deposit_applied','credit_applied'));
-- Back-link (CASCADE: removing a credit takes its paired settlement with it, so
-- the ledger never holds a settlement whose credit is gone).
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS contract_credit_id uuid
    REFERENCES public.service_contract_credits(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS invoice_payments_contract_credit_idx
  ON public.invoice_payments(contract_credit_id);

-- ── §3 boilerplate — GRANT + RLS + policies (never anon) ──────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_late_fees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_late_fees TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_credits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_credits TO service_role;

ALTER TABLE public.service_contract_late_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_contract_credits ENABLE ROW LEVEL SECURITY;

-- Row access open to authenticated (matches 0128); the app gates who may read
-- (clients:view / financials:view) and act (financials:edit). The proposal job
-- runs as service_role.
CREATE POLICY service_contract_late_fees_select_authenticated
  ON public.service_contract_late_fees FOR SELECT TO authenticated USING (true);
CREATE POLICY service_contract_late_fees_all_authenticated
  ON public.service_contract_late_fees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY service_contract_credits_select_authenticated
  ON public.service_contract_credits FOR SELECT TO authenticated USING (true);
CREATE POLICY service_contract_credits_all_authenticated
  ON public.service_contract_credits FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ── Existence check (run after applying — every line should match its comment) ─
--   -- New tables (expect 2)
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema='public'
--      AND table_name IN ('service_contract_late_fees','service_contract_credits');
--
--   -- New service_contracts columns (expect 15)
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='service_contracts'
--      AND column_name IN ('source_quote_id','source_send_id','source_acceptance_id',
--        'source_quote_number','source_signed_by','source_signed_at','source_signed_pdf_path',
--        'source_record_hash','source_terms','payment_terms_days','late_fee_mode',
--        'late_fee_monthly_pct','late_fee_flat_amount','late_fee_grace_days',
--        'cancelled_effective_date');
--
--   -- invoice_payments back-link column (expect 1)
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='invoice_payments' AND column_name='contract_credit_id';
--
--   -- Constraints (expect 8)
--   SELECT conname FROM pg_constraint WHERE conname IN (
--     'quotes_intended_target_kind_check','quotes_intended_target_shape_check',
--     'service_contracts_payment_terms_chk','service_contracts_late_fee_chk',
--     'service_contracts_late_fee_mode_chk','service_contract_late_fees_block_uniq',
--     'service_contract_credits_period_uniq','invoice_payments_method_check');
--
--   -- Exactly ONE kind-CHECK remains on quotes, and it admits service_contract (expect 1 row, t)
--   SELECT conname, pg_get_constraintdef(oid) LIKE '%service_contract%' AS widened
--     FROM pg_constraint WHERE conrelid='public.quotes'::regclass AND contype='c'
--      AND pg_get_constraintdef(oid) LIKE '%intended_target_kind%'
--      AND pg_get_constraintdef(oid) NOT LIKE '%intended_target_project_id%';
--
--   -- credit_applied admitted (expect t)
--   SELECT pg_get_constraintdef(oid) LIKE '%credit_applied%' FROM pg_constraint
--    WHERE conname='invoice_payments_method_check';
--
--   -- Foreign keys (expect 9)
--   SELECT conname FROM pg_constraint WHERE contype='f' AND conrelid IN (
--     'public.service_contracts'::regclass, 'public.service_contract_late_fees'::regclass,
--     'public.service_contract_credits'::regclass, 'public.invoice_payments'::regclass)
--     AND (conname LIKE 'service_contracts_source_%' OR conname LIKE 'service_contract_late_fees_%'
--          OR conname LIKE 'service_contract_credits_%' OR conname LIKE 'invoice_payments_contract_credit%');
--   -- = service_contracts_source_quote_id_fkey, _source_send_id_fkey, _source_acceptance_id_fkey,
--   --   service_contract_late_fees_contract_id_fkey, _source_invoice_id_fkey, _fee_invoice_id_fkey,
--   --   service_contract_credits_contract_id_fkey, _source_invoice_id_fkey,
--   --   invoice_payments_contract_credit_id_fkey
--
--   -- Indexes (expect 6)
--   SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (
--     'service_contracts_source_quote_uniq','service_contracts_source_acceptance_idx',
--     'service_contract_late_fees_contract_idx','service_contract_late_fees_status_idx',
--     'service_contract_credits_contract_idx','invoice_payments_contract_credit_idx');
--
--   -- Grants (expect 16 rows: 2 tables × 2 roles × 4 privileges, no anon)
--   SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public'
--      AND table_name IN ('service_contract_late_fees','service_contract_credits')
--      AND grantee IN ('authenticated','service_role','anon')
--    ORDER BY 1,2,3;
--
--   -- RLS on (expect 2 rows, both t)
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('service_contract_late_fees','service_contract_credits');
--
--   -- Policies (expect 4)
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
--     AND tablename IN ('service_contract_late_fees','service_contract_credits');
--
-- ── Reverse migration (commented — additive change; reverse order) ────────────
--   BEGIN;
--   ALTER TABLE public.invoice_payments DROP COLUMN IF EXISTS contract_credit_id;
--   ALTER TABLE public.invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_method_check;
--   ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_method_check
--     CHECK (method IN ('cheque','eft','e_transfer','credit_card','cash','other','deposit_applied'));
--   DROP TABLE IF EXISTS public.service_contract_credits;
--   DROP TABLE IF EXISTS public.service_contract_late_fees;
--   DROP INDEX IF EXISTS public.service_contracts_source_acceptance_idx;
--   DROP INDEX IF EXISTS public.service_contracts_source_quote_uniq;
--   ALTER TABLE public.service_contracts
--     DROP CONSTRAINT IF EXISTS service_contracts_late_fee_mode_chk,
--     DROP CONSTRAINT IF EXISTS service_contracts_late_fee_chk,
--     DROP CONSTRAINT IF EXISTS service_contracts_payment_terms_chk,
--     DROP COLUMN IF EXISTS cancelled_effective_date,
--     DROP COLUMN IF EXISTS late_fee_grace_days, DROP COLUMN IF EXISTS late_fee_flat_amount,
--     DROP COLUMN IF EXISTS late_fee_monthly_pct, DROP COLUMN IF EXISTS late_fee_mode,
--     DROP COLUMN IF EXISTS payment_terms_days, DROP COLUMN IF EXISTS source_terms,
--     DROP COLUMN IF EXISTS source_record_hash, DROP COLUMN IF EXISTS source_signed_pdf_path,
--     DROP COLUMN IF EXISTS source_signed_at, DROP COLUMN IF EXISTS source_signed_by,
--     DROP COLUMN IF EXISTS source_quote_number, DROP COLUMN IF EXISTS source_acceptance_id,
--     DROP COLUMN IF EXISTS source_send_id, DROP COLUMN IF EXISTS source_quote_id;
--   ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_intended_target_shape_check;
--   ALTER TABLE public.quotes ADD CONSTRAINT quotes_intended_target_shape_check CHECK (
--     (intended_target_kind IS NULL AND intended_target_project_id IS NULL)
--     OR (intended_target_kind = 'new_project' AND intended_target_project_id IS NULL)
--     OR (intended_target_kind = 'change_order' AND intended_target_project_id IS NOT NULL));
--   ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_intended_target_kind_check;
--   ALTER TABLE public.quotes ADD CONSTRAINT quotes_intended_target_kind_check
--     CHECK (intended_target_kind IN ('new_project','change_order'));
--   COMMIT;
-- Reversible only while no row uses the new values: no quote with
-- intended_target_kind='service_contract' and no 'credit_applied' payment (the
-- re-narrowed CHECKs would reject them) — re-point or delete those rows first.
-- Dropping the two new tables discards late-fee and credit history; export first.
