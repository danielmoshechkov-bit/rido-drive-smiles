-- Przełączenie zużycia SMS ze starego salda na `billing_consume` (wariant A).
--
-- ⚠️ URUCHAMIAĆ PO DEPLOYU `workshop-send-sms` I `send-sms`. Nowe funkcje
-- rozpoznają oba źródła i działają przed migracją i po niej; stare sprawdzają
-- wyłącznie `sms_balance` i po wyzerowaniu odmawiałyby wszystkim.
--
-- CO SCALAMY, A CZEGO NIE:
--
-- Paczki ze znacznikiem `odzwierciedlone_at` to DUPLIKATY. Gdy klient kupił
-- 500 SMS-ów, powstała paczka na 500 i JEDNOCZEŚNIE doliczyliśmy 500 do
-- `sms_balance`, bo z niego się wydawało. Zużycie zdejmowało tylko ze starego
-- salda, więc paczka nadal pokazuje 500, choć część już poszła.
--
-- **Prawdą jest `sms_balance`.** Scalenie „saldo + wszystkie paczki" dałoby
-- klientowi drugi raz to, co już ma. Dlatego paczki-duplikaty zerujemy
-- (zachowując `amount_total` i `order_id` jako zapis zakupu), a zakładamy
-- jedną nową paczkę równą staremu saldu.
--
-- Paczki BEZ tego znacznika nigdy nie trafiły do salda — te zostają nietknięte
-- i dodają się normalnie.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Zapis stanu sprzed — warunek odwracalności
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_migracja_4_10 (
  provider_id                     uuid PRIMARY KEY,
  saldo_przed                     integer NOT NULL,
  paczki_odzwierciedlone_przed    numeric(12,2) NOT NULL DEFAULT 0,
  paczki_nieodzwierciedlone_przed numeric(12,2) NOT NULL DEFAULT 0,
  pack_id                         uuid,
  wykonano_at                     timestamptz NOT NULL DEFAULT now()
);

-- Osobno stan każdej wyzerowanej paczki, żeby cofnięcie nie zgadywało.
CREATE TABLE IF NOT EXISTS public.sms_migracja_4_10_paczki (
  pack_id          uuid PRIMARY KEY,
  remaining_przed  numeric(12,2) NOT NULL
);

ALTER TABLE public.sms_migracja_4_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_migracja_4_10_paczki ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_migracja_4_10 FROM anon, authenticated;
REVOKE ALL ON public.sms_migracja_4_10_paczki FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Nowe źródło paczki
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_addon_packs
  DROP CONSTRAINT IF EXISTS billing_addon_packs_source_check;
ALTER TABLE public.billing_addon_packs
  ADD CONSTRAINT billing_addon_packs_source_check CHECK (source IN
    ('purchase', 'admin_grant', 'compensation', 'migracja'));

-- ---------------------------------------------------------------------------
-- 3. Scalenie
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sms      uuid;
  w          record;
  v_dubl     numeric;
  v_nowe     numeric;
  v_pack     uuid;
  v_przed    numeric;
  v_po       numeric;
  v_ile      integer := 0;
BEGIN
  SELECT id INTO v_sms FROM billing_features WHERE key = 'sms';
  IF v_sms IS NULL THEN
    RAISE EXCEPTION 'Brak funkcji sms w billing_features — nie ma czego scalać';
  END IF;

  FOR w IN
    SELECT sp.id, sp.company_name, COALESCE(sp.sms_balance, 0) AS saldo
    FROM service_providers sp
    -- Blokada wiersza: wysyłka SMS-a w trakcie migracji POCZEKA, zamiast
    -- zdjąć jednostkę z salda, które właśnie przenosimy.
    FOR UPDATE
  LOOP
    SELECT COALESCE(sum(amount_remaining), 0) INTO v_dubl
    FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_sms AND amount_remaining > 0 AND odzwierciedlone_at IS NOT NULL;

    SELECT COALESCE(sum(amount_remaining), 0) INTO v_nowe
    FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_sms AND amount_remaining > 0 AND odzwierciedlone_at IS NULL;

    CONTINUE WHEN w.saldo = 0 AND v_dubl = 0 AND v_nowe = 0;

    -- 🔴 DOPISANE 16.08.2026, PO WYKONANIU TEJ MIGRACJI NA PRODUKCJI.
    -- Zmiana nie ma skutku w bazie (migracja jest już zaaplikowana) — chodzi
    -- o rozbrojenie pliku. Bez tego warunku PONOWNE uruchomienie KASUJE
    -- SMS-y: paczka scalona powstaje ze znacznikiem `odzwierciedlone_at`,
    -- więc przy drugim przebiegu krok „wyzeruj duplikaty" dopasowuje ją samą.
    -- Kontrola „przed = po" tego NIE wykrywa, bo `sms_balance` jest już
    -- wyzerowane i obie strony równania wychodzą zgodnie.
    -- Wykryte przy pisaniu bliźniaczej migracji 4.12, na lokalnym uruchomieniu
    -- trzy razy pod rząd.
    CONTINUE WHEN EXISTS (SELECT 1 FROM sms_migracja_4_10 WHERE provider_id = w.id);

    -- Ile klient może wysłać PRZED zmianą: stare saldo plus paczki, których
    -- do tego salda nigdy nie doliczono.
    v_przed := w.saldo + v_nowe;

    INSERT INTO sms_migracja_4_10
      (provider_id, saldo_przed, paczki_odzwierciedlone_przed, paczki_nieodzwierciedlone_przed)
    VALUES (w.id, w.saldo, v_dubl, v_nowe)
    ON CONFLICT (provider_id) DO NOTHING;

    -- Zapamiętujemy stan paczek-duplikatów, zanim je wyzerujemy.
    INSERT INTO sms_migracja_4_10_paczki (pack_id, remaining_przed)
    SELECT id, amount_remaining FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_sms AND amount_remaining > 0 AND odzwierciedlone_at IS NOT NULL
    ON CONFLICT (pack_id) DO NOTHING;

    UPDATE billing_addon_packs
    SET amount_remaining = 0,
        note = COALESCE(note, '') || ' [4.10: jednostki przeniesione do paczki scalonej]',
        updated_at = now()
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_sms AND amount_remaining > 0 AND odzwierciedlone_at IS NOT NULL
      -- Paczka założona przez migrację NIE jest duplikatem — jest wynikiem.
      AND source <> 'migracja';

    -- Jedna paczka bezterminowa równa staremu saldu.
    IF w.saldo > 0 THEN
      INSERT INTO billing_addon_packs
        (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
         expires_at, source, note, odzwierciedlone_at)
      VALUES ('service_provider', w.id, v_sms, w.saldo, w.saldo,
              NULL, 'migracja',
              'Saldo przeniesione przy przejściu na billing_consume (4.10)', now())
      RETURNING id INTO v_pack;

      UPDATE sms_migracja_4_10 SET pack_id = v_pack WHERE provider_id = w.id;
    END IF;

    UPDATE service_providers SET sms_balance = 0, updated_at = now() WHERE id = w.id;

    INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
    SELECT w.id, -w.saldo, 'korekta',
           'Przeniesienie salda do paczki przy przejściu na billing_consume (4.10)'
    WHERE w.saldo <> 0;

    -- ── Kontrola W TEJ SAMEJ TRANSAKCJI ────────────────────────────
    SELECT COALESCE(sum(amount_remaining), 0) INTO v_po
    FROM billing_addon_packs
    WHERE subscriber_type = 'service_provider' AND subscriber_id = w.id
      AND feature_id = v_sms AND amount_remaining > 0;

    IF v_po <> v_przed THEN
      -- Wyjątek wycofuje CAŁĄ migrację. Lepiej nie zmienić nic, niż zostawić
      -- część warsztatów z inną liczbą SMS-ów, niż mieli.
      RAISE EXCEPTION
        'Rozjazd dla % (%): przed = %, po = %. Migracja wycofana.',
        w.company_name, w.id, v_przed, v_po;
    END IF;

    v_ile := v_ile + 1;
    RAISE NOTICE 'scalono %: % SMS', w.company_name, v_po;
  END LOOP;

  RAISE NOTICE 'Przeniesiono % warsztatów', v_ile;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Zużycie idzie przez billing_consume
-- ---------------------------------------------------------------------------
-- Sygnatura bez zmian, więc `workshop-send-sms` i `send-sms` wołają to samo.
CREATE OR REPLACE FUNCTION public.deduct_sms_credit(p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_wynik jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM service_providers WHERE id = p_provider_id) THEN
    RAISE WARNING 'deduct_sms_credit: identyfikator % nie jest warsztatem — SMS NIEROZLICZONY', p_provider_id;
    RETURN;
  END IF;

  v_wynik := public.billing_consume('service_provider', p_provider_id, 'sms', 1);

  -- Księga SMS zostaje: to ona odpowiada na pytanie „skąd to saldo" i ma
  -- ciągłość sprzed przejścia.
  INSERT INTO sms_credit_ledger (provider_id, delta, powod, opis)
  VALUES (p_provider_id, -1, 'wyslanie',
          'z_puli=' || COALESCE(v_wynik ->> 'z_puli', '0') ||
          ' z_paczek=' || COALESCE(v_wynik ->> 'z_paczek', '0') ||
          ' nadwyzka=' || COALESCE(v_wynik ->> 'nadwyzka', '0'));

  IF COALESCE((v_wynik ->> 'ok')::boolean, false) = false THEN
    RAISE WARNING 'deduct_sms_credit: zużycie odrzucone dla % — %', p_provider_id, v_wynik ->> 'reason';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ile klient może wysłać — jedno miejsce dla bramki i dla paska
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sms_dostepne(p_provider_id uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_stan jsonb;
  v_lim  numeric;
BEGIN
  v_stan := public.check_usage('service_provider', p_provider_id, 'sms', 1);

  -- Bez limitu w planie: liczba nie ma sensu, zwracamy NULL i interfejs
  -- pokazuje „bez limitu" zamiast zmyślonej liczby.
  IF (v_stan ->> 'reason') = 'unlimited' THEN RETURN NULL; END IF;
  IF (v_stan ->> 'reason') IN ('unknown_feature', 'feature_not_in_plan') THEN
    -- Brak funkcji w planie: zostają same paczki, jeśli jakieś kupił.
    RETURN COALESCE((SELECT sum(amount_remaining) FROM billing_addon_packs p
                     JOIN billing_features f ON f.id = p.feature_id
                     WHERE p.subscriber_type = 'service_provider'
                       AND p.subscriber_id = p_provider_id AND f.key = 'sms'
                       AND p.amount_remaining > 0
                       AND (p.expires_at IS NULL OR p.expires_at > now())), 0);
  END IF;

  v_lim := NULLIF(v_stan ->> 'limit', '')::numeric;
  RETURN GREATEST(COALESCE(v_lim, 0) - COALESCE((v_stan ->> 'used')::numeric, 0), 0)
       + COALESCE((v_stan ->> 'packs_remaining')::numeric, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.sms_dostepne(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_dostepne(uuid) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
