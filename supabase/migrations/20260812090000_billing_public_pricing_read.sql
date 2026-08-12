-- ============================================================================
-- BILLING 3.3 — cennik czytelny dla niezalogowanego gościa.
--
-- Etap 1 dał na billing_plans / billing_features / billing_plan_features
-- wyłącznie polityki `TO authenticated`. Strona /cennik jest publiczna, więc
-- bez tej migracji gość zobaczyłby pustą stronę, a zalogowany pełną — czyli
-- najgorszy możliwy wariant: cennik działający tylko dla tych, którzy już są
-- klientami.
--
-- Nie ma tu nic wrażliwego. Nazwy planów, ceny i limity są dokładnie tym, co
-- ma stać na stronie ofertowej. Subskrypcje, zużycie, ustawienia i audyt
-- zostają zamknięte przed anon tak jak były.
-- ============================================================================

BEGIN;

-- Plan widoczny w ofercie = plan aktywny. Dezaktywacja planu (nasze „usunięcie")
-- natychmiast zdejmuje go z cennika, nie ruszając subskrypcji.
CREATE POLICY billing_plans_select_public ON public.billing_plans
  FOR SELECT TO anon
  USING (is_active);

CREATE POLICY billing_features_select_public ON public.billing_features
  FOR SELECT TO anon
  USING (is_active);

-- Macierz wyłącznie dla planów widocznych w ofercie. Polityka dla `authenticated`
-- ma tu USING (true); dla gościa zawężamy, żeby zakres wycofanych pakietów nie
-- wyciekał w odpowiedzi PostgREST.
CREATE POLICY billing_plan_features_select_public ON public.billing_plan_features
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_plans p
      WHERE p.id = billing_plan_features.plan_id
        AND p.is_active
    )
  );

-- Druga warstwa. Zapis dla anon został odebrany w etapie 1 i tak zostaje —
-- tutaj dokładamy wyłącznie odczyt tych trzech tabel.
GRANT SELECT ON public.billing_plans         TO anon;
GRANT SELECT ON public.billing_features      TO anon;
GRANT SELECT ON public.billing_plan_features TO anon;

COMMIT;
