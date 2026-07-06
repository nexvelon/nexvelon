-- 0085_billing_same_as_site.sql
-- PROJ2-5 Part 1 — a site's billing address gains a THIRD inheritance source:
-- "same as the site's own physical address". Parallel to the existing
-- billing_same_as_client (0015) and the mailing_same_as_site flag (0073).
--
-- §2.1: additive nullable-free boolean, DEFAULT false → no backfill. Existing
--       sites keep their billing_same_as_client behaviour untouched; if that was
--       true they inherit from the client, if false they use their stored
--       billing_* values. billing_same_as_site starts false for everyone.
-- §3:   not a new table — no GRANT/RLS changes.

BEGIN;

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS billing_same_as_site boolean NOT NULL DEFAULT false;

-- A billing address has at most ONE inheritance source: it can't be "same as
-- client" AND "same as site" at once. (Both false = the site's own stored
-- billing_* values; exactly one true = that source.)
ALTER TABLE public.sites
  ADD CONSTRAINT sites_billing_source_exclusive_check
  CHECK (NOT (billing_same_as_client = true AND billing_same_as_site = true));

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_billing_source_exclusive_check;
-- ALTER TABLE public.sites DROP COLUMN IF EXISTS billing_same_as_site;
