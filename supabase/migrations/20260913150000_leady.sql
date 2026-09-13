-- ============================================================================
-- LEADY — kontakty do oddzwonienia, ze ŹRÓDŁEM JAKO POLEM
--
-- Dlaczego osobna tabela, a nie `marketing_leads`: tamta ma pięć własnych
-- ścieżek zapisu (webhook Meta Ads, leady zewnętrzne, synchronizacja, scoring
-- AI, kolejka obdzwaniania) i własny interfejs w module marketingu. Dziś jest
-- pusta, ale cała instalacja stoi — kontakt z dema wpadłby przy pierwszej
-- kampanii do automatycznego obdzwaniania razem z leadami reklamowymi.
--
-- `zrodlo` jest zwykłym tekstem z indeksem. Dołożenie piątego źródła za miesiąc
-- to jeden nowy ciąg znaków, zero zmian w strukturze i zero migracji.
--
-- ⚠️ DO WYKONANIA PRZEZ CZŁOWIEKA.
-- ============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.lead_status AS ENUM ('nowy', 'oddzwonilismy', 'zainteresowany', 'odrzucony');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.leady (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utworzony_at     timestamptz NOT NULL DEFAULT now(),
  imie             text,
  telefon          text,
  email            text,
  -- ŹRÓDŁO JAKO POLE. Dziś 'demo-agenta'; jutro formularz, reklama, marketplace.
  zrodlo           text NOT NULL,
  -- ZGODA NA TELEFON JEST OSOBNA OD ZGODY NA DANE. Bez niej nie wolno dzwonić,
  -- więc trzymamy ją jako własną kolumnę, a nie zakopaną w `zgody`.
  zgoda_telefon    boolean NOT NULL DEFAULT false,
  -- TREŚĆ zgód, nie samo „true": gdy ktoś zapyta, na co się zgodził, musimy
  -- pokazać zdanie, które widział — a ono zmienia się w czasie.
  zgody            jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           public.lead_status NOT NULL DEFAULT 'nowy',
  notatka          text,
  obsluzony_przez  uuid REFERENCES auth.users(id),
  obsluzony_at     timestamptz
);

COMMENT ON TABLE public.leady IS
  'Kontakty do oddzwonienia ze wszystkich źródeł. Panel sprzedażowy admina.';
COMMENT ON COLUMN public.leady.zgoda_telefon IS
  'Osobna zgoda na kontakt telefoniczny. FALSE znaczy ZAKAZ dzwonienia, nie brak danych.';

CREATE INDEX IF NOT EXISTS leady_zrodlo_data ON public.leady (zrodlo, utworzony_at DESC);
CREATE INDEX IF NOT EXISTS leady_status_data ON public.leady (status, utworzony_at DESC);

ALTER TABLE public.leady ENABLE ROW LEVEL SECURITY;

-- Tylko administrator. Zapis idzie kluczem serwisowym z funkcji brzegowej,
-- więc anon i authenticated nie mają tu czego szukać.
DROP POLICY IF EXISTS "leady admin" ON public.leady;
CREATE POLICY "leady admin" ON public.leady
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.leady FROM anon;

SELECT 'tabela leady' AS co, count(*)::text AS wierszy FROM public.leady;

COMMIT;
