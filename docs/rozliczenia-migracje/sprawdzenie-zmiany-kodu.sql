-- ═══════════════════════════════════════════════════════════════════════════
-- CO ZMIENI SAMO WDROŻENIE KODU (bez migracji) — SAM ODCZYT, ZERO ZAPISU
-- ═══════════════════════════════════════════════════════════════════════════
-- To jest WAŻNIEJSZE pytanie niż migracje: kwoty zmienia poprawka wzoru, nie
-- zapis do bazy. Zapytanie liczy na tych samych danych DWIE wersje:
--
--   STARY  — to, co dziś stoi na produkcji: podstawa Ubera zależna od trybu
--            („netto" bierze samą kolumnę D, bez gotówki), a 50% VAT-u od
--            paliwa doliczane do WYPŁATY jako zwrot.
--   NOWY   — podstawa Ubera to D razem z gotówką (F), a 50% VAT-u od paliwa
--            pomniejsza PODATEK.
--
-- KONTROLA POZYTYWNA jest wbudowana w sam wynik: w tym samym przebiegu flota
-- z trybem „netto" i paliwem (Car4Ride) pokazuje kwoty różne od zera. Gdyby
-- wszystkie wiersze wyszły zerowe, to znaczy, że zapytanie nie liczy — a nie,
-- że nic się nie zmienia.
--
-- Zakres dat niżej obejmuje sześć tygodni. Zawęź go, żeby obejrzeć jeden.
-- ═══════════════════════════════════════════════════════════════════════════
WITH okres AS (SELECT DATE '2026-08-03' AS od, DATE '2026-09-13' AS do_),
kier AS (
  SELECT d.id, d.fleet_id, f.name AS flota, d.first_name||' '||d.last_name AS kierowca,
         d.custom_weekly_fee, d.fuel_card_number,
         (d.payment_method='b2b' OR d.billing_method='b2b' OR d.b2b_enabled) AS b2b,
         c.name AS miasto
  FROM public.drivers d
  JOIN public.fleets f ON f.id = d.fleet_id
  LEFT JOIN public.cities c ON c.id = d.city_id
),
ust AS (  -- ustawienia miasta: wartości z wiersza bolt, uber_calculation_mode z wiersza uber
  SELECT k.id AS driver_id, k.fleet_id, k.flota, k.kierowca, k.custom_weekly_fee, k.fuel_card_number, k.b2b,
         COALESCE(b.vat_rate,               fl.vat_rate,               8)::numeric AS stawka,
         COALESCE(b.settlement_mode,        fl.settlement_mode,        'single_tax') AS tryb,
         COALESCE(b.secondary_vat_rate,     fl.secondary_vat_rate,     23)::numeric AS stawka2,
         COALESCE(b.additional_percent_rate,fl.additional_percent_rate, 0)::numeric AS dodatek,
         COALESCE(b.base_fee,               fl.base_fee,               50)::numeric AS oplata_miasta,
         COALESCE(u.uber_calculation_mode,  fl.uber_calculation_mode,  'netto') AS uber_tryb
  FROM kier k
  JOIN public.fleets fl ON fl.id = k.fleet_id
  LEFT JOIN public.fleet_city_settings b ON b.fleet_id = k.fleet_id AND b.city_name = k.miasto AND b.platform='bolt'  AND b.is_active
  LEFT JOIN public.fleet_city_settings u ON u.fleet_id = k.fleet_id AND u.city_name = k.miasto AND u.platform='uber' AND u.is_active
),
sur AS (  -- surowe kwoty z rozliczeń tygodnia
  SELECT s.driver_id, s.period_from, max(s.period_to) AS period_to,
         sum(COALESCE((s.amounts->>'uber_base')::numeric,0))            AS uber_base,
         sum(COALESCE((s.amounts->>'uber_payout_d')::numeric,0))        AS uber_d,
         sum(COALESCE((s.amounts->>'uber_gross_total')::numeric,0))     AS uber_g,
         sum(COALESCE((s.amounts->>'uber_cash_f')::numeric,0))          AS uber_cash,
         sum(COALESCE((s.amounts->>'uber_commission')::numeric,0))      AS uber_prow,
         sum(CASE WHEN abs(COALESCE((s.amounts->>'bolt_projected_d')::numeric,0)) > 0.01
                  THEN COALESCE((s.amounts->>'bolt_projected_d')::numeric,0)
                  ELSE COALESCE((s.amounts->>'bolt_payout_s')::numeric,0) END) AS bolt_base,
         sum(COALESCE((s.amounts->>'bolt_cash')::numeric,0))            AS bolt_cash,
         sum(COALESCE((s.amounts->>'bolt_commission')::numeric,0))      AS bolt_prow,
         sum(abs(COALESCE((s.amounts->>'bolt_col_i')::numeric,0)))      AS bolt_i,
         sum(abs(COALESCE((s.amounts->>'bolt_col_j')::numeric,0)))      AS bolt_j,
         sum(abs(COALESCE((s.amounts->>'bolt_col_k')::numeric,0)))      AS bolt_k,
         sum(COALESCE((s.amounts->>'freenow_base_s')::numeric,0))       AS fn_base,
         sum(COALESCE((s.amounts->>'freenow_cash_f')::numeric,0))       AS fn_cash,
         sum(COALESCE((s.amounts->>'freenow_commission_t')::numeric,0)) AS fn_prow,
         max(COALESCE((s.amounts->>'manual_service_fee')::numeric, NULL))  AS oplata_reczna,
         sum(COALESCE(s.rental_fee,0))                                  AS wynajem,
         sum(COALESCE((s.amounts->>'manual_week_adjustment')::numeric,0)) AS korekta
  FROM public.settlements s, okres o
  WHERE s.period_from >= o.od AND s.period_to <= o.do_
  GROUP BY s.driver_id, s.period_from
),
licz AS (
  SELECT u.flota, u.kierowca, u.tryb, u.uber_tryb, u.b2b, u.stawka, u.stawka2, u.dodatek,
         u.custom_weekly_fee, u.oplata_miasta,
         s.uber_base, s.uber_d, s.uber_g, s.uber_cash, s.uber_prow,
         s.bolt_base, s.bolt_cash, s.bolt_prow, s.bolt_i, s.bolt_j, s.bolt_k,
         s.fn_base, s.fn_cash, s.fn_prow, s.oplata_reczna, s.wynajem, s.korekta, s.period_from,
         pal.paliwo,
         (u.stawka/100) AS r, (u.stawka2/100) AS r2, ((u.stawka+u.dodatek)/100) AS r_plus,
         pal.paliwo * 23.0/123.0 / 2 AS odliczenie,
         COALESCE(s.oplata_reczna, u.custom_weekly_fee, u.oplata_miasta) AS oplata,
         (GREATEST(s.uber_base,0) + GREATEST(s.bolt_base,0) + GREATEST(s.fn_base,0)) AS baza,
         (s.uber_prow + s.bolt_prow + s.fn_prow) AS prowizje,
         (s.uber_cash + s.bolt_cash + s.fn_cash) AS gotowka
  FROM ust u
  JOIN sur s ON s.driver_id = u.driver_id
  -- Paliwo MUSI pochodzić z tego samego tygodnia co rozliczenie. Liczone raz dla
  -- całego zakresu dawałoby wielokrotność przy porównaniu kilku tygodni naraz.
  CROSS JOIN LATERAL (
    SELECT COALESCE(sum(ft.total_amount), 0)::numeric AS paliwo
    FROM public.fuel_transactions ft
    WHERE regexp_replace(ft.card_number,'^0+','') = regexp_replace(COALESCE(u.fuel_card_number,'@'),'^0+','')
      AND ft.transaction_date BETWEEN s.period_from AND s.period_to
  ) pal
),
wynik AS (
  SELECT flota, period_from, kierowca, tryb, uber_tryb, b2b, paliwo, odliczenie, baza, oplata,
    -- ═══ STARY KOD (to, co dziś stoi na produkcji) ═══
    CASE WHEN b2b THEN 0 WHEN tryb='dual_tax'
      THEN GREATEST(bolt_base,0)*r_plus
         + (CASE WHEN uber_tryb='brutto' THEN GREATEST(CASE WHEN uber_g>0 THEN uber_g ELSE GREATEST(uber_base,0)*1.25 END,0)
                 ELSE GREATEST(uber_base,0)*1.25 END + GREATEST(fn_base,0)) * r
      ELSE (CASE WHEN uber_tryb='netto' THEN GREATEST(COALESCE(NULLIF(uber_d,0),uber_base),0)
                 WHEN uber_tryb='gross_total' THEN GREATEST(CASE WHEN uber_g>0 THEN uber_g ELSE uber_base*1.25 END,0)
                 ELSE GREATEST(uber_base,0) END
            + GREATEST(bolt_base,0) + GREATEST(fn_base,0)) * r
    END AS podatek_stary,
    -- ═══ NOWY KOD ═══
    GREATEST(0,
      CASE WHEN b2b THEN 0 WHEN tryb='dual_tax'
        THEN GREATEST(bolt_base,0)*r_plus
           + (CASE WHEN uber_tryb='brutto' THEN GREATEST(CASE WHEN uber_g>0 THEN uber_g ELSE GREATEST(uber_base,0)*1.25 END,0)
                   ELSE GREATEST(uber_base,0)*1.25 END + GREATEST(fn_base,0)) * r
        ELSE (CASE WHEN uber_tryb='gross_total' THEN GREATEST(CASE WHEN uber_g>0 THEN uber_g ELSE uber_base*1.25 END,0)
                   ELSE GREATEST(uber_base,0) END
              + GREATEST(bolt_base,0) + GREATEST(fn_base,0)) * r
      END - CASE WHEN b2b THEN 0 ELSE odliczenie END) AS podatek_nowy,
    CASE WHEN b2b OR tryb<>'dual_tax' THEN 0 ELSE (bolt_i+bolt_j+bolt_k)*r2 END AS podatek2,
    baza - prowizje - gotowka - oplata - wynajem - korekta - paliwo AS reszta
  FROM licz
)
SELECT flota, period_from AS tydzien,
       count(*) AS kierowcow,
       count(*) FILTER (WHERE abs(podatek_nowy - podatek_stary) > 0.005) AS zmiana_podatku,
       count(*) FILTER (WHERE abs((reszta - podatek_nowy - podatek2)
                                - (reszta - podatek_stary - podatek2 + odliczenie)) > 0.005) AS zmiana_wyplaty,
       round(sum(podatek_nowy - podatek_stary), 2) AS suma_zmiany_podatku,
       round(sum((reszta - podatek_nowy - podatek2)
               - (reszta - podatek_stary - podatek2 + odliczenie)), 2) AS suma_zmiany_wyplaty,
       round(max(abs((reszta - podatek_nowy - podatek2)
                   - (reszta - podatek_stary - podatek2 + odliczenie))), 2) AS najwieksza_zmiana_wyplaty
FROM wynik GROUP BY flota, period_from ORDER BY period_from DESC, flota;
