-- 0128_service_contracts.sql
-- RECUR-1 — service contracts + recurring billing (the recurring-revenue theme
-- recovered by REALITY-2, promoted to top of P1 by REALITY-3).
--
-- Nexvelon Guardian is a monitoring business — its revenue recurs (fire/elevator/
-- intrusion monitoring billed on a cycle). This adds the ability to express "this
-- site pays $85/month for monitoring" and generate the invoices automatically.
--
-- THREE tables, full §3 boilerplate on each (GRANT authenticated + service_role,
-- RLS, policies — never anon). ADDITIVE only (§1).

BEGIN;

-- ── service_contracts ────────────────────────────────────────────────────────
-- A recurring-billing agreement attached to a client (always) and optionally a
-- specific site. opco is carried per contract (§2.6 — Guardian and Integrated
-- Solutions file separately) and flows to every generated invoice.
CREATE TABLE IF NOT EXISTS public.service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opco text NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  -- Nullable: a contract can be client-level or pinned to one site. RESTRICT so a
  -- site with a live contract cannot be hard-deleted (matches invoices).
  site_id uuid REFERENCES public.sites(id) ON DELETE RESTRICT,
  name text NOT NULL,
  -- Lifecycle: draft | active | suspended | cancelled | expired. NO check —
  -- statuses may grow (§1); the app validates transitions.
  status text NOT NULL DEFAULT 'draft',
  -- Cadence is a fixed enum (a CHECK is safe here per §1 — cadence types don't grow).
  cadence text NOT NULL CHECK (cadence IN ('monthly','quarterly','semiannual','annual','custom')),
  -- Required only when cadence = 'custom' (enforced in app + the CHECK below).
  custom_interval_days int,
  -- advance = bill at the start of the period it covers (typical for monitoring);
  -- arrears = bill at the end. Fixed enum.
  billing_timing text NOT NULL DEFAULT 'advance' CHECK (billing_timing IN ('advance','arrears')),
  -- manual = operator generates on demand; automatic = generated AND issued on the
  -- billing date; draft_for_approval = generated as a draft awaiting a human to
  -- issue (DEFAULT). Fixed enum.
  billing_mode text NOT NULL DEFAULT 'draft_for_approval'
    CHECK (billing_mode IN ('manual','automatic','draft_for_approval')),
  start_date date NOT NULL,
  end_date date,                       -- null = open-ended
  next_billing_date date,              -- the scheduler's cursor; null when not active
  -- Tax snapshotted onto each generated invoice (monitoring is taxable).
  tax_rate numeric NOT NULL DEFAULT 13,
  tax_exempt boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- custom cadence must carry a positive interval; non-custom must not.
  CONSTRAINT service_contracts_custom_interval_chk CHECK (
    (cadence = 'custom' AND custom_interval_days IS NOT NULL AND custom_interval_days > 0)
    OR (cadence <> 'custom' AND custom_interval_days IS NULL)
  )
);

-- ── service_contract_lines ───────────────────────────────────────────────────
-- Per-contract pricing lines ("Fire monitoring $45", "Elevator monitoring $40").
-- These are the CURRENT price; each generated invoice SNAPSHOTS them into
-- invoice_lines (§2.2), so a later rate change never rewrites a past invoice.
CREATE TABLE IF NOT EXISTS public.service_contract_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── service_contract_invoices ────────────────────────────────────────────────
-- The link from a generated invoice back to its contract and the period it billed.
-- The UNIQUE (contract_id, period_start) is the DOUBLE-BILL GUARD: a period can be
-- claimed exactly once, enforced by the database, not just code. invoice_id is
-- nullable so the period can be claimed BEFORE the invoice is built (idempotency
-- lock); SET NULL if the invoice is later hard-deleted (the period record survives).
CREATE TABLE IF NOT EXISTS public.service_contract_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.service_contracts(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_contract_invoices_period_uniq UNIQUE (contract_id, period_start)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Contracts due for billing on a date (the scheduler's hot query).
CREATE INDEX IF NOT EXISTS service_contracts_due_idx
  ON public.service_contracts(next_billing_date)
  WHERE status = 'active';
-- Contracts by client + site (the client/site detail pages).
CREATE INDEX IF NOT EXISTS service_contracts_client_site_idx
  ON public.service_contracts(client_id, site_id);
-- Lines + period links by contract.
CREATE INDEX IF NOT EXISTS service_contract_lines_contract_idx
  ON public.service_contract_lines(contract_id);
CREATE INDEX IF NOT EXISTS service_contract_invoices_contract_idx
  ON public.service_contract_invoices(contract_id);
CREATE INDEX IF NOT EXISTS service_contract_invoices_invoice_idx
  ON public.service_contract_invoices(invoice_id);

-- ── §3 boilerplate — GRANT + RLS + policies (never anon) ──────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contracts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_lines TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contract_invoices TO service_role;

ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_contract_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_contract_invoices ENABLE ROW LEVEL SECURITY;

-- Row access open to authenticated; the app gates who may read/manage contracts
-- (clients:view to see, financials:edit to manage). Generation runs as service_role.
CREATE POLICY service_contracts_select_authenticated
  ON public.service_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY service_contracts_all_authenticated
  ON public.service_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY service_contract_lines_select_authenticated
  ON public.service_contract_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY service_contract_lines_all_authenticated
  ON public.service_contract_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY service_contract_invoices_select_authenticated
  ON public.service_contract_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY service_contract_invoices_all_authenticated
  ON public.service_contract_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── §5 — widen activity_log entity_type for 'service_contract' ────────────────
-- Reproduces the COMPLETE existing list (0124) + the new value. Keep in lockstep
-- with ACTIVITY_ENTITY_TYPES in lib/types/database.ts (the AUDIT-FIX-1 drift test).
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
    'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
    'ui_theme', 'inventory', 'attachment',
    'job', 'job_task', 'deficiency', 'commissioning_item',
    'subcontractor', 'subcontractor_compliance',
    'balance_snapshot',
    -- RECUR-1 addition:
    'service_contract'
  ));

COMMIT;

-- ── Existence check (run after applying) ─────────────────────────────────────
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public'
--       AND table_name IN ('service_contracts','service_contract_lines','service_contract_invoices');  -- expect 3
--   SELECT conname FROM pg_constraint WHERE conname IN
--     ('service_contract_invoices_period_uniq','service_contracts_custom_interval_chk','activity_log_entity_type_check');  -- expect 3
--   SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
--     ('service_contracts_due_idx','service_contracts_client_site_idx',
--      'service_contract_lines_contract_idx','service_contract_invoices_contract_idx',
--      'service_contract_invoices_invoice_idx');  -- expect 5
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='public' AND table_name='service_contracts';  -- authenticated + service_role, all 4 privs
--   SELECT polname FROM pg_policies WHERE schemaname='public'
--     AND tablename LIKE 'service_contract%';  -- expect 6 (2 per table)
--   SELECT 'service_contract' = ANY (
--     SELECT unnest(string_to_array(regexp_replace(pg_get_constraintdef(oid), '.*ARRAY\[|\].*', '', 'g'), ',')))
--     FROM pg_constraint WHERE conname='activity_log_entity_type_check';  -- entity_type allowed
--
-- ── Reverse migration (commented — additive change; drop in reverse order) ────
--   BEGIN;
--   DROP TABLE IF EXISTS public.service_contract_invoices;
--   DROP TABLE IF EXISTS public.service_contract_lines;
--   DROP TABLE IF EXISTS public.service_contracts;
--   ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
--   ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--     CHECK (entity_type IN (
--       'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
--       'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
--       'ui_theme', 'inventory', 'attachment',
--       'job', 'job_task', 'deficiency', 'commissioning_item',
--       'subcontractor', 'subcontractor_compliance', 'balance_snapshot'
--     ));
--   COMMIT;
-- Reversible only while no 'service_contract' activity rows exist (the re-add CHECK
-- would reject them) — delete those rows first if reversing after use.
