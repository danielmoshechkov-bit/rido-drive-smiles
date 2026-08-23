-- Potwierdzenie przyjecia opon dla klienta: krotki link w SMS-ie, pod ktorym
-- widzi, co zostawil, gdzie i kiedy — a po odbiorze rowniez date i godzine
-- wydania.
--
-- Kluczowa decyzja: potwierdzenie jest ODDZIELNA kopia, nie widokiem na wpis
-- warsztatu. Gdyby warsztat skasowal komplet (przez pomylke albo celowo),
-- link klienta nadal dziala i pokazuje, co przyjeto. Dowod nie moze znikac
-- na zyczenie jednej ze stron.

CREATE TABLE IF NOT EXISTS public.workshop_tire_receipts (
  kod         text PRIMARY KEY,
  storage_id  uuid REFERENCES public.workshop_tire_storage(id) ON DELETE SET NULL,
  provider_id uuid NOT NULL,
  dane        jsonb NOT NULL,
  utworzono   timestamptz NOT NULL DEFAULT now(),
  odebrano_at timestamptz
);

CREATE INDEX IF NOT EXISTS workshop_tire_receipts_wpis
  ON public.workshop_tire_receipts (storage_id);

COMMENT ON TABLE public.workshop_tire_receipts IS
  'Kopia potwierdzenia dla klienta. Przezywa skasowanie wpisu — to dowod, nie widok.';
COMMENT ON COLUMN public.workshop_tire_receipts.dane IS
  'Zamrozony opis przyjecia: warsztat, adres, klient, pojazd, opony. Nie zmienia sie.';

ALTER TABLE public.workshop_tire_receipts ENABLE ROW LEVEL SECURITY;

-- Czytanie idzie przez edge function po kodzie z linku, nie przez klienta
-- przegladarki — inaczej kazdy moglby pobrac cala tabele potwierdzen.
REVOKE ALL ON public.workshop_tire_receipts FROM anon, authenticated;

DROP POLICY IF EXISTS "warsztat czyta swoje potwierdzenia" ON public.workshop_tire_receipts;
CREATE POLICY "warsztat czyta swoje potwierdzenia"
  ON public.workshop_tire_receipts FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid()));

GRANT SELECT ON public.workshop_tire_receipts TO authenticated;

-- ------------------------------------------------------------------- kod
CREATE OR REPLACE FUNCTION public.losowy_kod_potwierdzenia()
RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  -- Bez 0/O oraz 1/I/L: kod bywa przepisywany z ekranu telefonu.
  alfabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  wynik   text := '';
  i       integer;
BEGIN
  FOR i IN 1..10 LOOP
    wynik := wynik || substr(alfabet, 1 + floor(random() * length(alfabet))::integer, 1);
  END LOOP;
  RETURN wynik;
END;
$$;

-- ------------------------------------------------------- tworzenie kopii
CREATE OR REPLACE FUNCTION public.utworz_potwierdzenie_opon()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kod  text;
  v_prov record;
  v_poj  record;
  v_prob integer := 0;
BEGIN
  SELECT company_name, short_name, company_phone, company_address, company_city
    INTO v_prov
  FROM service_providers WHERE id = NEW.provider_id;

  SELECT brand, model, plate INTO v_poj
  FROM workshop_vehicles WHERE id = NEW.vehicle_id;

  LOOP
    v_kod := losowy_kod_potwierdzenia();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM workshop_tire_receipts WHERE kod = v_kod);
    v_prob := v_prob + 1;
    IF v_prob > 20 THEN
      -- Nie blokujemy przyjecia opon z powodu potwierdzenia. Brak kopii jest
      -- do naprawienia, nieprzyjety komplet nie.
      RETURN NEW;
    END IF;
  END LOOP;

  INSERT INTO workshop_tire_receipts (kod, storage_id, provider_id, dane)
  VALUES (v_kod, NEW.id, NEW.provider_id, jsonb_build_object(
    'numer',        NEW.storage_number,
    'przyjeto',     NEW.stored_at,
    'termin',       NEW.pickup_deadline,
    'klient',       NEW.client_name,
    'warsztat',     coalesce(nullif(v_prov.short_name, ''), v_prov.company_name),
    'ulica',        v_prov.company_address,
    'miasto',       v_prov.company_city,
    'telefon',      v_prov.company_phone,
    'pojazd',       nullif(trim(coalesce(v_poj.brand, '') || ' ' || coalesce(v_poj.model, '')), ''),
    'rejestracja',  v_poj.plate,
    'marka_opon',   nullif(trim(coalesce(NEW.tire_brand, '') || ' ' || coalesce(NEW.tire_model, '')), ''),
    'rozmiar',      NEW.tire_size,
    'sztuk',        NEW.quantity,
    'sezon',        NEW.season,
    'felgi',        NEW.rim_type,
    'miejsce',      NEW.location_name
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_potwierdzenie_opon ON public.workshop_tire_storage;
CREATE TRIGGER trg_potwierdzenie_opon
  AFTER INSERT ON public.workshop_tire_storage
  FOR EACH ROW EXECUTE FUNCTION public.utworz_potwierdzenie_opon();

-- ----------------------------------------------------------- data odbioru
CREATE OR REPLACE FUNCTION public.oznacz_odbior_w_potwierdzeniu()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.pickup_at IS NOT DISTINCT FROM OLD.pickup_at THEN
    RETURN NEW;
  END IF;

  UPDATE workshop_tire_receipts
  SET odebrano_at = NEW.pickup_at
  WHERE storage_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_odbior_w_potwierdzeniu ON public.workshop_tire_storage;
CREATE TRIGGER trg_odbior_w_potwierdzeniu
  AFTER UPDATE OF pickup_at ON public.workshop_tire_storage
  FOR EACH ROW EXECUTE FUNCTION public.oznacz_odbior_w_potwierdzeniu();

-- Komplety przyjete wczesniej tez dostaja potwierdzenie — inaczej warsztat
-- nie moglby wyslac linku do niczego, co juz lezy na regale.
INSERT INTO public.workshop_tire_receipts (kod, storage_id, provider_id, dane, utworzono, odebrano_at)
SELECT
  losowy_kod_potwierdzenia(), s.id, s.provider_id,
  jsonb_build_object(
    'numer', s.storage_number, 'przyjeto', s.stored_at, 'termin', s.pickup_deadline,
    'klient', s.client_name,
    'warsztat', coalesce(nullif(p.short_name, ''), p.company_name),
    'ulica', p.company_address, 'miasto', p.company_city, 'telefon', p.company_phone,
    'pojazd', nullif(trim(coalesce(v.brand, '') || ' ' || coalesce(v.model, '')), ''),
    'rejestracja', v.plate,
    'marka_opon', nullif(trim(coalesce(s.tire_brand, '') || ' ' || coalesce(s.tire_model, '')), ''),
    'rozmiar', s.tire_size, 'sztuk', s.quantity, 'sezon', s.season,
    'felgi', s.rim_type, 'miejsce', s.location_name
  ),
  coalesce(s.created_at, s.stored_at, now()), s.pickup_at
FROM public.workshop_tire_storage s
  LEFT JOIN public.service_providers p ON p.id = s.provider_id
  LEFT JOIN public.workshop_vehicles v ON v.id = s.vehicle_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.workshop_tire_receipts r WHERE r.storage_id = s.id
);
