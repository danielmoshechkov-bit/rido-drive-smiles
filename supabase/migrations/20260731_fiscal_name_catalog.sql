-- =====================================================================
-- FISKALIZACJA — trwała „nazwa na paragon" w katalogu
--
-- Warsztat wpisuje te same usługi setki razy. Raz ustawiona nazwa fiskalna
-- ma się zapamiętać i być używana automatycznie przy każdym paragonie.
--
-- Puste pole = automatyczne skracanie (słownik skrótów + granica słowa).
-- Kolumna jest opcjonalna i nie zmienia żadnego istniejącego zachowania.
-- =====================================================================

-- Pozycje zleceń podpowiadane są z inventory_products (części, materiały, usługi).
ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS fiscal_name text;

-- Katalog usług prezentowany klientom.
ALTER TABLE public.provider_services
  ADD COLUMN IF NOT EXISTS fiscal_name text;

COMMENT ON COLUMN public.inventory_products.fiscal_name IS
  'Nazwa drukowana na paragonie fiskalnym (max 40 znaków). Puste = automatyczne skracanie nazwy handlowej.';
COMMENT ON COLUMN public.provider_services.fiscal_name IS
  'Nazwa drukowana na paragonie fiskalnym (max 40 znaków). Puste = automatyczne skracanie nazwy handlowej.';
