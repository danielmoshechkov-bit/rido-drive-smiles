-- PRZECHOWALNIA OPON — dwie dziury, przez ktore ucieka pieniadz.
--
-- 1. Przypomnienie wychodzilo RAZ i tylko wtedy, gdy termin miescil sie
--    w oknie [dzis-30, dzis+7]. Kto z okna wypadl, nie dostawal juz nigdy nic.
--    Na produkcji: cztery komplety po terminie (201, 121, 61 i 46 dni)
--    bez ani jednego przypomnienia.
--
-- 2. Po terminie nie naliczalo sie nic. Warsztat trzyma opony w nieskonczonosc
--    za cene ustalona z gory.
--
-- Naliczanie jest DOMYSLNIE WYLACZONE (stawka 0). Zadnemu warsztatowi nie
-- doliczamy oplat, ktorych sam nie ustawil — to jego umowa z klientem, nie nasza.

-- ------------------------------------------------------------- ustawienia
CREATE TABLE IF NOT EXISTS public.workshop_tire_storage_settings (
  provider_id        uuid PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  oplata_za_dzien    numeric(10,2) NOT NULL DEFAULT 0,
  dni_karencji       integer       NOT NULL DEFAULT 0,
  oplata_maksymalna  numeric(10,2),
  co_ile_dni_przypominac integer   NOT NULL DEFAULT 30,
  ile_przypomnien_max    integer   NOT NULL DEFAULT 6,
  dni_do_nieodebranych   integer   NOT NULL DEFAULT 180,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oplata_nieujemna     CHECK (oplata_za_dzien >= 0),
  CONSTRAINT karencja_nieujemna   CHECK (dni_karencji >= 0),
  CONSTRAINT maks_nieujemna       CHECK (oplata_maksymalna IS NULL OR oplata_maksymalna >= 0),
  CONSTRAINT odstep_sensowny      CHECK (co_ile_dni_przypominac BETWEEN 1 AND 365),
  CONSTRAINT liczba_sensowna      CHECK (ile_przypomnien_max BETWEEN 0 AND 60)
);

COMMENT ON TABLE public.workshop_tire_storage_settings IS
  'Zasady przechowalni opon per warsztat: oplata po terminie, rytm przypomnien, granica nieodebranych.';

ALTER TABLE public.workshop_tire_storage_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warsztat czyta swoje zasady" ON public.workshop_tire_storage_settings;
CREATE POLICY "warsztat czyta swoje zasady"
  ON public.workshop_tire_storage_settings FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "warsztat zmienia swoje zasady" ON public.workshop_tire_storage_settings;
CREATE POLICY "warsztat zmienia swoje zasady"
  ON public.workshop_tire_storage_settings FOR ALL TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()))
  WITH CHECK (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- --------------------------------------------------------- kolumny wpisu
ALTER TABLE public.workshop_tire_storage
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS oplata_po_terminie_zaplacona numeric(10,2),
  ADD COLUMN IF NOT EXISTS nieodebrane_od date,
  -- Bieznik osobno dla kazdej opony. Dotad byla jedna wartosc na komplet,
  -- wiec roznica miedzy osiami — ta, ktora decyduje o wymianie — ginela.
  ADD COLUMN IF NOT EXISTS tread_lp_mm numeric(4,1),
  ADD COLUMN IF NOT EXISTS tread_pp_mm numeric(4,1),
  ADD COLUMN IF NOT EXISTS tread_lt_mm numeric(4,1),
  ADD COLUMN IF NOT EXISTS tread_pt_mm numeric(4,1);

COMMENT ON COLUMN public.workshop_tire_storage.reminder_count IS
  'Ile przypomnien juz poszlo. reminder_sent_at to data OSTATNIEGO, nie jedynego.';
COMMENT ON COLUMN public.workshop_tire_storage.nieodebrane_od IS
  'Od kiedy komplet uznany za nieodebrany. Ustawiane recznie przez warsztat.';

-- Istniejace wpisy z wyslanym przypomnieniem maja go policzone jako jedno.
UPDATE public.workshop_tire_storage
SET reminder_count = 1
WHERE reminder_sent_at IS NOT NULL AND reminder_count = 0;

-- ------------------------------------------------- naleznosc po terminie
CREATE OR REPLACE FUNCTION public.przechowalnia_naleznosc(
  p_provider_id uuid,
  p_termin date,
  p_pickup_at timestamptz,
  p_cena numeric
)
RETURNS numeric
-- Celowo BEZ security definer: funkcja czyta zasady warsztatu, wiec ma
-- widziec dokladnie to, co wolajacy. Inaczej kazdy poznalby stawki cudzego
-- warsztatu, podajac jego identyfikator.
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  z record;
  v_dni  integer;
  v_kara numeric;
BEGIN
  SELECT oplata_za_dzien, dni_karencji, oplata_maksymalna
    INTO z
  FROM workshop_tire_storage_settings
  WHERE provider_id = p_provider_id;

  -- Brak zasad albo stawka zero = nie naliczamy nic. Nigdy nie doliczamy
  -- oplaty, ktorej warsztat nie ustawil.
  IF z IS NULL OR coalesce(z.oplata_za_dzien, 0) <= 0 OR p_termin IS NULL THEN
    RETURN coalesce(p_cena, 0);
  END IF;

  -- Po odbiorze naliczanie stoi na dacie odbioru, nie biegnie dalej.
  v_dni := GREATEST(
    0,
    coalesce(p_pickup_at::date, current_date) - p_termin - coalesce(z.dni_karencji, 0)
  );

  v_kara := v_dni * z.oplata_za_dzien;
  IF z.oplata_maksymalna IS NOT NULL THEN
    v_kara := LEAST(v_kara, z.oplata_maksymalna);
  END IF;

  RETURN coalesce(p_cena, 0) + v_kara;
END;
$$;

COMMENT ON FUNCTION public.przechowalnia_naleznosc IS
  'Cena przechowania powiekszona o oplate za dni po terminie. Bez ustawien zwraca sama cene.';

-- --------------------------------------------------- widok dla warsztatu
CREATE OR REPLACE VIEW public.workshop_tire_storage_naleznosci AS
SELECT
  s.id,
  s.provider_id,
  s.storage_number,
  s.client_name,
  s.is_active,
  s.pickup_at,
  s.storage_cost,
  s.nieodebrane_od,
  s.reminder_count,
  s.reminder_sent_at,
  COALESCE(s.pickup_deadline,
           (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date) AS termin,
  GREATEST(0, current_date - COALESCE(s.pickup_deadline,
           (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date)) AS dni_po_terminie,
  public.przechowalnia_naleznosc(
    s.provider_id,
    COALESCE(s.pickup_deadline,
             (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date),
    s.pickup_at,
    s.storage_cost
  ) AS do_zaplaty
FROM public.workshop_tire_storage s;

-- Widok dziedziczy RLS z tabeli zrodlowej (security_invoker), wiec warsztat
-- nadal widzi wylacznie swoje wpisy.
ALTER VIEW public.workshop_tire_storage_naleznosci SET (security_invoker = true);

-- ------------------------------------------- przypomnienia bez konca okna
-- Dochodzi kolumna w srodku listy, a tego `CREATE OR REPLACE` nie potrafi.
DROP VIEW IF EXISTS public.workshop_tire_reminders_due;
CREATE VIEW public.workshop_tire_reminders_due AS
SELECT
  s.id,
  s.provider_id,
  s.client_id,
  s.storage_number,
  s.season,
  s.quantity,
  s.reminder_count,
  COALESCE(s.reminder_channel, 'sms'::text) AS channel,
  COALESCE(s.pickup_deadline,
           (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date) AS due_date,
  COALESCE(NULLIF(s.client_name, ''::text),
           TRIM(BOTH FROM (COALESCE(c.first_name, ''::text) || ' '::text) || COALESCE(c.last_name, ''::text)),
           c.company_name) AS client_name,
  NULLIF(COALESCE(NULLIF(s.client_phone, ''::text), c.phone), ''::text) AS phone,
  NULLIF(c.email, ''::text) AS email,
  COALESCE(NULLIF(p.short_name, ''::text), p.company_name) AS provider_name,
  p.company_phone AS provider_phone
FROM workshop_tire_storage s
  LEFT JOIN workshop_clients c ON c.id = s.client_id
  LEFT JOIN service_providers p ON p.id = s.provider_id
  LEFT JOIN workshop_tire_storage_settings z ON z.provider_id = s.provider_id
WHERE s.is_active IS TRUE
  AND s.pickup_at IS NULL
  AND s.nieodebrane_od IS NULL
  AND COALESCE(s.reminder_channel, 'sms'::text) <> 'none'::text
  -- Termin juz blisko albo minal. Bez dolnej granicy: komplet lezacy rok
  -- po terminie nadal wymaga upomnienia, a wczesniej wypadal z okna.
  AND COALESCE(s.pickup_deadline,
               (s.stored_at + make_interval(months => COALESCE(s.reminder_months, 6)))::date)
      <= (CURRENT_DATE + 7)
  -- Pierwsze przypomnienie albo kolejne po ustalonym odstepie.
  AND (s.reminder_sent_at IS NULL
       OR s.reminder_sent_at < now() - make_interval(days => COALESCE(z.co_ile_dni_przypominac, 30)))
  -- Gorna granica, zeby przypominanie nie zamienilo sie w nekanie.
  AND s.reminder_count < COALESCE(z.ile_przypomnien_max, 6);

ALTER VIEW public.workshop_tire_reminders_due SET (security_invoker = true);
