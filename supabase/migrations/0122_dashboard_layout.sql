-- UIDG-8 — per-user dashboard layout. Additive column, no new table.
--
-- Storage decision (2c): the layout is always read/written atomically per user
-- (never queried per-widget across users), and UIDG-10's per-widget config nests
-- inside each array element — so a jsonb blob beats a row-per-widget table's join
-- overhead with no loss. The PER-USER override reuses the existing
-- public.user_ui_prefs (migration 0117) — it is already the "one row per user,
-- NULL = inherit" home with owner-scoped RLS and the correct GRANTs, so no §3
-- new-table boilerplate is triggered here. The ORG DEFAULT reuses the existing
-- public.company_settings key/value store (migration 0028) under the key
-- 'dashboard_default_layout' — mirroring how the theme default is stored — so it
-- too needs no new table. NULL/absent means inherit (never copied into a user row).
--
-- Shape: { "widgets": [ { "id": "kpiOverview", "colSpan": 12 }, ... ] } — order is
-- array order. No CHECK constrains the widget ids (§1 — the catalog will grow);
-- validation is in application code against the widget registry.

ALTER TABLE public.user_ui_prefs
  ADD COLUMN IF NOT EXISTS dashboard_layout jsonb;

COMMENT ON COLUMN public.user_ui_prefs.dashboard_layout IS
  'UIDG-8 — the user''s dashboard layout override ({widgets:[{id,colSpan}]}). NULL = inherit the org default (company_settings ''dashboard_default_layout'') then the built-in default. Validated in app code against the widget registry.';

-- No GRANT/RLS changes: user_ui_prefs already grants authenticated + service_role
-- and enforces owner-scoped RLS (0117); a new column inherits both.

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse):
--   ALTER TABLE public.user_ui_prefs DROP COLUMN IF EXISTS dashboard_layout;
--   -- (and, if desired, delete the org-default KV row:)
--   -- DELETE FROM public.company_settings WHERE key = 'dashboard_default_layout';
