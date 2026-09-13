-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 WYCENA ZNAŁA TYLKO LINIĘ WARSZTATOWĄ — przyciski płatności były martwe
-- ═══════════════════════════════════════════════════════════════════════════
--
-- OBJAW ZGŁOSZONY PRZEZ WŁAŚCICIELA: w oknie zakupu pakietu Agent pojawia się
-- wybór metody płatności, ale kliknięcie „Zapłać BLIK-iem" albo „Zapłać kartą"
-- nie robi NIC. Bez przekierowania, bez komunikatu, bez błędu w konsoli.
--
-- DOWÓD Z LOGÓW (nie z domysłu): w ciągu pięciu godzin obejmujących test
-- w rejestrze funkcji brzegowych NIE MA ANI JEDNEGO wywołania
-- `billing-checkout` ani `billing-payu-order`. Z przeglądarki nie wychodziło
-- nic — więc pękało PRZED żądaniem.
--
-- PRZYCZYNA. Oba przyciski stoją pod `disabled={!!wysylka || !cena}`, a `cena`
-- pochodzi z tej funkcji. Dla pakietu agenta funkcja podnosiła wyjątek:
--
--     PLAN_NIEZNANY: agent
--
-- bo szukała planu tak:
--
--     SELECT * INTO v_plan FROM billing_plans
--     WHERE code = p_plan_code AND product_line = 'warsztat';   -- ⬅ TU
--
-- Hak `useCenaOkresu` traktuje brak wyceny jako poprawną odpowiedź „tego nie
-- da się kupić" (tak zachowuje się plan darmowy i indywidualny), więc zwracał
-- `null` bez słowa. Okno wyłączało oba przyciski i czekało. Klient widział
-- ekran, który wygląda na gotowy, i klikał w martwy przycisk.
--
-- TO JEST TEN SAM BŁĄD, który tydzień temu zablokował okno zakupu w froncie:
-- ŚCIEŻKA SPRZEDAŻY ZAKŁADAŁA JEDNĄ LINIĘ PRODUKTOWĄ. Tam stało
-- `filter(p => p.product_line === 'warsztat')`, tutaj `AND product_line =
-- 'warsztat'`. Naprawiliśmy front, a baza została z tym samym założeniem —
-- i przejęła rolę ściany.
--
-- NAPRAWA. Plan szukany po samym kodzie. `billing_plans_code_key` pilnuje, że
-- kod jest unikalny w całej tabeli, więc nie ma czego rozstrzygać między
-- liniami. Gwarancja ceny czytana z subskrypcji W TEJ SAMEJ LINII co plan —
-- gwarancja na abonament warsztatowy nie ma prawa ustalać ceny agenta.
--
-- CZEGO NIE ZMIENIAM: rabatu rocznego (dziesięć miesięcy płatnych za dwanaście
-- dostępu), zaokrągleń ani kształtu wyniku. Jedyna zmiana to KTÓRE plany
-- funkcja w ogóle widzi.

CREATE OR REPLACE FUNCTION public.billing_cena_okresu(
  p_plan_code text,
  p_provider  uuid,
  p_okres     text DEFAULT 'miesiac'::text
)
RETURNS TABLE(
  plan_id uuid, nazwa text, okres text, miesiecy integer,
  cena_netto numeric, vat_rate numeric, cena_brutto numeric,
  bez_rabatu_netto numeric, bez_rabatu_brutto numeric, po_gwarancji boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- ⬇ JEDYNE MIEJSCE, w którym stoi rabat roczny.
  c_miesiecy_platnych constant integer := 10;
  c_miesiecy_dostepu  constant integer := 12;

  v_plan      billing_plans%ROWTYPE;
  v_gwarancja timestamptz;
  v_ma_sub    boolean;
  v_mies      numeric;   -- cena za jeden miesiąc, po gwarancji albo startowa
  v_mnoznik   integer;
BEGIN
  IF p_okres NOT IN ('miesiac', 'rok') THEN
    RAISE EXCEPTION 'OKRES_NIEZNANY: %', p_okres;
  END IF;

  -- PLAN SZUKANY PO SAMYM KODZIE — bez zakładania linii produktowej.
  -- `billing_plans_code_key` (UNIQUE na `code`) gwarantuje jednoznaczność.
  SELECT * INTO v_plan FROM billing_plans
  WHERE code = p_plan_code;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'PLAN_NIEZNANY: %', p_plan_code;
  END IF;
  IF v_plan.is_custom OR COALESCE(v_plan.price_net, 0) <= 0 THEN
    -- Plan indywidualny wyceniamy rozmową, darmowy nie ma czego sprzedawać.
    RAISE EXCEPTION 'PLAN_NIE_DO_KUPIENIA: %', p_plan_code;
  END IF;

  -- GWARANCJA CENY Z TEJ SAMEJ LINII CO PLAN.
  --
  -- Wcześniej stało tu `AND s.product_line = 'warsztat'` — a to znaczyłoby, że
  -- warsztat z rocznym stażem na abonamencie warsztatowym kupuje agenta od razu
  -- po cenie docelowej, choć agenta widzi pierwszy raz w życiu. Gwarancja jest
  -- własnością konkretnego produktu, nie konta.
  SELECT s.price_guarantee_until, true INTO v_gwarancja, v_ma_sub
  FROM billing_subscriptions s
  WHERE s.subscriber_type = 'service_provider'
    AND s.subscriber_id = p_provider
    AND s.product_line = v_plan.product_line
  ORDER BY s.created_at DESC LIMIT 1;

  -- Gwarancja biegnie od PIERWSZEGO zakupu klienta i obowiązuje przez rok,
  -- niezależnie od tego, czy kupował miesiącami, czy rokiem. Jedna reguła:
  -- cena startowa przez pierwszy rok, potem docelowa.
  po_gwarancji := COALESCE(v_ma_sub, false)
                  AND v_gwarancja IS NOT NULL
                  AND v_gwarancja < now()
                  AND v_plan.price_net_target IS NOT NULL;

  v_mies := CASE WHEN po_gwarancji THEN v_plan.price_net_target ELSE v_plan.price_net END;

  IF p_okres = 'rok' THEN
    v_mnoznik := c_miesiecy_platnych;
    miesiecy  := c_miesiecy_dostepu;
  ELSE
    v_mnoznik := 1;
    miesiecy  := 1;
  END IF;

  plan_id           := v_plan.id;
  nazwa             := v_plan.name;
  okres             := p_okres;
  cena_netto        := round(v_mies * v_mnoznik, 2);
  vat_rate          := v_plan.vat_rate;
  -- Zaokrąglenie na kwocie BRUTTO, nie na składnikach: to ona jest pobierana
  -- i to ona musi zgadzać się z fakturą co do grosza.
  cena_brutto       := round(v_mies * v_mnoznik * (1 + v_plan.vat_rate / 100), 2);
  bez_rabatu_netto  := round(v_mies * miesiecy, 2);
  bez_rabatu_brutto := round(v_mies * miesiecy * (1 + v_plan.vat_rate / 100), 2);
  RETURN NEXT;
END;
$function$;

-- Uprawnienia jak dotąd: wycenę czyta zalogowany klient w oknie zakupu.
-- Wymienione z nazwy, bo `FROM public` nie odbiera nadań `anon`/`authenticated`
-- (patrz CLAUDE.md, sekcja o REVOKE).
REVOKE ALL ON FUNCTION public.billing_cena_okresu(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_cena_okresu(text, uuid, text) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- KONTROLA — obie linie produktowe muszą się wyceniać.
-- ═══════════════════════════════════════════════════════════════════════════
-- Oczekiwane: trzy wiersze, kwoty brutto 306,27 / 490,77 / 207,87.
SELECT p.code, w.nazwa, w.cena_netto, w.cena_brutto, w.okres
FROM billing_plans p
CROSS JOIN LATERAL billing_cena_okresu(p.code, NULL, 'miesiac') w
WHERE p.code IN ('agent', 'agent_pro', 'warsztat_pro')
ORDER BY p.code;
