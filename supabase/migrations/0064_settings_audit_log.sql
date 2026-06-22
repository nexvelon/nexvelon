BEGIN;

CREATE TABLE IF NOT EXISTS public.settings_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL,
  before_text text,
  after_text text NOT NULL,
  edited_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_by_email text,
  edited_by_name text,
  edited_at timestamptz NOT NULL DEFAULT now(),
  action_type text NOT NULL CHECK (action_type IN ('edit', 'restore')),
  restored_from_audit_id uuid REFERENCES public.settings_audit_log(id) ON DELETE SET NULL,
  change_summary text
);

CREATE INDEX IF NOT EXISTS settings_audit_log_setting_key_idx ON public.settings_audit_log(setting_key);
CREATE INDEX IF NOT EXISTS settings_audit_log_edited_at_idx ON public.settings_audit_log(edited_at DESC);

ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settings_audit_log_select_authenticated ON public.settings_audit_log;
CREATE POLICY settings_audit_log_select_authenticated ON public.settings_audit_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS settings_audit_log_insert_authenticated ON public.settings_audit_log;
CREATE POLICY settings_audit_log_insert_authenticated ON public.settings_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- No DELETE policy — audit log is append-only by design. Never delete entries.

COMMIT;
