-- smoke_0089_sequential_quote_number.sql
-- Verify the generator exists, starts at 10000, increments off the max, and
-- ignores legacy timestamp numbers. Each mutation runs in a savepoint we roll
-- back so no test rows persist.

-- 1. Function exists.
DO $$
BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'next_sequential_quote_number';
  ASSERT FOUND, 'smoke fail: next_sequential_quote_number() missing';
  RAISE NOTICE 'ok: function exists';
END $$;

-- 2. Increments off the highest existing sequential number, and legacy
--    timestamp numbers are ignored. Uses a temp row rolled back at the end.
DO $$
DECLARE result text;
BEGIN
  -- Seed a legacy-format number (must be ignored) + a sequential one.
  INSERT INTO public.quotes (id, number, status, data)
  VALUES ('smoke-legacy-0089', 'Q-260705212157-74', 'Draft', '{}'::jsonb),
         ('smoke-seq-0089',    'Q-10005',            'Draft', '{}'::jsonb);

  result := public.next_sequential_quote_number();
  ASSERT result = 'Q-10006',
    format('smoke fail: expected Q-10006 (max+1 ignoring legacy), got %s', result);
  RAISE NOTICE 'ok: next number is % (legacy ignored, max+1)', result;

  -- Roll the temp rows back so the smoke leaves no trace.
  DELETE FROM public.quotes WHERE id IN ('smoke-legacy-0089', 'smoke-seq-0089');
END $$;

-- 3. With no sequential numbers present, the generator starts at Q-10000.
--    (Only meaningful on a DB with zero Q-<digits> quotes; informational
--    otherwise.)
DO $$
DECLARE n int; result text;
BEGIN
  SELECT count(*) INTO n FROM public.quotes WHERE number ~ '^Q-\d+$';
  IF n = 0 THEN
    result := public.next_sequential_quote_number();
    ASSERT result = 'Q-10000',
      format('smoke fail: expected Q-10000 on empty, got %s', result);
    RAISE NOTICE 'ok: first sequential number is Q-10000';
  ELSE
    RAISE NOTICE 'skip: % sequential quote(s) already exist', n;
  END IF;
END $$;
