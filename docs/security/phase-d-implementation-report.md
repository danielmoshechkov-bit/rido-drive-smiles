# GetRido — Faza D: XSS, cache i izolacja sesji

## Status

**PASS lokalnie / NO-GO dla publikacji całego systemu.** Kod Fazy D przechodzi testy kontraktowe, `typecheck`, produkcyjny `build`, walidację PHP i `git diff --check`. Brak środowiska przeglądarkowego E2E oraz lokalnego Supabase oznacza, że scenariusze runtime A → logout → B i historyczne dane w bazie nadal wymagają testu przed publikacją.

## Co naprawiono

- Usunięto regułę Workbox `NetworkFirst`, która zapisywała wszystkie odpowiedzi GET Supabase w globalnym `supabase-cache`. Wygenerowany `dist/sw.js` nie zawiera originu Supabase ani tej nazwy cache.
- Dodano rozdzielenie sesji trwałej i sesji karty (`authStorage.ts`) oraz ustawianie preferencji przed `signInWithPassword` we wszystkich zwykłych formularzach logowania.
- Dodano `SessionIsolationBoundary`: przy zmianie użytkownika lub kontekstu firmy czyści TanStack Query, prywatne Cache Storage, drafty, dane GPS, koszyk/favorites i tenantowe preferencje. Zdarzenie auth dla niezmienionego użytkownika jedynie odświeża zapytania, dzięki czemu reset hasła i ponowna autoryzacja nie wpadają w pętlę remountu.
- Zgoda `getrido_gps_consent` jest traktowana jako stan prywatny i usuwana przy zmianie użytkownika; nowe konto nie dziedziczy automatycznego uruchomienia geolokalizacji.
- Produkcyjny `DriverDashboard` nie ufa już `localStorage.testUser`; tryb testowy pozostał wyłącznie w buildzie `DEV`.
- Klient wynajmu nie może przełączyć `rental_dry_run=false`; realna wysyłka SMS/e-mail jest zablokowana fail-closed.
- Dodano centralny sanitizer DOMPurify 3.4.11 z jawną allowlistą. Obejmuje opisy AI, umowy, dokumenty, szablony, e-mail preview, mapy, raporty, faktury i `srcDoc`.
- Markery map i `InfoWindow` używają DOM API oraz `textContent`, zamiast interpolowanego `innerHTML`.
- Podglądy stron AI i faktur są sanityzowane, mają pusty `sandbox`, `no-referrer` i CSP bez skryptów, formularzy i sieci.
- Podglądy dokumentów akceptują wyłącznie krótkotrwały signed URL HTTPS z dokładnego originu projektu Supabase i jawnej listy prywatnych bucketów. Usunięto fallback do dowolnego URL, Google Viewer oraz `<object>`; Google Sheets ma osobną allowlistę `https://docs.google.com/spreadsheets/`.
- Raport sprzedaży warsztatu ma klucz cache zawierający `providerId` i pobiera dane przez `phase_d_workshop_sales_report`. RPC ponownie sprawdza `auth.uid()` oraz uprawnienie managera do providera i zwraca tylko faktury połączone ze zleceniami tego warsztatu.
- Publiczny `invoice-pdf.php`, który przyjmował dowolny HTML bez auth, zwraca teraz `410 endpoint_disabled`. Klient nie przesyła do niego HTML.
- Model AI parsera nieruchomości nie zapisuje już surowego HTML; wynik jest zamieniany na ograniczony, escapowany tekst.

## Ataki blokowane

Przed zmianą możliwe były stored/reflected XSS przez pola klienta, umowy i wynik modelu, wykonanie aktywnego HTML w podglądzie strony, arbitralne renderowanie HTML przez publiczny PHP, podszycie przez `testUser`, uruchomienie realnej wysyłki przez zmianę Local Storage oraz odczyt cache poprzedniego użytkownika/tenanta po logout.

## Zmienione pliki

Główne granice bezpieczeństwa:

- `vite.config.ts`, `src/main.tsx`, `src/App.tsx`
- `src/security/authStorage.ts`, `src/security/sessionIsolation.ts`
- `src/security/SessionIsolationBoundary.tsx`, `src/security/htmlSanitizer.ts`
- `src/security/trustedContentUrl.ts`
- `src/integrations/supabase/client.ts`
- `public/invoice-pdf.php`, `src/utils/renderInvoicePdf.ts`
- `src/utils/invoiceHtmlGenerator.ts`, `src/utils/rentalContractGenerator.ts`
- formularze auth: `Auth.tsx`, `MarketplaceAuth.tsx`, `AuthModal.tsx`, `LoginModal.tsx`
- komponenty dokumentów, umów, faktur, map, raportów i website buildera wskazane przez testy `phase-d-*`.
- `src/components/workshop/WorkshopExtraReports.tsx`

Dodano migrację `20260801145000_phase_d_session_xss_tenant_followup.sql` z wąskim, tenantowym RPC raportu sprzedaży. Migracja nie została uruchomiona na żadnej bazie.

## Testy

- `npm run test:security:phase-d`: **PASS, 40/40**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `php -l public/invoice-pdf.php`: **PASS**.
- kontrola wygenerowanego service workera: **PASS** — brak cache Supabase.
- `git diff --check`: **PASS**.

## Celowo zablokowane funkcje i przywrócenie

1. **Publiczny generator PDF:** przywrócić jako uwierzytelniony endpoint przyjmujący wyłącznie `document_id`; serwer ma zweryfikować JWT, tenant i uprawnienie, pobrać dane oraz użyć kontrolowanego szablonu. Dompdf: `isPhpEnabled=false`, `isRemoteEnabled=false`, limit/rate limit/audyt.
2. **Realne SMS/e-mail wynajmu:** zastąpić klientowy przełącznik serwerowym endpointem z tenantem z JWT, zgodami, limitem, audytem, idempotency key i katalogiem zatwierdzonych nadawców.
3. **Pełne CSS podglądów AI i dokumentów:** obecnie aktywny CSS/skrypty są usuwane. Przywrócić przez zaufane klasy/statyczny arkusz albo izolowany origin renderera z CSP; nie dopuszczać dowolnego `style` z bazy lub modelu.
4. **Prywatny tryb offline:** celowo brak cache odpowiedzi Supabase. Przywrócenie wymaga szyfrowanego, wersjonowanego magazynu partycjonowanego przez `user_id + tenant_id`, z czyszczeniem przy logout/revokacji.
5. **Historyczne URL dokumentów:** arbitralne/publiczne URL nie są już renderowane. Przywrócić podgląd po zarejestrowaniu obiektu w `private_storage_objects`, nadaniu ACL oraz pobieraniu krótkiego signed URL przez `private-storage-download`; upload ma zapisywać bucket i ścieżkę, nie publiczny URL. Nie przywracać fallbacku do wartości z bazy.
6. **Historyczne faktury bez `workshop_order_id`:** nie pojawią się w tenantowym raporcie warsztatu. Bezpieczne przywrócenie wymaga kontrolowanego backfillu powiązania faktura → zlecenie/provider, po kopii i raporcie rekordów niejednoznacznych. Nie wolno wracać do filtra wyłącznie po `user_id`.

## Ryzyko pozostałe i działania ręczne

- Wykonać w prawdziwej przeglądarce test A → logout → B, tę samą i nową kartę oraz offline/throttling; potwierdzić brak danych A.
- Na lokalnym/stagingowym Supabase wykonać test RPC: manager A → provider A (sukces), manager A → provider B (403), pracownik bez roli finansowej (403), anon (401). Lokalny Docker pozostaje niedostępny, więc migracja nie została wykonana runtime.
- Po wdrożeniu użytkownicy ze starą, nieoznaczoną sesją Local Storage zostaną jednorazowo wylogowani — to zamierzone czyszczenie historycznego stanu.
- Przeskanować istniejące kolumny HTML i wykonać kontrolowany backfill po kopii zapasowej; sanitizer przy odczycie blokuje payload, ale nie usuwa go z bazy.
- Po dodaniu bezpiecznego renderera przeprowadzić regresję wizualną umów, faktur i raportów. Obecny fail-closed renderer zachowuje treść, ale ogranicza formatowanie.
- Pełna CSP aplikacji i nagłówki hostingu należą do Fazy F; do tego czasu globalny gate publikacyjny pozostaje **NO-GO**.
