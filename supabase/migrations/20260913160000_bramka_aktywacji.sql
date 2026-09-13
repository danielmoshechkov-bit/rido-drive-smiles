-- ============================================================================
-- BRAMKA AKTYWACJI NUMERU — „nie ma pakietu, nie ma numeru"
--
-- Dotąd `voice-number-activate` sprawdzała wyłącznie, czy ktoś jest zalogowany
-- i ma warsztat. `voice-numbers-worker`, który KUPUJE NUMER U OPERATORA ZA
-- NASZE PIENIĄDZE, nie sprawdzał nic. Po przebudowie panelu warsztat bez
-- pakietu nie zobaczy już przycisku — ale dziura zostawała na poziomie API,
-- a to ta sama klasa błędu co w `ai-chat` i `send-sms`.
--
-- Flaga domyślnie WYŁĄCZONA: kod trafia na produkcję martwy i nie odcina
-- nikogo w chwili wdrożenia.
--
-- ⚠️ DO WYKONANIA PRZEZ CZŁOWIEKA.
-- ============================================================================

BEGIN;

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS agent_bramka_aktywacji boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.billing_settings.agent_bramka_aktywacji IS
  'Czy zamówienie numeru wymaga opłaconego pakietu Agent. Domyślnie false.';

-- ============================================================================
-- CZY WARSZTAT MA OPŁACONY PAKIET AGENTA — jedno źródło dla panelu i serwera.
--
-- 🔴 PYTAMY O LINIĘ PLANU, NIE O KOLUMNĘ `billing_subscriptions.product_line`.
-- Webhook Stripe tej kolumny NIE USTAWIA przy pierwszym zakupie: buduje wiersz
-- bez niej, a kolumna ma wartość domyślną `'other'`. Pierwszy w historii zakup
-- pakietu Agent poszedłby właśnie tą ścieżką — i bramka odmówiłaby numeru
-- komuś, kto właśnie zapłacił.
--
-- Linia produktowa jest własnością PLANU i tam jest zawsze prawdziwa.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ma_pakiet_agenta(p_provider uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM billing_subscriptions s
      JOIN billing_plans p ON p.id = s.plan_id
     WHERE s.subscriber_type = 'service_provider'
       AND s.subscriber_id = p_provider
       AND p.product_line = 'agent'
       AND s.status IN ('active', 'trialing')
       AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;

REVOKE ALL ON FUNCTION public.ma_pakiet_agenta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ma_pakiet_agenta(uuid) TO authenticated, service_role;

SELECT 'flaga bramki' AS co, agent_bramka_aktywacji::text AS wartosc
  FROM public.billing_settings WHERE id = true
UNION ALL
SELECT 'warsztatow z pakietem agenta', count(*)::text
  FROM public.service_providers sp WHERE public.ma_pakiet_agenta(sp.id);

COMMIT;
