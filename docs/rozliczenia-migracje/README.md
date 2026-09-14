# Migracje modułu rozliczeń (do wykonania ręcznie)

Trzy pliki, w tej kolejności. Każdy ma na końcu blok kontrolny — jeśli coś się
nie zgadza, migracja **pada z nazwaną przyczyną** zamiast przejść na zielono.

| # | plik | co robi | czy zmienia kwoty |
|---|---|---|---|
| 1 | `20260914083000_fleet_city_settings_zapis_floty.sql` | flota może zapisywać/kasować własne ustawienia miast (dziś może tylko administrator platformy) | nie |
| 2 | `20260914090000_plany_rozliczen_kierowcy.sql` | kolumny planów, `drivers.settlement_plan_id`, polityka zapisu dla floty, wyzwalacz nadający plan domyślny nowym kierowcom | nie |
| 3 | `20260914090100_plany_rozliczen_zasiew_i_przypisanie.sql` | zakłada plany „Podstawowy" i „Ryczałt 159 zł", przypisuje plan domyślny istniejącym kierowcom, zakłada indeks | nie — plan domyślny ma wszystkie pola puste, czyli „licz jak dotąd" |

Pliki 2 i 3 są rozdzielone celowo: krok na danych (`CREATE UNIQUE INDEX`) potrafi
wycofać w tej samej transakcji zmiany kodu, a przebieg i tak zamelduje „Success".

## Kolejność wdrożenia całości

1. **Funkcje brzegowe** — `supabase functions deploy settlements` i
   `supabase functions deploy recalculate-week`. Funkcje nie jadą z `deploy.yml`.
2. **Migracje** — trzy powyższe, w kolejności.
3. **Front** — dopiero teraz.

Front i funkcje działają też PRZED migracjami (brak kolumny planu = brak planu,
liczone po ustawieniach miasta), ale panel „Plany rozliczeń" będzie wtedy pusty,
a wybór planu przy kierowcy powie wprost, że nie ma z czego wybierać.

## Po wykonaniu

```sql
-- kto na jakim planie
SELECT f.name AS flota, p.name AS plan, p.tax_enabled, p.tax_percentage, p.base_fee,
       p.is_default, count(d.id) AS kierowcow
FROM public.settlement_plans p
JOIN public.fleets f ON f.id = p.fleet_id
LEFT JOIN public.drivers d ON d.settlement_plan_id = p.id
GROUP BY 1,2,3,4,5,6 ORDER BY 1, 6 DESC;
```
