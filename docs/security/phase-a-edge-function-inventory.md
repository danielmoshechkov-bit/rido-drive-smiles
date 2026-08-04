# Phase A — Edge Function Inventory

Stan bazowy przed wdrożeniem zabezpieczeń Fazy A, 2026-08-01. Dokument obejmuje wyłącznie statyczną analizę lokalnego repozytorium; nie potwierdza konfiguracji wdrożonej w panelu Supabase.

## Legenda

| Symbol | Znaczenie |
|---|---|
| A | Endpoint zalogowanego użytkownika; wymaga zweryfikowanego JWT i autoryzacji zasobu/tenanta. |
| B | Endpoint administracyjny; wymaga JWT, jawnej roli systemowego administratora, audytu i dla operacji krytycznych reautoryzacji. |
| C | Service-to-service/worker; wymaga fail-closed podpisu HMAC lub równoważnego poświadczenia, timestampu i ochrony replay. |
| D | Webhook dostawcy; podpis musi być sprawdzany na surowym body, a event zapisany idempotentnie. |
| E | Świadomie publiczny endpoint read-only; odpowiedź nie może zawierać danych prywatnych ani sekretów. |
| F | Endpoint do zablokowania; obecnej funkcji nie wolno publikować w tym kształcie. |
| ENABLE* | Może pozostać dostępny dopiero po wykonaniu wskazanych działań P1; nie oznacza gotowości produkcyjnej. |
| BLOCK | Powinien odpowiadać fail-closed do czasu poprawnej implementacji wymaganej klasy. |

W `supabase/config.toml` znajduje się 108 sekcji. 107 ma `verify_jwt=false`; tylko `generate-ad-creative` ma `verify_jwt=true`. Dwie sekcje nie mają implementacji. Spośród 106 istniejących funkcji 96 używa `service_role`. Wildcard CORS oraz brak wspólnego rate limitingu, audytu i tenant resolvera są problemami przekrojowymi.

## Funkcje ujęte w `supabase/config.toml`

| # | Funkcja | Klasa docelowa | `verify_jwt` | `service_role` | Obecna kontrola auth / tenant / roli | Priorytet | Decyzja |
|---:|---|:---:|:---:|:---:|---|:---:|:---:|
| 1 | `drivers-search` | A | false | tak | Brak JWT i tenanta; globalny odczyt kierowców. | P0 | BLOCK |
| 2 | `vehicles` | A | false | nie | Klient anon; nagłówek JWT nie jest przekazywany; prywatny CRUD. | P0 | BLOCK |
| 3 | `documents` | A | false | nie | Klient anon; brak właściciela/tenanta dokumentu. | P0 | BLOCK |
| 4 | `document-templates` | B | false | nie | Anonimowy pełny CRUD szablonów. | P0 | BLOCK |
| 5 | `reminders` | C | false | tak | Brak auth; publiczny odczyt/zapis/cron i wysyłka. | P0 | BLOCK |
| 6 | `settlements` | A | false | tak | Brak JWT; ufa `fleet_id`, `city_id` i CSV z body. | P0 | BLOCK |
| 7 | `csv-import` | B | false | tak | Brak JWT/roli; `force_first_import`, masowe zapisy i stałe hasło. | P0 | BLOCK |
| 8 | `admin-bootstrap` | B | false | tak | Stały token w kodzie; tworzy potwierdzonego administratora. | P0 | BLOCK |
| 9 | `create-driver-accounts` | B | false | tak | Brak auth; masowo tworzy konta ze stałym hasłem. | P0 | BLOCK |
| 10 | `reset-driver-password` | B | false | tak | Brak auth; body wybiera konto, hasło i usunięcie użytkownika. | P0 | BLOCK |
| 11 | `cleanup-fake-auth-accounts` | B | false | tak | Brak auth; masowe usuwanie użytkowników Auth. | P0 | BLOCK |
| 12 | `sync-driver-ids` | B | false | tak | Brak auth; klient wybiera `city_id`; masowe zmiany. | P0 | BLOCK |
| 13 | `update-driver-debt` | C | false | tak | Brak podpisu; body ustala kierowcę i wartości zadłużenia. | P0 | BLOCK |
| 14 | `rebuild-drivers` | B | false | tak | Brak auth; masowa przebudowa i stałe hasło. | P0 | BLOCK |
| 15 | `sanitize-getrido` | B | false | tak | Brak auth; masowa mutacja wskazanego miasta. | P0 | BLOCK |
| 16 | `fleet-invitations` | A | false | tak | JWT sprawdzany; brak potwierdzenia członkostwa w `fleet_id` i właściciela zaproszenia. | P0 | BLOCK |
| 17 | `fuel-import` | A | false | tak | Brak JWT/tenanta; masowy import. | P0 | BLOCK |
| 18 | `import-drivers` | B | false | tak | Brak JWT/roli; body wybiera `city_id`. | P0 | BLOCK |
| 19 | `send-registration-email` | C | false | tak | Brak podpisu; dowolny odbiorca i `activation_link`. | P0 | BLOCK |
| 20 | `register-driver` | F | false | tak | Publiczny admin signup; ufa `existing_user_id`, auto-confirm i zmianie hasła. | P0 | BLOCK |
| 21 | `send-password-reset-email` | F | false | tak | Publiczne `listUsers`/recovery; brak trwałego limitu. | P1 | BLOCK |
| 22 | `send-price-change-email` | C | false | tak | Brak podpisu; kierowca, pojazd i ceny z body. | P1 | BLOCK |
| 23 | `client-verify-vehicle-ownership` | A | false | tak | JWT poprawny, lecz VIN może przenieść cudzy zweryfikowany pojazd. | P0 | BLOCK |
| 24 | `register-marketplace-user` | F | false | tak | Publiczny admin signup; opcjonalne auto-confirm i nadawanie ról. | P0 | BLOCK |
| 25 | `resend-activation-email` | F | false | tak | Brak trwałego limitu; częściowa enumeracja aktywnych kont. | P1 | BLOCK |
| 26 | `activate-workshop-trial` | A | false | tak | JWT wyznacza własnego użytkownika; brak allowlisty planów, audytu i rate limitu. | P1 | ENABLE* |
| 27 | `send-driver-invoice` | A | false | tak | Brak JWT/ownership; `fleet_id` i odbiorca z body. | P0 | BLOCK |
| 28 | `create-fleet-account` | B | false | tak | Brak auth; tworzy potwierdzone konto, role i zwraca recovery link. | P0 | BLOCK |
| 29 | `ai-search` | E | false | tak | Auth opcjonalny; ufa `userId`/IP; globalny odczyt i koszt AI. | P0 | BLOCK |
| 30 | `ai-chat-support` | F | false | brak kodu | Stara sekcja bez katalogu/implementacji. | P1 | BLOCK |
| 31 | `ai-admin-assistant` | F | false | brak kodu | Stara sekcja bez katalogu/implementacji. | P1 | BLOCK |
| 32 | `track-listing-interaction` | F | false | tak | Anonimowy zapis dowolnej interakcji/IP; brak limitu. | P1 | BLOCK |
| 33 | `ai-listing-assessment` | E | false | nie | Publiczny koszt AI bez zaufanego limitu. | P1 | BLOCK |
| 34 | `transit-data` | E | false | tak | Publiczny cache danych nieprywatnych; brak limitu współrzędnych/zapisów. | P1 | ENABLE* |
| 35 | `location-integrations` | B | false | tak | JWT i rola admin/real-estate-admin; brak audytu, reauth i prawdziwego vaultu. | P1 | ENABLE* |
| 36 | `google-location-data` | E | false | tak | Publiczne zużycie płatnego API; brak limitu; logowany prefiks klucza. | P1 | BLOCK |
| 37 | `ai-service` | A | false | tak | Brak wiarygodnego JWT; ufa klientowemu `userId`; globalny routing i koszt. | P0 | BLOCK |
| 38 | `ai-seo-generator` | A | false | tak | Brak JWT/ownership; zapisuje dla `listingId` z body. | P0 | BLOCK |
| 39 | `ai-photo-edit` | A | false | tak | JWT tylko do billing; brak ownership oferty; `created_by` z body. | P0 | BLOCK |
| 40 | `register-fleet` | F | false | tak | Publiczny signup; ufa `existing_user_id` i nadaje rolę floty. | P0 | BLOCK |
| 41 | `seed-services-demo` | B | false | tak | Brak JWT/roli; masowe dane demonstracyjne. | P0 | BLOCK |
| 42 | `invoice-pdf` | A | false | tak | Brak auth/tenanta; faktura pobierana po dowolnym ID. | P0 | BLOCK |
| 43 | `send-sms` | A | false | tak | Brak obowiązkowego auth; numer/tekst/fleet/sender z body; brak idempotencji. | P0 | BLOCK |
| 44 | `rental-payment-reminders` | A | false | tak | Brak tenant auth; dowolne kwoty, status `paid`, szablony i wysyłki. | P0 | BLOCK |
| 45 | `ksef-integration` | A | false | tak | Auth opcjonalny; body wybiera token/NIP/entity/fakturę. | P0 | BLOCK |
| 46 | `verify-vat` | E/A | false | tak | Publiczny lookup połączony z aktualizacją dowolnego `driver_id`. | P0 | BLOCK |
| 47 | `ai-assistant` | A | false | tak | `confirmed:true` i `toolCalls` z klienta; część akcji dostępna anonimowo. | P0 | BLOCK |
| 48 | `registry-gus` | E/A | false | tak | Publiczny lookup może zapisać wynik do klientowego `recipientId`. | P1 | BLOCK |
| 49 | `gus-lookup` | E | false | nie | Publiczny read-only; brak rate limitu/CORS allowlisty. | P1 | ENABLE* |
| 50 | `registry-whitelist` | E/A | false | tak | Publiczny lookup może zapisać pod dowolnym `recipientId`. | P1 | BLOCK |
| 51 | `admin-list-users` | B | false | tak | `getUser` i `has_role(admin)`; zależne od szczelności `user_roles`, brak audytu/reauth. | P1 | ENABLE* |
| 52 | `admin-create-user` | B | false | tak | JWT/admin poprawne; role z body, słabe minimum hasła, brak audytu. | P1 | ENABLE* |
| 53 | `insurance-alerts` | C | false | tak | Brak podpisu; globalny worker odczytuje pojazdy i tworzy alerty. | P0 | BLOCK |
| 54 | `ai-invoice-assistant` | A | false | tak | Brak JWT/ownership `entity_id`; mutacje faktur. | P0 | BLOCK |
| 55 | `send-invoice-email` | A | false | tak | Brak JWT/ownership faktury i odbiorcy. | P0 | BLOCK |
| 56 | `send-rental-invitation` | C | false | nie | Brak podpisu; dowolny odbiorca i link portalowy. | P0 | BLOCK |
| 57 | `send-rental-confirmation` | C | false | tak | Brak auth; dowolny najem/odbiorca i zapis logu. | P0 | BLOCK |
| 58 | `admin-ai-agent` | B | false | tak | Brak JWT/roli; globalne narzędzia administracyjne i feature flags. | P0 | BLOCK |
| 59 | `admin-ai-secrets` | B | false | tak | `getUser` i admin; brak rate limitu, reauth i pełnego audytu. | P1 | ENABLE* |
| 60 | `voice-preview` | A | false | tak | JWT poprawny; brak tenant entitlement i limitu kosztu. | P1 | ENABLE* |
| 61 | `voice-list` | A | false | tak | JWT poprawny; współdzielone konto ElevenLabs, brak limitu. | P1 | ENABLE* |
| 62 | `voice-company-interview` | A | false | tak | JWT poprawny; nieograniczony fetch URL powoduje SSRF/prompt injection. | P0 | BLOCK |
| 63 | `voice-agent-chat` | A/C | false | tak | Service-token omija auth; provider, kontekst, prompt i capability z body. | P0 | BLOCK |
| 64 | `voice-library` | A | false | tak | JWT poprawny; brak entitlement/quota per tenant. | P1 | ENABLE* |
| 65 | `voice-add` | A | false | tak | Każdy zalogowany mutuje współdzielone konto ElevenLabs. | P1 | BLOCK |
| 66 | `voice-agent-tools` | A/C | false | tak | Provider z body; service-token omija kontrolę; write bez idempotencji/audytu. | P0 | BLOCK |
| 67 | `voice-call-analyze` | A/C | false | tak | Provider/order/booking z body; automatycznie publikuje aktywną wiedzę. | P0 | BLOCK |
| 68 | `voice-agent-llm` | C | false | tak | Zmienione w Fazie E: dawny globalny `VOICE_LLM_TOKEN` i token w URL są odrzucane; wymagane jest krótkotrwałe capability związane z provider/config/call/persona. Live pozostaje fail-closed. | P1 | ENABLE* |
| 69 | `voice-call-postprocess` | D | false | tak | HMAC raw body, ale provider z niepodpisanego URL; brak replay; uruchamia auto-learning. | P0 | BLOCK |
| 70 | `voice-agent-simulate` | A | false | tak | Podany provider nie jest weryfikowany; analiza testowa może publikować wiedzę. | P0 | BLOCK |
| 71 | `ticket-ai-chat` | A | false | tak | JWT poprawny; brak rate limitu, audytu i walidacji screenshot URL. | P1 | ENABLE* |
| 72 | `generate-repair-prompt` | B | false | tak | JWT/rola, ale brak tenant ownership ticketu; każda rola flotowa może użyć dowolnego ID. | P0 | BLOCK |
| 73 | `getrido-ai-execute` | F | false | tak | Publiczny proxy przekazuje body do `ai-chat` jako `service_role`. | P0 | BLOCK |
| 74 | `send-fleet-registration-email` | C | false | tak | Brak podpisu; dowolny odbiorca i link aktywacyjny. | P0 | BLOCK |
| 75 | `fleet-alerts` | C | false | tak | Brak podpisu; globalny worker. | P0 | BLOCK |
| 76 | `workshop-send-sms` | A/C | false | tak | JWT i membership/owner binding; wewnętrzne service-call; brak rate/idempotencji/audytu. | P1 | ENABLE* |
| 77 | `workshop-send-scheduled-sms` | C | false | tak | Sekret crona opcjonalny; przy braku sekretu endpoint pozostaje otwarty. | P0 | BLOCK |
| 78 | `admin-users` | B | false | tak | JWT/admin poprawne; destrukcyjne akcje bez reauth/idempotencji/audytu. | P1 | ENABLE* |
| 79 | `create-test-accounts` | F | false | tak | Brak auth; tworzy stałe konta i hasła testowe. | P0 | BLOCK |
| 80 | `crm-import-asari` | A/C | false | tak | Brak auth; dowolny `integration_id`, masowe zapisy i SSRF przez URL feedu. | P0 | BLOCK |
| 81 | `ai-call-webhook-meta` | D | false | tak | Brak podpisu; stały verify token, PII w logu, automatyczne `ai_consent=true`. | P0 | BLOCK |
| 82 | `ai-call-webhook-telegram` | D | false | tak | Brak sekretu/podpisu/replay; fałszywe leady i zgody. | P0 | BLOCK |
| 83 | `ai-call-worker` | C | false | tak | Brak podpisu; publiczne uruchamianie kolejki i zapis symulacji. | P0 | BLOCK |
| 84 | `ai-generate-call-scripts` | A/B | false | tak | Brak JWT/ownership; zapis/usuwanie skryptów dla `config_id` z body. | P0 | BLOCK |
| 85 | `ai-chat` | A | false | tak | Auth opcjonalny; klientowy `systemPrompt`; globalne providery i koszt. | P0 | BLOCK |
| 86 | `foto-proxy` | E | false | nie | Stała allowlista źródeł i magic-byte check; brak limitu rozmiaru/rate. | P1 | ENABLE* |
| 87 | `seo-agent` | C/B | false | tak | Brak podpisu/roli; globalny worker modyfikujący oferty. | P0 | BLOCK |
| 88 | `generate-document-ai` | A | false | nie | Brak JWT; publiczny koszt i niezaufana treść dokumentu. | P1 | BLOCK |
| 89 | `parse-general-listing` | E/A | false | nie | Brak JWT/rate limitu; publiczny koszt AI. | P1 | BLOCK |
| 90 | `auto-translate-ui` | C/B | false | tak | Brak podpisu/roli; globalny zapis tłumaczeń UI. | P0 | BLOCK |
| 91 | `auto-translate-listing` | A/C | false | tak | Brak auth/ownership; klientowy listing i tekst. | P0 | BLOCK |
| 92 | `auto-translate-daily` | C | false | tak | Brak podpisu; publiczny masowy worker. | P0 | BLOCK |
| 93 | `translation-queue-worker` | C | false | tak | Brak podpisanego wywołania; globalny worker. | P0 | BLOCK |
| 94 | `translation-queue-add` | A/C | false | tak | Brak JWT/tenant; dowolne zadania kosztowe. | P0 | BLOCK |
| 95 | `translate-content` | A/E | false | tak | Brak auth; globalny cache może zawierać prywatne treści. | P0 | BLOCK |
| 96 | `generate-provider-description` | A | false | tak | Brak JWT/ownership; publiczny koszt AI. | P1 | BLOCK |
| 97 | `generate-ad-creative` | A | true | tak | Gateway JWT, lecz brak `getUser`; `service_id/client_id` z body i zapis `service_role`. | P0 | BLOCK |
| 98 | `report-portal-error` | F | false | tak | Publiczna wysyłka e-mail; throttle tylko w pamięci instancji. | P1 | BLOCK |
| 99 | `workshop-translate` | A | false | tak | Brak JWT; prywatny tekst trafia do globalnego cache/modelu. | P0 | BLOCK |
| 100 | `workshop-translate-batch` | A | false | tak | Brak JWT/tenanta; dowolne identyfikatory encji i zapis cache. | P0 | BLOCK |
| 101 | `workshop-invite-employee` | A | false | tak | JWT i owner/provider binding; brak allowlisty ról, rate i bezpiecznego tokenu. | P1 | ENABLE* |
| 102 | `workshop-accept-employee-invitation` | F | false | tak | UUID rekordu jako token; brak auth, expiry i związania z e-mailem. | P0 | BLOCK |
| 103 | `workshop-employee-submit-findings` | A | false | tak | JWT i assignment/provider binding; brak idempotencji/audytu. | P1 | ENABLE* |
| 104 | `workshop-approve-findings` | A | false | tak | JWT i owner/provider binding; brak limitu batcha i audytu. | P1 | ENABLE* |
| 105 | `rental-dispatcher` | C | false | tak | Brak podpisu; publiczny worker `service_role`. | P0 | BLOCK |
| 106 | `rental-availability` | A | false | nie | RLS przez przekazany JWT, lecz bez jawnego `getUser`/401. | P1 | ENABLE* |
| 107 | `driver-bank-change-request` | A | false | tak | Claims wiążą usera z kierowcą; słaba walidacja IBAN, plaintext token, brak rate/audytu. | P1 | ENABLE* |
| 108 | `driver-bank-change-confirm` | F | false | tak | Publiczna zmiana rachunku przez plaintext token; consume i aktualizacja nieatomowe. | P0 | BLOCK |

## Istniejące funkcje bez sekcji w `config.toml`

W repozytorium istnieje **65**, a nie 63, funkcji bez jawnej sekcji. Różnica `171 katalogów - 108 sekcji = 63` jest myląca, ponieważ dwie sekcje konfiguracji nie mają kodu. Przecięcie wynosi 106, więc `171 - 106 = 65`. Pominięcie dwóch ostatnich funkcji pozostawiłoby niezinwentaryzowaną powierzchnię ataku.

| # | Funkcja | Wstępne ryzyko | Decyzja |
|---:|---|---|---|
| 1 | `add-to-call-queue` | Kolejka połączeń, zapis leadów i ryzyko duplikacji/kosztu. | Wymaga jawnej klasyfikacji |
| 2 | `admin-sms-settings` | Sekrety i globalna konfiguracja SMS. | Wymaga jawnej klasyfikacji |
| 3 | `ai-agent-contact` | Kontakt AI/SMS/e-mail i dane leadów. | Wymaga jawnej klasyfikacji |
| 4 | `ai-agent-learn` | Zapis wiedzy i poisoning. | Wymaga jawnej klasyfikacji |
| 5 | `ai-agent-reply` | Koszt AI, dane rozmów i możliwe narzędzia. | Wymaga jawnej klasyfikacji |
| 6 | `ai-agent-test` | Tryb testowy może wykonać produkcyjne skutki. | Wymaga jawnej klasyfikacji |
| 7 | `analyze-call` | Transkrypcje, PII, koszt AI i cross-tenant. | Wymaga jawnej klasyfikacji |
| 8 | `analyze-invoice` | Dokumenty finansowe i koszt AI. | Wymaga jawnej klasyfikacji |
| 9 | `auto-queue-hot-leads` | Masowa kolejka outbound i podwójny kontakt. | Wymaga jawnej klasyfikacji |
| 10 | `booking-available-slots` | Prywatna dostępność i tenant calendar. | Wymaga jawnej klasyfikacji |
| 11 | `booking-notify` | Wysyłka komunikacji i dane rezerwacji. | Wymaga jawnej klasyfikacji |
| 12 | `booking-reminders` | Worker komunikacyjny, retry i koszty. | Wymaga jawnej klasyfikacji |
| 13 | `booking-review-reminder` | Publiczna/masowa komunikacja. | Wymaga jawnej klasyfikacji |
| 14 | `booking-send-verification` | Kody weryfikacyjne, enumeration i abuse. | Wymaga jawnej klasyfikacji |
| 15 | `booking-verify-code` | Token/kod, replay i przejęcie rezerwacji. | Wymaga jawnej klasyfikacji |
| 16 | `commission-monthly-billing` | Rozliczenia finansowe i masowy worker. | Wymaga jawnej klasyfikacji |
| 17 | `daily-sales-analysis` | Globalne dane sprzedażowe i koszt AI. | Wymaga jawnej klasyfikacji |
| 18 | `deepgram-transcribe` | Nagrania/PII, sekret Deepgram i koszt. | Wymaga jawnej klasyfikacji |
| 19 | `email-probe` | Diagnostyka/wysyłka e-mail i sekrety SMTP. | Wymaga jawnej klasyfikacji |
| 20 | `execute-agent-action` | Uprzywilejowane akcje AI i tool injection. | Wymaga jawnej klasyfikacji |
| 21 | `external-lead-webhook` | Publiczny ingress, podpis, replay i tenant routing. | Wymaga jawnej klasyfikacji |
| 22 | `gmb-sync` | Integracja Google, tokeny i masowe zmiany. | Wymaga jawnej klasyfikacji |
| 23 | `ic-catalog-sync` | Zewnętrzny import i masowy zapis katalogu. | Wymaga jawnej klasyfikacji |
| 24 | `instagram-post` | Publikacja zewnętrzna i token Meta. | Wymaga jawnej klasyfikacji |
| 25 | `invoice-email-webhook` | Webhook e-mail, faktury, podpis i replay. | Wymaga jawnej klasyfikacji |
| 26 | `knowledge-update-bot` | Modyfikacja wiedzy/promptów i poisoning. | Wymaga jawnej klasyfikacji |
| 27 | `ksef-monitor` | KSeF, tokeny fiskalne/księgowe i worker. | Wymaga jawnej klasyfikacji |
| 28 | `ksef-unsubscribe` | Destrukcyjna zmiana subskrypcji KSeF. | Wymaga jawnej klasyfikacji |
| 29 | `local-seo-autopilot` | Masowe publikowanie/zmiany i koszt AI. | Wymaga jawnej klasyfikacji |
| 30 | `lookup-nip` | Publiczny lookup, koszt i opcjonalny zapis. | Wymaga jawnej klasyfikacji |
| 31 | `marketing-agent-chat` | Dane kampanii, koszt AI i możliwe narzędzia. | Wymaga jawnej klasyfikacji |
| 32 | `meeting-ai` | Dane spotkań, nagrania/transkrypcje i koszt. | Wymaga jawnej klasyfikacji |
| 33 | `meta-leads-receiver` | Webhook Meta, podpis/replay i tenant routing. | Wymaga jawnej klasyfikacji |
| 34 | `meta-leads-webhook` | Webhook Meta, podpis/replay i tenant routing. | Wymaga jawnej klasyfikacji |
| 35 | `migrate-ledger-payments-flame` | Migracja/ledger płatności i ryzyko salda. | Wymaga jawnej klasyfikacji |
| 36 | `parse-listing-ai` | Koszt AI, niezaufany HTML i zapis oferty. | Wymaga jawnej klasyfikacji |
| 37 | `parse-purchase-invoice` | Dokumenty finansowe, upload i koszt AI. | Wymaga jawnej klasyfikacji |
| 38 | `payment-core` | Kwoty, produkty, kredyty, SMS i operacje finansowe. | Wymaga jawnej klasyfikacji |
| 39 | `payment-core-webhook` | Podpis płatności, replay, idempotencja i ledger. | Wymaga jawnej klasyfikacji |
| 40 | `predict-campaign-performance` | Koszt AI i dane kampanii. | Wymaga jawnej klasyfikacji |
| 41 | `process-purchase-inventory` | Faktury zakupowe i mutacje magazynu. | Wymaga jawnej klasyfikacji |
| 42 | `recalculate-week` | Masowe przeliczenie rozliczeń. | Wymaga jawnej klasyfikacji |
| 43 | `reset-fleet-settlements` | Destrukcyjne resetowanie danych finansowych. | Wymaga jawnej klasyfikacji |
| 44 | `rido-mail` | Hasła/tokeny pocztowe, PII, sync i wysyłka. | Wymaga jawnej klasyfikacji |
| 45 | `rotate-creatives` | Masowe publikacje i zewnętrzne API. | Wymaga jawnej klasyfikacji |
| 46 | `run-ab-test` | Zmiana wariantów AI i globalne dane jakości. | Wymaga jawnej klasyfikacji |
| 47 | `run-automations` | Dowolne automatyzacje i wielokrotne skutki. | Wymaga jawnej klasyfikacji |
| 48 | `schedule-viewings` | Kalendarze/terminy, tenant i podwójne zapisy. | Wymaga jawnej klasyfikacji |
| 49 | `score-lead` | Dane leadów, cross-tenant i koszt AI. | Wymaga jawnej klasyfikacji |
| 50 | `send-daily-report` | Masowa wysyłka i prywatne raporty. | Wymaga jawnej klasyfikacji |
| 51 | `send-employee-invitation` | Zaproszenia, tokeny, role i wysyłka. | Wymaga jawnej klasyfikacji |
| 52 | `send-notification` | Ogólna wysyłka i spoofing odbiorcy. | Wymaga jawnej klasyfikacji |
| 53 | `send-project-invitation` | Zaproszenia, tokeny i tenant membership. | Wymaga jawnej klasyfikacji |
| 54 | `smart-followup` | Automatyczny kontakt, zgody, DNC i retry. | Wymaga jawnej klasyfikacji |
| 55 | `sync-external-leads` | Import leadów, tokeny źródeł i deduplikacja. | Wymaga jawnej klasyfikacji |
| 56 | `test-crm-feed` | SSRF, sekrety integracji i tryb testowy. | Wymaga jawnej klasyfikacji |
| 57 | `translate` | Prywatna treść, koszt i globalny cache. | Wymaga jawnej klasyfikacji |
| 58 | `translate-batch` | Masowy koszt i cross-tenant cache. | Wymaga jawnej klasyfikacji |
| 59 | `translate-message` | Prywatne wiadomości i cross-tenant odczyt/zapis. | Wymaga jawnej klasyfikacji |
| 60 | `vehicle-check` | Dane pojazdu, kredyty i płatne źródła. | Wymaga jawnej klasyfikacji |
| 61 | `weekly-debt-calc` | Zadłużenia i wartości finansowe. | Wymaga jawnej klasyfikacji |
| 62 | `weekly-debt-rebuild` | Masowa przebudowa zadłużeń. | Wymaga jawnej klasyfikacji |
| 63 | `weekly-learning` | Automatyczne uczenie i publikacja wiedzy. | Wymaga jawnej klasyfikacji |
| 64 | `workshop-notify-employee` | Dane zleceń i komunikacja pracowników. | Wymaga jawnej klasyfikacji |
| 65 | `workshop-parts-api` | Zewnętrzne API części, tenant, sekrety i koszt. | Wymaga jawnej klasyfikacji |

## Działania ręczne

1. Porównać ten dokument z listą funkcji faktycznie wdrożonych w każdym projekcie Supabase; konfiguracja repozytorium nie dowodzi stanu produkcji.
2. Zablokować routing/deployment wszystkich pozycji `BLOCK` albo wdrożyć fail-closed odpowiedź `503` do czasu właściwego auth. Nie usuwać funkcji ani danych.
3. Obrócić historyczny stały token instalacyjny, wszystkie historyczne hasła testowe i wszystkie poświadczenia, które mogły zostać użyte w środowisku. Wartości nie należy powielać w dokumentacji ani logach.
4. Usunąć/obrócić wycofane `VOICE_LLM_TOKEN` i `VOICE_INTERNAL_SECRET`; skonfigurować nowy `AI_CAPABILITY_SIGNING_SECRET`, obrócić `ELEVENLABS_WEBHOOK_SECRET`, sekrety cronów oraz pozostałe sekrety webhooków. Tokenów nie umieszczać w URL. Telefonii live nie włączać przed przejściem bramek Fazy E/F.
5. Dla klas A/B ustawić `verify_jwt=true`, zachowując niezależne `getUser()`, serwerowe tenant resolution i kontrolę roli w kodzie.
6. Dla klas C/D pozostawić gateway odpowiedni dla dostawcy, ale wymagać podpisu na raw body, timestampu, krótkiego okna czasowego, unikalnego event ID oraz trwałego inboxu replay.
7. Dla klas E skonfigurować origin allowlist, schemat odpowiedzi, rozproszony rate limit i limit kosztu.
8. Dodać centralny audit trail bez tokenów, haseł i pełnych danych wrażliwych.
9. Jawnie dodać do `config.toml` i sklasyfikować wszystkie 65 funkcji z drugiej tabeli; do tego czasu nie mogą przejść GATE 1.

## Werdykt

**FAIL / NO-GO.** GATE 1 nie przechodzi: istnieją publiczne uprzywilejowane funkcje bez poprawnego auth oraz funkcje bez jawnej klasyfikacji wdrożeniowej.
