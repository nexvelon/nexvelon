-- 0023_inventory_vocab.sql
-- Chunk B-1: settings-managed vocabularies for inventory dropdowns
-- (category / manufacturer / unit_of_measure / storage_location).
--
-- Single table with a `kind` discriminator + UNIQUE(kind, name), mirroring the
-- line_item_classifications (0008) / margin_tiers (0010) managed-list pattern:
-- is_active soft-delete, audit columns → auth.users, shared handle_updated_at()
-- trigger, RLS authenticated read+write (writes additionally requireAdmin at the
-- server-action layer). 'vendor' is intentionally NOT a kind here — the Vendors
-- settings pane owns vendors.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_vocab (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL CHECK (kind IN ('category','manufacturer','unit_of_measure','storage_location')),
  name          text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  updated_by    uuid REFERENCES auth.users(id),
  UNIQUE (kind, name)
);

CREATE INDEX IF NOT EXISTS inventory_vocab_kind_order_idx  ON public.inventory_vocab (kind, display_order);
CREATE INDEX IF NOT EXISTS inventory_vocab_kind_active_idx ON public.inventory_vocab (kind, is_active);

CREATE TRIGGER inventory_vocab_set_updated_at
  BEFORE UPDATE ON public.inventory_vocab
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.inventory_vocab ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_vocab_select_authenticated" ON public.inventory_vocab
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_vocab_write_authenticated" ON public.inventory_vocab
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed (idempotent). Expanded from the current hardcoded consts:
--   category        = ProductForm CATEGORY_OPTIONS + 'Conduits/Fittings'
--   manufacturer    = ProductForm MANUFACTURER_OPTIONS
--   storage_location = 'Default' + inventory-data WAREHOUSE_LOCATIONS
--   unit_of_measure = Each / Box / Pack / Case / Roll / Feet / Meter
INSERT INTO public.inventory_vocab (kind, name, display_order) VALUES
  ('unit_of_measure','Each',0),
  ('unit_of_measure','Box',1),
  ('unit_of_measure','Pack',2),
  ('unit_of_measure','Case',3),
  ('unit_of_measure','Roll',4),
  ('unit_of_measure','Feet',5),
  ('unit_of_measure','Meter',6),

  ('storage_location','Default',0),
  ('storage_location','Main Warehouse',1),
  ('storage_location','Truck 1',2),
  ('storage_location','Truck 2',3),
  ('storage_location','Truck 3',4),
  ('storage_location','Branch — Mississauga',5),

  ('category','Access Control',0),
  ('category','CCTV',1),
  ('category','Video Surveillance',2),
  ('category','Intrusion',3),
  ('category','Intercom',4),
  ('category','Networking',5),
  ('category','Network',6),
  ('category','Power',7),
  ('category','Cabling',8),
  ('category','Racks',9),
  ('category','Accessories',10),
  ('category','Conduits/Fittings',11),

  ('manufacturer','Kantech',0),
  ('manufacturer','Genetec',1),
  ('manufacturer','Avigilon',2),
  ('manufacturer','DSC',3),
  ('manufacturer','Hanwha',4),
  ('manufacturer','ICT',5),
  ('manufacturer','Hartmann',6),
  ('manufacturer','Keyscan',7),
  ('manufacturer','C-CURE',8),
  ('manufacturer','Lenel',9),
  ('manufacturer','Axis',10),
  ('manufacturer','Uniview',11),
  ('manufacturer','Vivotek',12)
ON CONFLICT (kind, name) DO NOTHING;

COMMIT;
