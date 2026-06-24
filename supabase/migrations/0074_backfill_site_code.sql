BEGIN;

-- POLISH-57 — backfill sites that have NULL site_code (invite-created sites,
-- which had no code pre-POLISH-57, plus any manual site whose client lacked a
-- client_code). Assign a sequential global "S-NNN" code starting AFTER the
-- current highest global "S-NNN" value. Existing codes (manual per-client
-- "S-{client_code}-NNN", or any non-null code) are NEVER changed — only NULLs
-- are filled. Ordered by created_at so older sites get lower numbers.

WITH base AS (
  SELECT COALESCE(MAX((substring(site_code FROM '^S-(\d+)$'))::int), 0) AS m
  FROM public.sites
  WHERE site_code ~ '^S-\d+$'
),
numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM public.sites
  WHERE site_code IS NULL
)
UPDATE public.sites s
SET site_code = 'S-' || lpad(((SELECT m FROM base) + n.rn)::text, 3, '0')
FROM numbered n
WHERE s.id = n.id;

COMMIT;
