BEGIN;

-- POLISH-54 — switch client address inheritance from NULL-when-inheriting
-- (POLISH-53) to COPY-RESOLVED + boolean flags. The "same as" relationship is
-- now tracked by a flag while the target columns hold the resolved values.
--
-- Column-name notes (verified against the live schema, NOT the spec draft):
--   * client address columns are billing_street / billing_city / … and
--     mailing_street / …  (NOT billing_address_line1).  Company address is
--     company_address_line1 / … (POLISH-53, migration 0071).
--   * clients.mailing_same_as_billing already exists (0012) — IF NOT EXISTS makes
--     re-adding a safe no-op.
--   * SITES are intentionally untouched: they already copy-resolve at insert time
--     and already carry their own flags (billing_same_as_client /
--     mailing_same_as_billing, 0015). No site column or backfill is added here.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_same_as_company boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mailing_same_as_billing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mailing_same_as_company boolean NOT NULL DEFAULT false;

-- BACKFILL: clients whose billing is empty (POLISH-53 NULL-inheritance) but have
-- a company address → copy company → billing and flag the relationship.
UPDATE public.clients
SET
  billing_street   = company_address_line1,
  billing_unit     = company_address_line2,
  billing_city     = company_address_city,
  billing_province = company_address_province,
  billing_postal   = company_address_postal,
  billing_country  = company_address_country,
  billing_same_as_company = true
WHERE billing_street IS NULL
  AND billing_city IS NULL
  AND company_address_line1 IS NOT NULL;

-- BACKFILL: clients whose mailing is empty but billing now has values → copy
-- billing → mailing and flag the relationship.
UPDATE public.clients
SET
  mailing_street   = billing_street,
  mailing_unit     = billing_unit,
  mailing_city     = billing_city,
  mailing_province = billing_province,
  mailing_postal   = billing_postal,
  mailing_country  = billing_country,
  mailing_same_as_billing = true
WHERE mailing_street IS NULL
  AND mailing_city IS NULL
  AND billing_street IS NOT NULL;

COMMIT;
