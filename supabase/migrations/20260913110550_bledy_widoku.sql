-- Dziennik wywrotek widoku — żeby nie czekać na zrzut ekranu od klienta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PO CO
-- ═══════════════════════════════════════════════════════════════════════════
-- 13.09.2026 trzy grupy użytkowników (klienci, kierowcy, pracownicy warsztatów)
-- nie mogły wejść do systemu. Objaw: „Ten widok się nie wczytał". Przyczyną
-- był błąd React #310 w DWÓCH miejscach naraz. Ustalenie tego zajęło dwie
-- rundy pytań do człowieka, bo `console.error` zostaje w przeglądarce klienta,
-- a granica błędu pokazywała komunikat i o nim zapominała.
--
-- Ta tabela zbiera to, co potrzebne do rozpoznania: gdzie, komu, co i czym.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO TYLKO ZALOGOWANI MOGĄ PISAĆ
-- ═══════════════════════════════════════════════════════════════════════════
-- Tabela zapisywalna przez `anon` to zaproszenie do zapchania bazy — a w tym
-- repozytorium mamy już historię z otwartymi zapisami. Zapis wymaga więc
-- zalogowania i wiersz musi należeć do piszącego (`WITH CHECK`).
--
-- Świadomy koszt: błędów użytkownika NIEzalogowanego tu nie będzie. To
-- akceptowalne, bo cała ta klasa usterek — wywrotka po zalogowaniu — z definicji
-- dotyczy zalogowanych. Gdyby kiedyś potrzebne były błędy sprzed logowania,
-- droga jest przez funkcję brzegową z ograniczeniem po adresie, nie przez
-- otwarcie tej tabeli.
--
-- CZYTAĆ może wyłącznie administrator. Treść błędu potrafi nieść fragment
-- danych z ekranu, więc nie jest to materiał dla innych klientów.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bledy_widoku (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Role w chwili wywrotki. Tekstem, nie tablicą enumów: rola może zniknąć
  -- ze słownika, a wpis w dzienniku ma zostać czytelny.
  role         text,
  sciezka      text NOT NULL,
  komunikat    text NOT NULL,
  -- Pierwsze klatki `componentStack` — to one nazywają komponent.
  komponent    text,
  stos         text,
  przegladarka text,
  -- Skrót wdrożenia, jeśli front go zna: ten sam błąd po wdrożeniu poprawki
  -- znaczy co innego niż przed.
  wersja       text
);

COMMENT ON TABLE public.bledy_widoku IS
  'Wywrotki renderowania złapane przez AppErrorBoundary. Zapis: zalogowany, tylko swoje. Odczyt: administrator.';

-- Rozpoznanie zaczyna się od „co się dzieje OSTATNIO" i „ile razy to samo".
CREATE INDEX IF NOT EXISTS idx_bledy_widoku_czas    ON public.bledy_widoku (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bledy_widoku_komunikat ON public.bledy_widoku (komunikat, created_at DESC);

ALTER TABLE public.bledy_widoku ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wlasny zapis bledu" ON public.bledy_widoku;
CREATE POLICY "wlasny zapis bledu" ON public.bledy_widoku
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "odczyt tylko administrator" ON public.bledy_widoku;
CREATE POLICY "odczyt tylko administrator" ON public.bledy_widoku
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r
                 WHERE r.user_id = auth.uid() AND r.role = 'admin'));

-- ---------------------------------------------------------------------------
-- KONTROLA KOŃCOWA — ZACHOWANIEM
-- ---------------------------------------------------------------------------
-- Sam zestaw odmów niczego nie dowodzi: gdyby tabela nie istniala, wszystko
-- by odmawialo i kontrola wyszla na zielono. Dlatego jest tu przypadek,
-- ktory MA sie udac, i liczymy dotkniete wiersze.
DO $KONIEC$
DECLARE
  v_uzytkownik uuid;
  v_id         uuid := gen_random_uuid();
  v_ile        int;
  v_udalo      boolean;
BEGIN
  -- Dowolny istniejacy uzytkownik — wiersz i tak kasujemy nizej.
  SELECT id INTO v_uzytkownik FROM auth.users LIMIT 1;
  IF v_uzytkownik IS NULL THEN
    RAISE WARNING 'Brak jakiegokolwiek uzytkownika — kontrola zachowania pominieta';
    RETURN;
  END IF;

  -- (a) KONTROLA POZYTYWNA: wlasny zapis MA przejsc.
  INSERT INTO public.bledy_widoku (id, user_id, sciezka, komunikat)
  VALUES (v_id, v_uzytkownik, '/kontrola', 'kontrola migracji');
  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile <> 1 THEN
    RAISE EXCEPTION 'Kontrola pozytywna padla — nie da sie zapisac bledu';
  END IF;

  -- (b) Wiersz bez uzytkownika NIE MA prawa powstac.
  v_udalo := true;
  BEGIN
    INSERT INTO public.bledy_widoku (user_id, sciezka, komunikat)
    VALUES (NULL, '/kontrola', 'bez uzytkownika');
  EXCEPTION WHEN not_null_violation THEN v_udalo := false;
  END;
  IF v_udalo THEN
    RAISE EXCEPTION 'Da sie zapisac blad bez uzytkownika — wiez NOT NULL nie dziala';
  END IF;

  DELETE FROM public.bledy_widoku WHERE id = v_id;

  -- (c) RLS wlaczone, obie polityki na miejscu.
  SELECT count(*) INTO v_ile FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'bledy_widoku';
  IF v_ile <> 2 THEN
    RAISE EXCEPTION 'Polityk jest % zamiast 2', v_ile;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bledy_widoku'::regclass) THEN
    RAISE EXCEPTION 'RLS wylaczone na bledy_widoku';
  END IF;

  RAISE NOTICE 'Dziennik wywrotek gotowy. Zapis: zalogowany tylko swoje. Odczyt: administrator.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';
