-- Wariant A, krok 1 z 3: okres próbny w `billing_subscriptions` MA SIĘ KOŃCZYĆ.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO TO MUSI BYĆ PIERWSZE
-- ═══════════════════════════════════════════════════════════════════════════
-- `moze_pracowac` przepuszcza dziś status `trialing` BEZ SPRAWDZENIA DATY:
--
--     RETURN v_status IN ('active', 'trialing', 'past_due');
--
-- Dopóki prawie żaden warsztat nie ma wiersza w `billing_subscriptions`, nie ma
-- to skutku — decyduje gałąź zapasowa po `paid_service_subscriptions`, a ta datę
-- sprawdza. Ale krok 3 zakłada wiersz `trialing` KAŻDEMU warsztatowi. Gdyby
-- wszedł przed tą poprawką, wszystkie 22 warsztaty dostałyby okres próbny
-- BEZ KOŃCA — stan gorszy niż obecny.
--
-- Dlatego kolejność jest częścią projektu, nie porządkowaniem: najpierw data
-- zaczyna obowiązywać, dopiero potem powstają wiersze, których dotyczy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CZEGO TA MIGRACJA NIE ROBI
-- ═══════════════════════════════════════════════════════════════════════════
-- Nie rusza statusu `active`. Przy Stripe okres przedłuża webhook i wygaśnięcie
-- po dacie byłoby odcięciem płacącego klienta, gdyby powiadomienie się spóźniło.
-- Miesiąc kupiony jednorazowo przez PayU dostanie własne zadanie wygaszające —
-- to osobny krok, świadomie nie tutaj.
--
-- Funkcję odtwarzam RÓŻNICOWO z treści z G4 (20260815120000): zmieniona jest
-- deklaracja zmiennych, zapytanie i jeden warunek. Reszta, łącznie z komentarzami
-- o rzutowaniu enumu i o braku filtra po `metadata->>module`, zostaje co do słowa —
-- każde z nich opisuje wpadkę, która już raz kosztowała produkcję.

BEGIN;

CREATE OR REPLACE FUNCTION public.moze_pracowac(p_provider uuid, p_linia text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text; v_user uuid; v_trial timestamptz; v_ma_trial boolean;
  v_okres_do timestamptz; v_trial_do timestamptz; v_koniec_probnego timestamptz;
BEGIN
  IF p_provider IS NULL OR p_linia IS NULL THEN
    RETURN false;                      -- brak podmiotu = brak zgody (fail-closed)
  END IF;

  SELECT status, current_period_end, trial_ends_at
    INTO v_status, v_okres_do, v_trial_do
  FROM billing_subscriptions
  WHERE subscriber_type = 'service_provider'
    AND subscriber_id   = p_provider
    -- `product_line` jest typem wyliczeniowym `billing_product_line`, a parametr
    -- przychodzi jako `text` — bez rzutowania Postgres nie ma operatora
    -- `billing_product_line = text` i całe zapytanie pada.
    --
    -- Rzutujemy KOLUMNĘ na tekst, nie parametr na typ wyliczeniowy. Rzutowanie
    -- parametru wywalałoby się wyjątkiem przy nieznanej nazwie linii, a ta
    -- funkcja stoi w politykach RLS: wyjątek przerwałby każde zapytanie do
    -- tabeli. Porównanie tekstowe przy nieznanej nazwie po prostu nic nie
    -- znajdzie i skończy się odmową — czyli fail-closed, tak jak reszta.
    AND product_line::text = p_linia
  ORDER BY created_at DESC LIMIT 1;

  IF v_status IS NOT NULL THEN
    -- OKRES PRÓBNY KOŃCZY SIĘ DATĄ. `trial_ends_at` jest polem właściwym;
    -- `current_period_end` bierzemy zapasowo, bo Stripe wypełnia je zawsze,
    -- a `trial_ends_at` tylko przy subskrypcjach z okresem próbnym.
    IF v_status = 'trialing' THEN
      v_koniec_probnego := COALESCE(v_trial_do, v_okres_do);
      -- Brak daty = okres próbny bezterminowy. Takie wiersze powstały przed
      -- wprowadzeniem terminów; odebranie im dostępu byłoby zmianą warunków
      -- wstecz. Ta sama zasada, co w gałęzi `paid_service_subscriptions` niżej.
      RETURN v_koniec_probnego IS NULL OR v_koniec_probnego > now();
    END IF;

    -- Subskrypcja płatna ma pierwszeństwo. 'past_due' PRZEPUSZCZA: to okres
    -- karencji, w którym operator sam ponawia pobranie i połowa nieudanych
    -- płatności naprawia się bez udziału klienta.
    RETURN v_status IN ('active', 'past_due');
  END IF;

  -- Brak subskrypcji płatnej — decyduje okres próbny właściciela.
  SELECT user_id INTO v_user FROM service_providers WHERE id = p_provider;
  IF v_user IS NULL THEN RETURN false; END IF;

  -- Świadomie NIE filtrujemy po metadata->>'module'. `activate-workshop-trial`
  -- sprawdza istnienie triala BEZ filtra — dla niego jeden wiersz na konto
  -- znaczy „ten użytkownik ma już okres próbny". Filtrowanie tutaj rozjechałoby
  -- się z zapisem: komuś odmówiono by drugiego triala, a pierwszy nie dawałby
  -- mu dostępu. Przy przyznawaniu dostępu jesteśmy hojni; przy odbieraniu
  -- widoczności publicznej (patrz `jest_klientem_linii`) — ostrożni.
  SELECT expires_at, true INTO v_trial, v_ma_trial
  FROM paid_service_subscriptions
  WHERE user_id = v_user AND status = 'trial'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT COALESCE(v_ma_trial, false) THEN RETURN false; END IF;

  -- Trial bez daty końca = trwający. Taki wiersz powstał przed wprowadzeniem
  -- terminów; odebranie mu dostępu byłoby zmianą warunków wstecz.
  RETURN v_trial IS NULL OR v_trial > now();
END;
$$;

REVOKE ALL ON FUNCTION public.moze_pracowac(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.moze_pracowac(uuid, text) TO authenticated, anon, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
