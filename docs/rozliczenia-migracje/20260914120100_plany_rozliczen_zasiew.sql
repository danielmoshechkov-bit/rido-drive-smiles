-- Plany rozliczeń — DANE i WIĘZY. Uruchamiać PO `20260914120000`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO Z TYM, CO JUŻ JEST (trzy pytania z CLAUDE.md)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ILE WIERSZY POWSTAŁO PO STAREMU: 10 wierszy `fleet_city_settings`
--    (5 miast × Bolt/Uber) w dwóch flotach — Car4Ride (Warszawa), Flame Partner
--    (Lublin, Wrocław, Zamość) i „dasdsa" (Kraków). Zero przypisań planów,
--    bo tabela właśnie powstała.
-- 2. NAPRAWIAMY CZY ZOSTAWIAMY: każdy istniejący komplet ustawień dostaje plan
--    o nazwie swojego miasta. Wartości NIE są kopiowane ani przeliczane —
--    te same wiersze dostają tylko rodzica. Żadna stawka nie zmienia
--    właściciela, więc żadna kwota się nie rusza.
-- 3. CO, GDY STAN SIĘ ZMIENIŁ: zasiew pomija miasta, które plan już mają
--    (`plan_id IS NOT NULL`), a kontrola na końcu pada, gdy po wszystkim
--    zostanie choć jeden wiersz bez rodzica.
--
-- PRZYPISAŃ NIE ROBIMY NIKOMU. Dotychczasowi kierowcy zostają bez planu, czyli
-- liczą się po ustawieniach miasta — dokładnie jak dziś. Plan przypisuje
-- partner w panelu, stojąc na tygodniu, od którego ma obowiązywać.
--
-- PLANU DOMYŚLNEGO TEŻ NIE WSKAZUJEMY. Przełącznik „domyślny" jest decyzją
-- partnera, nie zgadywanką migracji: dopóki go nie włączy, nowy kierowca
-- liczy się po mieście, tak jak dotąd.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Kontrola wstępna: czy da się nadać nazwy jednoznacznie ─────────────────
DO $$
DECLARE v_kolizje text;
BEGIN
  SELECT string_agg(DISTINCT city_name, ', ') INTO v_kolizje
  FROM public.fleet_city_settings
  WHERE plan_id IS NULL AND city_name IS NULL;

  IF EXISTS (SELECT 1 FROM public.fleet_city_settings WHERE plan_id IS NULL AND city_name IS NULL) THEN
    RAISE EXCEPTION 'Są ustawienia bez miasta i bez planu — nie ma z czego zrobić nazwy planu';
  END IF;
END $$;

-- ── 1. Plan dla każdego istniejącego kompletu ustawień miasta ──────────────
INSERT INTO public.fleet_settlement_plans (fleet_id, name, city_name, is_default, is_active)
SELECT DISTINCT c.fleet_id, c.city_name, c.city_name, false, true
FROM public.fleet_city_settings c
WHERE c.plan_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.fleet_settlement_plans p
    WHERE p.fleet_id = c.fleet_id AND p.name = c.city_name
  );

-- ── 2. Wiersze Bolt/Uber trafiają pod swój plan ────────────────────────────
UPDATE public.fleet_city_settings c
   SET plan_id = p.id
  FROM public.fleet_settlement_plans p
 WHERE p.fleet_id = c.fleet_id
   AND p.name = c.city_name
   AND c.plan_id IS NULL;

-- ── 3. Więzy — dopiero teraz, gdy dane są kompletne ────────────────────────
-- Stara unikalność blokowała dwa plany dla tego samego miasta. Od teraz
-- „Warszawa 8% + 50" i „Ryczałt 159" mogą stać obok siebie w jednym mieście.
ALTER TABLE public.fleet_city_settings
  DROP CONSTRAINT IF EXISTS fleet_city_settings_fleet_id_city_name_platform_key;

-- Jeden komplet Bolt i jeden Uber na plan.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_city_settings_plan_platform
  ON public.fleet_city_settings (plan_id, platform)
  WHERE plan_id IS NOT NULL;

-- Nazwy planów muszą się różnić — po nazwie wybiera się plan przy kierowcy.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_settlement_plans_nazwa_na_flote
  ON public.fleet_settlement_plans (fleet_id, lower(name));

-- Jeden plan domyślny na flotę.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_settlement_plans_jeden_domyslny
  ON public.fleet_settlement_plans (fleet_id)
  WHERE is_default = true AND is_active = true;

-- ---------------------------------------------------------------------------
-- Kontrola SKUTKU — na danych, nie na treści zapytań
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sieroty integer; v_planow integer; v_miast integer; v_przypisan integer;
BEGIN
  SELECT count(*) INTO v_sieroty FROM public.fleet_city_settings WHERE plan_id IS NULL;
  IF v_sieroty > 0 THEN
    RAISE EXCEPTION 'Ustawienia bez planu po zasiewie: % wierszy', v_sieroty;
  END IF;

  SELECT count(DISTINCT (fleet_id, city_name)) INTO v_miast FROM public.fleet_city_settings;
  SELECT count(*) INTO v_planow FROM public.fleet_settlement_plans;
  IF v_planow <> v_miast THEN
    RAISE EXCEPTION 'Planów % przy % kompletach ustawień — zasiew nie trafił 1:1', v_planow, v_miast;
  END IF;

  -- Migracja NIE ma prawa nikomu przypisać planu ani wskazać domyślnego:
  -- to zmieniłoby kwoty albo zachowanie przy dodawaniu kierowcy.
  SELECT count(*) INTO v_przypisan FROM public.driver_plan_assignments;
  IF v_przypisan > 0 THEN
    RAISE EXCEPTION 'Powstało % przypisań planu — migracja miała nie przypisywać nikomu', v_przypisan;
  END IF;

  IF EXISTS (SELECT 1 FROM public.fleet_settlement_plans WHERE is_default) THEN
    RAISE EXCEPTION 'Migracja wskazała plan domyślny — to decyzja partnera, nie migracji';
  END IF;

  RAISE NOTICE 'OK: % planów z % kompletów ustawień, zero przypisań, zero planów domyślnych.', v_planow, v_miast;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- SPRAWDZENIE PO URUCHOMIENIU (osobnym przebiegiem — „Success" nie jest dowodem)
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT f.name AS flota, p.name AS plan, p.city_name, p.is_default,
--        max(CASE WHEN c.platform='bolt' THEN c.vat_rate END)  AS vat_bolt,
--        max(CASE WHEN c.platform='bolt' THEN c.base_fee END)  AS oplata_bolt,
--        max(CASE WHEN c.platform='uber' THEN c.vat_rate END)  AS vat_uber,
--        count(c.id) AS wierszy
-- FROM public.fleet_settlement_plans p
-- JOIN public.fleets f ON f.id = p.fleet_id
-- LEFT JOIN public.fleet_city_settings c ON c.plan_id = p.id
-- GROUP BY 1,2,3,4 ORDER BY 1,2;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WYCOFANIE
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS public.fleet_settlement_plans_jeden_domyslny;
-- DROP INDEX IF EXISTS public.fleet_settlement_plans_nazwa_na_flote;
-- DROP INDEX IF EXISTS public.fleet_city_settings_plan_platform;
-- UPDATE public.fleet_city_settings SET plan_id = NULL;
-- DELETE FROM public.fleet_settlement_plans;
-- ALTER TABLE public.fleet_city_settings
--   ADD CONSTRAINT fleet_city_settings_fleet_id_city_name_platform_key
--   UNIQUE (fleet_id, city_name, platform);
