-- Zlecenie próbne z wprowadzenia — nie liczy się do niczego.
--
-- Warsztat uczy się na własnym aucie i własnym numerze telefonu: musi zobaczyć
-- prawdziwy SMS i prawdziwą stronę dla klienta, inaczej nie wie, co dostaje
-- jego klient. Ale za naukę nie płaci się pakietem SMS ani limitem sprawdzeń
-- pojazdu — inaczej pierwsze wrażenie z produktu to zużyty limit.
--
-- Nadużycie odcinamy trzema warunkami, nie zaufaniem:
--   * SMS z próbnego zlecenia idzie WYŁĄCZNIE na numer własny warsztatu,
--   * najwyżej `LIMIT_SMS` takich wiadomości na warsztat,
--   * darmowe sprawdzenie pojazdu przysługuje RAZ.
-- Liczniki są tutaj, po stronie bazy, bo przeglądarce w tej sprawie nie wierzymy.

ALTER TABLE public.workshop_orders
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workshop_orders.is_demo IS
  'Zlecenie z wprowadzenia. Jego SMS-y nie schodzą z pakietu, a samo zlecenie warsztat kasuje po nauce.';

CREATE TABLE IF NOT EXISTS public.workshop_onboarding_usage (
  provider_id          uuid PRIMARY KEY REFERENCES public.service_providers(id) ON DELETE CASCADE,
  vehicle_lookup_used  boolean NOT NULL DEFAULT false,
  demo_sms_sent        int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workshop_onboarding_usage IS
  'Co warsztat wykorzystał z darmowego wprowadzenia: jedno sprawdzenie pojazdu i pula SMS-ów próbnych.';

ALTER TABLE public.workshop_onboarding_usage ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.workshop_onboarding_usage TO authenticated;
GRANT ALL ON public.workshop_onboarding_usage TO service_role;

-- Warsztat widzi swój licznik (panel może pokazać „zostało N wiadomości próbnych"),
-- ale ZMIENIAĆ go może tylko serwer. Inaczej limit byłby na zaufanie.
DROP POLICY IF EXISTS "wou_read" ON public.workshop_onboarding_usage;
CREATE POLICY "wou_read" ON public.workshop_onboarding_usage
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
         OR public.has_role(auth.uid(), 'admin'::app_role));

-- Jedno miejsce z decyzją „czy ten SMS wolno wysłać za darmo".
-- Zwraca powód odmowy, żeby edge miała co pokazać użytkownikowi.
CREATE OR REPLACE FUNCTION public.demo_sms_dozwolony(p_provider uuid, p_telefon text, p_limit int DEFAULT 5)
RETURNS TABLE (dozwolone boolean, powod text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wlasny text;
  v_wyslane int;
  v_cyfry text := regexp_replace(COALESCE(p_telefon, ''), '\D', '', 'g');
BEGIN
  SELECT regexp_replace(COALESCE(ws.phone, sp.company_phone, ''), '\D', '', 'g')
    INTO v_wlasny
    FROM public.service_providers sp
    LEFT JOIN public.workshop_settings ws ON ws.user_id = sp.user_id
   WHERE sp.id = p_provider
   LIMIT 1;

  IF COALESCE(v_wlasny, '') = '' THEN
    RETURN QUERY SELECT false, 'Warsztat nie ma zapisanego własnego numeru telefonu';
    RETURN;
  END IF;

  -- Porównujemy po ostatnich 9 cyfrach: numer bywa zapisany z +48, ze spacjami
  -- albo bez kierunkowego, a to ma być ten sam telefon.
  IF right(v_cyfry, 9) <> right(v_wlasny, 9) THEN
    RETURN QUERY SELECT false, 'SMS ze zlecenia próbnego można wysłać tylko na własny numer warsztatu';
    RETURN;
  END IF;

  SELECT COALESCE(demo_sms_sent, 0) INTO v_wyslane
    FROM public.workshop_onboarding_usage WHERE provider_id = p_provider;

  IF COALESCE(v_wyslane, 0) >= p_limit THEN
    RETURN QUERY SELECT false, format('Wykorzystano pulę %s wiadomości próbnych', p_limit);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.demo_sms_dozwolony(uuid, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.demo_sms_dozwolony(uuid, text, int) TO service_role;

-- Zliczanie wysłanych wiadomości próbnych (serwer, po udanej wysyłce).
CREATE OR REPLACE FUNCTION public.demo_sms_zapisz(p_provider uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.workshop_onboarding_usage (provider_id, demo_sms_sent)
  VALUES (p_provider, 1)
  ON CONFLICT (provider_id) DO UPDATE
    SET demo_sms_sent = public.workshop_onboarding_usage.demo_sms_sent + 1,
        updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.demo_sms_zapisz(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.demo_sms_zapisz(uuid) TO service_role;

-- Darmowe sprawdzenie pojazdu: przysługuje raz i tylko w trakcie wprowadzenia.
-- Zwraca true, jeśli TO wywołanie ma być bezpłatne (i od razu je odhacza).
CREATE OR REPLACE FUNCTION public.onboarding_pojazd_za_darmo(p_provider uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uzyte boolean;
BEGIN
  INSERT INTO public.workshop_onboarding_usage (provider_id)
  VALUES (p_provider)
  ON CONFLICT (provider_id) DO NOTHING;

  SELECT vehicle_lookup_used INTO v_uzyte
    FROM public.workshop_onboarding_usage WHERE provider_id = p_provider FOR UPDATE;

  IF v_uzyte THEN RETURN false; END IF;

  UPDATE public.workshop_onboarding_usage
     SET vehicle_lookup_used = true, updated_at = now()
   WHERE provider_id = p_provider;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.onboarding_pojazd_za_darmo(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.onboarding_pojazd_za_darmo(uuid) TO service_role;
