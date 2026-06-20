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

### ✅ SPRINT 0 — Bezpieczeństwo + płatność (P0) — ZROBIONE (czeka na merge)
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

### ⏳ SPRINT 2 — Pipeline 2-krokowy + uporządkowanie — NIE ZACZĘTE
- API4AI bg-removal (`API4AI_KEY` z Secrets) → Gemini wstawia tło. Tryb single/spin
  (spin = wspólny seed/skala/pozycja). Galeria stylów per user (seed = user_id+timestamp).

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
