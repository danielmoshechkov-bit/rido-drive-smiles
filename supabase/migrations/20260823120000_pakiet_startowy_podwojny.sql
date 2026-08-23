-- 🔴 Każde nowe konto dostawało PODWÓJNY pakiet startowy SMS.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ DZIAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- `przyznaj_pakiet_startowy` robiła dwie rzeczy naraz:
--   1. zakładała paczkę SMS wprost (`INSERT INTO billing_addon_packs`),
--   2. wołała `grant_sms_credits`, żeby zapisać wiersz księgi.
--
-- Miało to sens do 19 sierpnia, bo `grant_sms_credits` pisała WYŁĄCZNIE do
-- księgi. Tego dnia naprawiliśmy ją tak, żeby zakładała paczkę — i od tej
-- chwili każda rejestracja tworzyła DWIE paczki po 30 SMS-ów, a księga
-- notowała jedną.
--
-- Nasza własna poprawka zrobiła dziurę w innym miejscu. Wykryte audytem
-- ścieżki klienta: świeże konto miało 60 dostępnych SMS-ów przy 30 w księdze.
--
-- Widok `sms_saldo_kontrola` pokazał to poprawnie — jedyny warsztat z różnicą.
-- Kontrola zadziałała; brakowało tylko kogoś, kto na nią spojrzy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SKALA
-- ═══════════════════════════════════════════════════════════════════════════
-- Dotyczy kont zakładanych PO 19 sierpnia. W chwili poprawki jedno takie konto
-- istnieje — testowe, z audytu. Żaden klient nie dostał podwójnego pakietu.
--
-- Wyrównania NIE robimy: to trzydzieści SMS-ów na koncie testowym, a
-- odbieranie jednostek zawsze niesie ryzyko odebrania ich komuś, kto zdążył
-- je wydać. Zostawiamy i odnotowujemy.

BEGIN;

CREATE OR REPLACE FUNCTION public.przyznaj_pakiet_startowy(
  p_user_id     uuid,
  p_provider_id uuid,
  p_email       text,
  p_sms         integer DEFAULT 30,
  p_vin         integer DEFAULT 5,
  p_rido_ai     integer DEFAULT 50
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $FUNKCJA$
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
  -- ⬇ PACZKI SMS NIE ZAKŁADAMY TUTAJ.
  --
  -- Stał tu `INSERT INTO billing_addon_packs` dla SMS-ów, a niżej stoi
  -- `grant_sms_credits` — i to ona OD 19 SIERPNIA też zakłada paczkę.
  -- Wcześniej pisała wyłącznie do księgi, więc oba wywołania miały sens.
  -- Po naszej własnej poprawce każde nowe konto dostawało DWIE paczki po
  -- `p_sms` sztuk, a księga notowała jedną: 60 dostępnych przy 30 zapisanych.
  --
  -- Zostaje `grant_sms_credits`: pisze paczkę I wiersz księgi w jednej
  -- transakcji, więc jedno źródło zamiast dwóch rozjeżdżających się.

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
$FUNKCJA$;

REVOKE ALL ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'przyznaj_pakiet_startowy';

  -- Wołanie `grant_sms_credits` MUSI zostać — to ono pisze księgę.
  IF v_src NOT LIKE '%grant_sms_credits%' THEN
    RAISE EXCEPTION 'pakiet startowy przestał zapisywać księgę SMS';
  END IF;

  -- A bezpośredniego zakładania paczki SMS ma już NIE być.
  IF v_src LIKE '%Pakiet startowy przy rejestracji''%FROM billing_features f WHERE f.key = ''sms''%' THEN
    RAISE EXCEPTION 'pakiet startowy nadal zakłada paczkę SMS obok grant_sms_credits';
  END IF;

  RAISE NOTICE 'Pakiet startowy: SMS-y wyłącznie przez grant_sms_credits (paczka + księga w jednym).';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
