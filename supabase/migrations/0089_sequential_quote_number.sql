-- 0089_sequential_quote_number.sql
-- New quotes get human-friendly SEQUENTIAL numbers (Q-10000, Q-10001, …)
-- instead of the old timestamp format (Q-260705212157-74). Rather than a
-- Postgres SEQUENCE (which needs manual setval on imports and drifts on edits),
-- a function scans the existing Q-<digits> numbers and returns max+1, starting
-- at 10000.
--
-- §2.1: additive function, no schema change. §2.2: LEGACY numbers are preserved
-- untouched — the `^Q-\d+$` filter matches ONLY the new pure-numeric format, so
-- timestamp numbers (which carry a second dash) are ignored, never renumbered.
-- §3: a function exposed via RPC needs GRANT EXECUTE to authenticated +
-- service_role.

BEGIN;

CREATE OR REPLACE FUNCTION public.next_sequential_quote_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  max_num integer;
BEGIN
  -- Highest existing sequential number, or 9999 so the first mint is Q-10000.
  -- Only `Q-<digits>` (no trailing segment) counts — legacy timestamp numbers
  -- like Q-260705212157-74 have a second dash and are excluded.
  SELECT COALESCE(MAX(CAST(SUBSTRING(number FROM 'Q-(\d+)$') AS integer)), 9999)
    INTO max_num
    FROM public.quotes
   WHERE number ~ '^Q-\d+$';

  RETURN 'Q-' || (max_num + 1)::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_sequential_quote_number()
  TO authenticated, service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- DROP FUNCTION IF EXISTS public.next_sequential_quote_number();
