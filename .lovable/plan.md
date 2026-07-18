## Zakres

Rozszerzenie istniejącego portalu (nieruchomości + giełda aut + wspólne). Zero refaktoru, zero zmian struktury, tylko nowe pliki/komponenty + punktowe wpięcia + nowe migracje `ADD COLUMN` / `CREATE TABLE`. Bez commita, bez deployu.

To jest ogromny zakres (~2–3 tygodnie ciągłej pracy jednego programisty). Proponuję podzielić na 6 iteracji — po każdej dajesz OK/nie i jedziemy dalej. Kończenie wszystkiego jedną turą = na pewno błędy, konflikty w URL/filtrach i migracje SQL do wywalenia.

## Iteracja 1 — Bugi globalne + fundament URL (najszybszy zwrot)

**C1 — focus outline + scroll na number**
- Globalny CSS w `src/index.css`: `:focus:not(:focus-visible){outline:none}` + spójny `:focus-visible` ring.
- Już mamy `useDisableNumberInputScroll` — sprawdzę czy jest wpięty w `App.tsx`, jeśli nie: wpinam.

**C2 — flicker menu „Moje GetRido"**
- W `UserDropdown` / `MyGetRidoButton` czekać na `isLoading` z `useUserRole` — skeleton zamiast częściowej listy.

**A4 — URL-based filtering (fundament dla A10, D1, B2)**
- Hook `useUrlFilters<T>(schema)` — serializacja/deserializacja filtrów ↔ `searchParams`, `replace` vs `push`.
- Wpięcie w `RealEstateMarketplace` (nieruchomości) — filtry z UI trafiają do URL i odwrotnie.
- Route params: `/nieruchomosci/:typ?/:transakcja?/:lokalizacja?` — dodane obok istniejącej `/nieruchomosci`, stara zostaje.
- SEO per landing page (`react-helmet-async` — sprawdzę czy jest, dorzucę jeśli nie): title/description/canonical/JSON-LD `ItemList`, `noindex` gdy >2 query params.
- Edge function `sitemap-nieruchomosci` + wpis w `robots.txt`.

Deliverable: linki filtrów działają, back button działa, Google ma co indeksować.

## Iteracja 2 — Filtry zaawansowane + sortowanie (A1, A2, A5)

- Migracja: `ALTER TABLE real_estate_listings ADD COLUMN attributes jsonb DEFAULT '{}'::jsonb` + GIN. Twarde pola (piętro, rok budowy, czynsz) jako osobne kolumny z B-tree.
- Nowy komponent `<AdvancedFiltersSheet>` (desktop accordion, mobile sheet). Licznik „Pokaż X ofert" z debounce 300 ms (`count: exact, head: true`).
- Segmented control typu sprzedającego (Wszyscy/Prywatne/Biuro/Deweloper) — pole wyliczane z profilu, nie ręcznie.
- Sortowanie z A5 (9 opcji, w URL).
- Osobne zestawy filtrów: mieszkania, domy, działki, lokale.

## Iteracja 3 — Mapa generyczna + promień + heat-mapa (A3, A6, D4)

- Włączyć `cube` + `earthdistance` migracją, indeks GiST na lat/lng.
- RPC `search_listings_within_radius(lat, lng, radius_km, filters jsonb)`.
- Komponent `<ResultsMap items renderPin onAreaChange>` — generyczny, w `src/components/maps/`.
  - Tryby Lista/Mapa/Podział, pinezki z ceną, klastrowanie (mamy `Supercluster`), „Szukaj w tym obszarze", rysowanie polygonu (mamy `useMapDrawingTools`), styl mapa/satelita.
- Warstwa heat-mapy D4 — widok zmaterializowany `mv_price_per_sqm_by_district` odświeżany cronem raz na dobę. Tooltip + na karcie ogłoszenia „o X% taniej niż mediana".

## Iteracja 4 — Historia cen + porównywarka + social proof (A7, A9, D2)

- Migracja: `listing_price_history` + trigger `AFTER UPDATE OF price`. To samo dla pojazdów (`vehicle_price_history`).
- Sekcja „Historia ceny" na karcie (recharts), badge ↓ na liście, filtr „Tylko obniżone".
- Porównywarka (max 3, stan w URL `?compare=`) — nowa strona + pływający pasek.
- D2 social proof: widok/serwisowy licznik wyświetleń (mamy `real_estate_listing_interactions`), Realtime presence dla „X ogląda teraz" (pokazuj tylko gdy ≥2), zapisania z `user_wishlists`. Zero pompowania — realne dane albo nic.

## Iteracja 5 — Zapisane wyszukiwania + alerty (A10 + pełne D1)

- Migracje: `saved_searches`, `saved_search_hits`, `short_links` — pełne GRANTs + RLS `user_id = auth.uid()`.
- Modal zapisu (kanały, częstotliwość, nazwa auto), weryfikacja SMS przed pierwszym alertem SMS.
- Edge function `saved-searches-notify` na cronie co godzinę + `pg_cron` schedule (daily 9:00, weekly Pn 9:00).
- Skracacz `/s/:code` z 302 i licznikiem.
- Grupowanie: 1 oferta → link do oferty, ≥2 → link do listy z `?since=<ts>` + baner „Nowe od Twojego ostatniego powiadomienia".
- SMS bez polskich znaków, „STOP" link.
- Panel „Moje wyszukiwania".
- Generyczny mechanizm — `module` w tabeli, ta sama edge function obsługuje wszystkie moduły.

## Iteracja 6 — Giełda aut (B1–B5) + raport VIN (D3) + sekcja porównawcza EasyHub (D5)

- B1: `<ResultsMap>` z iteracji 3 wpięta w giełdę.
- B2: `useUrlFilters` + rozszerzone filtry pojazdów + landing routes `/gielda/:typ?/:marka?/:model?/:lokalizacja?`.
- B3: historia cen + badge (już z iter. 4). Predykcję ceny zostawiam na osobną decyzję — wymaga ML/danych treningowych i osobnej rozmowy.
- B4: porównywarka (reużycie z iter. 4).
- B5: alerty (reużycie z iter. 5, `module='gielda'`).
- D3: sekcja „Historia pojazdu" na `VehicleDetailPage` — reużycie istniejącej integracji VIN/CEPiK/RegCheck. Alert cofniętego licznika: porównanie `deklarowany_przebieg` vs ostatni odczyt z badania. Badge „Przebieg zweryfikowany".
- D5: sekcja porównawcza na `EasyHub` — **BEZ nazw konkurencji**, „GetRido vs typowy portal ogłoszeń". Tabela 3-kolumnowa desktop, karty mobile.

## AI z B6 — poza tym planem

Voice listing, guided capture, smart kontakt, cross-listing, jazda próbna, Voice Tour 360° — każda z tych funkcji to osobny 2–5-dniowy projekt. Zrobimy je po iteracji 6 jako osobne prompty, nie wciskam ich tutaj.

## D6 — Ostrzeżenia bezpieczeństwa

Nie ruszam istniejących. Uruchomię skan (`security--get_scan_results`) i zwrócę listę z podziałem RLS vs reszta. Nowy kod będzie miał RLS od razu.

## Co wymaga Twojej decyzji przed startem

1. **OK na podział na 6 iteracji?** Jeśli chcesz wszystko jedną turą — powiedz, ale ostrzegam, że to praktycznie gwarantuje błędy w URL/filtrach i migracje do wycofania.
2. **Iteracja 1** — startuję od niej po Twoim OK. Reszta idzie sekwencyjnie z checkpointami.
3. **Predykcja ceny (B3)** — pominąć na razie? Wymaga osobnej analizy danych.
4. **B6 (funkcje AI)** — potwierdzasz że robimy po iter. 6, osobnymi promptami?
5. Ile aktywnych alertów na konto naprawdę? Zaproponowałeś 10 — trzymamy się.

Napisz „OK, iter 1" i startuję.
