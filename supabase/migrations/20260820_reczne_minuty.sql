-- ============================================================================
-- RĘCZNE NADAWANIE I ZEROWANIE MINUT — funkcja produktu, nie obejście na testy
--
-- Powody, dla których będzie używana zawsze: klient testowy przed zakupem,
-- reklamacja, gest handlowy, warsztat partnerski.
--
-- NADANE TRAFIAJĄ DO DOKUPIONYCH, nie do pakietowych. Pakietowe kasują się
-- przy odnowieniu subskrypcji — minuty, które daliśmy w ramach reklamacji,
-- nie mogą zniknąć klientowi po miesiącu.
-- ============================================================================

-- KTO MOŻE. Lista, nie zaszyty w kodzie adres: zmiana uprawnień nie może
-- wymagać wdrożenia migracji.
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS operatorzy_recznych_operacji text[]
  NOT NULL DEFAULT ARRAY['daniel.moshechkov@gmail.com'];

CREATE OR REPLACE FUNCTION public.voice_wolno_recznie()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u, public.billing_settings s
     WHERE u.id = auth.uid() AND s.id = true
       AND lower(u.email) = ANY (SELECT lower(x) FROM unnest(s.operatorzy_recznych_operacji) x)
  );
$$;

-- ============================================================================
-- NADANIE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.voice_nadaj_minuty(
  p_provider_id uuid, p_minuty integer, p_powod text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature uuid;
  v_pack    uuid;
BEGIN
  IF NOT public.voice_wolno_recznie() THEN
    RAISE EXCEPTION 'Brak uprawnien do recznego nadawania minut';
  END IF;
  IF p_minuty IS NULL OR p_minuty <= 0 THEN
    RAISE EXCEPTION 'Liczba minut musi byc dodatnia';
  END IF;
  -- POWÓD JEST OBOWIĄZKOWY I MA COŚ ZNACZYĆ. "test" albo "." to nie powód —
  -- za pół roku nikt nie odtworzy, dlaczego ten warsztat dostał 200 minut.
  IF p_powod IS NULL OR length(btrim(p_powod)) < 5 THEN
    RAISE EXCEPTION 'Powod jest obowiazkowy (min. 5 znakow)';
  END IF;

  SELECT id INTO v_feature FROM public.billing_features WHERE key = 'voice_minutes' AND is_active;
  IF v_feature IS NULL THEN RAISE EXCEPTION 'Brak cechy voice_minutes'; END IF;

  INSERT INTO public.billing_addon_packs
    (subscriber_type, subscriber_id, feature_id, amount_total, amount_remaining,
     expires_at, source, note)
  VALUES ('service_provider', p_provider_id, v_feature, p_minuty, p_minuty,
          NULL, 'admin_grant', btrim(p_powod))
  RETURNING id INTO v_pack;

  INSERT INTO public.billing_audit_log (actor_id, action, target_table, target_id, before, after)
  VALUES (auth.uid(), 'voice_minuty_nadane', 'billing_addon_packs', v_pack,
          NULL, jsonb_build_object('provider_id', p_provider_id, 'minuty', p_minuty, 'powod', btrim(p_powod)));

  RETURN public.voice_saldo_minut(p_provider_id);
END;
$$;

-- ============================================================================
-- ZEROWANIE — obie pule naraz, bo „wyzeruj" nie może zostawić połowy
-- ============================================================================
CREATE OR REPLACE FUNCTION public.voice_wyzeruj_minuty(
  p_provider_id uuid, p_powod text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feature uuid;
  v_przed   jsonb;
  v_limit   numeric;
  v_paczek  integer;
BEGIN
  IF NOT public.voice_wolno_recznie() THEN
    RAISE EXCEPTION 'Brak uprawnien do zerowania minut';
  END IF;
  IF p_powod IS NULL OR length(btrim(p_powod)) < 5 THEN
    RAISE EXCEPTION 'Powod jest obowiazkowy (min. 5 znakow)';
  END IF;

  SELECT id INTO v_feature FROM public.billing_features WHERE key = 'voice_minutes' AND is_active;
  v_przed := public.voice_saldo_minut(p_provider_id);

  -- 1) DOKUPIONE: paczki do zera. Nie kasujemy wierszy — historia zakupu
  --    i nadania ma zostać, inaczej nie odtworzymy, co zniknęło i kiedy.
  UPDATE public.billing_addon_packs
     SET amount_remaining = 0, updated_at = now()
   WHERE subscriber_type = 'service_provider' AND subscriber_id = p_provider_id
     AND feature_id = v_feature AND amount_remaining > 0;
  GET DIAGNOSTICS v_paczek = ROW_COUNT;

  -- 2) PAKIETOWE: zużycie podnosimy do wysokości limitu. Nie ruszamy planu ani
  --    subskrypcji — po odnowieniu okresu pula wróci sama, bo `billing_usage`
  --    jest kluczowane miesiącem.
  v_limit := public.feature_limit('service_provider'::billing_subscriber_type, p_provider_id, 'voice_minutes');
  IF v_limit IS NOT NULL AND v_limit > 0 THEN
    INSERT INTO public.billing_usage (subscriber_type, subscriber_id, feature_id, period_start, used)
    VALUES ('service_provider', p_provider_id, v_feature, date_trunc('month', now())::date, v_limit)
    ON CONFLICT (subscriber_type, subscriber_id, feature_id, period_start)
    DO UPDATE SET used = GREATEST(public.billing_usage.used, EXCLUDED.used), updated_at = now();
  END IF;

  INSERT INTO public.billing_audit_log (actor_id, action, target_table, target_id, before, after)
  VALUES (auth.uid(), 'voice_minuty_wyzerowane', 'service_providers', p_provider_id,
          v_przed, jsonb_build_object('powod', btrim(p_powod), 'paczek_wyzerowanych', v_paczek));

  RETURN public.voice_saldo_minut(p_provider_id);
END;
$$;

REVOKE ALL ON FUNCTION public.voice_nadaj_minuty(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.voice_wyzeruj_minuty(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voice_nadaj_minuty(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.voice_wyzeruj_minuty(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.voice_wolno_recznie() TO authenticated;
