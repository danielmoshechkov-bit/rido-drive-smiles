-- Pakiet startowy dostaje 50 pytan do Rido AI.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO 50, A NIE 200
-- ═══════════════════════════════════════════════════════════════════════════
-- Jedno pytanie kosztuje nas 6-40 gr, zaleznie od tego, czy poszlo tanim
-- modelem (dopytanie) czy mocnym z przeszukaniem internetu (analiza). 200 pytan
-- na start to 36-80 zl realnego kosztu rozdawane KAZDEMU, kto poda adres
-- e-mail — a nowy adres kosztuje zero.
--
-- Zabezpieczenie jest dobre: jeden adres = jeden pakiet, na zawsze, a wiersz
-- w `pakiety_startowe` zostaje nawet po skasowaniu konta. Ale ono chroni przed
-- powtorzeniem na TYM SAMYM adresie, nie przed zalozeniem nowego.
--
-- 50 pytan to wciaz duzo: jedna usterka to jedna-dwie pelne analizy, wiec
-- starczy na kilkadziesiat realnych spraw. Warsztat zdazy sie przekonac, zanim
-- skoncza. Nasz koszt: 9-20 zl na konto — do przyjecia jako koszt pozyskania.
--
-- Domyslne wartosci parametrow SMS i VIN zostaja bez zmian.

BEGIN;

CREATE OR REPLACE FUNCTION public.przyznaj_pakiet_startowy(
  p_user_id uuid,
  p_provider_id uuid,
  p_email text,
  p_sms integer DEFAULT 30,
  p_vin integer DEFAULT 5,
  p_rido_ai integer DEFAULT 50
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text := public.normalizuj_email(p_email);
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

  -- Pakiet trafia do PACZEK warsztatu: stare salda są martwe, a wysyłka,
  -- sprawdzenia i pytania do Rido AI czytają pulę planu i paczki.
  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  SELECT 'service_provider', p_provider_id, f.id, p_sms, p_sms,
         NULL, 'admin_grant', 'Pakiet startowy przy rejestracji'
  FROM billing_features f WHERE f.key = 'sms' AND p_sms > 0;

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  SELECT 'service_provider', p_provider_id, f.id, p_vin, p_vin,
         NULL, 'admin_grant', 'Pakiet startowy przy rejestracji'
  FROM billing_features f WHERE f.key = 'vehicle_lookup' AND p_vin > 0;

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  SELECT 'service_provider', p_provider_id, f.id, p_rido_ai, p_rido_ai,
         NULL, 'admin_grant', 'Pakiet startowy przy rejestracji'
  FROM billing_features f WHERE f.key = 'rido_ai' AND p_rido_ai > 0;

  -- Ślad w księdze SMS zostaje, bo to ona odpowiada na pytanie „skąd to saldo".
  PERFORM public.grant_sms_credits(p_provider_id, p_sms, 'pakiet_startowy')
  WHERE p_sms > 0;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer, integer) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM billing_features WHERE key = 'rido_ai') THEN
    RAISE EXCEPTION 'Brak cechy rido_ai — pakiet startowy nie mialby czego przyznac';
  END IF;
  RAISE NOTICE 'Pakiet startowy: 30 SMS, 5 VIN, 50 pytan do Rido AI.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Stara wersja pieciaoargumentowa MUSI zniknac
-- ---------------------------------------------------------------------------
-- `CREATE OR REPLACE` z dodatkowym parametrem nie zastepuje funkcji, tylko
-- tworzy DRUGA obok niej. PostgreSQL przy wywolaniu z pieciooma argumentami
-- wybiera dopasowanie dokladne, czyli te STARA — bez pytan do Rido AI.
-- Pakiet startowy nigdy by ich nie przyznal, a wyglądałoby to na dzialajace.
DROP FUNCTION IF EXISTS public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer);

DO $$
DECLARE v_ile int;
BEGIN
  SELECT count(*) INTO v_ile FROM pg_proc WHERE proname = 'przyznaj_pakiet_startowy';
  IF v_ile <> 1 THEN
    RAISE EXCEPTION 'Oczekiwano jednej wersji przyznaj_pakiet_startowy, jest %', v_ile;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
