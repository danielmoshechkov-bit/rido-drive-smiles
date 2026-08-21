-- Usunięcie dziewięciu kont demonstracyjnych z 24 stycznia.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO
-- ═══════════════════════════════════════════════════════════════════════════
-- Świecą się na /uslugi jako prawdziwi usługodawcy: „Czysto i Świeżo",
-- „Jan Majster", „Hydro-Max". Klient widzi firmy, których nie ma — a to psuje
-- wiarygodność portalu mocniej niż pusta lista. Razem z nimi idą dane zasiane
-- w tej samej sesji: usługi, opinie i rezerwacje.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- KOLEJNOŚĆ — DWA KLUCZE OBCE BEZ KASKADY
-- ═══════════════════════════════════════════════════════════════════════════
-- `service_reviews.provider_id` i `service_bookings.provider_id` mają NO ACTION.
-- Samo `DELETE FROM service_providers` odbiłoby się o nie błędem. Kolejność:
-- rezerwacje → opinie → usługi → usługodawcy. `services` ma CASCADE i zeszłoby
-- samo, ale kasujemy je WPROST — inaczej kaskada usunęłaby wiersze, których
-- nie zdążylibyśmy zapisać do kopii, i cofnięcie byłoby niepełne.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO NIE ROBIĘ
-- ═══════════════════════════════════════════════════════════════════════════
-- Nie wpisuję identyfikatorów. Reguła: brak właściciela, założone 24 stycznia,
-- zero zleceń. Ale reguła bez kontroli jest niebezpieczna — gdyby ktoś kiedyś
-- założył konto bez `user_id` tego samego dnia, zniknęłoby razem z resztą.
-- Dlatego liczba musi wynieść dokładnie dziewięć, inaczej migracja przerywa.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Kopia do cofnięcia — PEŁNA TREŚĆ WIERSZY
-- ---------------------------------------------------------------------------
-- `jsonb` zamiast kolumn: kopia ma przeżyć zmiany schematu i nie wymagać
-- utrzymywania. Odtworzenie wiersza: patrz komentarz pod tabelą.
CREATE TABLE IF NOT EXISTS public.wydmuszki_kopia (
  id          bigserial PRIMARY KEY,
  tabela      text        NOT NULL,
  wiersz      jsonb       NOT NULL,
  provider_id uuid        NOT NULL,
  usunieto_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wydmuszki_kopia IS
  'Pełna treść wierszy usuniętych z kontami demonstracyjnymi (24.01). '
  'Odtworzenie jednej tabeli, np. usługodawców: '
  'INSERT INTO service_providers SELECT (jsonb_populate_record(NULL::service_providers, wiersz)).* '
  'FROM wydmuszki_kopia WHERE tabela = ''service_providers''; '
  'Kolejność odtwarzania odwrotna do usuwania: service_providers, services, '
  'service_reviews, service_bookings.';

-- ---------------------------------------------------------------------------
-- 2. Wykonanie
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ids       uuid[];
  v_ile       integer;
  v_uslug     integer; v_opinii integer; v_rezerwacji integer;
  v_nieznane  text;
  r           record;
  v_licznik   bigint;
BEGIN
  -- Powtórne uruchomienie: reguła nic nie znajdzie, bo konta już nie istnieją.
  -- Bez tej gałęzi kontrola „dokładnie dziewięć" wywaliłaby migrację przy
  -- drugim przebiegu — czyli poprawnie wykonana praca wyglądałaby na awarię.
  IF EXISTS (SELECT 1 FROM public.wydmuszki_kopia WHERE tabela = 'service_providers') THEN
    RAISE NOTICE 'Konta demonstracyjne usunięte wcześniej (% wierszy w kopii) — pomijam.',
      (SELECT count(*) FROM public.wydmuszki_kopia);
    RETURN;
  END IF;

  SELECT array_agg(sp.id), count(*) INTO v_ids, v_ile
  FROM public.service_providers sp
  WHERE sp.user_id IS NULL
    AND sp.created_at::date = DATE '2026-01-24'
    AND NOT EXISTS (SELECT 1 FROM public.workshop_orders o WHERE o.provider_id = sp.id);

  IF COALESCE(v_ile, 0) <> 9 THEN
    RAISE EXCEPTION 'Reguła złapała % kont zamiast dziewięciu — przerywam. Sprawdź, kto doszedł albo ubył.',
      COALESCE(v_ile, 0);
  END IF;

  -- ---------------------------------------------------------------------------
  -- Czy coś jeszcze na nie wskazuje
  -- ---------------------------------------------------------------------------
  -- To samo przejście po schemacie, co w rozpoznaniu. Powtarzam je TUTAJ, bo
  -- między rozpoznaniem a wykonaniem mogła dojść nowa tabela — równolegle
  -- powstaje wyszukiwarka klientów i pojazdów. Jeśli wskazuje na nie cokolwiek
  -- poza trzema znanymi tabelami, migracja się zatrzymuje zamiast zgadywać.
  v_nieznane := NULL;
  FOR r IN
    SELECT (c.conrelid::regclass)::text AS tabela, a.attname::text AS kolumna
    FROM pg_constraint c
    JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f' AND c.confrelid = 'public.service_providers'::regclass
    UNION
    SELECT (cl.oid::regclass)::text, a.attname::text
    FROM pg_class cl
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE cl.relkind = 'r' AND a.atttypid = 'uuid'::regtype
      AND a.attname IN ('provider_id', 'service_provider_id', 'reviewer_provider_id', 'tenant_id')
  LOOP
    -- Trzy znane tabele kasujemy niżej — je pomijamy. Kopia trzyma własne
    -- wiersze, więc jej też nie liczymy jako podpięcia.
    CONTINUE WHEN r.tabela IN ('services', 'service_reviews', 'service_bookings', 'wydmuszki_kopia');

    EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY($1)', r.tabela, r.kolumna)
      INTO v_licznik USING v_ids;

    IF v_licznik > 0 THEN
      v_nieznane := concat_ws(', ', v_nieznane, r.tabela || '.' || r.kolumna || ' (' || v_licznik || ')');
    END IF;
  END LOOP;

  IF v_nieznane IS NOT NULL THEN
    RAISE EXCEPTION 'Na konta demonstracyjne wskazuje także: %. Nie kasuję — wróć do rozpoznania.', v_nieznane;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Kopia, potem usunięcie — od liści do korzenia
  -- ---------------------------------------------------------------------------
  INSERT INTO public.wydmuszki_kopia (tabela, wiersz, provider_id)
  SELECT 'service_bookings', to_jsonb(t), t.provider_id FROM public.service_bookings t
  WHERE t.provider_id = ANY (v_ids);
  GET DIAGNOSTICS v_rezerwacji = ROW_COUNT;
  DELETE FROM public.service_bookings WHERE provider_id = ANY (v_ids);

  INSERT INTO public.wydmuszki_kopia (tabela, wiersz, provider_id)
  SELECT 'service_reviews', to_jsonb(t), t.provider_id FROM public.service_reviews t
  WHERE t.provider_id = ANY (v_ids);
  GET DIAGNOSTICS v_opinii = ROW_COUNT;
  DELETE FROM public.service_reviews WHERE provider_id = ANY (v_ids);

  INSERT INTO public.wydmuszki_kopia (tabela, wiersz, provider_id)
  SELECT 'services', to_jsonb(t), t.provider_id FROM public.services t
  WHERE t.provider_id = ANY (v_ids);
  GET DIAGNOSTICS v_uslug = ROW_COUNT;
  DELETE FROM public.services WHERE provider_id = ANY (v_ids);

  INSERT INTO public.wydmuszki_kopia (tabela, wiersz, provider_id)
  SELECT 'service_providers', to_jsonb(t), t.id FROM public.service_providers t
  WHERE t.id = ANY (v_ids);
  DELETE FROM public.service_providers WHERE id = ANY (v_ids);

  RAISE NOTICE 'Usunięto: 9 kont, % usług, % opinii, % rezerwacji.',
    v_uslug, v_opinii, v_rezerwacji;

  -- Kontrola końcowa: po wszystkim nic nie może zostać.
  FOR r IN SELECT unnest(ARRAY['services','service_reviews','service_bookings']) AS tabela LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE provider_id = ANY($1)', r.tabela)
      INTO v_licznik USING v_ids;
    IF v_licznik > 0 THEN
      RAISE EXCEPTION 'W % zostało % wierszy — wycofuję', r.tabela, v_licznik;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.service_providers WHERE id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'Konta demonstracyjne nadal istnieją — wycofuję';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
