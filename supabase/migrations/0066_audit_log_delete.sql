BEGIN;

-- POLISH-30 — allow admins to hard-delete individual T&C audit-log versions.
-- (The restored_from_audit_id FK was already created ON DELETE SET NULL in 0064,
-- so deleting a referenced version safely nulls the reference on dependents.)
DROP POLICY IF EXISTS settings_audit_log_delete_authenticated ON public.settings_audit_log;
CREATE POLICY settings_audit_log_delete_authenticated ON public.settings_audit_log
  FOR DELETE TO authenticated USING (true);

COMMIT;
