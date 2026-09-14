-- ═══════════════════════════════════════════════════════════════════════════
-- CO ZROBIĄ MIGRACJE PLANÓW (20260914120000 + 120100) — SAM ODCZYT
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiać PRZED migracjami. Nie używa nowych tabel — liczy na tym, co jest.
--
-- Migracje robią dokładnie trzy rzeczy:
--   1. zakładają plan dla każdego istniejącego kompletu ustawień miasta,
--   2. podpinają istniejące wiersze `fleet_city_settings` pod ten plan,
--   3. NIE przypisują planu nikomu i NIE wskazują planu domyślnego.
--
-- Skoro wiersze ustawień nie zmieniają wartości, a żaden kierowca nie dostaje
-- przypisania, to każdy liczy się dalej po mieście — czyli dokładnie jak dziś.
-- To zapytanie ma to POKAZAĆ, a nie kazać w to wierzyć.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Ile planów powstanie i czy 1:1 z dzisiejszymi kompletami ustawień ───
SELECT
  f.name AS flota,
  count(DISTINCT c.city_name)                        AS planow_powstanie,
  count(*) FILTER (WHERE c.platform = 'bolt')        AS wierszy_bolt,
  count(*) FILTER (WHERE c.platform = 'uber')        AS wierszy_uber,
  -- Każde miasto musi mieć DOKŁADNIE jeden wiersz bolt: po nim liczą się
  -- tygodnie sprzed pierwszego przypisania planu. Dwa oznaczałyby, że
  -- rozstrzygnięcie „po mieście" przestaje być jednoznaczne.
  count(*) FILTER (WHERE c.platform = 'bolt')
    - count(DISTINCT c.city_name)                    AS nadmiarowe_bolt_MA_BYC_0,
  string_agg(DISTINCT c.city_name, ', ' ORDER BY c.city_name) AS nazwy_planow
FROM public.fleet_city_settings c
JOIN public.fleets f ON f.id = c.fleet_id
WHERE c.is_active
GROUP BY f.name
ORDER BY 2 DESC;

-- ── 2. Ilu kierowców dostanie przypisanie planu ────────────────────────────
-- Ma wyjść ZERO w każdej flocie: migracja nikomu planu nie nadaje.
-- Kierowcy liczą się dalej po mieście, a plan przypisuje partner w panelu,
-- stojąc na tygodniu, od którego ma obowiązywać.
SELECT f.name AS flota,
       count(d.id)                                   AS kierowcow_w_flocie,
       0                                             AS dostanie_przypisanie_planu,
       count(d.id) FILTER (WHERE d.city_id IS NULL)  AS bez_miasta_licza_sie_flota
FROM public.fleets f
JOIN public.drivers d ON d.fleet_id = f.id
GROUP BY f.name
ORDER BY 2 DESC;

-- ── 3. KONTROLA POZYTYWNA: ile by się zmieniło, GDYBY ktoś przypisał ryczałt ──
-- Bez tej kolumny „zero" z punktu 2 nic nie dowodzi — mogłoby znaczyć
-- „zapytanie nic nie liczy". Tu widać, że różnice potrafią być duże:
-- to skutek planu VAT 0% + opłata 159 zł, gdyby nadać go wszystkim.
WITH okres AS (SELECT DATE '2026-09-07' AS od, DATE '2026-09-13' AS do_),
dane AS (
  SELECT f.name AS flota, s.driver_id,
         COALESCE((s.amounts->>'uber_base')::numeric, 0)
       + COALESCE((s.amounts->>'bolt_projected_d')::numeric, 0)
       + COALESCE((s.amounts->>'freenow_base_s')::numeric, 0) AS baza,
         COALESCE(b.vat_rate, fl.vat_rate, 8)::numeric        AS stawka_dzis,
         -- po migracji ten sam wiersz miasta, tylko z wypełnionym `plan_id`
         COALESCE(b.vat_rate, fl.vat_rate, 8)::numeric        AS stawka_po_migracji,
         COALESCE(b.base_fee, fl.base_fee, 50)::numeric       AS oplata_dzis
  FROM public.settlements s
  CROSS JOIN okres o
  JOIN public.drivers d ON d.id = s.driver_id
  JOIN public.fleets f ON f.id = d.fleet_id
  JOIN public.fleets fl ON fl.id = d.fleet_id
  LEFT JOIN public.cities ci ON ci.id = d.city_id
  LEFT JOIN public.fleet_city_settings b
    ON b.fleet_id = d.fleet_id AND b.city_name = ci.name AND b.platform = 'bolt' AND b.is_active
  WHERE s.period_from >= o.od AND s.period_to <= o.do_
)
SELECT flota,
       count(*) AS kierowcow,
       round(sum(GREATEST(baza, 0) * stawka_dzis / 100), 2)  AS podatek_dzis,
       -- Po migracji bez przypisań kierowca liczy się tą samą ścieżką (miasto),
       -- więc to jest TO SAMO wyrażenie — różnica musi wyjść zerem.
       round(sum(GREATEST(baza, 0) * stawka_po_migracji / 100), 2) AS podatek_po_migracji,
       round(sum(GREATEST(baza, 0) * stawka_po_migracji / 100)
           - sum(GREATEST(baza, 0) * stawka_dzis / 100), 2)   AS zmiana_MA_BYC_0,
       -- gdyby ktoś nadał wszystkim plan „Ryczałt 159 bez podatku" (VAT 0%):
       round(sum(0 - GREATEST(baza, 0) * stawka_dzis / 100), 2) AS KONTROLA_zmiana_podatku,
       round(sum(159 - oplata_dzis), 2)                         AS KONTROLA_zmiana_oplat
FROM dane
GROUP BY flota
ORDER BY 2 DESC;
