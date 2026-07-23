-- 0100_bill_payments_paid_at_index.sql
-- SUB-7 — T5018 annual contract-payment reporting. NO new tables: T5018 is a
-- DERIVED report over the existing payment ledger (§2.2 — a stored annual total
-- goes stale the moment a payment is back-dated or corrected). This migration
-- only adds the supporting index for the calendar-year range scans.
--
-- Why plain (paid_at) and not a composite (paid_at, bill_id): the report's
-- query shape is "sub-attributed bills first (small set, served by SUB-4's
-- vendor_bills_subcontractor_id_idx), then their payments by bill_id
-- (bill_payments_bill_id_idx from 0092) filtered to the year". The paid_at
-- index serves the year-picker scan (distinct years of activity) and any
-- future date-first query; the join side is already covered, so a composite
-- would duplicate 0092's index for no gain.

BEGIN;

CREATE INDEX IF NOT EXISTS bill_payments_paid_at_idx
  ON public.bill_payments (paid_at);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP INDEX IF EXISTS public.bill_payments_paid_at_idx;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
