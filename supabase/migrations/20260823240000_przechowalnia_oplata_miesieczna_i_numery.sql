-- Trzy sprawy naraz.
--
-- 1. Oplata po terminie liczy sie ZA MIESIAC, nie za dzien. Rozliczenie
--    przechowalni idzie w miesiacach i stawka dzienna do niego nie pasowala.
--    Kazdy ROZPOCZETY miesiac po terminie jest platny w calosci.
--
-- 2. `storage_number` nie byl przez nic nadawany. Istniejace numery P/2026/NNN
--    pochodza z danych probnych, a kazdy nowy wpis zostawal bez numeru —
--    pokwitowanie drukowalo kreske w miejscu "Nr miejsca".
--
-- 3. Historia przypomnien: dotad znany byl tylko licznik i data ostatniego.
--    Warsztat przy sporze potrzebuje listy: kiedy, czym, na jaki numer.

-- ------------------------------------------------------- oplata miesieczna
ALTER TABLE public.workshop_tire_storage_settings
  ADD COLUMN IF NOT EXISTS oplata_za_miesiac numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS miesiace_karencji integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oplata_miesieczna_nieujemna') THEN
    ALTER TABLE public.workshop_tire_storage_settings
      ADD CONSTRAINT oplata_miesieczna_nieujemna CHECK (oplata_za_miesiac >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'karencja_miesiace_nieujemna') THEN
    ALTER TABLE public.workshop_tire_storage_settings
      ADD CONSTRAINT karencja_miesiace_nieujemna CHECK (miesiace_karencji >= 0);
  END IF;
END $$;

-- Kto zdazyl ustawic stawke dzienna, dostaje jej miesieczny odpowiednik,
-- zeby zmiana jednostki nie wyzerowala mu naliczania po cichu.
UPDATE public.workshop_tire_storage_settings
SET oplata_za_miesiac = round(oplata_za_dzien * 30, 2),
    miesiace_karencji = GREATEST(0, round(dni_karencji / 30.0)::integer)
WHERE oplata_za_miesiac = 0 AND coalesce(oplata_za_dzien, 0) > 0;

COMMENT ON COLUMN public.workshop_tire_storage_settings.oplata_za_dzien IS
  'NIEUZYWANE od 08.2026 — zastapione przez oplata_za_miesiac. Zostaje dla historii.';

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
  v_po        integer;
  v_kara      numeric;
BEGIN
  v_koniec := coalesce(p_pickup_at::date, current_date);

  -- 1. Oplata za samo przechowanie.
  IF p_cena_za_okres IS NOT NULL AND coalesce(p_okres_miesiecy, 0) > 0 AND p_stored_at IS NOT NULL THEN
    v_miesiecy := (EXTRACT(YEAR FROM age(v_koniec, p_stored_at::date))::integer * 12)
                + EXTRACT(MONTH FROM age(v_koniec, p_stored_at::date))::integer;
    v_okresow := GREATEST(1, CEIL(v_miesiecy::numeric / p_okres_miesiecy)::integer);
    v_przechow := v_okresow * p_cena_za_okres;
  ELSE
    v_przechow := coalesce(p_cena, 0);
  END IF;

  -- 2. Oplata za przetrzymanie po terminie — za kazdy ROZPOCZETY miesiac.
  SELECT oplata_za_miesiac, miesiace_karencji, oplata_maksymalna
    INTO z
  FROM workshop_tire_storage_settings
  WHERE provider_id = p_provider_id;

  IF z IS NULL OR coalesce(z.oplata_za_miesiac, 0) <= 0 OR p_termin IS NULL THEN
    RETURN v_przechow;
  END IF;

  IF v_koniec <= p_termin THEN
    RETURN v_przechow;
  END IF;

  -- Pelne miesiace po terminie, plus jeden za rozpoczety.
  v_po := (EXTRACT(YEAR FROM age(v_koniec, p_termin))::integer * 12)
        + EXTRACT(MONTH FROM age(v_koniec, p_termin))::integer;
  IF EXTRACT(DAY FROM age(v_koniec, p_termin))::integer > 0 THEN
    v_po := v_po + 1;
  END IF;

  v_po := GREATEST(0, v_po - coalesce(z.miesiace_karencji, 0));
  IF v_po <= 0 THEN
    RETURN v_przechow;
  END IF;

  v_kara := v_po * z.oplata_za_miesiac;
  IF z.oplata_maksymalna IS NOT NULL THEN
    v_kara := LEAST(v_kara, z.oplata_maksymalna);
  END IF;

  RETURN v_przechow + v_kara;
END;
$$;

-- ------------------------------------------------------------ numer wpisu
CREATE OR REPLACE FUNCTION public.nadaj_numer_przechowania()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rok  text;
  v_next integer;
BEGIN
  IF coalesce(btrim(NEW.storage_number), '') <> '' THEN
    RETURN NEW;
  END IF;

  v_rok := to_char(coalesce(NEW.stored_at, now()), 'YYYY');

  -- Numerujemy w obrebie warsztatu i roku. Bierzemy najwyzszy dotychczasowy
  -- zamiast liczyc wiersze — skasowany wpis nie moze oddac swojego numeru
  -- nastepnemu, bo dwa pokwitowania mialyby ten sam.
  SELECT coalesce(max(NULLIF(regexp_replace(storage_number, '^P/\d{4}/', ''), '')::integer), 0) + 1
    INTO v_next
  FROM workshop_tire_storage
  WHERE provider_id = NEW.provider_id
    AND storage_number ~ ('^P/' || v_rok || '/\d+$');

  NEW.storage_number := 'P/' || v_rok || '/' || lpad(v_next::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_numer_przechowania ON public.workshop_tire_storage;
CREATE TRIGGER trg_numer_przechowania
  BEFORE INSERT ON public.workshop_tire_storage
  FOR EACH ROW EXECUTE FUNCTION public.nadaj_numer_przechowania();

-- ------------------------------------------------------ historia przypomnien
CREATE TABLE IF NOT EXISTS public.workshop_tire_reminder_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_id  uuid NOT NULL REFERENCES public.workshop_tire_storage(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL,
  kanal       text NOT NULL,
  odbiorca    text,
  udane       boolean NOT NULL DEFAULT true,
  blad        text,
  wyslano_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workshop_tire_reminder_log_wpis
  ON public.workshop_tire_reminder_log (storage_id, wyslano_at DESC);

COMMENT ON TABLE public.workshop_tire_reminder_log IS
  'Kiedy, czym i na jaki numer poszlo przypomnienie. Przy sporze z klientem to jedyny dowod.';

ALTER TABLE public.workshop_tire_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warsztat czyta swoja historie" ON public.workshop_tire_reminder_log;
CREATE POLICY "warsztat czyta swoja historie"
  ON public.workshop_tire_reminder_log FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- Zapisuje wylacznie wysylka (service_role). Recznie dopisana historia
-- przestalaby byc dowodem.
REVOKE INSERT, UPDATE, DELETE ON public.workshop_tire_reminder_log FROM authenticated, anon;
