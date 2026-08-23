-- PRZECHOWALNIA: cennik wg rozmiaru i rodzaju felgi + oplata cykliczna.
--
-- Dotad cena przechowania byla jedna liczba wpisywana recznie przy przyjeciu
-- i nie zalezala od niczego. Warsztat bral tyle samo za komplet 15" na stali
-- co za 21" na aluminium, i tyle samo za trzy miesiace co za rok.
--
-- Teraz: cennik (rozmiar + rodzaj felgi -> stawka za okres) i okres rozliczeniowy
-- od 1 do 12 miesiecy. System sam mnozy stawke przez liczbe rozpoczetych okresow.
--
-- WAZNE: stawka i dlugosc okresu zapisuja sie NA WPISIE w chwili przyjecia.
-- Pozniejsza podwyzka cennika nie podnosi ceny klientowi, ktory zostawil opony
-- wczesniej — tak samo jak wystawiona faktura nie zmienia sie po zmianie cennika.

-- ------------------------------------------------------------------ cennik
CREATE TABLE IF NOT EXISTS public.workshop_tire_pricing (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  rozmiar         text NOT NULL,
  rodzaj_felgi    text NOT NULL DEFAULT 'dowolne',
  cena_za_okres   numeric(10,2) NOT NULL,
  okres_miesiecy  integer NOT NULL DEFAULT 6,
  aktywna         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cena_nieujemna    CHECK (cena_za_okres >= 0),
  CONSTRAINT okres_od_1_do_12  CHECK (okres_miesiecy BETWEEN 1 AND 12),
  CONSTRAINT felga_znana       CHECK (rodzaj_felgi IN ('stalowe', 'aluminiowe', 'bez felg', 'dowolne'))
);

-- Jeden wiersz na parę rozmiar+felga. Dwie stawki na to samo to zrodlo sporu
-- z klientem, wiec baza na to nie pozwala.
CREATE UNIQUE INDEX IF NOT EXISTS workshop_tire_pricing_para
  ON public.workshop_tire_pricing (provider_id, lower(btrim(rozmiar)), rodzaj_felgi)
  WHERE aktywna;

COMMENT ON TABLE public.workshop_tire_pricing IS
  'Cennik przechowalni: stawka za okres wg rozmiaru opony i rodzaju felgi.';
COMMENT ON COLUMN public.workshop_tire_pricing.rodzaj_felgi IS
  '"dowolne" dziala jako stawka zapasowa, gdy nie ma wpisu dla konkretnej felgi.';

ALTER TABLE public.workshop_tire_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warsztat czyta swoj cennik" ON public.workshop_tire_pricing;
CREATE POLICY "warsztat czyta swoj cennik"
  ON public.workshop_tire_pricing FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "warsztat zmienia swoj cennik" ON public.workshop_tire_pricing;
CREATE POLICY "warsztat zmienia swoj cennik"
  ON public.workshop_tire_pricing FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- ---------------------------------------------------------- stawka na wpisie
ALTER TABLE public.workshop_tire_storage
  ADD COLUMN IF NOT EXISTS cena_za_okres  numeric(10,2),
  ADD COLUMN IF NOT EXISTS okres_miesiecy integer;

COMMENT ON COLUMN public.workshop_tire_storage.cena_za_okres IS
  'Stawka zamrozona przy przyjeciu. Puste = stary model, liczy sie storage_cost.';

ALTER TABLE public.workshop_tire_storage_settings
  ADD COLUMN IF NOT EXISTS domyslny_okres_miesiecy integer NOT NULL DEFAULT 6;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'domyslny_okres_od_1_do_12'
  ) THEN
    ALTER TABLE public.workshop_tire_storage_settings
      ADD CONSTRAINT domyslny_okres_od_1_do_12
      CHECK (domyslny_okres_miesiecy BETWEEN 1 AND 12);
  END IF;
END $$;

-- ------------------------------------------------------- podpowiedz z cennika
CREATE OR REPLACE FUNCTION public.przechowalnia_stawka(
  p_provider_id uuid,
  p_rozmiar text,
  p_rodzaj_felgi text
)
RETURNS TABLE (cena numeric, okres integer)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT c.cena_za_okres, c.okres_miesiecy
  FROM workshop_tire_pricing c
  WHERE c.provider_id = p_provider_id
    AND c.aktywna
    AND lower(btrim(c.rozmiar)) = lower(btrim(coalesce(p_rozmiar, '')))
    AND c.rodzaj_felgi IN (coalesce(nullif(btrim(p_rodzaj_felgi), ''), 'dowolne'), 'dowolne')
  -- Wpis dokladnie dla tej felgi bije stawke zapasowa "dowolne".
  ORDER BY (c.rodzaj_felgi = 'dowolne')
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.przechowalnia_stawka IS
  'Zwraca stawke z cennika dla rozmiaru i felgi. Brak wpisu = brak wiersza.';

-- --------------------------------------------------------------- naleznosc
CREATE OR REPLACE FUNCTION public.przechowalnia_naleznosc(
  p_provider_id uuid,
  p_termin date,
  p_pickup_at timestamptz,
  p_cena numeric,
  p_stored_at timestamptz DEFAULT NULL,
  p_cena_za_okres numeric DEFAULT NULL,
  p_okres_miesiecy integer DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  z record;
  v_koniec    date;
  v_miesiecy  integer;
  v_okresow   integer;
  v_przechow  numeric;
  v_dni       integer;
  v_kara      numeric;
BEGIN
  v_koniec := coalesce(p_pickup_at::date, current_date);

  -- 1. Oplata za samo przechowanie.
  IF p_cena_za_okres IS NOT NULL AND coalesce(p_okres_miesiecy, 0) > 0 AND p_stored_at IS NOT NULL THEN
    -- Liczymy pelne miesiace. Rozpoczety okres jest platny w calosci, ale
    -- niepelny miesiac w srodku okresu nie podbija rachunku — na korzysc klienta.
    v_miesiecy := (EXTRACT(YEAR FROM age(v_koniec, p_stored_at::date))::integer * 12)
                + EXTRACT(MONTH FROM age(v_koniec, p_stored_at::date))::integer;

    v_okresow := GREATEST(1, CEIL(v_miesiecy::numeric / p_okres_miesiecy)::integer);
    v_przechow := v_okresow * p_cena_za_okres;
  ELSE
    -- Stary model: jedna kwota wpisana recznie przy przyjeciu.
    v_przechow := coalesce(p_cena, 0);
  END IF;

  -- 2. Oplata za przetrzymanie po terminie.
  SELECT oplata_za_dzien, dni_karencji, oplata_maksymalna
    INTO z
  FROM workshop_tire_storage_settings
  WHERE provider_id = p_provider_id;

  IF z IS NULL OR coalesce(z.oplata_za_dzien, 0) <= 0 OR p_termin IS NULL THEN
    RETURN v_przechow;
  END IF;

  v_dni := GREATEST(0, v_koniec - p_termin - coalesce(z.dni_karencji, 0));
  v_kara := v_dni * z.oplata_za_dzien;
  IF z.oplata_maksymalna IS NOT NULL THEN
    v_kara := LEAST(v_kara, z.oplata_maksymalna);
  END IF;

  RETURN v_przechow + v_kara;
END;
$$;

-- ------------------------------------------------------------------- widok
-- Widok zdejmujemy PRZED stara funkcja, bo na niej wisi.
DROP VIEW IF EXISTS public.workshop_tire_storage_naleznosci;

-- Stara, czteroargumentowa wersja zostalaby obok nowej jako osobna funkcja
-- i widok wolalby wciaz ja. Usuwamy ja jawnie.
DROP FUNCTION IF EXISTS public.przechowalnia_naleznosc(uuid, date, timestamptz, numeric);
CREATE VIEW public.workshop_tire_storage_naleznosci AS
SELECT
  s.id,
  s.provider_id,
  s.storage_number,
  s.client_name,
  s.is_active,
  s.stored_at,
  s.pickup_at,
  s.storage_cost,
  s.cena_za_okres,
  s.okres_miesiecy,
  s.nieodebrane_od,
  s.reminder_count,
  s.reminder_sent_at,
  COALESCE(s.pickup_deadline,
           (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date) AS termin,
  GREATEST(0, current_date - COALESCE(s.pickup_deadline,
           (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date)) AS dni_po_terminie,
  -- Ile rozpoczetych okresow juz sie naliczylo (puste przy starym modelu).
  CASE WHEN s.cena_za_okres IS NOT NULL AND COALESCE(s.okres_miesiecy, 0) > 0
       THEN GREATEST(1, CEIL((
              (EXTRACT(YEAR FROM age(COALESCE(s.pickup_at::date, current_date), s.stored_at::date))::integer * 12)
            + EXTRACT(MONTH FROM age(COALESCE(s.pickup_at::date, current_date), s.stored_at::date))::integer
            )::numeric / s.okres_miesiecy)::integer)
  END AS okresow,
  public.przechowalnia_naleznosc(
    s.provider_id,
    COALESCE(s.pickup_deadline,
             (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date),
    s.pickup_at,
    s.storage_cost,
    s.stored_at,
    s.cena_za_okres,
    s.okres_miesiecy
  ) AS do_zaplaty
FROM public.workshop_tire_storage s;

ALTER VIEW public.workshop_tire_storage_naleznosci SET (security_invoker = true);
