
-- Iteracja 2 — new columns for advanced filters. Non-destructive.
ALTER TABLE public.real_estate_listings
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rent_amount numeric,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric;

-- GIN on attributes (jsonb_path_ops = smaller, faster for @> containment)
CREATE INDEX IF NOT EXISTS idx_rel_attributes_gin
  ON public.real_estate_listings USING GIN (attributes jsonb_path_ops);

-- Range/sort indexes — only where selectivity helps
CREATE INDEX IF NOT EXISTS idx_rel_price       ON public.real_estate_listings (price)       WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rel_area        ON public.real_estate_listings (area)        WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rel_rooms       ON public.real_estate_listings (rooms)       WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rel_build_year  ON public.real_estate_listings (build_year)  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rel_city_lower  ON public.real_estate_listings (lower(city));
CREATE INDEX IF NOT EXISTS idx_rel_type_txn_status
  ON public.real_estate_listings (property_type, transaction_type, status);
CREATE INDEX IF NOT EXISTS idx_rel_created_at  ON public.real_estate_listings (created_at DESC)
  WHERE status = 'active';
