-- 0117_ui_theme_persistence.sql
-- UIDG-3 — persist the UI theme in the DB with an Admin-set org default and a
-- per-user override, and land the UIDG-4 custom-theme schema in the same
-- migration so this feature area needs only one.
--
-- Design notes:
--   A) ORG DEFAULT reuses the existing public.company_settings key/value store
--      (migration 0028) via the keys 'default_ui_theme' and
--      'default_ui_theme_mode' — no new org-level table is created (§1: additive,
--      no duplication). Absent keys fall back to lib/theme.ts DEFAULT_THEME in
--      app code, so no seed row is required.
--   B) public.user_ui_prefs — one row per user; NULL theme_key/theme_mode means
--      "inherit the org default" (do NOT copy the org value into the user row).
--   C) public.custom_themes — schema only this chunk (the colour editor ships in
--      UIDG-4). RLS: read own OR published; write own.
--
-- theme_key / theme_mode are deliberately plain text with NO narrow CHECK
-- constraint (§1 forbids narrowing later): a custom theme's key will not be one
-- of the 14 built-in presets, so validation lives in application code against
-- THEME_ORDER + the user's available custom themes, not in the DB.

BEGIN;

-- ── B) Per-user override ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_ui_prefs (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_key   text,        -- NULL = inherit the org default
  theme_mode  text,        -- NULL = inherit the org default (future axis, unused now)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ui_prefs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ui_prefs TO service_role;

ALTER TABLE public.user_ui_prefs ENABLE ROW LEVEL SECURITY;

-- Owner-scoped: a user reads and writes only their own row.
CREATE POLICY user_ui_prefs_select_own ON public.user_ui_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_ui_prefs_insert_own ON public.user_ui_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY user_ui_prefs_update_own ON public.user_ui_prefs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY user_ui_prefs_delete_own ON public.user_ui_prefs
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER user_ui_prefs_updated_at
  BEFORE UPDATE ON public.user_ui_prefs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── C) Custom themes (schema only this chunk) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_themes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  created_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tokens         jsonb NOT NULL,        -- the resolved ThemeColors shape (lib/theme.ts)
  base_theme_key text,                  -- preset it was derived from, if any
  is_published   boolean NOT NULL DEFAULT false,   -- false = private to creator
  deleted_at     timestamptz,           -- soft delete (§1)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_themes_tokens_is_object CHECK (jsonb_typeof(tokens) = 'object')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_themes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_themes TO service_role;

ALTER TABLE public.custom_themes ENABLE ROW LEVEL SECURITY;

-- Read: your own rows OR any published row. Write: your own rows only.
CREATE POLICY custom_themes_select_own_or_published ON public.custom_themes
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR is_published = true);
CREATE POLICY custom_themes_insert_own ON public.custom_themes
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY custom_themes_update_own ON public.custom_themes
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY custom_themes_delete_own ON public.custom_themes
  FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE INDEX custom_themes_created_by_idx
  ON public.custom_themes (created_by) WHERE deleted_at IS NULL;
CREATE INDEX custom_themes_published_idx
  ON public.custom_themes (is_published) WHERE is_published = true AND deleted_at IS NULL;

CREATE TRIGGER custom_themes_updated_at
  BEFORE UPDATE ON public.custom_themes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── activity_log: allow the 'ui_theme' audit kind ────────────────────────────
-- Reproduce the current allowed set (last set in 0080_project_lifecycle.sql) and
-- add 'ui_theme'. CHECK constraints apply to every role (incl. service_role, the
-- client the theme actions audit through), so this widening is required for the
-- audit insert to succeed. Additive per §1 — no value is removed.
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
    'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
    'ui_theme'
  ));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse):
--   BEGIN;
--   ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
--   ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--     CHECK (entity_type IN (
--       'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
--       'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project'
--     ));
--   DROP TABLE IF EXISTS public.custom_themes;
--   DROP TABLE IF EXISTS public.user_ui_prefs;
--   -- The org default lives as company_settings rows, not schema. To fully
--   -- revert, also remove them:
--   -- DELETE FROM public.company_settings
--   --   WHERE key IN ('default_ui_theme', 'default_ui_theme_mode');
--   COMMIT;
