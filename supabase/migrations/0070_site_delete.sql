BEGIN;

-- POLISH-46 — atomic hard-delete of a single SITE and everything beneath it,
-- WITHOUT touching the parent client. Mirrors hard_delete_client (0069) but
-- scoped to one site. Runs in one implicit transaction (plpgsql), so a missed
-- FK rolls the whole thing back — no partial state. SECURITY DEFINER; callable
-- only by service_role (the admin-gated server action).
--
-- sites.deleted_at already exists (migration 0001), so no column/index is added.
--
-- Site FK graph (derived from migrations): the RESTRICT edges that block a site
-- delete are inventory_stock.site_id, invoices.site_id, projects.site_id.
-- contacts.site_id is SET NULL; quotes.site_id has NO FK (stored only). The
-- deeper chain (projects -> project_cost_centers -> labour_entries RESTRICT,
-- invoices -> invoice_lines) is ordered children-first below. Quotes are
-- PRESERVED (only their site link is cleared). The parent client is untouched.

CREATE OR REPLACE FUNCTION public.hard_delete_site(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_ids uuid[];
  v_invoice_ids uuid[];
  v_cc_ids      uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO v_project_ids FROM projects WHERE site_id = p_site_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_invoice_ids FROM invoices WHERE site_id = p_site_id;
  SELECT coalesce(array_agg(id), '{}') INTO v_cc_ids
    FROM project_cost_centers WHERE project_id = ANY(v_project_ids);

  -- labour first (RESTRICTs cost centers), then invoices + lines
  DELETE FROM labour_entries       WHERE cost_center_id = ANY(v_cc_ids);
  DELETE FROM invoice_lines        WHERE invoice_id = ANY(v_invoice_ids);
  DELETE FROM invoices             WHERE site_id = p_site_id;
  -- project children then projects (clears projects.site_id RESTRICT)
  DELETE FROM project_quotes       WHERE project_id = ANY(v_project_ids);
  DELETE FROM project_cost_centers WHERE project_id = ANY(v_project_ids);
  DELETE FROM projects             WHERE site_id = p_site_id;
  -- inventory at the site (clears inventory_stock.site_id RESTRICT)
  DELETE FROM inventory_stock      WHERE site_id = p_site_id;
  -- site-scoped contacts
  DELETE FROM contacts             WHERE site_id = p_site_id;
  -- quotes are PRESERVED — just clear their (un-FK'd) site link
  UPDATE quotes SET site_id = NULL WHERE site_id = p_site_id;
  -- attachment rows for the site + its projects + its invoices (quote
  -- attachments stay, since quotes survive). Storage objects handled in the app.
  DELETE FROM attachments WHERE
       (entity_type = 'site'    AND entity_id = p_site_id::text)
    OR (entity_type = 'project' AND entity_id = ANY(SELECT unnest(v_project_ids)::text))
    OR (entity_type = 'invoice' AND entity_id = ANY(SELECT unnest(v_invoice_ids)::text));
  -- finally the site row. The parent client is intentionally NOT touched.
  DELETE FROM sites                WHERE id = p_site_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_site(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_delete_site(uuid) TO service_role;

COMMIT;
