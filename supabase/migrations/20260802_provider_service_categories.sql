-- ============================================================================
-- Kategorie usług usługodawcy (Warsztat / Myjnia / Detailing …).
-- Dotąd kategoria była sztywną listą w kodzie i usługodawca mógł mieć tylko
-- jedną branżę. Teraz kategorie są jego własne: przełącza się między nimi w
-- panelu i na karcie, a każda może mieć swoje zdjęcie.
--
-- Powiązanie z usługami zostaje po NAZWIE (provider_services.category), żeby
-- nie ruszać istniejących danych ani wyszukiwarki usług.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_service_categories_name_unique UNIQUE (provider_id, name)
);

CREATE INDEX IF NOT EXISTS idx_provider_service_categories_provider
  ON public.provider_service_categories (provider_id, sort_order);

ALTER TABLE public.provider_service_categories ENABLE ROW LEVEL SECURITY;

-- Odczyt publiczny: to katalog usług widoczny na karcie usługodawcy
-- (same nazwy kategorii i zdjęcia — bez danych osobowych).
DROP POLICY IF EXISTS provider_service_categories_public_read ON public.provider_service_categories;
CREATE POLICY provider_service_categories_public_read
  ON public.provider_service_categories FOR SELECT
  USING (true);

-- Zapis tylko właściciel karty usługodawcy.
DROP POLICY IF EXISTS provider_service_categories_owner_write ON public.provider_service_categories;
CREATE POLICY provider_service_categories_owner_write
  ON public.provider_service_categories FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = provider_service_categories.provider_id AND sp.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.service_providers sp
    WHERE sp.id = provider_service_categories.provider_id AND sp.user_id = auth.uid()
  ));

-- Przeniesienie tego, co już jest: każda kategoria używana przez usługi
-- staje się kategorią usługodawcy, żeby nikt nie stracił podziału oferty.
INSERT INTO public.provider_service_categories (provider_id, name, sort_order)
SELECT DISTINCT ps.provider_id, ps.category, 0
FROM public.provider_services ps
WHERE COALESCE(NULLIF(TRIM(ps.category), ''), '') <> ''
ON CONFLICT (provider_id, name) DO NOTHING;
