-- Pakiet startowy dla nowego usługodawcy: 20 SMS-ów + 5 sprawdzeń VIN.
--
-- Stały, niezależny od planu, przyznawany RAZ.
--
-- ⚠️ NAJTRUDNIEJSZA CZĘŚĆ TO „RAZ". Klucz po `user_id` nie wystarcza: konto da
-- się skasować i założyć ponownie na ten sam adres, a wtedy `user_id` jest
-- nowy i pakiet przyznałby się drugi raz. Klucz po `provider_id` też nie —
-- warsztat da się usunąć i odtworzyć w ramach tego samego konta.
--
-- Dlatego księgą uprawnień jest ADRES E-MAIL, znormalizowany. To jedyny
-- identyfikator, który przeżywa i skasowanie konta, i odtworzenie warsztatu.

-- ---------------------------------------------------------------------------
-- 1. Rejestr przyznanych pakietów
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pakiety_startowe (
  -- Adres jako klucz główny: jedno konto = jeden pakiet, na zawsze.
  email        text PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_id  uuid REFERENCES public.service_providers(id) ON DELETE SET NULL,
  sms          integer NOT NULL,
  vin          integer NOT NULL,
  przyznany_at timestamptz NOT NULL DEFAULT now()
);

-- `ON DELETE SET NULL`, nie `CASCADE`. Gdyby konto zniknęło, wiersz ma ZOSTAĆ
-- — to on jest dowodem, że pakiet na ten adres już poszedł. Kaskada skasowałaby
-- dowód razem z kontem i pakiet dałoby się wziąć ponownie.

ALTER TABLE public.pakiety_startowe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pakiety_startowe FROM anon, authenticated;

COMMENT ON TABLE public.pakiety_startowe IS
  'Kto już dostał pakiet startowy. Klucz po e-mailu, bo user_id nie przeżywa '
  'skasowania konta, a provider_id nie przeżywa odtworzenia warsztatu.';

-- ---------------------------------------------------------------------------
-- 2. Powód „pakiet_startowy" w księdze SMS
-- ---------------------------------------------------------------------------
-- Księga z 4.4 dopuszczała pięć powodów. Dokładamy szósty, żeby historia była
-- pełna od pierwszego dnia konta, a nie zaczynała się od pierwszej wysyłki.
ALTER TABLE public.sms_credit_ledger
  DROP CONSTRAINT IF EXISTS sms_credit_ledger_powod_check;

ALTER TABLE public.sms_credit_ledger
  ADD CONSTRAINT sms_credit_ledger_powod_check CHECK (powod IN
    ('saldo_otwarcia', 'nadanie_admin', 'zakup', 'wyslanie', 'korekta', 'pakiet_startowy'));

-- `grant_sms_credits` też musi go przepuszczać.
CREATE OR REPLACE FUNCTION public.grant_sms_credits(
  p_provider_id uuid,
  p_ile         integer,
  p_powod       text DEFAULT 'nadanie_admin',
  p_actor       uuid DEFAULT NULL,
  p_opis        text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_saldo integer;
BEGIN
  IF p_ile IS NULL OR p_ile = 0 THEN
    RAISE EXCEPTION 'grant_sms_credits: liczba SMS-ów musi być różna od zera';
  END IF;
  IF p_powod NOT IN ('nadanie_admin', 'zakup', 'korekta', 'pakiet_startowy') THEN
    RAISE EXCEPTION 'grant_sms_credits: niedozwolony powód %', p_powod;
  END IF;

  UPDATE service_providers
  SET sms_balance = GREATEST(COALESCE(sms_balance, 0) + p_ile, 0),
      updated_at  = now()
  WHERE id = p_provider_id
  RETURNING sms_balance INTO v_saldo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_sms_credits: nie ma warsztatu %', p_provider_id;
  END IF;

  INSERT INTO sms_credit_ledger (provider_id, delta, powod, actor_user_id, opis)
  VALUES (p_provider_id, p_ile, p_powod, p_actor, p_opis);

  RETURN v_saldo;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Dozwolone typy transakcji VIN
-- ---------------------------------------------------------------------------
-- ⚠️ ZNALEZIONE PRZY OKAZJI: ograniczenie dopuszczało cztery typy
-- ('purchase','usage','manual_add','manual_remove'), a `payment-core`
-- (`handleAdminGrant`) wstawia `admin_grant`. Każde nadanie kredytów VIN przez
-- administratora dopisywało więc kredyty, ale wpis do księgi odbijał się od
-- ograniczenia — a kod nie sprawdza błędu tego wstawienia, więc działo się to
-- po cichu. Saldo rosło bez śladu w historii.
ALTER TABLE public.vehicle_lookup_credit_transactions
  DROP CONSTRAINT IF EXISTS vehicle_lookup_credit_transactions_type_check;

ALTER TABLE public.vehicle_lookup_credit_transactions
  ADD CONSTRAINT vehicle_lookup_credit_transactions_type_check CHECK (type IN
    ('purchase', 'usage', 'manual_add', 'manual_remove', 'admin_grant', 'starter_pack'));

-- ---------------------------------------------------------------------------
-- 4. Przyznanie pakietu
-- ---------------------------------------------------------------------------
-- Jedna funkcja, jedna transakcja, idempotentna. Zwraca `true`, gdy pakiet
-- został właśnie przyznany, i `false`, gdy ten adres już go miał.
CREATE OR REPLACE FUNCTION public.przyznaj_pakiet_startowy(
  p_user_id     uuid,
  p_provider_id uuid,
  p_email       text,
  p_sms         integer DEFAULT 20,
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

  -- Rezerwacja miejsca PIERWSZA. Gdy dwa żądania przyjdą równocześnie
  -- (np. podwójne kliknięcie), klucz główny przepuści tylko jedno, a drugie
  -- odbije się o konflikt i nie doda kredytów. Sprawdzanie „czy istnieje"
  -- przed wstawieniem zostawiłoby okno na podwójne przyznanie.
  INSERT INTO pakiety_startowe (email, user_id, provider_id, sms, vin)
  VALUES (v_email, p_user_id, p_provider_id, p_sms, p_vin)
  ON CONFLICT (email) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;   -- ten adres już dostał pakiet
  END IF;

  -- SMS-y przez księgę, żeby historia salda była pełna od pierwszego dnia.
  PERFORM public.grant_sms_credits(
    p_provider_id, p_sms, 'pakiet_startowy', NULL,
    'Pakiet startowy przy rejestracji');

  -- Kredyty VIN mają własną księgę transakcji — używamy jej, zamiast zakładać
  -- drugą obok.
  INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
  VALUES (p_user_id, p_vin, p_vin)
  ON CONFLICT (user_id) DO UPDATE
    SET remaining_credits        = vehicle_lookup_credits.remaining_credits + p_vin,
        total_credits_purchased  = COALESCE(vehicle_lookup_credits.total_credits_purchased, 0) + p_vin;

  INSERT INTO vehicle_lookup_credit_transactions (user_id, type, credits, source, note)
  VALUES (p_user_id, 'starter_pack', p_vin, 'system', 'Pakiet startowy przy rejestracji');

  RAISE NOTICE 'Pakiet startowy dla % : % SMS, % VIN', v_email, p_sms, p_vin;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.przyznaj_pakiet_startowy(uuid, uuid, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
