BEGIN;

-- POLISH-45 — atomic hard-delete of a client and everything beneath it.
--
-- Why a function (not sequential JS DELETEs): the FK graph has RESTRICT edges
-- that block deletion unless children go first, and at least one is non-obvious
-- (labour_entries.cost_center_id -> project_cost_centers RESTRICT, 0054). A
-- plpgsql function runs in a single implicit transaction, so if ANY delete is
-- blocked by an FK we haven't accounted for, the WHOLE operation rolls back —
-- no partial / corrupt state. SECURITY DEFINER so it runs with table-owner
-- rights; callable only by service_role (the admin-gated server action).
--
-- FK graph this orders against (derived from migrations 0001/0022/0027/0041/
-- 0042/0043/0046/0049/0054/0056):
--   clients  <- sites.client_id (CASCADE), contacts.client_id (CASCADE),
--               projects.client_id (RESTRICT), invoices.client_id (RESTRICT),
--               quotes.client_id (no FK), client_invitations.client_id (SET NULL)
--   sites    <- inventory_stock.site_id (RESTRICT), projects.site_id (RESTRICT),
--               invoices.site_id (RESTRICT), contacts.site_id (SET NULL),
--               quotes.site_id (no FK)
--   projects <- project_quotes.project_id (CASCADE), project_cost_centers.project_id (CASCADE),
--               invoices.project_id (RESTRICT)
--   project_cost_centers <- labour_entries.cost_center_id (RESTRICT),
--               inventory_stock.current_cost_center_id (SET NULL)
--   quotes   <- project_quotes.quote_id (RESTRICT), projects.originating_quote_id (SET NULL),
--               project_cost_centers.source_quote_id (SET NULL)
--   invoices <- invoice_lines.invoice_id (CASCADE)
-- Preserved on purpose: activity_log (audit history), users/profiles/settings.

CREATE OR REPLACE FUNCTION public.hard_delete_client(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_ids    uuid[];
  v_quote_ids   text[];
  v_invoice_ids uuid[];
  v_project_ids uuid[];
  v_cc_ids      uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_site_ids    FROM sites    WHERE client_id = p_client_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_quote_ids   FROM quotes   WHERE client_id = p_client_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_invoice_ids FROM invoices WHERE client_id = p_client_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_project_ids FROM projects WHERE client_id = p_client_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_cc_ids
    FROM project_cost_centers WHERE project_id = ANY(v_project_ids);

  -- labour first (RESTRICTs cost centers)
  DELETE FROM labour_entries       WHERE cost_center_id = ANY(v_cc_ids);
  -- invoices (clears invoices.project_id RESTRICT) + their lines
  DELETE FROM invoice_lines        WHERE invoice_id = ANY(v_invoice_ids);
  DELETE FROM invoices             WHERE client_id = p_client_id;
  -- project children then projects
  DELETE FROM project_quotes       WHERE project_id = ANY(v_project_ids);
  DELETE FROM project_cost_centers WHERE project_id = ANY(v_project_ids);
  DELETE FROM projects             WHERE client_id = p_client_id;
  -- quotes (project_quotes RESTRICT now cleared)
  DELETE FROM quotes               WHERE client_id = p_client_id;
  -- inventory at these sites (RESTRICTs sites)
  DELETE FROM inventory_stock      WHERE site_id = ANY(v_site_ids);
  -- contacts + originating invitations
  DELETE FROM contacts             WHERE client_id = p_client_id OR site_id = ANY(v_site_ids);
  DELETE FROM client_invitations   WHERE client_id = p_client_id;
  -- attachment rows for every owned entity (storage objects handled in the app)
  DELETE FROM attachments WHERE
       (entity_type = 'client'  AND entity_id = p_client_id::text)
    OR (entity_type = 'site'    AND entity_id = ANY(SELECT unnest(v_site_ids)::text))
    OR (entity_type = 'quote'   AND entity_id = ANY(v_quote_ids))
    OR (entity_type = 'invoice' AND entity_id = ANY(SELECT unnest(v_invoice_ids)::text))
    OR (entity_type = 'project' AND entity_id = ANY(SELECT unnest(v_project_ids)::text));
  -- finally sites then the client itself
  DELETE FROM sites                WHERE client_id = p_client_id;
  DELETE FROM clients              WHERE id = p_client_id;
END;
$$;

-- Lock it down: only the service-role (admin-gated action) may execute it.
REVOKE ALL ON FUNCTION public.hard_delete_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_client(uuid) TO service_role;

COMMIT;
