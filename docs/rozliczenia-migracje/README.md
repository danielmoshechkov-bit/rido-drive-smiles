# Migracje modułu rozliczeń (do wykonania ręcznie)

Trzy pliki, w tej kolejności. Każdy ma na końcu blok kontrolny — jeśli coś się
nie zgadza, migracja **pada z nazwaną przyczyną** zamiast przejść na zielono.

| # | plik | co robi | czy zmienia kwoty |
|---|---|---|---|
| 1 | `20260914083000_fleet_city_settings_zapis_floty.sql` | flota może zapisywać własne ustawienia (dziś może tylko administrator platformy) — bez tego nie da się dodać planu | nie |
| 2 | `20260914120000_plany_rozliczen_struktura.sql` | tabela `fleet_settlement_plans`, `plan_id` w `fleet_city_settings`, tabela `driver_plan_assignments`, polityki, wyzwalacz nadający plan domyślny nowym kierowcom | nie |
| 3 | `20260914120100_plany_rozliczen_zasiew.sql` | zakłada plan dla każdego istniejącego kompletu ustawień miasta i podpina pod niego wiersze; zdejmuje starą unikalność, zakłada nowe indeksy | nie |

Pliki 2 i 3 są rozdzielone celowo: krok na danych (`CREATE UNIQUE INDEX`,
`DROP CONSTRAINT`) potrafi wycofać w tej samej transakcji zmiany kodu, a przebieg
i tak zamelduje „Success".

## Co te migracje ZROBIĄ, zmierzone przed uruchomieniem

`sprawdzenie-planow.sql` (sam odczyt) na produkcji:

- **Powstanie 5 planów**: Flame Partner — Lublin, Wrocław, Zamość; Car4Ride — Warszawa; „dasdsa" — Kraków.
- **Zero przypisań**: żaden z 261 kierowców nie dostaje planu. Wszyscy liczą się dalej po mieście.
- **Zero planów domyślnych**: przełącznik „domyślny" włącza partner sam, świadomie.
- **Podatek przed = po** (Car4Ride, tydzień 07–13.09: 4204,51 zł → 4204,51 zł, różnica 0,00).
- **Kontrola pozytywna w tym samym zapytaniu**: gdyby ktoś nadał wszystkim plan
  „Ryczałt 159 bez podatku", podatek spadłby o 4204,51 zł, a opłaty wzrosły o 4796 zł.
  Zero z poprzedniego punktu znaczy więc „nic się nie zmienia", a nie „nic nie policzyłem".

## Kolejność wdrożenia całości

1. **Funkcje brzegowe** — `supabase functions deploy settlements` i
   `supabase functions deploy recalculate-week`. Funkcje nie jadą z `deploy.yml`.
2. **Migracje** — trzy powyższe, w kolejności.
3. **Front** — dopiero teraz.

Front i funkcje działają też PRZED migracjami: brak tabel planów znaczy „licz po
ustawieniach miasta", czyli dokładnie jak dotąd, z ostrzeżeniem w konsoli.

## Po wykonaniu

```sql
-- plany i ich stawki
SELECT f.name AS flota, p.name AS plan, p.city_name, p.is_default,
       max(CASE WHEN c.platform='bolt' THEN c.vat_rate END) AS vat_bolt,
       max(CASE WHEN c.platform='bolt' THEN c.base_fee END) AS oplata_bolt,
       max(CASE WHEN c.platform='uber' THEN c.vat_rate END) AS vat_uber,
       count(c.id) AS wierszy_ustawien
FROM public.fleet_settlement_plans p
JOIN public.fleets f ON f.id = p.fleet_id
LEFT JOIN public.fleet_city_settings c ON c.plan_id = p.id
GROUP BY 1,2,3,4 ORDER BY 1,2;

-- kto ma jaki plan i od kiedy
SELECT d.first_name||' '||d.last_name AS kierowca, p.name AS plan, a.effective_from
FROM public.driver_plan_assignments a
JOIN public.drivers d ON d.id = a.driver_id
LEFT JOIN public.fleet_settlement_plans p ON p.id = a.plan_id
ORDER BY 1, 3 DESC;
```

## Wycofanie

Odwrotnie: 3 → 2 → 1. Bloki `WYCOFANIE` są na końcu każdego pliku. Wdrożony kod
przeżyje każde z nich — pyta o tabele planów tolerancyjnie i bez nich liczy po
ustawieniach miasta.
