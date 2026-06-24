BEGIN;

-- POLISH-59 — unify codes. (1) Backfill client_code for invite-approved clients
-- that have NULL, using createClient's real format C-{OPCO_PREFIX}-{YEAR}-{NNNN}
-- (4-digit, sequenced per opco+year). (2) Renumber invite-format sites ('S-NNN',
-- no second dash — from POLISH-57) into the unified per-client 'S-{client_code}-NNN'.
-- Existing properly-formatted codes are never changed. Atomic (single tx).

-- Step 1 — client_code backfill (per opco-prefix + created_at year).
DO $$
DECLARE
  rec     RECORD;
  v_prefix text;
  v_year  int;
  v_next  int;
BEGIN
  FOR rec IN
    SELECT id, default_opco, created_at
    FROM public.clients
    WHERE client_code IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    v_prefix := CASE rec.default_opco
                  WHEN 'integrated_solutions' THEN 'IS'
                  WHEN 'guardian' THEN 'GD'
                  ELSE 'XX' END;
    v_year := EXTRACT(YEAR FROM rec.created_at)::int;
    -- Next number for this prefix+year across ALL current codes (re-queried each
    -- iteration so codes assigned earlier in this loop are counted).
    SELECT COALESCE(MAX((substring(client_code FROM '-(\d{4})$'))::int), 0) + 1
      INTO v_next
      FROM public.clients
      WHERE client_code LIKE 'C-' || v_prefix || '-' || v_year::text || '-%';
    UPDATE public.clients
      SET client_code = 'C-' || v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0')
      WHERE id = rec.id;
  END LOOP;
END $$;

-- Step 2 — renumber invite-format sites ('S-NNN') to per-client 'S-{client_code}-NNN'.
DO $$
DECLARE
  c      RECORD;
  s      RECORD;
  v_seq  int;
BEGIN
  FOR c IN
    SELECT DISTINCT cl.id, cl.client_code
    FROM public.clients cl
    JOIN public.sites st ON st.client_id = cl.id
    WHERE st.site_code ~ '^S-[0-9]+$'
      AND cl.client_code IS NOT NULL
  LOOP
    -- Continue AFTER any existing per-client sites so we never collide.
    SELECT COALESCE(MAX((substring(site_code FROM '-(\d+)$'))::int), 0)
      INTO v_seq
      FROM public.sites
      WHERE client_id = c.id
        AND site_code LIKE 'S-' || c.client_code || '-%';
    FOR s IN
      SELECT id FROM public.sites
      WHERE client_id = c.id
        AND site_code ~ '^S-[0-9]+$'
      ORDER BY created_at ASC, id ASC
    LOOP
      v_seq := v_seq + 1;
      UPDATE public.sites
        SET site_code = 'S-' || c.client_code || '-' || lpad(v_seq::text, 3, '0')
        WHERE id = s.id;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
