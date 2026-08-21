-- Wariant A, krok 2 z 3: plan okresu próbnego dla linii warsztatowej.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO NOWY PLAN, SKORO `trial_max` ISTNIEJE
-- ═══════════════════════════════════════════════════════════════════════════
-- `trial_max` ma `product_line = 'other'` — i to jest decyzja, nie przeoczenie:
-- migracja 20260810180000 zostawiła tam pakiety łączone, bo łączenie linii
-- w jednym planie przestało być modelem, który wspieramy.
--
-- Tymczasem `moze_pracowac` szuka wiersza po `product_line = 'warsztat'`.
-- Subskrypcja na `trial_max` byłaby dla bramki NIEWIDOCZNA: funkcja zeszłaby
-- do gałęzi zapasowej i cały wariant A nie zmieniłby niczego.
--
-- Stąd osobny plan próbny w linii warsztatowej. `is_active = false`: nie ma się
-- pokazywać w cenniku ani dawać kupić — ma być przypisywalny. Tak samo jak
-- `trial_max`, którego ta flaga nie wyłącza z uprawnień (`billing_active_plan`
-- nie filtruje po `is_active`).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ZAKRES: ODWZOROWANIE `warsztat_pro`, KOPIOWANE, NIE PRZEPISYWANE
-- ═══════════════════════════════════════════════════════════════════════════
-- Macierz funkcji KOPIUJĘ z `warsztat_pro` zapytaniem, zamiast wypisywać
-- kilkanaście wierszy z ręki. Powód praktyczny: limity zmieniały się już w tej
-- bazie (VIN zszedł do zera we wszystkich planach), a lista przepisana literałami
-- rozjechałaby się przy pierwszej kolejnej zmianie. Kopia bierze stan na dziś,
-- jakikolwiek jest.
--
-- Dlaczego Pro, a nie MAX: MAX zawiera linię Agenta, a Agent jest osobnym
-- produktem z własnym pakietem. Okres próbny warsztatu ma dawać najwyższy plan
-- WARSZTATU i nic ponad to.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Plan
-- ---------------------------------------------------------------------------
-- `trial_days` bierzemy z `warsztat_pro`, żeby obietnica ze strony i długość
-- okresu w bazie miały jedno źródło — tak samo jak robi to `_shared/workshopTrial.ts`.
INSERT INTO public.billing_plans
  (code, name, description, subscriber_type, price_net, vat_rate, billing_interval,
   trial_days, is_custom, is_active, sort_order)
SELECT
  'trial_warsztat',
  'Okres próbny — Warsztat',
  'Pełny zakres planu Pro na czas okresu próbnego. Nie do kupienia — przypisywany automatycznie.',
  p.subscriber_type, 0, p.vat_rate, p.billing_interval,
  p.trial_days, false, false, 95
FROM public.billing_plans p
WHERE p.code = 'warsztat_pro'
ON CONFLICT (code) DO NOTHING;

-- Linia produktowa: kolumna ma wartość domyślną 'other', a wpis wyżej jej nie
-- podaje. Bez tego plan byłby niewidoczny dla bramki — czyli dokładnie ten błąd,
-- przed którym ta migracja ma chronić.
UPDATE public.billing_plans SET product_line = 'warsztat' WHERE code = 'trial_warsztat';

-- ---------------------------------------------------------------------------
-- 2. Macierz funkcji — kopia z Pro
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value)
SELECT nowy.id, f.feature_id, f.is_enabled, f.limit_value
FROM public.billing_plan_features f
JOIN public.billing_plans pro  ON pro.id  = f.plan_id AND pro.code  = 'warsztat_pro'
CROSS JOIN LATERAL (SELECT id FROM public.billing_plans WHERE code = 'trial_warsztat') nowy
ON CONFLICT (plan_id, feature_id) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled,
      limit_value = EXCLUDED.limit_value,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_linia text; v_cech integer; v_cech_pro integer;
BEGIN
  SELECT product_line::text INTO v_linia FROM billing_plans WHERE code = 'trial_warsztat';
  IF v_linia IS DISTINCT FROM 'warsztat' THEN
    RAISE EXCEPTION 'trial_warsztat ma linię % — bramka by go nie zobaczyła', COALESCE(v_linia, 'BRAK PLANU');
  END IF;

  SELECT count(*) INTO v_cech      FROM billing_plan_features f
    JOIN billing_plans p ON p.id = f.plan_id WHERE p.code = 'trial_warsztat';
  SELECT count(*) INTO v_cech_pro  FROM billing_plan_features f
    JOIN billing_plans p ON p.id = f.plan_id WHERE p.code = 'warsztat_pro';

  IF v_cech <> v_cech_pro OR v_cech = 0 THEN
    RAISE EXCEPTION 'macierz próbnego (%) nie odpowiada Pro (%)', v_cech, v_cech_pro;
  END IF;

  -- Plan próbny nie może dać się kupić z cennika.
  IF EXISTS (SELECT 1 FROM billing_plans WHERE code = 'trial_warsztat' AND is_active) THEN
    RAISE EXCEPTION 'trial_warsztat jest aktywny — pokazałby się w cenniku';
  END IF;

  RAISE NOTICE 'trial_warsztat: linia warsztat, % funkcji jak w Pro, poza cennikiem', v_cech;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
