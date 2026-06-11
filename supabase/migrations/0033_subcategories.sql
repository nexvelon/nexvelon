BEGIN;
ALTER TABLE public.inventory_vocab
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.inventory_vocab(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS inventory_vocab_parent_id_idx ON public.inventory_vocab (parent_id);

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS subcategory text;
CREATE INDEX IF NOT EXISTS inventory_products_subcategory_idx ON public.inventory_products (subcategory);
COMMIT;
