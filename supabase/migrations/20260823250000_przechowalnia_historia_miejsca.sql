-- Miejsce, w ktorym leza opony, dalo sie ustawic wylacznie przy przyjeciu.
-- Po przeniesieniu kompletu na inny regal nie bylo jak tego zapisac ani
-- sprawdzic, gdzie komplet lezal wczesniej — a w warsztacie opony wedruja
-- czesto i to wlasnie \"gdzie to jest\" decyduje o tym, czy da sie je znalezc.
--
-- Historie zapisuje TRIGGER, nie przegladarka: dzieki temu przeniesienie
-- zrobione z dowolnego ekranu (albo skryptem) tez zostawia slad.

CREATE TABLE IF NOT EXISTS public.workshop_tire_location_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_id  uuid NOT NULL REFERENCES public.workshop_tire_storage(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL,
  z_miejsca   text,
  na_miejsce  text,
  kto         uuid,
  -- clock_timestamp(), nie now(): `now()` zwraca poczatek transakcji, wiec
  -- przyjecie i przeniesienie zapisane w jednej operacji mialyby identyczna
  -- godzine i kolejnosc w historii bylaby przypadkowa.
  kiedy       timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS workshop_tire_location_log_wpis
  ON public.workshop_tire_location_log (storage_id, kiedy DESC);

COMMENT ON TABLE public.workshop_tire_location_log IS
  'Gdzie komplet lezal i kiedy zostal przeniesiony. Zapisywane triggerem, nie przez UI.';

ALTER TABLE public.workshop_tire_location_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warsztat czyta historie miejsc" ON public.workshop_tire_location_log;
CREATE POLICY "warsztat czyta historie miejsc"
  ON public.workshop_tire_location_log FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

-- Historia ma byc zapisem tego, co sie stalo. Recznie dopisany wiersz
-- przestalby nim byc.
REVOKE INSERT, UPDATE, DELETE ON public.workshop_tire_location_log FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.zapisz_przeniesienie_opon()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Zapis bez zmiany miejsca (np. sama zmiana przypomnien) nie jest
  -- przeniesieniem i nie ma po co trafiac do historii.
  IF coalesce(btrim(NEW.location_name), '') IS NOT DISTINCT FROM coalesce(btrim(OLD.location_name), '') THEN
    RETURN NEW;
  END IF;

  INSERT INTO workshop_tire_location_log (storage_id, provider_id, z_miejsca, na_miejsce, kto)
  VALUES (NEW.id, NEW.provider_id,
          nullif(btrim(coalesce(OLD.location_name, '')), ''),
          nullif(btrim(coalesce(NEW.location_name, '')), ''),
          auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_przeniesienie_opon ON public.workshop_tire_storage;
CREATE TRIGGER trg_przeniesienie_opon
  AFTER UPDATE OF location_name ON public.workshop_tire_storage
  FOR EACH ROW EXECUTE FUNCTION public.zapisz_przeniesienie_opon();

-- Pierwsze polozenie tez jest informacja: bez niego historia zaczyna sie
-- od drugiego regalu i nie wiadomo, skad komplet przyszedl.
CREATE OR REPLACE FUNCTION public.zapisz_pierwsze_miejsce_opon()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF coalesce(btrim(NEW.location_name), '') = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO workshop_tire_location_log (storage_id, provider_id, z_miejsca, na_miejsce, kto)
  VALUES (NEW.id, NEW.provider_id, NULL, btrim(NEW.location_name), auth.uid());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pierwsze_miejsce_opon ON public.workshop_tire_storage;
CREATE TRIGGER trg_pierwsze_miejsce_opon
  AFTER INSERT ON public.workshop_tire_storage
  FOR EACH ROW EXECUTE FUNCTION public.zapisz_pierwsze_miejsce_opon();
