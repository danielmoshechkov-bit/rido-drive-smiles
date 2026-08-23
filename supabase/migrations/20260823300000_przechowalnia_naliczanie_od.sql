-- Oplata za przetrzymanie liczyla sie od PIERWOTNEGO terminu odbioru.
-- W praktyce znaczylo to, ze w chwili wpisania stawki klient, ktory zostawil
-- opony rok temu, dostawal rachunek za caly ten rok — mimo ze nikt go
-- wczesniej o zadnej oplacie nie uprzedzil.
--
-- Naliczamy od dnia, w ktorym warsztat WLACZYL oplate, nigdy wczesniej.
-- Date ustawia sam wyzwalacz przy pierwszym zapisaniu niezerowej stawki,
-- zeby nie zalezala od tego, czy ekran ja podal.

ALTER TABLE public.workshop_tire_storage_settings
  ADD COLUMN IF NOT EXISTS naliczanie_od date;

COMMENT ON COLUMN public.workshop_tire_storage_settings.naliczanie_od IS
  'Od kiedy liczy sie oplata za przetrzymanie. Ustawiane automatycznie przy wlaczeniu stawki. Puste = oplata nigdy nie byla wlaczona.';

CREATE OR REPLACE FUNCTION public.ustaw_poczatek_naliczania()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- Pierwsze wlaczenie oplaty wyznacza dzien startu. Kolejne zmiany stawki
  -- go NIE przesuwaja: podwyzka nie moze kasowac dotychczasowego naliczenia,
  -- a obnizka nie moze go cofac.
  IF coalesce(NEW.oplata_za_miesiac, 0) > 0 AND NEW.naliczanie_od IS NULL THEN
    NEW.naliczanie_od := current_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poczatek_naliczania ON public.workshop_tire_storage_settings;
CREATE TRIGGER trg_poczatek_naliczania
  BEFORE INSERT OR UPDATE ON public.workshop_tire_storage_settings
  FOR EACH ROW EXECUTE FUNCTION public.ustaw_poczatek_naliczania();

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
  v_start     date;
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

  -- 2. Oplata za przetrzymanie po terminie.
  SELECT oplata_za_miesiac, miesiace_karencji, oplata_maksymalna, naliczanie_od
    INTO z
  FROM workshop_tire_storage_settings
  WHERE provider_id = p_provider_id;

  IF z IS NULL OR coalesce(z.oplata_za_miesiac, 0) <= 0 OR p_termin IS NULL THEN
    RETURN v_przechow;
  END IF;

  -- Liczymy od pozniejszej z dwoch dat: terminu odbioru albo dnia wlaczenia
  -- oplaty. Za czas sprzed wlaczenia nikt nie placi, bo nikt o niej nie wiedzial.
  v_start := GREATEST(p_termin, coalesce(z.naliczanie_od, p_termin));

  IF v_koniec <= v_start THEN
    RETURN v_przechow;
  END IF;

  v_po := (EXTRACT(YEAR FROM age(v_koniec, v_start))::integer * 12)
        + EXTRACT(MONTH FROM age(v_koniec, v_start))::integer;
  IF EXTRACT(DAY FROM age(v_koniec, v_start))::integer > 0 THEN
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
