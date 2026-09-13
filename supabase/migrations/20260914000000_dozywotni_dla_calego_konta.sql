-- ═══════════════════════════════════════════════════════════════════════════
-- DOŻYWOTNI DOSTĘP DOTYCZY CAŁEGO KONTA, NIE TYLKO AGENTA (14.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Wczoraj znacznik nazywał się `agent_dozywotni` i pilnował jednego produktu.
-- Decyzja właściciela: konto demonstracyjne nie ma powodu, żeby cokolwiek mu
-- wygasało — ani agent, ani moduł warsztatowy, ani nic, co dojdzie później.
--
-- JEDNA KOLUMNA, NIE DWIE. Drugi znacznik obok pierwszego znaczyłby dwie
-- prawdy o tym samym koncie i pytanie „którą czyta ta bramka", zadawane przy
-- każdej następnej zmianie. Zmieniamy nazwę istniejącej i rozszerzamy zasięg.

ALTER TABLE public.service_providers
  RENAME COLUMN agent_dozywotni TO dostep_dozywotni;

COMMENT ON COLUMN public.service_providers.dostep_dozywotni IS
  'DOSTĘP DOŻYWOTNI DO CAŁEJ PLATFORMY — decyzja właściciela z 13/14.09.2026. '
  'Konto z tym znacznikiem ma WSZYSTKO bez końca: agent odbiera telefony, '
  'moduł warsztatowy działa, nic nie wygasa, nie ma karencji ani twardego '
  'bloku. Ustawione dla konta demonstracyjnego CART78GARAGE, na którym stoi '
  'numer ze strony /ai-agent — demo nigdy nie będzie miało subskrypcji, '
  'a przestanie działać dokładnie w dniu, w którym ktoś to „naprawi". '
  'NIE KASOWAĆ przy porządkach. Czytają to `agent_moze_odbierac()` '
  'i `moze_pracowac()`.';

-- ───────────────────────────────────────────────────────────────────────────
-- Bramka agenta — ta sama logika, nowa nazwa kolumny.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_moze_odbierac(p_provider uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dozywotni boolean;
  v_ma_sub    boolean;
BEGIN
  IF p_provider IS NULL THEN
    RETURN false;                       -- brak podmiotu = brak zgody
  END IF;

  -- DOŻYWOTNI WYGRYWA ZE WSZYSTKIM. Sprawdzany pierwszy i kończy pytanie:
  -- żadna reguła niżej nie ma prawa go dotknąć.
  SELECT COALESCE(sp.dostep_dozywotni, false) INTO v_dozywotni
  FROM service_providers sp WHERE sp.id = p_provider;
  IF v_dozywotni THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM billing_subscriptions s
    JOIN billing_plans p ON p.id = s.plan_id
    WHERE s.subscriber_type = 'service_provider'
      AND s.subscriber_id = p_provider
      AND p.product_line = 'agent'
      AND s.status IN ('active', 'trialing')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) INTO v_ma_sub;

  RETURN COALESCE(v_ma_sub, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.agent_moze_odbierac(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_moze_odbierac(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Dostęp do reszty platformy — `moze_pracowac` stoi w politykach RLS
-- ───────────────────────────────────────────────────────────────────────────
-- Ta funkcja rozstrzyga, czy warsztat może pracować w danej linii produktowej,
-- i jest wołana z polityk RLS oraz z bramek w funkcjach brzegowych. Dokładamy
-- na jej początku to samo pytanie o dożywotni dostęp — PRZED czytaniem
-- subskrypcji, żeby brak wiersza nie miał jak zamknąć konta demonstracyjnego.
--
-- Reszta ciała bez zmian: pobrana z żywej definicji i przeniesiona jeden do
-- jednego (zasada z CLAUDE.md — długiej funkcji nie przepisujemy z ekranu).
CREATE OR REPLACE FUNCTION public.moze_pracowac(p_provider uuid, p_linia text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_user uuid; v_trial timestamptz; v_ma_trial boolean;
  v_okres_do timestamptz; v_trial_do timestamptz; v_koniec_probnego timestamptz;
BEGIN
  IF p_provider IS NULL OR p_linia IS NULL THEN
    RETURN false;                      -- brak podmiotu = brak zgody (fail-closed)
  END IF;

  -- DOŻYWOTNI PRZED WSZYSTKIM INNYM (14.09.2026).
  --
  -- Konto demonstracyjne nie ma i nie będzie miało subskrypcji, więc każda
  -- reguła niżej odpowiedziałaby „nie". Pytanie stoi PRZED czytaniem wiersza,
  -- żeby jego brak nie miał jak zamknąć demo. Patrz komentarz przy kolumnie
  -- `service_providers.dostep_dozywotni` — NIE KASOWAĆ przy porządkach.
  IF (SELECT COALESCE(sp.dostep_dozywotni, false)
        FROM service_providers sp WHERE sp.id = p_provider) THEN
    RETURN true;
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
$function$
;

REVOKE ALL ON FUNCTION public.moze_pracowac(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moze_pracowac(uuid, text) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Ostrzeżenia: dożywotni ich nie dostaje (nic mu nie wygasa)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.billing_do_ostrzezenia()
RETURNS TABLE(
  subscription_id uuid, provider_id uuid, user_id uuid, email text,
  nazwa_firmy text, prog_dni integer, koniec date, powod text, linia text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH kandydaci AS (
    SELECT s.id, s.subscriber_id, s.status, s.product_line::text AS linia,
           CASE WHEN s.status = 'trialing'
                THEN COALESCE(s.trial_ends_at, s.current_period_end)
                ELSE s.current_period_end
           END::date AS koniec,
           CASE WHEN s.status = 'trialing' THEN 'trial' ELSE 'platnosc' END AS powod
    FROM billing_subscriptions s
    WHERE s.subscriber_type = 'service_provider'
      AND s.status IN ('trialing', 'active')
      AND s.cancel_at IS NULL
      AND (CASE WHEN s.status = 'trialing'
                THEN COALESCE(s.trial_ends_at, s.current_period_end)
                ELSE s.current_period_end END) IS NOT NULL
  ),
  z AS (
    SELECT k.id, k.subscriber_id, k.koniec, k.powod, k.linia, p.prog
    FROM kandydaci k
    CROSS JOIN LATERAL (
      SELECT prog FROM (VALUES (7), (1)) AS w(prog) WHERE k.linia <> 'agent'
      UNION ALL
      SELECT prog FROM (VALUES (3), (0)) AS a(prog) WHERE k.linia = 'agent'
    ) AS p
    WHERE k.koniec = (now() AT TIME ZONE 'Europe/Warsaw')::date + p.prog
  )
  SELECT z.id, z.subscriber_id, sp.user_id,
         COALESCE(NULLIF(sp.owner_email, ''), NULLIF(sp.company_email, ''), u.email),
         COALESCE(NULLIF(sp.company_name, ''), 'Twój warsztat'),
         z.prog, z.koniec, z.powod, z.linia
  FROM z
  JOIN service_providers sp ON sp.id = z.subscriber_id
  JOIN auth.users u ON u.id = sp.user_id
  WHERE COALESCE(sp.dostep_dozywotni, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM billing_ostrzezenia o
    WHERE o.subscription_id = z.id AND o.prog_dni = z.prog AND o.dotyczy_daty = z.koniec
  )
  AND COALESCE(NULLIF(sp.owner_email, ''), NULLIF(sp.company_email, ''), u.email) IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.billing_do_ostrzezenia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_do_ostrzezenia() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Zejście na twardy blok omija konto dożywotnie
-- ───────────────────────────────────────────────────────────────────────────
-- Bez tego warunku zadanie cykliczne przestawiłoby demo na `read_only`, gdyby
-- kiedykolwiek trafił mu się wiersz subskrypcji z przeszłą datą.
CREATE OR REPLACE FUNCTION public.billing_zejdz_do_read_only()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ile integer;
BEGIN
  UPDATE billing_subscriptions s
  SET status = 'read_only', updated_at = now()
  WHERE s.status IN ('past_due', 'trialing')
    AND s.dokanczanie_do IS NOT NULL
    AND s.dokanczanie_do < now()
    AND NOT EXISTS (
      SELECT 1 FROM service_providers sp
      WHERE sp.id = s.subscriber_id AND COALESCE(sp.dostep_dozywotni, false)
    );

  GET DIAGNOSTICS v_ile = ROW_COUNT;
  IF v_ile > 0 THEN
    RAISE NOTICE 'billing_zejdz_do_read_only: % subskrypcji na twardym bloku', v_ile;
  END IF;
  RETURN v_ile;
END;
$function$;

REVOKE ALL ON FUNCTION public.billing_zejdz_do_read_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_zejdz_do_read_only() TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT string_agg(company_name, ', ') FROM service_providers
    WHERE dostep_dozywotni)                                          AS konto_dozywotnie,
  (SELECT agent_moze_odbierac(id)::text FROM service_providers
    WHERE dostep_dozywotni LIMIT 1)                                  AS agent_odbiera,
  (SELECT moze_pracowac(id, 'warsztat')::text FROM service_providers
    WHERE dostep_dozywotni LIMIT 1)                                  AS modul_warsztatowy,
  (SELECT moze_pracowac(id, 'agent')::text FROM service_providers
    WHERE dostep_dozywotni LIMIT 1)                                  AS linia_agenta,
  (SELECT voice_odmowic_brak_minut(id)::text FROM service_providers
    WHERE dostep_dozywotni LIMIT 1)                                  AS odmowa_ma_byc_false;
