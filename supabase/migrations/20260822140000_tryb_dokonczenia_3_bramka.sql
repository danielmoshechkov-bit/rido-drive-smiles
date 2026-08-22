-- Tryb dokończenia, krok 3: bramka wpuszcza dokańczanie.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ ZMIENIA
-- ═══════════════════════════════════════════════════════════════════════════
-- Do tej pory bramka znała jedną odpowiedź: `moze_pracowac`. Teraz dla TRZECH
-- rzeczy dokłada drugą — `wolno_dokanczac`:
--
--   workshop_orders            UPDATE i DELETE
--   workshop_order_items       INSERT, UPDATE, DELETE   (i pliki, zdjęcia, podpisy)
--
-- INSERT na `workshop_orders` zostaje ZAMKNIĘTY. To jest cała różnica między
-- „dokończ, co zacząłeś" a „pracuj dalej".
--
-- DELETE na zleceniu wpuszczamy świadomie: warsztat i tak nie założy nowego
-- w jego miejsce, więc kasowanie nie jest drogą obejścia — a bywa jedynym
-- sposobem sprzątnięcia pomyłki.
--
-- Pozycje otwarte, bo tożsamości zlecenia pilnuje wyzwalacz z kroku 2. Para
-- klient–pojazd jest zamrożona, więc każda dopisana pozycja obciąża dalej tego
-- samego klienta za to samo auto.
--
-- WSZYSTKIE POZOSTAŁE TABELE zostają zamknięte bez zmian — w tym kartoteki
-- klientów i pojazdów. To zamyka drugą drogę obejścia: przepisanie istniejącego
-- klienta na inne nazwisko zamiast podmiany go w zleceniu.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO PRZEBUDOWA PROCEDURY, A NIE DOŁOŻENIE POLITYKI
-- ═══════════════════════════════════════════════════════════════════════════
-- Polityki bramki są RESTRICTIVE, czyli łączą się przez AND. Dołożenie obok
-- kolejnej polityki niczego by nie OTWARŁO — tylko dodało kolejny warunek do
-- spełnienia. Wyjątek trzeba wpisać w warunek istniejącej polityki, a te
-- generuje procedura. Stąd nowa wersja procedury z tą samą sygnaturą: wywołania
-- z G0 i z migracji nowych tabel działają dalej bez zmian.

BEGIN;

CREATE OR REPLACE PROCEDURE public.warsztat_zaloz_bramke(p_dodatkowy_warunek text DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  t text; warunek text; kolumna text; warunek_dokanczania text;
  przez_zlecenie text[] := public.warsztat_tabele_przez_zlecenie();
BEGIN
  FOREACH t IN ARRAY public.warsztat_tabele_wprost() || przez_zlecenie LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'pomijam % — brak tabeli', t; CONTINUE;
    END IF;

    -- Wyrażenie wskazujące warsztat: wprost albo przez zlecenie nadrzędne.
    IF t = ANY (przez_zlecenie) THEN
      kolumna := '(SELECT o.provider_id FROM public.workshop_orders o WHERE o.id = order_id)';
    ELSE
      kolumna := 'provider_id';
    END IF;

    warunek := format('public.moze_pracowac(%s, ''warsztat'')', kolumna);
    IF p_dodatkowy_warunek IS NOT NULL THEN
      warunek := warunek || ' OR ' || replace(p_dodatkowy_warunek, '%KOLUMNA%', kolumna);
    END IF;

    -- Tryb dokończenia dotyczy WYŁĄCZNIE zlecenia i jego pozycji.
    IF t = 'workshop_orders' OR t = ANY (przez_zlecenie) THEN
      warunek_dokanczania := warunek || format(' OR public.wolno_dokanczac(%s, ''warsztat'')', kolumna);
    ELSE
      warunek_dokanczania := warunek;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'warsztat_zapis_delete', t);

    -- INSERT: na samym zleceniu tryb dokończenia NIE pomaga — nowego nie założy.
    -- Na pozycjach pomaga, bo dopisanie części do zlecenia w toku jest właśnie
    -- dokańczaniem.
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO public WITH CHECK (%s)',
      'warsztat_zapis_insert', t,
      CASE WHEN t = 'workshop_orders' THEN warunek ELSE warunek_dokanczania END);

    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (%s) WITH CHECK (%s)',
      'warsztat_zapis_update', t, warunek_dokanczania, warunek_dokanczania);

    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (%s)',
      'warsztat_zapis_delete', t, warunek_dokanczania);
  END LOOP;
END;
$$;

-- Odtworzenie polityk z furtką serwisową administratora — tak samo jak G0
-- i migracja nowych tabel. Pominięcie tego argumentu odebrałoby administratorowi
-- okna serwisowe.
CALL public.warsztat_zaloz_bramke('public.ma_okno_serwisowe(%KOLUMNA%)');

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_brak text;
BEGIN
  -- Zlecenie i pozycje mają znać tryb dokończenia...
  SELECT string_agg(tablename || '.' || cmd, ', ') INTO v_brak
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('workshop_orders', 'workshop_order_items')
    AND policyname LIKE 'warsztat_zapis_%'
    AND cmd IN ('UPDATE', 'DELETE')
    AND qual NOT LIKE '%wolno_dokanczac%';
  IF v_brak IS NOT NULL THEN
    RAISE EXCEPTION 'Bramka nie zna trybu dokończenia dla: %', v_brak;
  END IF;

  -- ...a zakładanie zleceń NIE.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='workshop_orders'
      AND policyname='warsztat_zapis_insert' AND with_check LIKE '%wolno_dokanczac%'
  ) THEN
    RAISE EXCEPTION 'Zakładanie zleceń przepuszcza tryb dokończenia — to nie jest dokańczanie';
  END IF;

  -- Kartoteki zostają zamknięte.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('workshop_clients','workshop_vehicles')
      AND policyname LIKE 'warsztat_zapis_%' AND COALESCE(qual, with_check) LIKE '%wolno_dokanczac%'
  ) THEN
    RAISE EXCEPTION 'Kartoteka klientów lub pojazdów przepuszcza tryb dokończenia';
  END IF;

  RAISE NOTICE 'Bramka: dokańczanie na zleceniu i pozycjach, zakładanie i kartoteki zamknięte.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
