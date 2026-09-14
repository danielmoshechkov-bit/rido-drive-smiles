-- ═══════════════════════════════════════════════════════════════════════════
-- CO ZMIENI MIGRACJA 3 (zasiew planów + przypisanie) — SAM ODCZYT, ZERO ZAPISU
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiać PRZED migracją. Nie używa kolumn, które dopiero powstaną
-- (`drivers.settlement_plan_id`, `settlement_plans.fleet_id`, `tax_enabled`) —
-- modeluje je literałami, dokładnie tak, jak zakłada je migracja.
--
-- Trzy scenariusze na TYCH SAMYCH danych, wzorem obowiązującym po wdrożeniu kodu:
--   PRZED    — plan tam, gdzie jest dziś: `driver_app_users.settlement_plan_id`.
--   PO       — plan „Podstawowy (stawki miasta)": wszystkie pola puste.
--   KONTROLA — plan „Ryczałt 159 zł": bez podatku, opłata 159.
--
-- KONTROLA POZYTYWNA: kolumny `kontrola_*` MUSZĄ być różne od zera. Jeśli i one
-- wyjdą zerowe, zapytanie jest zepsute, a jego „zero" w kolumnach `po_vs_przed_*`
-- nie dowodzi niczego. Zero ma znaczyć „nic się nie zmienia", nie „nic nie policzyłem".
--
-- Okres: ostatni tydzień z danymi. Zmień daty, żeby sprawdzić inny.
-- ═══════════════════════════════════════════════════════════════════════════
WITH okres AS (SELECT DATE '2026-09-07' AS od, DATE '2026-09-13' AS do_),

kier AS (
  SELECT d.id, d.fleet_id, f.name AS flota,
         d.first_name || ' ' || d.last_name AS kierowca,
         d.custom_weekly_fee, d.fuel_card_number,
         (d.payment_method = 'b2b' OR d.billing_method = 'b2b' OR d.b2b_enabled) AS b2b,
         c.name AS miasto,
         sp.tax_percentage AS przed_stawka_planu,
         sp.base_fee       AS przed_oplata_planu,
         -- dziś „plan bez stawki" znaczy „plan bez podatku" (tak stoi w bazie)
         (sp.id IS NOT NULL AND sp.tax_percentage IS NULL) AS przed_bez_podatku
  FROM public.drivers d
  JOIN public.fleets f ON f.id = d.fleet_id
  LEFT JOIN public.cities c ON c.id = d.city_id
  LEFT JOIN public.driver_app_users dau ON dau.driver_id = d.id
  LEFT JOIN public.settlement_plans sp ON sp.id = dau.settlement_plan_id
),

ust AS (
  SELECT k.*,
         COALESCE(b.vat_rate,                fl.vat_rate,                8)::numeric   AS stawka_miasta,
         COALESCE(b.settlement_mode,         fl.settlement_mode,         'single_tax') AS tryb,
         COALESCE(b.secondary_vat_rate,      fl.secondary_vat_rate,      23)::numeric  AS stawka2,
         COALESCE(b.additional_percent_rate, fl.additional_percent_rate, 0)::numeric   AS dodatek,
         COALESCE(b.base_fee,                fl.base_fee,                50)::numeric  AS oplata_miasta,
         COALESCE(u.uber_calculation_mode,   fl.uber_calculation_mode,   'netto')      AS uber_tryb
  FROM kier k
  JOIN public.fleets fl ON fl.id = k.fleet_id
  LEFT JOIN public.fleet_city_settings b
    ON b.fleet_id = k.fleet_id AND b.city_name = k.miasto AND b.platform = 'bolt' AND b.is_active
  LEFT JOIN public.fleet_city_settings u
    ON u.fleet_id = k.fleet_id AND u.city_name = k.miasto AND u.platform = 'uber' AND u.is_active
),

sur AS (
  SELECT s.driver_id, s.period_from, max(s.period_to) AS period_to,
         sum(COALESCE((s.amounts->>'uber_base')::numeric, 0))              AS uber_base,
         sum(COALESCE((s.amounts->>'uber_gross_total')::numeric, 0))       AS uber_g,
         sum(COALESCE((s.amounts->>'uber_commission')::numeric, 0))        AS uber_prow,
         sum(COALESCE((s.amounts->>'uber_cash_f')::numeric, 0))            AS uber_cash,
         sum(CASE WHEN abs(COALESCE((s.amounts->>'bolt_projected_d')::numeric, 0)) > 0.01
                  THEN COALESCE((s.amounts->>'bolt_projected_d')::numeric, 0)
                  ELSE COALESCE((s.amounts->>'bolt_payout_s')::numeric, 0) END) AS bolt_base,
         sum(COALESCE((s.amounts->>'bolt_cash')::numeric, 0))              AS bolt_cash,
         sum(COALESCE((s.amounts->>'bolt_commission')::numeric, 0))        AS bolt_prow,
         sum(abs(COALESCE((s.amounts->>'bolt_col_i')::numeric, 0)))        AS bolt_i,
         sum(abs(COALESCE((s.amounts->>'bolt_col_j')::numeric, 0)))        AS bolt_j,
         sum(abs(COALESCE((s.amounts->>'bolt_col_k')::numeric, 0)))        AS bolt_k,
         sum(COALESCE((s.amounts->>'freenow_base_s')::numeric, 0))         AS fn_base,
         sum(COALESCE((s.amounts->>'freenow_cash_f')::numeric, 0))         AS fn_cash,
         sum(COALESCE((s.amounts->>'freenow_commission_t')::numeric, 0))   AS fn_prow,
         max(COALESCE((s.amounts->>'manual_service_fee')::numeric, NULL))  AS oplata_reczna,
         sum(COALESCE(s.rental_fee, 0))                                    AS wynajem,
         sum(COALESCE((s.amounts->>'manual_week_adjustment')::numeric, 0)) AS korekta
  FROM public.settlements s, okres o
  WHERE s.period_from >= o.od AND s.period_to <= o.do_
  GROUP BY s.driver_id, s.period_from
),

licz AS (
  SELECT
    u.flota, u.kierowca, u.b2b, u.tryb, u.stawka2, u.dodatek, u.stawka_miasta,
    pal.paliwo * 23.0/123.0 / 2 AS odliczenie,

    -- podstawy podatku — takie same we wszystkich trzech scenariuszach,
    -- bo żaden z planów nie zmienia trybu ani kolumn źródłowych
    GREATEST(s.bolt_base, 0) AS bolt_p,
    GREATEST(s.fn_base, 0)   AS fn_p,
    CASE WHEN u.uber_tryb = 'gross_total'
         THEN GREATEST(CASE WHEN s.uber_g > 0 THEN s.uber_g ELSE s.uber_base * 1.25 END, 0)
         ELSE GREATEST(s.uber_base, 0) END AS uber_single,
    CASE WHEN u.uber_tryb = 'brutto'
         THEN GREATEST(CASE WHEN s.uber_g > 0 THEN s.uber_g ELSE GREATEST(s.uber_base, 0) * 1.25 END, 0)
         ELSE GREATEST(s.uber_base, 0) * 1.25 END AS uber_dual,
    (s.bolt_i + s.bolt_j + s.bolt_k) AS baza2,

    -- wspólna część wypłaty (bez opłaty i bez podatków)
    (GREATEST(s.uber_base,0) + GREATEST(s.bolt_base,0) + GREATEST(s.fn_base,0))
      - (s.uber_prow + s.bolt_prow + s.fn_prow)
      - (s.uber_cash + s.bolt_cash + s.fn_cash)
      - s.wynajem - s.korekta - pal.paliwo AS reszta,

    -- ── trzy scenariusze: stawka, opłata, czy podatek w ogóle ──
    CASE WHEN u.przed_bez_podatku THEN 0 ELSE COALESCE(u.przed_stawka_planu, u.stawka_miasta) END AS stawka_przed,
    u.stawka_miasta AS stawka_po,
    0::numeric      AS stawka_kontrola,

    COALESCE(s.oplata_reczna, u.custom_weekly_fee, u.przed_oplata_planu, u.oplata_miasta) AS oplata_przed,
    COALESCE(s.oplata_reczna, u.custom_weekly_fee, u.oplata_miasta)                       AS oplata_po,
    COALESCE(s.oplata_reczna, u.custom_weekly_fee, 159)                                   AS oplata_kontrola,

    (NOT u.b2b AND NOT u.przed_bez_podatku) AS podatek_przed,
    (NOT u.b2b)                             AS podatek_po,
    false                                   AS podatek_kontrola
  FROM ust u
  JOIN sur s ON s.driver_id = u.id
  CROSS JOIN LATERAL (
    -- paliwo MUSI być z tego samego tygodnia co rozliczenie
    SELECT COALESCE(sum(ft.total_amount), 0)::numeric AS paliwo
    FROM public.fuel_transactions ft
    WHERE regexp_replace(ft.card_number, '^0+', '') = regexp_replace(COALESCE(u.fuel_card_number, '@'), '^0+', '')
      AND ft.transaction_date BETWEEN s.period_from AND s.period_to
  ) pal
),

-- podatek i wypłata dla każdego scenariusza (wzór z `pomniejszOPaliwo` + `wyplataTygodniowa`)
scen AS (
  SELECT flota, kierowca,
    GREATEST(0, CASE WHEN podatek_przed THEN
        (CASE WHEN tryb = 'dual_tax'
              THEN bolt_p * (stawka_przed + dodatek)/100 + (uber_dual + fn_p) * stawka_przed/100
              ELSE (uber_single + bolt_p + fn_p) * stawka_przed/100 END) - odliczenie
      ELSE 0 END) AS podatek_przed_kwota,
    GREATEST(0, CASE WHEN podatek_po THEN
        (CASE WHEN tryb = 'dual_tax'
              THEN bolt_p * (stawka_po + dodatek)/100 + (uber_dual + fn_p) * stawka_po/100
              ELSE (uber_single + bolt_p + fn_p) * stawka_po/100 END) - odliczenie
      ELSE 0 END) AS podatek_po_kwota,
    GREATEST(0, CASE WHEN podatek_kontrola THEN
        (CASE WHEN tryb = 'dual_tax'
              THEN bolt_p * (stawka_kontrola + dodatek)/100 + (uber_dual + fn_p) * stawka_kontrola/100
              ELSE (uber_single + bolt_p + fn_p) * stawka_kontrola/100 END) - odliczenie
      ELSE 0 END) AS podatek_kontrola_kwota,
    CASE WHEN tryb = 'dual_tax' AND podatek_przed    THEN baza2 * stawka2/100 ELSE 0 END AS podatek2_przed,
    CASE WHEN tryb = 'dual_tax' AND podatek_po       THEN baza2 * stawka2/100 ELSE 0 END AS podatek2_po,
    CASE WHEN tryb = 'dual_tax' AND podatek_kontrola THEN baza2 * stawka2/100 ELSE 0 END AS podatek2_kontrola,
    reszta, oplata_przed, oplata_po, oplata_kontrola
  FROM licz
)

SELECT
  s.flota,
  count(*) AS kierowcow_z_rozliczeniem,
  -- ilu kierowców migracja w ogóle dotknie (dostaną wpis `settlement_plan_id`)
  max(w.ilu) AS kierowcow_dostanie_plan,

  -- ═══ TO JEST ODPOWIEDŹ: obie kolumny mają być 0.00 ═══
  round(sum(podatek_po_kwota - podatek_przed_kwota), 2) AS po_vs_przed_podatek,
  round(sum((reszta - oplata_po      - podatek_po_kwota      - podatek2_po)
          - (reszta - oplata_przed   - podatek_przed_kwota   - podatek2_przed)), 2) AS po_vs_przed_wyplata,

  -- ═══ KONTROLA POZYTYWNA: te MUSZĄ być różne od zera ═══
  round(sum(podatek_kontrola_kwota - podatek_przed_kwota), 2) AS kontrola_podatek,
  round(sum((reszta - oplata_kontrola - podatek_kontrola_kwota - podatek2_kontrola)
          - (reszta - oplata_przed    - podatek_przed_kwota    - podatek2_przed)), 2) AS kontrola_wyplata
FROM scen s
JOIN LATERAL (
  SELECT count(*) AS ilu FROM public.drivers d
  JOIN public.fleets f ON f.id = d.fleet_id
  WHERE f.name = s.flota
) w ON true
GROUP BY s.flota
ORDER BY 2 DESC;
