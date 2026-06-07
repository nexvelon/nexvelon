-- 0027_quotes.sql
-- Chunk F-1a: greenfield quotes persistence (plumbing only — no UI cutover yet).
--
-- The full Quote object is stored as jsonb in `data` (sections, items, totals,
-- document-style fields, schedules) — the builder already serializes/consumes
-- the whole Quote, so a blob is the smallest leap from the localStorage store.
-- Top-level columns mirror queryable fields for listing/filtering.
--
-- id is TEXT (quote ids are app-minted "q-xxxxxxxx" strings via newId, not
-- UUIDs). client_id / site_id are stored but NOT FK'd yet — deferred to avoid
-- import friction in the F-1b cutover; integrity FK is a later add.

BEGIN;

CREATE TABLE IF NOT EXISTS public.quotes (
  id          text PRIMARY KEY,
  number      text,
  name        text,
  client_id   uuid,
  site_id     uuid,
  status      text NOT NULL DEFAULT 'Draft'
              CHECK (status IN ('Draft','Sent','Approved','Rejected','Expired','Converted')),
  owner_id    uuid REFERENCES auth.users(id),
  total       numeric(14,2),
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotes_status_idx  ON public.quotes (status);
CREATE INDEX IF NOT EXISTS quotes_client_idx  ON public.quotes (client_id);
CREATE INDEX IF NOT EXISTS quotes_owner_idx   ON public.quotes (owner_id);
CREATE INDEX IF NOT EXISTS quotes_created_idx ON public.quotes (created_at DESC);

CREATE TRIGGER quotes_set_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select_authenticated" ON public.quotes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotes_write_authenticated" ON public.quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
