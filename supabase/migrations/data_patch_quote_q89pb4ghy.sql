-- data_patch_quote_q89pb4ghy.sql
-- ONE-OFF DATA PATCH — not a numbered/versioned migration. Run manually.
--
-- Data patch: revert quote q-89pb4ghy from Sent to Draft.
-- Root cause: the builder's "Send for Approval" button had no client/site
-- validation and bypassed the hardened sendQuoteAction. See QUOTES-5.
-- Original status flip: 2026-07-01 22:38 UTC by Jay Shah.
--
-- Reads return the `data` jsonb blob (lib/api/quotes.ts toQuote = row.data),
-- so BOTH the data.status and the top-level status mirror must be corrected.

-- Update both the top-level status mirror AND the data.status jsonb.
update public.quotes
set
  status = 'Draft',
  data = jsonb_set(data, '{status}', '"Draft"'),
  updated_at = now()
where id = 'q-89pb4ghy';

-- Log the correction in quote_audit_log.
insert into public.quote_audit_log
  (quote_id, event_type, actor_id, actor_name, changes)
values
  ('q-89pb4ghy',
   'status_changed',
   null,  -- system correction
   'System (QUOTES-5 data patch)',
   '{"status":{"from":"Sent","to":"Draft"},"reason":"Corrected accidental send via unguarded builder button"}'::jsonb);

-- Verify.
select id, status, data->>'status' as data_status, updated_at
from public.quotes
where id = 'q-89pb4ghy';
-- Expected: status='Draft', data_status='Draft'
