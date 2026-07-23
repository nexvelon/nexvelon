-- smoke_0100_bill_payments_paid_at_index.sql
-- Verify: the paid_at index exists on bill_payments.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'bill_payments'
     AND indexname = 'bill_payments_paid_at_idx';
  ASSERT n = 1, 'smoke fail: bill_payments_paid_at_idx missing';
  RAISE NOTICE 'ok: bill_payments(paid_at) index present';
END $$;
