-- Potwierdzenie dla klienta ma pokazywac oba rozmiary, gdy os tylna ma swoj.
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
    'rozmiar',      CASE
                      WHEN coalesce(btrim(NEW.tire_size_rear), '') = ''
                        OR btrim(NEW.tire_size_rear) = btrim(coalesce(NEW.tire_size, ''))
                      THEN NEW.tire_size
                      ELSE coalesce(NEW.tire_size, '') || ' / tyl ' || btrim(NEW.tire_size_rear)
                    END,
    'sztuk',        NEW.quantity,
    'sezon',        NEW.season,
    'felgi',        NEW.rim_type,
    'miejsce',      NEW.location_name
  ));

  RETURN NEW;
END;
$$;
