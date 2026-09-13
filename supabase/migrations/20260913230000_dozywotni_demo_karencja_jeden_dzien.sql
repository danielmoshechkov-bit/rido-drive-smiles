-- ═══════════════════════════════════════════════════════════════════════════
-- TRZY DECYZJE WŁAŚCICIELA Z 13.09.2026, ZAPISANE W BAZIE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. CART78GARAGE — DOSTĘP DOŻYWOTNI. Numer demonstracyjny ze strony
--    /ai-agent nigdy nie będzie miał pakietu i nigdy nie może przestać
--    odbierać. Żadna reguła wygaśnięcia, blokady ani karencji go nie dotyka.
--
-- 2. KARENCJA JEDEN DZIEŃ, jedna reguła dla wszystkich linii produktowych.
--
-- 3. AGENT PRZESTAJE ODBIERAĆ PO WYGAŚNIĘCIU — dziura, przez którą jedna
--    płatność dawała agenta bez końca. Opis niżej, przy funkcji.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. ZNACZNIK DOŻYWOTNIEGO DOSTĘPU
-- ───────────────────────────────────────────────────────────────────────────
-- Kolumna, nie lista identyfikatorów w kodzie. Identyfikator wpisany w funkcję
-- brzegową albo w warunek SQL ginie przy pierwszym refaktorze i nikt nie wie,
-- czemu demo przestało odbierać. Tu stoi w danych, z komentarzem, który mówi
-- WPROST, że to nie jest pomyłka do posprzątania.
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS agent_dozywotni boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_providers.agent_dozywotni IS
  'DOSTĘP DOŻYWOTNI DO AGENTA — decyzja właściciela z 13.09.2026. Konto z tym '
  'znacznikiem odbiera telefony ZAWSZE: bez pakietu, bez odnawiania, bez '
  'karencji i bez wygasania. Ustawione dla numeru demonstracyjnego '
  'CART78GARAGE ze strony /ai-agent — demo nigdy nie będzie miało subskrypcji, '
  'a przestanie odbierać dokładnie w dniu, w którym ktoś to „naprawi". '
  'NIE KASOWAĆ przy porządkach. Czyta to `agent_moze_odbierac()`.';

UPDATE public.service_providers sp
   SET agent_dozywotni = true
 WHERE EXISTS (
   SELECT 1 FROM public.voice_numbers n
   WHERE n.provider_id = sp.id AND n.demonstracyjny = true
 );

-- ───────────────────────────────────────────────────────────────────────────
-- 2. JEDNO PYTANIE O PRAWO DO ODBIERANIA
-- ───────────────────────────────────────────────────────────────────────────
-- Do dziś nikt tego pytania nie zadawał. `voice-agent-init` — funkcja, przez
-- którą przechodzi KAŻDE połączenie — sprawdzała wyłącznie saldo minut, a ta
-- kontrola miała w środku:
--
--     IF NOT v_ma_sub THEN RETURN false; END IF;   -- brak subskrypcji = PRZEPUŚĆ
--
-- czyli warsztat z WYGASŁYM pakietem wypadał z warunku „ma aktywną
-- subskrypcję" i był przepuszczany. Numer zostawał przypisany, agent odbierał
-- dalej, a minuty płaciliśmy my u dostawcy rozmów. Jedna płatność dawała
-- agenta bez końca.
--
-- Teraz odpowiedź jest w JEDNYM miejscu i wołają ją wszystkie bramki.
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
  SELECT COALESCE(sp.agent_dozywotni, false) INTO v_dozywotni
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
-- 3. BRAMKA ODBIERANIA — dwa powody odmowy zamiast jednego
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.voice_odmowic_brak_minut(p_provider_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_flaga     boolean;
  v_saldo     jsonb;
  v_dostepne  numeric;
BEGIN
  -- Wyłącznik awaryjny zostaje: jedna flaga wyłącza OBA powody odmowy.
  SELECT voice_minuty_blokuja INTO v_flaga FROM billing_settings WHERE id = true;
  IF NOT COALESCE(v_flaga, false) THEN RETURN false; END IF;

  -- POWÓD PIERWSZY: NIE MA PRAWA DO AGENTA (brak pakietu albo pakiet wygasł).
  -- Dożywotni przechodzi tędy bez zatrzymania — patrz `agent_moze_odbierac`.
  IF NOT public.agent_moze_odbierac(p_provider_id) THEN
    RETURN true;
  END IF;

  -- POWÓD DRUGI: pakiet jest, ale minuty się skończyły.
  v_saldo := public.voice_saldo_minut(p_provider_id);
  v_dostepne := NULLIF(v_saldo ->> 'dostepne', '')::numeric;

  -- `dostepne = NULL` znaczy „bez ograniczen", nie „zero".
  IF v_dostepne IS NULL THEN RETURN false; END IF;

  RETURN v_dostepne < 1;
EXCEPTION WHEN OTHERS THEN
  -- BŁĄD SPRAWDZENIA PRZEPUSZCZA ROZMOWĘ — odwrotnie niż przy pieniądzach,
  -- bo tu odmowa znaczy nieodebrany telefon klienta warsztatu, który zapłacił.
  RAISE WARNING 'voice_odmowic_brak_minut: % — przepuszczam polaczenie', SQLERRM;
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.voice_odmowic_brak_minut(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voice_odmowic_brak_minut(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. KARENCJA: JEDEN DZIEŃ, BEZ WYJĄTKÓW
-- ───────────────────────────────────────────────────────────────────────────
-- `grace_period_days` było do dziś MARTWE — nie czytała go żadna funkcja.
-- Prawdziwą karencję ustalał domyślny parametr `termin_dokonczenia(p_dni := 3)`.
-- Ustawiamy oba na jeden dzień, żeby wartość w ustawieniach i zachowanie
-- systemu mówiły to samo.
--
-- Dzień liczony jest ROBOCZY, nie kalendarzowy — `termin_dokonczenia` omija
-- niedziele i święta na podstawie godzin otwarcia warsztatu. To zostaje:
-- blokada w niedzielę o poranku zastałaby warsztat zamknięty i nie dałaby mu
-- żadnej szansy na poprawienie karty.
UPDATE public.billing_settings SET grace_period_days = 1 WHERE id = true;

ALTER FUNCTION public.termin_dokonczenia(uuid, timestamptz, integer)
  RENAME TO termin_dokonczenia_stary;

CREATE OR REPLACE FUNCTION public.termin_dokonczenia(
  p_provider uuid,
  p_od timestamptz DEFAULT now(),
  p_dni integer DEFAULT 1
) RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Cała arytmetyka dni roboczych została w starej funkcji — tu zmienia się
  -- WYŁĄCZNIE wartość domyślna. Przepisywanie tamtego kodu po to, żeby zmienić
  -- jedną cyfrę, byłoby zaproszeniem do literówki w miejscu, które decyduje
  -- o odcięciu klienta.
  SELECT public.termin_dokonczenia_stary(p_provider, p_od, GREATEST(COALESCE(p_dni, 1), 1));
$function$;

REVOKE ALL ON FUNCTION public.termin_dokonczenia(uuid, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.termin_dokonczenia(uuid, timestamptz, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.termin_dokonczenia_stary(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.termin_dokonczenia_stary(uuid, timestamptz, integer) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. OSTRZEŻENIA OBEJMUJĄ LINIĘ AGENTA
-- ───────────────────────────────────────────────────────────────────────────
-- Stało tu `AND s.product_line = 'warsztat'`, więc maile „kończy się za…"
-- NIGDY nie dotyczyły pakietu agenta. Warsztat straciłby go bez jednego słowa.
--
-- Progi są RÓŻNE dla linii, bo produkty kończą się inaczej: abonament
-- warsztatowy odnawia się sam i ostrzeżenie jest uprzejmością (7 i 1 dzień),
-- a pakiet agenta kupiony BLIK-iem NIE ODNOWI SIĘ SAM — tam ostrzeżenie jest
-- warunkiem, żeby klient w ogóle zdążył (3 dni i dzień wygaśnięcia).
DROP FUNCTION IF EXISTS public.billing_do_ostrzezenia();

CREATE FUNCTION public.billing_do_ostrzezenia()
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
           -- Data próbna WYŁĄCZNIE dla subskrypcji próbnej. Dla opłaconej
           -- liczy się koniec okresu — nawet gdyby stara data próbna została
           -- w wierszu.
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
  -- DOŻYWOTNI NIE DOSTAJE OSTRZEŻEŃ: nic mu nie wygasa, więc mail „kończy się
  -- za trzy dni" byłby nieprawdą wysłaną z naszej poczty.
  WHERE COALESCE(sp.agent_dozywotni, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM billing_ostrzezenia o
    WHERE o.subscription_id = z.id AND o.prog_dni = z.prog AND o.dotyczy_daty = z.koniec
  )
  AND COALESCE(NULLIF(sp.owner_email, ''), NULLIF(sp.company_email, ''), u.email) IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.billing_do_ostrzezenia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_do_ostrzezenia() TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM service_providers WHERE agent_dozywotni)          AS kont_dozywotnich,
  (SELECT string_agg(company_name, ', ') FROM service_providers
    WHERE agent_dozywotni)                                                AS ktore,
  (SELECT agent_moze_odbierac(id)::text FROM service_providers
    WHERE agent_dozywotni LIMIT 1)                                        AS demo_moze_odbierac,
  (SELECT voice_odmowic_brak_minut(id)::text FROM service_providers
    WHERE agent_dozywotni LIMIT 1)                                        AS demo_odmowa_ma_byc_false,
  (SELECT grace_period_days::text FROM billing_settings WHERE id = true)  AS karencja_dni;
