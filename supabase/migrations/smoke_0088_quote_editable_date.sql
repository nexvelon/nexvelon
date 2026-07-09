-- smoke_0088_quote_editable_date.sql
-- Verify the column exists and the backfill covered every row.

-- 1. Column exists, type date.
DO $$
DECLARE v_type text;
BEGIN
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'quotes'
     AND column_name = 'quote_date';
  ASSERT v_type = 'date', format('smoke fail: quote_date type is %s', v_type);
  RAISE NOTICE 'ok: quotes.quote_date is date';
END $$;

-- 2. Backfill covered every existing row (no NULL quote_date on rows that have
--    a created_at).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.quotes
   WHERE quote_date IS NULL AND created_at IS NOT NULL;
  ASSERT n = 0, format('smoke fail: %s quotes still have NULL quote_date', n);
  RAISE NOTICE 'ok: quote_date backfilled for all existing quotes';
END $$;
