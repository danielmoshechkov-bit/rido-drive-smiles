-- Księga SMS jako pełny rejestr decyzji + wyrównanie wstecz.
--
-- ⚠️ URUCHAMIAĆ PO `20260822090000_sms_fail_closed.sql`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO USTALILIŚMY
-- ═══════════════════════════════════════════════════════════════════════════
-- SALDO liczy się WYŁĄCZNIE z paczek. Jedna liczba, jedno źródło — koniec
-- pytania „która jest prawdziwa".
--
-- KSIĘGA to rejestr DECYZJI: odpowiada „skąd wzięło się to, co masz", nie
-- „ile masz". Trafia do niej każda operacja zmieniająca stan: zakup, pakiet
-- startowy, nadanie administratora, wysyłka, zwrot, korekta, wygaśnięcie.
--
-- WYGAŚNIĘCIA: obsługa dopisana, zadanie cykliczne NIE URUCHAMIANE. Paczki są
-- bezterminowe świadomie — klient płaci za jednostki, nie za dostęp czasowy,
-- a przepadające kredyty to najczęstszy powód pretensji przy takich produktach.
-- Funkcja czeka na produkt z terminem (np. minuty agenta rozliczane
-- miesięcznie). Sprawdzone przed napisaniem: dziś 18 paczek, wszystkie
-- bezterminowe, więc zadanie i tak nie miałoby czego robić.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO BRAKOWAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- Zakup SMS-ów nie trafiał do księgi w ogóle: `billing_wydaj_paczke` zakładała
-- paczkę i na tym kończyła. Do tego wpisy sprzed przejścia na paczki opisują
-- salda, których już nie ma. Stąd rozjazd, który zgłosiłeś: CART78GARAGE miał
-- księgę −14 przy 124 kredytach, a CART sp. z o.o. księgę 69 przy 200.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Nowe powody
-- ---------------------------------------------------------------------------
-- `zwrot` i `wygasniecie` to osobne zdarzenia, nie „korekta". Korekta znaczy
-- „ktoś ręcznie poprawił", a te dwa dzieją się same — mieszanie ich odbiera
-- księdze zdolność odpowiadania na pytanie „dlaczego".
-- `wyrownanie` używamy RAZ, w punkcie 5.
ALTER TABLE public.sms_credit_ledger
  DROP CONSTRAINT IF EXISTS sms_credit_ledger_powod_check;
ALTER TABLE public.sms_credit_ledger
  ADD CONSTRAINT sms_credit_ledger_powod_check CHECK (powod IN
    ('saldo_otwarcia', 'nadanie_admin', 'zakup', 'wyslanie', 'korekta',
     'pakiet_startowy', 'zwrot', 'wygasniecie', 'wyrownanie'));

-- ---------------------------------------------------------------------------
-- 2. Zakup trafia do księgi
-- ---------------------------------------------------------------------------
-- Odtwarzamy `billing_wydaj_paczke` RÓŻNICOWO z ostatniej wersji, dokładając
-- wyłącznie wpis do księgi. Przepisywanie jej z pamięci zgubiło mi już raz
-- warunek `status <> 'oplacone'` — czyli sam otworzyłbym dziurę wydającą towar
-- za niezapłacone zamówienie.
CREATE OR REPLACE FUNCTION public.billing_wydaj_paczke(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_zam    billing_orders%ROWTYPE;
  v_prod   billing_addon_products%ROWTYPE;
  v_klucz  text;
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

  SELECT key INTO v_klucz FROM billing_features WHERE id = v_prod.feature_id;

  IF v_prod.waznosc_dni IS NOT NULL THEN
    v_wygasa := now() + make_interval(days => v_prod.waznosc_dni);
  END IF;

  INSERT INTO billing_addon_packs (
    subscriber_type, subscriber_id, feature_id,
    amount_total, amount_remaining, expires_at, source, order_id, note)
  VALUES (
    v_zam.subscriber_type, v_zam.subscriber_id, v_prod.feature_id,
    v_zam.units, v_zam.units, v_wygasa, 'purchase', v_zam.id,
    'Doładowanie: ' || v_zam.units || ' × ' || v_prod.name)
  RETURNING id INTO v_pack;

  -- ⬇️ NOWE: zakup w księdze. Bez tego rejestr nie odpowiadał na pytanie
  -- „skąd wzięło się te 100 SMS-ów" — paczka była, wpisu nie.
  IF v_klucz = 'sms' AND v_zam.subscriber_type = 'service_provider' THEN
    INSERT INTO sms_credit_ledger (provider_id, delta, powod, ref_tabela, ref_id, opis)
    VALUES (v_zam.subscriber_id, v_zam.units::integer, 'zakup',
            'billing_orders', v_zam.id,
            'Doładowanie ' || v_zam.units || ' SMS, zamówienie ' || v_zam.id);
  END IF;

  -- Kupujący BEZ warsztatu: sprawdzenia pojazdu nadal zasilają saldo osobiste,
  -- bo dla niego to jedyna pula (patrz 4.12).
  IF v_klucz = 'vehicle_lookup'
     AND v_zam.subscriber_type <> 'service_provider'
     AND v_zam.user_id IS NOT NULL THEN
    INSERT INTO vehicle_lookup_credits (user_id, remaining_credits, total_credits_purchased)
    VALUES (v_zam.user_id, v_zam.units::integer, v_zam.units::integer)
    ON CONFLICT (user_id) DO UPDATE
      SET remaining_credits       = vehicle_lookup_credits.remaining_credits + EXCLUDED.remaining_credits,
          total_credits_purchased = COALESCE(vehicle_lookup_credits.total_credits_purchased, 0)
                                    + EXCLUDED.total_credits_purchased;

    INSERT INTO vehicle_lookup_credit_transactions (user_id, type, credits, source, note)
    VALUES (v_zam.user_id, 'purchase', v_zam.units::integer, 'payment',
            'Doładowanie PayU, zamówienie ' || v_zam.id);

    UPDATE billing_addon_packs SET odzwierciedlone_at = now() WHERE id = v_pack;
  END IF;

  UPDATE billing_orders
  SET wydane_at = now(), pack_id = v_pack, updated_at = now()
  WHERE id = p_order_id;

  RETURN v_pack;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Zwrot ma własny powód
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.zwroc_sms_credit(p_provider_id uuid, p_powod text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sms uuid;
BEGIN
  SELECT id INTO v_sms FROM billing_features WHERE key = 'sms';
  IF v_sms IS NULL THEN
    RAISE WARNING 'zwroc_sms_credit: brak cechy sms — jednostka NIEZWRÓCONA';
    RETURN;
  END IF;

  INSERT INTO billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  VALUES ('service_provider', p_provider_id, v_sms, 1, 1, NULL, 'compensation',
          COALESCE(p_powod, 'Zwrot za nieudaną wysyłkę SMS'));

  INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
  VALUES (p_provider_id, 1, 'zwrot', COALESCE(p_powod, 'Zwrot za nieudaną wysyłkę SMS'));
END;
$$;

REVOKE ALL ON FUNCTION public.zwroc_sms_credit(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.zwroc_sms_credit(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Wygaśnięcia — GOTOWE, ALE NIEURUCHOMIONE
-- ---------------------------------------------------------------------------
-- Świadomie bez `cron.schedule`. Paczki są dziś bezterminowe i mają takie
-- zostać; ta funkcja czeka na produkt z terminem. Gdy taki się pojawi,
-- wystarczy jedna linia planująca zadanie — logika i księgowanie już są.
CREATE OR REPLACE FUNCTION public.sms_wygas_paczki()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_p    record;
  v_ile  integer := 0;
BEGIN
  FOR v_p IN
    SELECT p.id, p.subscriber_id, p.amount_remaining, p.expires_at
    FROM billing_addon_packs p
    JOIN billing_features f ON f.id = p.feature_id
    WHERE f.key = 'sms'
      AND p.subscriber_type = 'service_provider'
      AND p.amount_remaining > 0
      AND p.expires_at IS NOT NULL
      AND p.expires_at <= now()
    FOR UPDATE
  LOOP
    -- Wpis PRZED wyzerowaniem: gdy klient zapyta „gdzie moje SMS-y", odpowiedź
    -- ma być w księdze, a nie w domysłach. Paczka bez wpisu wygląda jak nasz błąd.
    INSERT INTO sms_credit_ledger (provider_id, delta, powod, ref_tabela, ref_id, opis)
    VALUES (v_p.subscriber_id, -v_p.amount_remaining::integer, 'wygasniecie',
            'billing_addon_packs', v_p.id,
            'Wygaśnięcie paczki z dnia ' || to_char(v_p.expires_at, 'YYYY-MM-DD'));

    UPDATE billing_addon_packs
    SET amount_remaining = 0, updated_at = now()
    WHERE id = v_p.id;

    v_ile := v_ile + 1;
  END LOOP;

  RETURN v_ile;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_wygas_paczki() FROM public;
GRANT EXECUTE ON FUNCTION public.sms_wygas_paczki() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Wyrównanie wstecz — jeden wpis na warsztat
-- ---------------------------------------------------------------------------
-- Nie rekonstruujemy historii, której nie ma. Jeden wpis różnicowy z datą
-- i opisem mówi wprost: „przed tym dniem księga była niepełna, o tyle".
-- To jest uczciwsze niż dopisywanie zdarzeń, które nigdy nie zostały zapisane.
CREATE TABLE IF NOT EXISTS public.ksiega_wyrownanie_4_20 (
  provider_id  uuid PRIMARY KEY,
  ksiega_przed integer NOT NULL,
  paczki_przed numeric(12,2) NOT NULL,
  roznica      integer NOT NULL,
  wykonano_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ksiega_wyrownanie_4_20 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ksiega_wyrownanie_4_20 FROM anon, authenticated;

DO $$
DECLARE
  w         record;
  v_ksiega  integer;
  v_paczki  numeric;
  v_roznica integer;
  v_ile     integer := 0;
  v_po      integer;
BEGIN
  FOR w IN SELECT id, company_name FROM service_providers LOOP
    -- Warsztat już wyrównany — druga próba nie może dopisać drugiej różnicy.
    CONTINUE WHEN EXISTS (SELECT 1 FROM ksiega_wyrownanie_4_20 WHERE provider_id = w.id);

    SELECT COALESCE(sum(delta), 0) INTO v_ksiega
    FROM sms_credit_ledger WHERE provider_id = w.id;

    SELECT COALESCE(sum(p.amount_remaining), 0) INTO v_paczki
    FROM billing_addon_packs p
    JOIN billing_features f ON f.id = p.feature_id
    WHERE p.subscriber_type = 'service_provider' AND p.subscriber_id = w.id
      AND f.key = 'sms' AND p.amount_remaining > 0;

    v_roznica := (v_paczki - v_ksiega)::integer;
    CONTINUE WHEN v_roznica = 0 AND v_ksiega = 0 AND v_paczki = 0;

    INSERT INTO ksiega_wyrownanie_4_20 (provider_id, ksiega_przed, paczki_przed, roznica)
    VALUES (w.id, v_ksiega, v_paczki, v_roznica);

    IF v_roznica <> 0 THEN
      INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
      VALUES (w.id, v_roznica, 'wyrownanie',
              'Wyrównanie księgi do stanu paczek. Przed tą datą księga była '
              || 'niepełna: zakupy i część nadań nie zostawiały wpisu. '
              || 'Księga ' || v_ksiega || ', paczki ' || v_paczki || '.');
    END IF;

    -- Kontrola W TEJ SAMEJ transakcji.
    SELECT COALESCE(sum(delta), 0) INTO v_po FROM sms_credit_ledger WHERE provider_id = w.id;
    IF v_po <> v_paczki::integer THEN
      RAISE EXCEPTION 'Wyrównanie nie domknęło % (%): księga % ≠ paczki %',
        w.company_name, w.id, v_po, v_paczki;
    END IF;

    v_ile := v_ile + 1;
    RAISE NOTICE 'wyrównano %: księga % → % (paczki %)', w.company_name, v_ksiega, v_po, v_paczki;
  END LOOP;

  RAISE NOTICE 'Wyrównano % warsztatów.', v_ile;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Widok kontrolny — czy księga nadal opisuje paczki
-- ---------------------------------------------------------------------------
-- Przy paczkach BEZTERMINOWYCH ten niezmiennik da się utrzymać: każda operacja
-- pisze i do paczek, i do księgi. Gdyby kiedyś doszedł produkt z terminem
-- i zadanie z punktu 4 zostało włączone, wygaśnięcia też będą księgowane.
DROP VIEW IF EXISTS public.sms_saldo_kontrola;
CREATE VIEW public.sms_saldo_kontrola AS
SELECT sp.id AS provider_id,
       sp.company_name,
       COALESCE(public.sms_dostepne(sp.id), 0)::integer AS dostepne,
       COALESCE(SUM(l.delta), 0)::integer               AS suma_ksiegi,
       COALESCE(public.sms_dostepne(sp.id), 0)::integer
         - COALESCE(SUM(l.delta), 0)::integer           AS roznica
FROM public.service_providers sp
LEFT JOIN public.sms_credit_ledger l ON l.provider_id = sp.id
GROUP BY sp.id, sp.company_name;

REVOKE ALL ON public.sms_saldo_kontrola FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
