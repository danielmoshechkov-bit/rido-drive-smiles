-- Doładowania w modelu SUWAKA, nie sztywnych pakietów.
--
-- Zmiana koncepcji (Daniel, 16.08.2026): klient wybiera LICZBĘ jednostek
-- licznikiem plus/minus, a kwota przelicza się na bieżąco po stałej stawce.
-- Żadnych wariantów typu „50 SMS / 19 zł, 200 / 59 zł" — te ceny były zresztą
-- błędne i nigdy nie zostały zatwierdzone.
--
-- Stawki zatwierdzone:
--   SMS  — 0,20 zł netto/szt., krok 100, minimum 100
--   VIN  — 1,70 zł netto/szt., krok  10, minimum  10
--
-- Minuty Agenta ŚWIADOMIE POMINIĘTE: decyzja cenowa jeszcze nie zapadła,
-- a zaszycie kwoty „na razie" zamieniłoby ją w cenę obowiązującą.

-- ---------------------------------------------------------------------------
-- 1. Funkcja mierzona dla SMS-ów
-- ---------------------------------------------------------------------------
-- `vehicle_lookup` już istnieje w cenniku; `sms` nie było.
INSERT INTO public.billing_features (key, name, description, kind, unit, sort_order)
VALUES ('sms', 'Wiadomości SMS', 'Powiadomienia SMS do klientów warsztatu', 'metered', 'SMS', 200)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Katalog: stawka jednostkowa zamiast gotowej paczki
-- ---------------------------------------------------------------------------
-- Tabela powstała dzień wcześniej i jest PUSTA (katalog miał wypełnić 4.11),
-- więc przebudowa nie dotyka żadnych danych.
ALTER TABLE public.billing_addon_products
  DROP COLUMN IF EXISTS amount,
  DROP COLUMN IF EXISTS price_gross;

ALTER TABLE public.billing_addon_products
  -- Cena NETTO za sztukę. Netto, bo tak podajemy ją klientowi („Podana cena
  -- jest kwotą netto"), a brutto liczymy przy płatności i na fakturze.
  ADD COLUMN IF NOT EXISTS unit_price_net numeric(10,4),
  -- Skok licznika. Warsztat nie kupuje 137 SMS-ów, tylko 100, 200, 300…
  ADD COLUMN IF NOT EXISTS step integer,
  ADD COLUMN IF NOT EXISTS min_units integer;

UPDATE public.billing_addon_products
SET unit_price_net = COALESCE(unit_price_net, 0.01),
    step           = COALESCE(step, 1),
    min_units      = COALESCE(min_units, 1)
WHERE unit_price_net IS NULL OR step IS NULL OR min_units IS NULL;

ALTER TABLE public.billing_addon_products
  ALTER COLUMN unit_price_net SET NOT NULL,
  ALTER COLUMN step           SET NOT NULL,
  ALTER COLUMN min_units      SET NOT NULL;

ALTER TABLE public.billing_addon_products
  DROP CONSTRAINT IF EXISTS billing_addon_products_sensowne;
ALTER TABLE public.billing_addon_products
  ADD CONSTRAINT billing_addon_products_sensowne CHECK (
    unit_price_net > 0 AND step > 0 AND min_units > 0
    -- Minimum musi być wielokrotnością kroku, inaczej sam suwak nie potrafiłby
    -- ustawić się na najmniejszej dozwolonej wartości.
    AND min_units % step = 0
  );

-- ---------------------------------------------------------------------------
-- 3. Zamówienie zna liczbę jednostek
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS units integer;

UPDATE public.billing_orders SET units = 1 WHERE units IS NULL;

ALTER TABLE public.billing_orders
  ALTER COLUMN units SET NOT NULL,
  ADD CONSTRAINT billing_orders_units_dodatnie CHECK (units > 0);

-- ---------------------------------------------------------------------------
-- 4. Wyliczenie kwoty — JEDNO miejsce, po stronie bazy
-- ---------------------------------------------------------------------------
-- Cena nie może pochodzić z żądania. Funkcja brzegowa przysyła tylko liczbę
-- jednostek; kwotę i sprawdzenie kroku robimy tutaj, żeby ta sama reguła
-- obowiązywała niezależnie od tego, kto pyta.
CREATE OR REPLACE FUNCTION public.billing_wylicz_doladowanie(
  p_code  text,
  p_units integer
)
RETURNS TABLE (
  product_id     uuid,
  units          integer,
  unit_price_net numeric,
  amount_net     numeric,
  amount_gross   numeric,
  vat_rate       numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p billing_addon_products%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM billing_addon_products
  WHERE code = p_code AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nieznany produkt: %', p_code USING ERRCODE = '22023';
  END IF;

  IF p_units IS NULL OR p_units < v_p.min_units THEN
    RAISE EXCEPTION 'Minimum to % %', v_p.min_units, p_code USING ERRCODE = '22023';
  END IF;

  -- Bez tego dałoby się kupić 1 SMS albo 3 sprawdzenia i obejść stawkę.
  IF p_units % v_p.step <> 0 THEN
    RAISE EXCEPTION 'Liczba musi być wielokrotnością %', v_p.step USING ERRCODE = '22023';
  END IF;

  -- Górna granica zdroworozsądkowa: chroni przed literówką w liczbie
  -- (10000 zamiast 1000) i przed próbą utworzenia zamówienia na miliony.
  IF p_units > 1000000 THEN
    RAISE EXCEPTION 'Zbyt duża liczba jednostek' USING ERRCODE = '22023';
  END IF;

  product_id     := v_p.id;
  units          := p_units;
  unit_price_net := v_p.unit_price_net;
  vat_rate       := v_p.vat_rate;
  amount_net     := round(p_units * v_p.unit_price_net, 2);
  amount_gross   := round(amount_net * (1 + v_p.vat_rate / 100), 2);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_wylicz_doladowanie(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.billing_wylicz_doladowanie(text, integer)
  TO service_role, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Wydanie paczki liczy jednostki z ZAMÓWIENIA
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_wydaj_paczke(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam    billing_orders%ROWTYPE;
  v_prod   billing_addon_products%ROWTYPE;
  v_pack   uuid;
  v_wygasa timestamptz;
BEGIN
  SELECT * INTO v_zam FROM billing_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma zamówienia %', p_order_id;
  END IF;

  IF v_zam.wydane_at IS NOT NULL THEN
    RETURN v_zam.pack_id;
  END IF;

  IF v_zam.status <> 'oplacone' THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: zamówienie % nie jest opłacone (%)', p_order_id, v_zam.status;
  END IF;

  SELECT * INTO v_prod FROM billing_addon_products WHERE id = v_zam.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'billing_wydaj_paczke: nie ma produktu %', v_zam.product_id;
  END IF;

  IF v_prod.waznosc_dni IS NOT NULL THEN
    v_wygasa := now() + make_interval(days => v_prod.waznosc_dni);
  END IF;

  -- Liczba jednostek pochodzi z ZAMÓWIENIA, nie z produktu. Produkt mówi
  -- tylko, po ile i w jakim kroku; ile klient kupił, wie zamówienie.
  INSERT INTO billing_addon_packs (
    subscriber_type, subscriber_id, feature_id,
    amount_total, amount_remaining, expires_at, source, order_id, note)
  VALUES (
    v_zam.subscriber_type, v_zam.subscriber_id, v_prod.feature_id,
    v_zam.units, v_zam.units, v_wygasa, 'purchase', v_zam.id,
    'Doładowanie: ' || v_zam.units || ' × ' || v_prod.name)
  RETURNING id INTO v_pack;

  UPDATE billing_orders
  SET wydane_at = now(), pack_id = v_pack, updated_at = now()
  WHERE id = p_order_id;

  RETURN v_pack;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Dwa produkty, ze stawkami zatwierdzonymi
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_addon_products
  (code, name, feature_id, unit_price_net, step, min_units, vat_rate, waznosc_dni, sort_order)
SELECT 'sms', 'Wiadomości SMS', f.id, 0.20, 100, 100, 23, NULL, 10
FROM public.billing_features f WHERE f.key = 'sms'
ON CONFLICT (code) DO UPDATE
  SET unit_price_net = EXCLUDED.unit_price_net,
      step           = EXCLUDED.step,
      min_units      = EXCLUDED.min_units,
      name           = EXCLUDED.name,
      updated_at     = now();

INSERT INTO public.billing_addon_products
  (code, name, feature_id, unit_price_net, step, min_units, vat_rate, waznosc_dni, sort_order)
SELECT 'vehicle_lookup', 'Sprawdzenia pojazdu (VIN)', f.id, 1.70, 10, 10, 23, NULL, 20
FROM public.billing_features f WHERE f.key = 'vehicle_lookup'
ON CONFLICT (code) DO UPDATE
  SET unit_price_net = EXCLUDED.unit_price_net,
      step           = EXCLUDED.step,
      min_units      = EXCLUDED.min_units,
      name           = EXCLUDED.name,
      updated_at     = now();

-- ---------------------------------------------------------------------------
-- 7. Stare pakiety SMS wyłączone
-- ---------------------------------------------------------------------------
-- Ceny 50/19, 200/59, 500/129 zł nie zostały zatwierdzone i są sprzeczne
-- ze stawką 0,20 zł netto. Wyłączamy, nie kasujemy — gdyby ktoś kiedyś je
-- kupił, historia ma zostać czytelna.
UPDATE public.credit_packages
SET is_active = false
WHERE credit_type = 'sms';

-- ---------------------------------------------------------------------------
-- 8. Pakiet startowy: 50 SMS (było 20), 5 sprawdzeń VIN
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.przyznaj_pakiet_startowy(
  p_user_id     uuid,
  p_provider_id uuid,
  p_email       text,
  p_sms         integer DEFAULT 50,
  p_vin         integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  IF v_email = '' OR p_provider_id IS NULL THEN
    RAISE WARNING 'przyznaj_pakiet_startowy: brak adresu albo warsztatu — pomijam';
    RETURN false;
  END IF;

  INSERT INTO pakiety_startowe (email, user_id, provider_id, sms, vin)
  VALUES (v_email, p_user_id, p_provider_id, p_sms, p_vin)
  ON CONFLICT (email) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM public.grant_sms_credits(
    p_provider_id, p_sms, 'pakiet_startowy', NULL,
    'Pakiet startowy przy rejestracji');

  INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
  VALUES (p_user_id, p_vin, p_vin)
  ON CONFLICT (user_id) DO UPDATE
    SET remaining_credits       = vehicle_lookup_credits.remaining_credits + p_vin,
        total_credits_purchased = COALESCE(vehicle_lookup_credits.total_credits_purchased, 0) + p_vin;

  INSERT INTO vehicle_lookup_credit_transactions (user_id, type, credits, source, note)
  VALUES (p_user_id, 'starter_pack', p_vin, 'system', 'Pakiet startowy przy rejestracji');

  RAISE NOTICE 'Pakiet startowy dla % : % SMS, % VIN', v_email, p_sms, p_vin;
  RETURN true;
END;
$$;

NOTIFY pgrst, 'reload schema';
