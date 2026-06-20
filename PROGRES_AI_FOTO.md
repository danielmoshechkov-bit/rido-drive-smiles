# PROGRES — Moduł AI Foto + Exterior 360 (Giełda Aut)

> Dziennik prac CC „ogłoszenia" (repo `rido-ogloszenia`, kopia robocza).
> Zakres: TYLKO marketplace / giełda aut. Workspace robi drugie CC w `rido-drive-smiles`.
> Wspólna baza Supabase: **wclrrytmrscqvsyxyvnn**.

## Mechanizm dostarczania zmian (ustalony)
- Migracje na bazę stosuje **Lovable Cloud** po trafieniu pliku do `supabase/migrations/`
  na GitHubie repo `danielmoshechkov-bit/rido-drive-smiles`. `deploy.yml` robi tylko
  build frontu + FTP na LH.pl (NIE migracje, NIE edge functions).
- Flow: branch `sprint0-ai-foto` → remote `github` → push → **PR + merge robi właściciel** →
  Lovable stosuje migrację i redeployuje funkcje/front.
- Wymóg twardy: ZERO zmian w bazie bez pliku migracji w repo.

---

## STATUS SPRINTÓW

### ✅ SPRINT 0 — Bezpieczeństwo + płatność (P0) — ZAMKNIĘTY (2026-06-20)
> Weryfikacja prod: bucket `car-photos` + polityki owner-only potwierdzone (anon INSERT odrzucony),
> `documents` authenticated-only potwierdzone (luka anon-write zamknięta), funkcja `ai-photo-edit`
> wdrożona przez CLI i potwierdzona runtime (featureKey bez JWT → 401). Test e2e: kredyt schodzi
> SERWEROWO, saldo `user_credits` 50 → 20 (−30) po testach. Breakdown w `ai_credit_history`.

- **0a/0b** Bucket `car-photos` (public read, write/del owner-only po folderze `{userId}/`).
  `VehiclePhotoUpload` pisze do `car-photos` zamiast `documents`. Ścieżka `anonymous/` usunięta,
  upload wymaga loginu.
- **0b** `documents` (współdzielony) — krok A: fałszywe polityki „Admins can…" (`USING(true)`,
  bez `TO authenticated`) → zastąpione `TO authenticated`. Public read (`SELECT`) bez zmian.
- **0c** `creditGate.ts` (był martwy) zaadaptowany pod `user_credits` + `ai_pricing`,
  wpięty serwerowo w `ai-photo-edit` PRZED Gemini. Front nie odejmuje kredytów (tylko `refreshCredits`).
- **0d** Koszt foto = WYŁĄCZNIE `ai_pricing` (`vehicle_photo_enhance=10`, `vehicle_photo_custom=15`).
  Hardcode `credits_used:2` w `ai-photo-edit` usunięty całkowicie. Funkcja zwraca `balance_after`.
- Pliki: `supabase/migrations/20260620120000_sprint0_car_photos_security.sql`,
  `supabase/functions/_shared/creditGate.ts`, `supabase/functions/ai-photo-edit/index.ts`,
  `src/components/marketplace/VehiclePhotoUpload.tsx`.

---

## 🔥 BACKLOG (priorytety) — zgłoszone 2026-06-20, NIE robić bez „dalej"

### ✅ E1 — Odblokowanie publikacji (W TOKU, 2026-06-20)
- BUG 1 (42501 RLS): migracja `20260620130000_e1_vehicle_listings_owner_rls.sql`
  (`created_by = auth.uid()`) + front ustawia `created_by` w insercie.
- „Moje ogłoszenia": `MyListingsTab` rozszerzony o sekcję **Giełda Aut**
  (`vehicle_listings` po `created_by`) — podgląd + usuwanie. **Edycja → E2.**
- Backfill RIDO-000006 (BMW X5, `id 80b3f59d…`) → daniel (SQL ręcznie w Studio).
- BUG 2 (401): `ai-service` używa `LOVABLE_API_KEY` na gatewayu Lovable (nie `openai_api_key_encrypted`).
- Migracja + backfill: wykonywane RĘCZNIE w Supabase SQL Editor (merge ich nie stosuje).

### ⏳ E2 — Walidacja + edycja ogłoszeń
- Walidacja zbiorcza (wszystkie braki naraz, czerwone pola, „uzupełnij brakujące dane") + przegląd wymagalności.
- **Tryb edycji** `AddVehicleListing` (dziś tylko „dodaj") — dopięcie edycji w „moje auta".

### ⏳ E6 — Statystyki ogłoszenia (auta) — ZATWIERDZONE jako osobny etap
Kolumny ISTNIEJĄ na `vehicle_listings` (`views`, `favorites_count`, `comparison_count`,
`contact_reveals_count`, `vin_reveals_count`), ale **tracking dla aut NIE działa**:
- `track-listing-interaction` wołany tylko z nieruchomości/general, nie ze stron aut;
- aktualizuje kolumny `view_count`/`favorite_count` których `vehicle_listings` nie ma
  (ma `views`/`favorites_count`) → niezgodność nazw;
- woła RPC `increment_listing_counter` — brak w migracjach;
- dla aut inkrementowany tylko `vin_reveals_count` (`VehicleDetailPage`).
Do zrobienia: podpiąć tracking (wejścia / „Zadzwoń"-reveal / ulubione / porównania) na stronach
aut → ujednolicić kolumny → pokazać w karcie „moje ogłoszenia (auta)".

### P0 — BUGI (najpierw, blokują realne wystawianie)
- **„Błąd podczas dodawania ogłoszenia" przy Opublikuj** — ogłoszenie się nie zapisuje.
  Zdiagnozować: insert do `vehicle_listings` (RLS — kto może INSERT? `vehicle_listings`
  ma polityki fleet/admin, a tu pisze zwykły marketplace user → prawdopodobny brak polityki
  INSERT dla usera), wymagane pola/typy, czy URL z `car-photos` zapisuje się poprawnie.
- **„Błąd generowania opisu" przy Wygeneruj opis z AI** — osobna funkcja `ai-service`
  (`type: vehicle-description`). Zdiagnozować osobno (klucz/model/kredyty/RLS).
- **Walidacja formularza — pokaż WSZYSTKIE braki naraz.** Teraz braki lecą po kolei
  (toast za toastem). Ma: podświetlić wszystkie brakujące wymagane pola na czerwono
  jednocześnie + komunikat „uzupełnij brakujące dane". Przy okazji **przegląd wymagalności**
  pól (które naprawdę powinny być obowiązkowe).

### P0/UX dodatkowo
- Rozjazd nazw kluczy `feature_toggles`: kod (`AddListingModal`, `SearchCategoryModal`) pyta
  o `vehicle_marketplace_enabled` / `real_estate_marketplace_enabled` / `services_marketplace_enabled`,
  a w DB są `marketplace_vehicles_enabled` itd. → flagi nie działają jak myśli admin.
  (Osobny task, ustalić jeden zestaw nazw.)

---

### ⏳ SPRINT 1 — Ustawienia admina portalu aut (rozszerzenie routera AI) — NIE ZACZĘTE
Rozbudowa istniejących tabel (`ai_providers`, `ai_routing_rules`, `ai_pricing`,
`ai_feature_flags`, `feature_toggles`) — NIE nowy system.
- Sekcja admin „Portal Aut / AI Foto": włącznik modułu, status kluczy API (czy ustawione,
  bez pokazywania wartości), przypisanie modelu do funkcji (dropdowny z bazy).
- Galeria teł `car_bg_styles` (predefiniowane, „domyślne", custom prompt, CRUD admina).
- **PANEL CENNIKA** (wymóg właściciela):
  - główny admin = **daniel.moshechkov@gmail.com** — sprawdzić/nadać rolę admina portalu.
  - jedna zakładka „Cennik" = WSZYSTKIE ceny modułu (foto enhance/custom/pakiety, Exterior 360,
    wyróżnienia ogłoszeń itd.), edytowalne, źródło prawdy = `ai_pricing` (+ tabele cen), bez hardcode.
  - zmiana w panelu = zmiana w bazie = działa od razu, bez deployu.
  - **PROMOCJE**: cena promocyjna + okres od/do lub % rabatu; gdy aktywna → obowiązuje cena
    promocyjna, po terminie wraca normalna. Strukturę (tabela cen + tabela/pola promocji)
    zaproponować do akceptacji PRZED budową.
- **Licznik kredytów stale widoczny** (nie tylko na karcie foto) — globalny, w nagłówku/UI —
  + przycisk **„Dokup kredyty"**.
- **Panel ustawień AI foto**: podpięcie **API4AI** (wycinanie tła) + przypisanie modeli do funkcji.
- **Przykład PRZED/PO** w modalu to dziś hardcode (`/example-before.jpg`, `/example-after.jpg` +
  unsplash Toyota w `AIPhotoSection`) — DWA różne auta. Ma być **realne przykładowe foto
  (to samo auto przed/po), edytowalne z panelu admina**.

### ⏳ SPRINT 2 — Pipeline 2-krokowy + galeria (NAPRAWIA JAKOŚĆ) — NIE ZACZĘTE
> Objaw dziś: czysty Gemini-edit daje nierówną jakość (np. „foto 2 słabe / samo tło"),
> bo Gemini ignoruje instrukcję pozycji i tła.
- **2-krokowy pipeline**: API4AI **wytnij tło** (`API4AI_KEY` z Secrets) → Gemini **wstaw tło**.
- **WSPÓLNY SEED tła**: wszystkie zdjęcia jednego auta na TYM SAMYM tle (dziś różne).
- **Kontrola pozycji auta**: wycięcie+wstawienie daje równe ustawienie (czysty Gemini ignoruje
  instrukcję pozycji).
- **Galeria teł** do wyboru z podglądem + własny opis.
- **Fullscreen podgląd PRZED zapłatą** + znak wodny (nie da się pobrać czystego; znak NIE zamazuje
  tablic rejestracyjnych).
- Tryb single/spin (spin = wspólny seed/skala/pozycja). Galeria stylów per user (seed = user_id+timestamp).
- **BUG re-wybór zdjęcia AI**: po usunięciu zdjęcia nie da się ponownie wybrać wygenerowanego
  (wejście w wygenerowane + „wybierz" nie zaznacza). Naprawić ponowny wybór.
- **Funkcja „Twoje / Wygenerowane AI"**: przełącznik przy zdjęciach + **ręczny wybór per zdjęcie** —
  klient miesza (część własnych, część AI) i sam decyduje, które trafiają do ogłoszenia.
  Nie tylko tryb „wszystkie albo/albo" (dziś `hasAiPhotos` jest globalne).

### ⏳ NOWA FUNKCJA — „Rido doradza" (ocena atrakcyjności ogłoszenia) — DO ROZPLANOWANIA
Ekran podsumowania na końcu flow dodawania:
- **% uzupełnienia** ogłoszenia, czego brakuje,
- ocena opisu (jakość/długość), punktowe zalecenia „co dodać by zwiększyć zasięg",
- zachęta do wygenerowania opisu przez Rido AI,
- sekcja „Rido doradza" na końcu flow.

### ⏳ SPRINT 3 — Capture z konturem (PWA) — NIE ZACZĘTE
### ⏳ SPRINT 4 — Exterior 360 (viewer) — NIE ZACZĘTE

---

## TASKI SKOORDYNOWANE z CC2 / Workspace (NIE ruszać solo)

> Dotyczą WSPÓLNEJ bazy `wclrrytmrscqvsyxyvnn` i/lub plików poza torem aut.
> Wymagają uzgodnienia konwencji ścieżek, bo zmiana RLS uderza w wiele modułów.

1. **`documents` — pełna izolacja (krok B).** Dziś (po Sprincie 0) write/del = każdy
   zalogowany (krok A). Docelowo: ownership per-user/rola. Problem: bucket `documents`
   to wspólny magazyn ~15 plików (fleet, workshop, faktury, inventory, driver, client)
   z RÓŻNYMI konwencjami ścieżek (`{vehicle_id}/`, plik w roocie, itd.) → izolacja
   `auth.uid()=foldername[1]` rozwali te moduły. Wymaga audytu ścieżek per moduł
   i uzgodnienia z CC2. Dotyczy też **tabeli** `public.documents` (RLS `USING(true)`).
2. **`listing-photos`** (bucket general_listings) — INSERT/DELETE bez ownershipu. Poprawić
   na wzór car-photos przy okazji uporządkowania general-tor.
3. **`workshop-order-photos`** — INSERT/DELETE bez ownershipu (moduł warsztat).

---

## NOTATKI ARCHITEKTONICZNE

### Dwa tory foto (świadomy podział — uporządkowanie w Sprincie 2)
- **TOR AUT (kanoniczny dla giełdy):** bucket `car-photos` + kolumny `vehicle_listings.photos`
  / `ai_enhanced_photos` / `has_ai_photos`. Płatność: `user_credits` + `ai_pricing`,
  serwerowo przez `creditGate` w `ai-photo-edit` (wymaga `featureKey`).
- **TOR GENERAL:** `AIPhotoSection` + `general_listing_photos` + `ai_photo_orders`
  (stub 5 zł). NIE wysyła `featureKey` → `ai-photo-edit` nie pobiera kredytów.
  Do migracji na model kredytowy w Sprincie 2 (wtedy `featureKey` staje się obowiązkowy
  i zamyka resztkowy wektor „edycja bez kredytów przy braku featureKey").

### Systemy kredytów (stan)
- **Marketplace foto** używa `user_credits` (saldo, 50 darmowych z onboardingu frontu).
- `ai-search`/`ai_user_credits` (trial 30/mc, `ai_query_costs`) — INNY system, poza zakresem,
  nietknięty.
