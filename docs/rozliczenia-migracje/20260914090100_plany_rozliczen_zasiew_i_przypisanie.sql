-- Plany rozliczeń: zasiew planów flot, przypisanie istniejącym kierowcom, więz.
--
-- Uruchamiać PO `20260914090000_plany_rozliczen_kierowcy.sql`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO OSOBNA MIGRACJA
-- ═══════════════════════════════════════════════════════════════════════════
-- CLAUDE.md: „Migracja zmieniająca FUNKCJĘ i zakładająca WIĘZ to dwie migracje".
-- Indeks unikalny (krok na danych) potrafi paść na tym, co zastanie, i wycofać
-- w tej samej transakcji poprawkę kodu — a przebieg i tak melduje „Success".
-- Tu pada wyłącznie ta migracja i wyłącznie z wypisaną listą winnych wierszy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO Z TYM, CO JUŻ NADANO (trzy pytania z CLAUDE.md)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ILE WIERSZY POWSTAŁO PO STAREMU: wszyscy kierowcy w bazie (263 w chwili
--    pisania) nie mają żadnego planu — kolumna właśnie powstała.
-- 2. NAPRAWIAMY CZY ZOSTAWIAMY: naprawiamy, ale w sposób, który NIE ZMIENIA
--    ŻADNEJ KWOTY. Plan „Podstawowy" ma wszystkie pola puste, czyli zostawia
--    stawkę i opłatę miasta dokładnie takie, jakie są dzisiaj. Gdyby zamiast
--    tego wpisać do planu stawki floty, kierowcy z miast o innych stawkach
--    policzyliby się od poniedziałku inaczej — po cichu.
-- 3. CO, GDY STAN SIĘ ZMIENIŁ: przypisujemy tylko tam, gdzie
--    `settlement_plan_id IS NULL`. Ręcznie ustawiony plan zostaje nietknięty.
--
-- Drugi plan („Ryczałt 159 zł bez podatku") powstaje pusty — nikt go nie
-- dostaje automatycznie. To partner wskazuje kierowców w panelu.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Kontrola wstępna: czy któraś flota ma już dwa plany domyślne ────────────
-- Indeks niżej i tak by to złapał, ale na komunikacie o kluczu, bez nazw.
DO $$
DECLARE v_kolizje text;
BEGIN
  SELECT string_agg(fleet_id::text, ', ') INTO v_kolizje
  FROM (
    SELECT fleet_id FROM public.settlement_plans
    WHERE is_default = true AND fleet_id IS NOT NULL
    GROUP BY fleet_id HAVING count(*) > 1
  ) k;

  IF v_kolizje IS NOT NULL THEN
    RAISE EXCEPTION 'Te floty mają już po kilka planów domyślnych: %. Zostaw po jednym i uruchom ponownie.', v_kolizje;
  END IF;
END $$;

-- ── 1. Plan „Podstawowy" dla każdej floty, która ma kierowców ──────────────
-- Wszystkie pola puste = „licz jak dotąd, po ustawieniach miasta".
INSERT INTO public.settlement_plans
  (name, fleet_id, tax_enabled, tax_percentage, base_fee, settlement_mode, service_fee, is_default, is_active, is_visible, description)
SELECT
  'Podstawowy (stawki miasta)',
  f.id,
  true,
  NULL,
  NULL,
  NULL,
  0,
  true,
  true,
  true,
  'Plan domyślny: podatek i opłata według ustawień miasta kierowcy. Przypisanie tego planu niczego nie przelicza.'
FROM public.fleets f
WHERE EXISTS (SELECT 1 FROM public.drivers d WHERE d.fleet_id = f.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.settlement_plans p
    WHERE p.fleet_id = f.id AND p.is_default = true
  );

-- ── 2. Plan ryczałtowy — gotowy do wskazania, nikomu nie przypisany ────────
INSERT INTO public.settlement_plans
  (name, fleet_id, tax_enabled, tax_percentage, base_fee, settlement_mode, service_fee, is_default, is_active, is_visible, description)
SELECT
  'Ryczałt 159 zł (bez podatku)',
  f.id,
  false,
  NULL,
  159,
  NULL,
  0,
  false,
  true,
  true,
  'Opłata stała 159 zł tygodniowo, podatek nie jest naliczany. Odliczenia 50% VAT od paliwa też nie ma — paliwo potrącane w pełnej kwocie.'
FROM public.fleets f
WHERE EXISTS (SELECT 1 FROM public.drivers d WHERE d.fleet_id = f.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.settlement_plans p
    WHERE p.fleet_id = f.id AND p.tax_enabled = false
  );

-- ── 3. Istniejący kierowcy dostają plan domyślny SWOJEJ floty ──────────────
UPDATE public.drivers d
   SET settlement_plan_id = p.id
  FROM public.settlement_plans p
 WHERE p.fleet_id = d.fleet_id
   AND p.is_default = true
   AND p.is_active = true
   AND d.settlement_plan_id IS NULL
   AND d.fleet_id IS NOT NULL;

-- ── 4. Więz: jeden plan domyślny na flotę ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS settlement_plans_jeden_domyslny_na_flote
  ON public.settlement_plans (fleet_id)
  WHERE is_default = true AND fleet_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Kontrola SKUTKU — na danych, nie na treści zapytań
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bez_planu integer;
  v_flot      integer;
  v_planow    integer;
  v_zmieniaja integer;
BEGIN
  SELECT count(*) INTO v_flot FROM public.fleets f
  WHERE EXISTS (SELECT 1 FROM public.drivers d WHERE d.fleet_id = f.id);

  SELECT count(*) INTO v_planow FROM public.settlement_plans
  WHERE fleet_id IS NOT NULL AND is_default = true;

  IF v_planow <> v_flot THEN
    RAISE EXCEPTION 'Plany domyślne: % przy % flotach z kierowcami', v_planow, v_flot;
  END IF;

  SELECT count(*) INTO v_bez_planu FROM public.drivers
  WHERE settlement_plan_id IS NULL AND fleet_id IS NOT NULL;
  IF v_bez_planu > 0 THEN
    RAISE EXCEPTION 'Kierowcy bez planu mimo wypełnienia wstecznego: %', v_bez_planu;
  END IF;

  -- Najważniejsze: żaden PRZYPISANY plan nie ma prawa zmieniać kwot.
  -- Plan domyślny z wypełnioną stawką albo opłatą przeliczyłby kierowców
  -- od najbliższego odświeżenia panelu — i nikt by tego nie zauważył.
  SELECT count(*) INTO v_zmieniaja FROM public.settlement_plans
  WHERE is_default = true AND fleet_id IS NOT NULL
    AND (tax_enabled = false OR tax_percentage IS NOT NULL
         OR base_fee IS NOT NULL OR settlement_mode IS NOT NULL);
  IF v_zmieniaja > 0 THEN
    RAISE EXCEPTION 'Plan domyślny ustala stawkę/opłatę (% szt.) — to zmieniłoby kwoty wszystkim', v_zmieniaja;
  END IF;

  RAISE NOTICE 'OK: % flot ma plan domyślny, wszyscy kierowcy przypisani, żadna kwota się nie zmienia.', v_flot;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- SPRAWDZENIE PO URUCHOMIENIU (osobnym przebiegiem — „Success" nie jest dowodem)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT f.name AS flota, p.name AS plan, p.tax_enabled, p.tax_percentage,
--        p.base_fee, p.is_default, count(d.id) AS kierowcow
-- FROM public.settlement_plans p
-- JOIN public.fleets f ON f.id = p.fleet_id
-- LEFT JOIN public.drivers d ON d.settlement_plan_id = p.id
-- GROUP BY f.name, p.name, p.tax_enabled, p.tax_percentage, p.base_fee, p.is_default
-- ORDER BY f.name, p.is_default DESC;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WYCOFANIE
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS public.settlement_plans_jeden_domyslny_na_flote;
-- UPDATE public.drivers SET settlement_plan_id = NULL
--  WHERE settlement_plan_id IN (SELECT id FROM public.settlement_plans WHERE fleet_id IS NOT NULL);
-- DELETE FROM public.settlement_plans WHERE fleet_id IS NOT NULL;
