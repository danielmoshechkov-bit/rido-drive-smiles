-- ============================================================================
-- NALICZANIE MINUT — JEDNA FUNKCJA, DWA WYWOŁANIA
--
-- Naliczenie woła `voice-call-postprocess` (zaraz po rozmowie) i awaryjnie
-- `voice-call-reconcile` (co 15 minut, dla rozmów bez znacznika — gdy webhook
-- nie doszedł). Reguła musi więc siedzieć w JEDNYM miejscu, bo dwa wywołania
-- z dwóch funkcji brzegowych to dwie okazje do rozjazdu.
--
-- IDEMPOTENCJA SIEDZI W ZAPISIE, NIE W SPRAWDZENIU. Warunek
-- `minutes_charged_at IS NULL` jest częścią UPDATE-a, więc dwa równoczesne
-- wywołania nie naliczą dwa razy — drugie nie znajdzie wiersza do zmiany.
-- Sprawdzenie przed zapisem („czy już naliczone?") miałoby okno między
-- odczytem a zapisem.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.voice_nalicz_minuty(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call    public.voice_calls;
  v_minuty  integer;
  v_wynik   jsonb;
BEGIN
  -- Zajmujemy wiersz i od razu stawiamy znacznik. Kto pierwszy, ten nalicza.
  UPDATE public.voice_calls
     SET minutes_charged_at = now()
   WHERE id = p_call_id
     AND minutes_charged_at IS NULL
  RETURNING * INTO v_call;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'pominiete', 'juz_naliczone');
  END IF;

  -- PEŁNE MINUTY W GÓRĘ. 60 s = 1 minuta, 61 s = 2 minuty.
  -- Rozmowa zerowej długości (nieudane połączenie, próba techniczna) kosztuje
  -- ZERO, ale znacznik zostaje — inaczej kontrola „rozmowa bez naliczenia"
  -- krzyczałaby na każdą taką próbę i nauczyłaby nas ją ignorować.
  v_minuty := CEIL(GREATEST(COALESCE(v_call.duration_seconds, 0), 0) / 60.0)::integer;

  IF v_minuty = 0 THEN
    UPDATE public.voice_calls SET minutes_charged = 0 WHERE id = p_call_id;
    RETURN jsonb_build_object('ok', true, 'minuty', 0, 'powod', 'rozmowa zerowej dlugosci');
  END IF;

  IF v_call.provider_id IS NULL THEN
    -- Rozmowa bez warsztatu nie ma kogo obciążyć. Zapisujemy minuty do wglądu,
    -- ale nie zgadujemy właściciela.
    UPDATE public.voice_calls SET minutes_charged = v_minuty WHERE id = p_call_id;
    RETURN jsonb_build_object('ok', false, 'minuty', v_minuty, 'powod', 'brak provider_id');
  END IF;

  v_wynik := public.billing_consume(
    'service_provider'::billing_subscriber_type, v_call.provider_id,
    'voice_minutes', v_minuty, true);

  UPDATE public.voice_calls
     SET minutes_charged = v_minuty,
         minutes_charge_detail = v_wynik
   WHERE id = p_call_id;

  RETURN jsonb_build_object('ok', COALESCE((v_wynik ->> 'ok')::boolean, false),
                            'minuty', v_minuty, 'rozbicie', v_wynik);
END;
$$;

REVOKE ALL ON FUNCTION public.voice_nalicz_minuty(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.voice_nalicz_minuty(uuid) TO service_role;

-- ============================================================================
-- SALDO MINUT — JEDNA LICZBA, KTÓRĄ WIDZI WARSZTAT
--
-- „Ile mi zostało", nie „ile zużyłem". Trzy składniki, bo trzy są potrzebne:
--   pakietowe  — limit planu minus zużycie w bieżącym okresie; wygasa przy odnowieniu
--   dokupione  — paczki bezterminowe; zostają
--   w_toku     — rozmowy trwające TERAZ, jeszcze nienaliczone
--
-- W_TOKU JEST TU Z POWODU, KTÓREGO NIE WIDAĆ NA PIERWSZY RZUT OKA. Przy pakiecie
-- z trzema rozmowami równoczesnymi saldo pokazywałoby stan sprzed nich — więc
-- warsztat z jedną minutą mógłby odebrać trzy rozmowy naraz i zejść na minus
-- kilkanaście minut, a licznik do końca pokazywałby „1".
-- ============================================================================

CREATE OR REPLACE FUNCTION public.voice_saldo_minut(p_provider_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stan     jsonb;
  v_limit    numeric;
  v_uzyte    numeric;
  v_paczki   numeric;
  v_w_toku   numeric;
  v_bez_planu boolean;
BEGIN
  v_stan := public.check_usage('service_provider'::billing_subscriber_type,
                               p_provider_id, 'voice_minutes', 1);

  -- BRAK PLANU TO NIE JEST LIMIT ZERO.
  --
  -- `check_usage` zwraca `limit: 0` w dwóch zupełnie różnych sytuacjach:
  -- gdy cechy nie ma w planie (`feature_not_in_plan`) i gdy warsztat ma
  -- wyłącznie paczki (`tylko_paczki`). Odczytanie tego jako „limit wynosi 0"
  -- pokazałoby warsztatowi bez pakietu twarde zero i wyglądałoby na zakaz,
  -- choć on po prostu jeszcze nie kupił. Rozróżnia je `reason`, nie liczba.
  v_bez_planu := (v_stan ->> 'reason') IN ('feature_not_in_plan', 'tylko_paczki');
  v_limit  := CASE WHEN v_bez_planu THEN NULL ELSE NULLIF(v_stan ->> 'limit', '')::numeric END;
  v_uzyte  := COALESCE((v_stan ->> 'used')::numeric, 0);
  v_paczki := COALESCE((v_stan ->> 'packs_remaining')::numeric, 0);

  -- Minuty rozmów trwających teraz, zaokrąglone w górę tak samo jak przy
  -- naliczaniu. Minimum jedna na rozmowę: rozmowa, która trwa dziesięć sekund,
  -- i tak będzie kosztowała minutę.
  SELECT COALESCE(SUM(GREATEST(CEIL(EXTRACT(EPOCH FROM (now() - started_at)) / 60.0), 1)), 0)
    INTO v_w_toku
    FROM public.voice_active_calls
   WHERE provider_id = p_provider_id
     AND started_at > now() - interval '30 minutes';

  RETURN jsonb_build_object(
    'ma_limit',   v_limit IS NOT NULL,
    'pakietowe',  CASE WHEN v_limit IS NULL THEN NULL ELSE GREATEST(v_limit - v_uzyte, 0) END,
    'dokupione',  v_paczki,
    'w_toku',     v_w_toku,
    -- `dostepne` to liczba, na której podejmuje się decyzje: ile zostało PO
    -- odjęciu tego, co właśnie się dzieje. Bez limitu planu i bez paczek
    -- zwracamy NULL — „bez ograniczeń", a nie zero. Zero znaczyłoby, że
    -- warsztat bez pakietu ma zakaz, a on po prostu jeszcze nie kupił.
    'dostepne',   CASE WHEN v_limit IS NULL AND v_paczki = 0 THEN NULL
                       ELSE COALESCE(v_limit - v_uzyte, 0) + v_paczki - v_w_toku END,
    'zuzyte_w_okresie', v_uzyte
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.voice_saldo_minut(uuid) TO authenticated, service_role;
