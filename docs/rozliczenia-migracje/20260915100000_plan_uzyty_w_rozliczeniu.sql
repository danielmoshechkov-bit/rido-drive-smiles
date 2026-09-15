-- Rozliczenie pamięta, KTÓRYM PLANEM policzono jego kwoty.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POWÓD (15.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Plan obowiązuje od wskazanego tygodnia W PRZÓD. Zmiana zrobiona na tygodniu 30
-- dotyczy więc także 31, 32, 33… — ale kwoty zapisane w bazie dla tamtych
-- tygodni (`actual_payout`, łańcuch długu) zostały policzone starym planem
-- i nikt ich automatycznie nie przelicza. I słusznie: część tych tygodni jest
-- już wypłacona, więc przeliczenie ma być decyzją człowieka, nie skutkiem
-- ubocznym zmiany planu.
--
-- Żeby ta decyzja była świadoma, trzeba WIDZIEĆ rozjazd. Ta kolumna zapisuje,
-- którym planem policzono kwoty siedzące w wierszu. Panel porównuje ją z planem
-- obowiązującym dla tego kierowcy w tym tygodniu i przy różnicy stawia
-- wykrzyknik z jednym kliknięciem „przelicz”.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO ZNACZY PUSTKA
-- ═══════════════════════════════════════════════════════════════════════════
-- NULL = „policzone bez planu" — czyli po ustawieniach miasta, tak jak liczyły
-- się wszystkie rozliczenia przed wprowadzeniem planów. To NIE jest „nie wiadomo":
-- kierowca bez przypisania ma dziś dokładnie ten stan, więc NULL vs NULL nie
-- zapala wykrzyknika i istniejące 3033 wiersze nie zmieniają wyglądu panelu.
--
-- Wykrzyknik zapali się wyłącznie tam, gdzie kierowca MA przypisany plan,
-- a kwoty są sprzed tego przypisania — czyli dokładnie w tygodniach, które
-- wymagają decyzji.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SPRAWDZIŁEM
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. KTO CZYTA `settlements`: front (FleetSettlementsView, DriverSettlements,
--    DriverDebtHistory…) czyta `select('*')`, funkcje brzegowe wymieniają kolumny
--    z nazwy. Nowa kolumna niczego im nie psuje.
-- 2. DRUGI KLUCZ OBCY: `settlements` nie ma dziś żadnego klucza do
--    `fleet_settlement_plans`, więc nowy jest jedyny — nie ma czego uczynić
--    niejednoznacznym w osadzeniach PostgREST.
-- 3. WIĘZ NA DANYCH: kolumna jest nullowalna i nie wchodzi w żaden indeks
--    unikalny, więc nie ma jak paść na danych zastanych.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS settlement_plan_id_uzyty uuid
  REFERENCES public.fleet_settlement_plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.settlements.settlement_plan_id_uzyty IS
  'Plan, którym policzono kwoty w tym wierszu. NULL = policzone po ustawieniach miasta (stan sprzed planów). Różnica wobec planu obowiązującego w tym tygodniu zapala w panelu wykrzyknik „wymaga przeliczenia".';

-- Panel pyta o to zawsze razem z kierowcą i okresem, a te kolumny mają już
-- swoje indeksy — osobnego nie zakładamy, żeby nie dokładać kosztu zapisu.

-- ---------------------------------------------------------------------------
-- Kontrola
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_kolumna integer;
  v_niepuste integer;
BEGIN
  SELECT count(*) INTO v_kolumna FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'settlements'
    AND column_name = 'settlement_plan_id_uzyty';
  IF v_kolumna <> 1 THEN
    RAISE EXCEPTION 'Kolumna settlement_plan_id_uzyty nie powstała';
  END IF;

  -- Migracja niczego nie wypełnia: stempel stawia dopiero przeliczenie.
  -- Gdyby tu coś było, znaczyłoby to, że ktoś dopisał wypełnienie wsteczne —
  -- a ono skłamałoby, którym planem naprawdę policzono stare kwoty.
  SELECT count(*) INTO v_niepuste FROM public.settlements
  WHERE settlement_plan_id_uzyty IS NOT NULL;
  IF v_niepuste > 0 THEN
    RAISE EXCEPTION 'Kolumna wypełniona w % wierszach — migracja miała zostawić NULL', v_niepuste;
  END IF;

  RAISE NOTICE 'OK: kolumna na miejscu, wszystkie wiersze z NULL (policzone bez planu).';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- SPRAWDZENIE PO URUCHOMIENIU (osobnym przebiegiem)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ilu kierowców w ilu tygodniach zapali wykrzyknik (plan obowiązuje, a kwoty
-- są sprzed niego). Uruchomić PRZED i PO przeliczaniu, żeby zobaczyć różnicę:
--
-- SELECT s.period_from, count(*) AS wymaga_przeliczenia
-- FROM public.settlements s
-- JOIN public.drivers d ON d.id = s.driver_id
-- LEFT JOIN LATERAL (
--   SELECT a.plan_id FROM public.driver_plan_assignments a
--   WHERE a.driver_id = s.driver_id AND a.effective_from <= s.period_from
--   ORDER BY a.effective_from DESC LIMIT 1
-- ) obowiazujacy ON true
-- WHERE obowiazujacy.plan_id IS DISTINCT FROM s.settlement_plan_id_uzyty
-- GROUP BY 1 ORDER BY 1 DESC;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WYCOFANIE
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.settlements DROP COLUMN IF EXISTS settlement_plan_id_uzyty;
