# Phase A — pełna klasyfikacja Edge Functions

Stan lokalnego repozytorium na 2026-08-01. Kolejność odpowiada `supabase/config.toml`. Dokument jest wynikiem analizy statycznej; nie potwierdza konfiguracji ani wersji wdrożonej w Supabase.

## Legenda

- **A** — endpoint uwierzytelnionego użytkownika, z serwerowym ustaleniem aktora i autoryzacją zasobu/tenanta.
- **B** — endpoint administracyjny, z rolą sprawdzaną w bazie, audytem i — dla operacji krytycznych — reautoryzacją.
- **C** — service-to-service/worker, z podpisem lub silnym sekretem, ochroną replay i idempotencją.
- **D** — webhook dostawcy, z podpisem surowego body i trwałym inboxem zdarzeń.
- **E** — świadomie publiczny, wyłącznie read-only, z limitami kosztu i ruchu.
- **F** — endpoint, który należy wyłączyć albo rozdzielić przed publikacją.
- **HARDENED** — ma niezależną kontrolę wymaganej tożsamości/uprawnień lub bezpieczną bramkę fail-closed. Nie oznacza zakończenia całego audytu ani gotowości produkcyjnej.
- **BLOCKED** — ryzykowny workflow jawnie kończy się bez skutku; przywrócenie wymaga bezpiecznego procesu opisanego w raporcie.
- **OPEN** — nadal dostępny bez pełnej kontroli wymaganej dla klasy. Samo `verify_jwt=true` nie zmienia stanu na HARDENED: publiczny klucz `anon` również jest JWT bramy.

W konfiguracji są **174** sekcje: 171 z `verify_jwt=true` i trzy uzasadnione wyjątki (`admin-bootstrap`, `voice-agent-llm`, `voice-call-postprocess`). Po dodaniu prywatnego pobierania Storage stan wynosi **30 HARDENED, 144 BLOCKED, 0 OPEN**. Spośród pozycji BLOCKED 131 używa wspólnej, bezwarunkowej bramki `phaseABlockedResponse`; pozostałe 13 były już wcześniej wyłączone lub nie mają implementacji.

## Funkcje 1–60

| # | Funkcja | Klasa | Stan | Uzasadnienie / brak |
|---:|---|:---:|:---:|---|
| 1 | `drivers-search` | A | BLOCKED | Service role; brak niezależnego user/tenant binding. |
| 2 | `vehicles` | A | BLOCKED | Brak jawnego potwierdzenia użytkownika i ownership. |
| 3 | `documents` | A | BLOCKED | Brak autoryzacji dokumentu/tenanta. |
| 4 | `document-templates` | B | BLOCKED | Uprzywilejowany CRUD bez kontroli administratora w kodzie. |
| 5 | `reminders` | C | HARDENED | Cron wymaga sekretu; ręczne akcje wymagają administratora. Pozostaje timestamp/replay P1. |
| 6 | `settlements` | A | HARDENED | JWT, dokładna rola floty, canonical fleet i audyt. |
| 7 | `csv-import` | B | HARDENED | Rola admin z DB, audyt; `force_first_import` zablokowany. |
| 8 | `admin-bootstrap` | B | HARDENED | Flaga, silny sekret i atomowy jednorazowy claim; wymaga bezpiecznej konfiguracji. |
| 9 | `create-driver-accounts` | B | BLOCKED | Masowe tworzenie kont wyłączone do czasu bezpiecznych zaproszeń. |
| 10 | `reset-driver-password` | B | BLOCKED | Reset i usunięcie Auth wymagają osobnego zweryfikowanego recovery/unlink. |
| 11 | `cleanup-fake-auth-accounts` | B | HARDENED | Admin z DB, ograniczony zakres i audyt; wymaga reautoryzacji P1. |
| 12 | `sync-driver-ids` | B | BLOCKED | Service role bez niezależnego admin auth. |
| 13 | `update-driver-debt` | C | HARDENED | Wykonanie tylko przez wewnętrzny sekret i canonical settlement; klientowa kwota zablokowana. Replay/idempotencja P1. |
| 14 | `rebuild-drivers` | B | HARDENED | Admin z DB, walidacja zakresu i audyt. |
| 15 | `sanitize-getrido` | B | HARDENED | Admin z DB, jawny zakres i audyt. |
| 16 | `fleet-invitations` | A | BLOCKED | Istnieje JWT, lecz ownership zaproszenia/floty pozostaje niepełny. |
| 17 | `fuel-import` | A | BLOCKED | Service role; brak niezależnego tenant auth. |
| 18 | `import-drivers` | B | HARDENED | Admin z DB, walidacja i audyt. |
| 19 | `send-registration-email` | C | BLOCKED | Wysyłka wyłączona do czasu zaufanej kolejki i serwerowego adresata/linku. |
| 20 | `register-driver` | F | BLOCKED | Publiczny admin-signup usunięty; potrzebny natywny signup/invite. |
| 21 | `send-password-reset-email` | F | BLOCKED | Potrzebny Supabase recovery, jednolita odpowiedź i trwały rate limit. |
| 22 | `send-price-change-email` | C | BLOCKED | Brak podpisanego wywołania, tenant binding i idempotencji. |
| 23 | `client-verify-vehicle-ownership` | A | BLOCKED | JWT istnieje, ale przepięcie pojazdu po VIN pozostaje ryzykowne. |
| 24 | `register-marketplace-user` | F | BLOCKED | Publiczny admin-signup wyłączony. |
| 25 | `resend-activation-email` | F | BLOCKED | Workflow wyłączony do czasu rate limitu i ochrony przed enumeracją. |
| 26 | `activate-workshop-trial` | A | BLOCKED | Auth istnieje; brak pełnego katalogu planów, audytu i limitów. |
| 27 | `send-driver-invoice` | A | BLOCKED | Service role; brak ownership faktury, floty i odbiorcy. |
| 28 | `create-fleet-account` | B | BLOCKED | Tworzenie konta zastąpione wymogiem zweryfikowanego zaproszenia. |
| 29 | `ai-search` | E | BLOCKED | Brak zaufanego limitu kosztu i bezpiecznego publicznego schematu danych. |
| 30 | `ai-chat-support` | F | BLOCKED | Sekcja konfiguracji bez implementacji w repozytorium. |
| 31 | `ai-admin-assistant` | F | BLOCKED | Sekcja konfiguracji bez implementacji w repozytorium. |
| 32 | `track-listing-interaction` | F | BLOCKED | Zapis telemetryczny bez trwałego limitu i ochrony przed spoofingiem. |
| 33 | `ai-listing-assessment` | E | BLOCKED | Publiczny/kosztowy model bez rozproszonego rate limitu. |
| 34 | `transit-data` | E | BLOCKED | Service role i koszt zewnętrzny bez pełnej ochrony abuse. |
| 35 | `location-integrations` | B | BLOCKED | Częściowy auth; brak reautoryzacji, audytu i docelowego vaultu. |
| 36 | `google-location-data` | E | BLOCKED | Publiczny koszt API bez rozproszonego limitu. |
| 37 | `ai-service` | A | BLOCKED | Ufa klientowemu kontekstowi; brak niezależnego actor/tenant binding. |
| 38 | `ai-seo-generator` | A | BLOCKED | Brak ownership `listing_id` i limitów kosztu. |
| 39 | `ai-photo-edit` | A | BLOCKED | JWT tylko częściowy; brak pewnego ownership zasobu. |
| 40 | `register-fleet` | F | BLOCKED | Publiczne nadawanie roli floty wyłączone. |
| 41 | `seed-services-demo` | B | BLOCKED | Masowe zapisy service role bez admin auth. |
| 42 | `invoice-pdf` | A | BLOCKED | Faktura dostępna po ID bez serwerowego ownership. |
| 43 | `send-sms` | A | BLOCKED | Numer, treść i tenant z body; brak kompletnej idempotencji/limitu. |
| 44 | `rental-payment-reminders` | A | BLOCKED | Klientowe kwoty/status/odbiorca i service role. |
| 45 | `ksef-integration` | A | HARDENED | JWT/ownership, szyfrowanie i canonical refs; `send` fail-closed do czasu idempotencji. |
| 46 | `verify-vat` | F | BLOCKED | Łączy publiczny lookup E z zapisem A; wymaga rozdzielenia. |
| 47 | `ai-assistant` | A | HARDENED | Użytkownik i tenant ustalane serwerowo; wysokiego ryzyka tool writes zablokowane. |
| 48 | `registry-gus` | F | BLOCKED | Publiczny lookup połączony z zapisem do klientowego zasobu. |
| 49 | `gus-lookup` | E | BLOCKED | Brak rate limitu i jawnego kontraktu publicznych danych. |
| 50 | `registry-whitelist` | F | BLOCKED | Publiczny lookup połączony z klientowym `recipientId`. |
| 51 | `admin-list-users` | B | HARDENED | JWT i rola admin z DB, ograniczona odpowiedź i audyt. |
| 52 | `admin-create-user` | B | HARDENED | JWT/admin, kontrola ról i audyt; krytyczna reautoryzacja pozostaje P1. |
| 53 | `insurance-alerts` | C | BLOCKED | Globalny worker service role bez podpisu/replay protection. |
| 54 | `ai-invoice-assistant` | A | BLOCKED | Brak ownership podmiotu/faktury przed service-role mutacją. |
| 55 | `send-invoice-email` | A | BLOCKED | Brak ownership faktury i serwerowo ustalonego odbiorcy. |
| 56 | `send-rental-invitation` | C | BLOCKED | Brak podpisu, idempotencji i canonical odbiorcy. |
| 57 | `send-rental-confirmation` | C | BLOCKED | Brak zaufanego wywołania i tenant binding. |
| 58 | `admin-ai-agent` | B | HARDENED | Wspólny admin auth, allowlista akcji i audyt. |
| 59 | `admin-ai-secrets` | B | HARDENED | Admin auth; write-only szyfrowane sekrety i redagowana odpowiedź. Reauth P1. |
| 60 | `voice-preview` | A | BLOCKED | Auth istnieje; brak entitlement, budżetu i rozproszonego rate limitu. |

## Funkcje 61–120

| # | Funkcja | Klasa | Stan | Uzasadnienie / brak |
|---:|---|:---:|:---:|---|
| 61 | `voice-list` | A | BLOCKED | Auth istnieje; brak pełnego tenant entitlement. |
| 62 | `voice-company-interview` | A | BLOCKED | Niezaufany URL/prompt może powodować SSRF lub poisoning. |
| 63 | `voice-agent-chat` | A | HARDENED | Provider wiązany serwerowo; user zawsze test/dry-run; write tools wyłączone. |
| 64 | `voice-library` | A | BLOCKED | Brak quota/entitlement per tenant. |
| 65 | `voice-add` | A | BLOCKED | Użytkownik może mutować współdzielone konto głosów. |
| 66 | `voice-agent-tools` | C | HARDENED | Read-only availability; write tools bezwzględnie 503; actor/provider ponownie autoryzowany. |
| 67 | `voice-call-analyze` | C | HARDENED | User dry-run; internal zapisuje tylko nieaktywną propozycję. Transakcyjność/replay P1. |
| 68 | `voice-agent-llm` | C | HARDENED | Derived HMAC per provider/persona; brak sekretu w URL. |
| 69 | `voice-call-postprocess` | D | HARDENED | HMAC raw body, signed agent binding i atomowy inbox replay. |
| 70 | `voice-agent-simulate` | A | HARDENED | Auth/provider binding; wymuszony dry-run bez skutków produkcyjnych. |
| 71 | `ticket-ai-chat` | A | BLOCKED | Brak trwałego rate limitu i bezpiecznego ownership screenshotu. |
| 72 | `generate-repair-prompt` | B | BLOCKED | Niepełny tenant ownership ticketu. |
| 73 | `getrido-ai-execute` | B | HARDENED | Dawny publiczny proxy ograniczony do administratora i audytowany. |
| 74 | `send-fleet-registration-email` | C | BLOCKED | Wysyłka wyłączona do czasu zaufanej kolejki i canonical adresata. |
| 75 | `fleet-alerts` | C | BLOCKED | Globalny worker bez podpisu i replay protection. |
| 76 | `workshop-send-sms` | A | BLOCKED | Częściowy provider binding; brak trwałej idempotencji, limitu i pełnego audytu. |
| 77 | `workshop-send-scheduled-sms` | C | BLOCKED | Niewystarczająca ochrona crona/replay i lawiny wysyłek. |
| 78 | `admin-users` | B | HARDENED | Admin auth i audyt; reauth/idempotencja destrukcyjnych akcji pozostają P1. |
| 79 | `create-test-accounts` | F | BLOCKED | Działa tylko w lokalnym środowisku z osobnym sekretem; produkcja fail-closed. |
| 80 | `crm-import-asari` | A | BLOCKED | Brak actor/tenant binding i ochrona SSRF feedu niepełna. |
| 81 | `ai-call-webhook-meta` | D | BLOCKED | Brak prawidłowego podpisu raw body i trwałej ochrony replay. |
| 82 | `ai-call-webhook-telegram` | D | BLOCKED | Brak podpisu dostawcy, replay i bezpiecznego tenant routing. |
| 83 | `ai-call-worker` | C | BLOCKED | Worker service role bez podpisanego wywołania/idempotencji. |
| 84 | `ai-generate-call-scripts` | B | HARDENED | Auth, provider binding; operacje ograniczone do bezpiecznego draft/approved flow. |
| 85 | `ai-chat` | A | HARDENED | Wymagany user; klientowy `systemPrompt` ignorowany i audytowany. |
| 86 | `foto-proxy` | E | BLOCKED | Allowlista jest częściowa; brak pełnego limitu rozmiaru/ruchu. |
| 87 | `seo-agent` | C | BLOCKED | Globalny worker/mutacje bez podpisu i tenant binding. |
| 88 | `generate-document-ai` | A | BLOCKED | Brak niezależnego user auth, limitu i ownership danych. |
| 89 | `parse-general-listing` | A | BLOCKED | Koszt AI bez niezależnego actor binding i rate limitu. |
| 90 | `auto-translate-ui` | B | BLOCKED | Globalny zapis tłumaczeń bez admin/worker auth. |
| 91 | `auto-translate-listing` | A | BLOCKED | Brak ownership oferty/tenanta. |
| 92 | `auto-translate-daily` | C | BLOCKED | Worker bez podpisu i idempotencji. |
| 93 | `translation-queue-worker` | C | BLOCKED | Globalny worker bez zaufanego wywołania. |
| 94 | `translation-queue-add` | A | BLOCKED | Brak user/tenant binding i kontroli kosztu. |
| 95 | `translate-content` | A | BLOCKED | Prywatna treść i globalny cache bez izolacji. |
| 96 | `generate-provider-description` | A | BLOCKED | Brak provider ownership i limitu kosztu. |
| 97 | `generate-ad-creative` | A | BLOCKED | Gateway JWT bez niezależnego `getUser`; ID zasobu z body. |
| 98 | `report-portal-error` | F | BLOCKED | Endpoint może wysyłać e-mail; throttle tylko per instancja. |
| 99 | `workshop-translate` | A | BLOCKED | Brak tenant auth; prywatny tekst trafia do modelu/cache. |
| 100 | `workshop-translate-batch` | A | BLOCKED | Brak tenant binding i limitu partii. |
| 101 | `workshop-invite-employee` | A | BLOCKED | Częściowy auth; brak kompletnej allowlisty ról/rate limitu. |
| 102 | `workshop-accept-employee-invitation` | F | BLOCKED | UUID jako capability bez poprawnego związania, expiry i anti-replay. |
| 103 | `workshop-employee-submit-findings` | A | BLOCKED | Auth częściowy; brak idempotencji i audytu. |
| 104 | `workshop-approve-findings` | A | BLOCKED | Auth częściowy; brak audytu/limitów operacji. |
| 105 | `rental-dispatcher` | C | HARDENED | Wymagany silny sekret i claim kolejki; timestamp/replay credential P1. |
| 106 | `rental-availability` | A | BLOCKED | Polega na gateway/RLS bez jawnego `getUser` i tenant context. |
| 107 | `driver-bank-change-request` | A | BLOCKED | Auth istnieje, lecz token/change workflow i rate limit wymagają przebudowy. |
| 108 | `driver-bank-change-confirm` | F | BLOCKED | Publiczny plaintext token i nieatomowe consume/update. |
| 109 | `add-to-call-queue` | A | BLOCKED | Service role; brak actor/tenant binding i deduplikacji kosztu. |
| 110 | `admin-sms-settings` | B | BLOCKED | Częściowy admin auth; sekret/config workflow nieprzejrzany i bez reauth. |
| 111 | `ai-agent-contact` | C | BLOCKED | Kontakt kosztowy bez podpisanego workera, DNC i idempotencji. |
| 112 | `ai-agent-learn` | C | BLOCKED | Automatycznie zmienia wiedzę; powinien tworzyć tylko propozycję. |
| 113 | `ai-agent-reply` | D | BLOCKED | Brak poprawnej weryfikacji podpisu Twilio/raw body. |
| 114 | `ai-agent-test` | A | BLOCKED | Brak wiarygodnego auth i gwarancji dry-run. |
| 115 | `analyze-call` | F | BLOCKED | Ufa providerowi/transkrypcji i publikuje wzorce; blokować do redesignu. |
| 116 | `analyze-invoice` | A | BLOCKED | Brak niezależnego ownership dokumentu i user auth. |
| 117 | `auto-queue-hot-leads` | C | BLOCKED | Worker bez podpisu, DNC i atomowej deduplikacji. |
| 118 | `booking-available-slots` | E | BLOCKED | Potrzebny zakresowy, wygasający token i ograniczony publiczny DTO. |
| 119 | `booking-notify` | C | BLOCKED | Wysyłka bez podpisanego workera i idempotencji. |
| 120 | `booking-reminders` | C | BLOCKED | Worker komunikacyjny bez bezpiecznego claim/replay. |

## Funkcje 121–174

| # | Funkcja | Klasa | Stan | Uzasadnienie / brak |
|---:|---|:---:|:---:|---|
| 121 | `booking-review-reminder` | C | BLOCKED | Wysyłka bez zaufanego wywołania, consent i deduplikacji. |
| 122 | `booking-send-verification` | F | BLOCKED | Słaby kod/losowość, enumeration i brak trwałego limitu. |
| 123 | `booking-verify-code` | F | BLOCKED | Słaba/non-atomic weryfikacja kodu i replay. |
| 124 | `commission-monthly-billing` | C | BLOCKED | Finansowy worker bez podpisu/idempotentnego ledger eventu. |
| 125 | `daily-sales-analysis` | C | BLOCKED | Globalne dane i koszt AI bez podpisanego wywołania. |
| 126 | `deepgram-transcribe` | A | HARDENED | User/meeting/audio path ownership, signed URL i redagowane błędy. Rate/cost limit P1. |
| 127 | `email-probe` | F | BLOCKED | Publiczna diagnostyka/wysyłka SMTP i ryzyko ujawnienia konfiguracji. |
| 128 | `execute-agent-action` | B | BLOCKED | Wysokiego ryzyka tool execution bez kompletnej ponownej autoryzacji. |
| 129 | `external-lead-webhook` | D | BLOCKED | Shared secret bez prawidłowego raw-body HMAC/replay inbox. |
| 130 | `gmb-sync` | A | BLOCKED | Ręczny i workerowy trust boundary wymaga rozdzielenia; token/tenant niepełny. |
| 131 | `ic-catalog-sync` | C | BLOCKED | Import worker bez podpisu, limitu i trwałego claimu. |
| 132 | `instagram-post` | A | BLOCKED | Publikacja zewnętrzna bez pełnego ownership, reauth i idempotencji. |
| 133 | `invoice-email-webhook` | F | BLOCKED | Opcjonalny sekret i klientowy `user_id`; rozdzielić UI A od webhooka D. |
| 134 | `knowledge-update-bot` | C | BLOCKED | Może zmieniać wiedzę bez workflow proposal → human approval. |
| 135 | `ksef-monitor` | C | BLOCKED | Worker KSeF bez kompletnego podpisu, lease i tenant binding. |
| 136 | `ksef-unsubscribe` | F | BLOCKED | Destrukcyjna operacja bez bezpiecznej reautoryzacji/workflow. |
| 137 | `local-seo-autopilot` | C | BLOCKED | Automatyczne publikacje bez podpisu, approval i idempotencji. |
| 138 | `lookup-nip` | E | BLOCKED | Brak rozproszonego rate limitu i gwarancji read-only. |
| 139 | `marketing-agent-chat` | A | BLOCKED | Brak niezależnego actor/tenant binding i budżetu AI. |
| 140 | `meeting-ai` | A | BLOCKED | Częściowy auth; recording URL/ownership i tenant isolation niepełne. |
| 141 | `meta-leads-receiver` | D | BLOCKED | Brak podpisu Meta raw body i trwałego inboxu replay. |
| 142 | `meta-leads-webhook` | D | BLOCKED | Brak podpisu Meta raw body i bezpiecznego tenant routing. |
| 143 | `migrate-ledger-payments-flame` | F | BLOCKED | Destrukcyjna migracja dostępna jako endpoint; natychmiast blokować. |
| 144 | `parse-listing-ai` | B | BLOCKED | Service role, niezaufany HTML i brak admin/ownership auth. |
| 145 | `parse-purchase-invoice` | A | BLOCKED | Dokument finansowy bez jawnego user/tenant ownership. |
| 146 | `payment-core` | A | HARDENED | Faza B: tylko uwierzytelniona intencja z kanonicznym `price_id` i idempotencją; rejestracja u operatora pozostaje fail-closed. |
| 147 | `payment-core-webhook` | D | BLOCKED | Brak potwierdzonego raw-body podpisu, replay i atomowego ledger grant. |
| 148 | `predict-campaign-performance` | A | BLOCKED | Brak ownership kampanii i limitu kosztu. |
| 149 | `process-purchase-inventory` | A | BLOCKED | Częściowy auth; check-then-mark pozwala na równoległe podwójne wykonanie. |
| 150 | `private-storage-download` | A | HARDENED | JWT, serwerowy tenant/owner/ACL, krótki signed URL, rate limit i audyt; wymaga operacyjnego backfillu metadanych. |
| 151 | `recalculate-week` | B | BLOCKED | Finansowe przeliczenie bez niezależnego admin/fleet auth. |
| 152 | `reset-fleet-settlements` | B | BLOCKED | Destrukcyjny reset bez admin auth, reauth i audytu. |
| 153 | `rido-mail` | A | HARDENED | User binding, AES-GCM dla nowych haseł, stare plaintext blokowane; OAuth/rotacja P1. |
| 154 | `rotate-creatives` | C | BLOCKED | Worker publikacyjny bez podpisu/approval/idempotencji. |
| 155 | `run-ab-test` | C | BLOCKED | Globalny worker eksperymentu bez signed invocation i tenant isolation. |
| 156 | `run-automations` | C | BLOCKED | Wielokrotne skutki bez signed worker, lease i idempotencji. |
| 157 | `schedule-viewings` | F | BLOCKED | Miesza publiczne umawianie i prywatne zapisy; wymaga podziału/tokenów. |
| 158 | `score-lead` | F | BLOCKED | Lead/tenant z body; blokować do canonical signed ingress lub osobnego A/C. |
| 159 | `send-daily-report` | C | BLOCKED | Prywatne raporty i wysyłka bez podpisanego workera. |
| 160 | `send-employee-invitation` | A | BLOCKED | Brak pełnego tenant role binding, token policy i rate limitu. |
| 161 | `send-notification` | C | BLOCKED | Ogólna wysyłka pozwala na spoofing odbiorcy/payloadu. |
| 162 | `send-project-invitation` | A | BLOCKED | Brak pełnego ownership projektu i bezpiecznego token workflow. |
| 163 | `smart-followup` | C | BLOCKED | Brak signed worker, DNC, limitu prób i atomowego claimu. |
| 164 | `sync-external-leads` | C | BLOCKED | Import bez signed invocation, canonical tenant i deduplikacji. |
| 165 | `test-crm-feed` | F | BLOCKED | SSRF/sekrety; testowy endpoint nie jest produkcyjnie fail-closed. |
| 166 | `translate` | A | BLOCKED | Prywatna treść, koszt i cache bez user/tenant isolation. |
| 167 | `translate-batch` | A | BLOCKED | Brak limitu partii, ownership i cache isolation. |
| 168 | `translate-message` | A | BLOCKED | Brak ownership konwersacji i separacji tłumaczeń tenantów. |
| 169 | `vehicle-check` | A | BLOCKED | Częściowy auth; płatny lookup/kredyty wymagają serwerowego ledger i idempotencji. |
| 170 | `weekly-debt-calc` | C | BLOCKED | Finansowy worker bez podpisu i niezmiennego ledger eventu. |
| 171 | `weekly-debt-rebuild` | B | BLOCKED | Masowa finansowa przebudowa bez admin auth/reauth. |
| 172 | `weekly-learning` | C | BLOCKED | Automatyczna nauka/publikacja bez human approval. |
| 173 | `workshop-notify-employee` | F | BLOCKED | Miesza user i worker; odbiorca/payload wymagają canonical binding. |
| 174 | `workshop-parts-api` | A | BLOCKED | Auth częściowy; klient wybiera `provider_id` bez pełnego ownership. |

## Wniosek wdrożeniowy

Konfiguracja `verify_jwt=true` ogranicza część anonimowego ruchu, ale nie zastępuje `auth.getUser()`/`requireUser()`, serwerowego tenant resolution, kontroli roli ani podpisu webhooka. Wszystkie zinwentaryzowane funkcje bez ukończonej granicy bezpieczeństwa są obecnie fail-closed, więc nie wolno usuwać guardów tylko po to, by przywrócić funkcjonalność. Stan nadal nie daje globalnego GO: RLS, storage, płatności, XSS, cache i testy integracyjne należą do kolejnych faz/gates.

## Odtworzenie zablokowanych funkcji

Guard można usunąć z pojedynczego endpointu dopiero po spełnieniu wymagań jego klasy i dodaniu testów pozytywnych oraz prób obejścia:

- **A:** `requireUser()`, serwerowe wyznaczenie tenanta i ownership każdego zasobu, zakaz zaufania `user_id`/`company_id`/`provider_id` z body, audyt operacji write oraz rate/idempotency odpowiednie do skutku.
- **B:** wymagania A plus `requireAdmin()` albo dokładna rola domenowa z DB, reautoryzacja operacji krytycznych, ograniczony zakres i pełny audit trail.
- **C:** osobne poświadczenie integracji, HMAC obejmujący body i timestamp, krótkie okno czasowe, nonce/event ID, trwały replay inbox, lease/retry/DLQ i idempotentny skutek.
- **D:** weryfikacja podpisu dostawcy na niezmienionym raw body, timestamp/nonce, unikalny `external_event_id`, atomowy inbox przed skutkiem i bezpieczne retry.
- **E:** formalnie zatwierdzony, minimalny DTO bez danych prywatnych, brak mutacji, origin policy, rozproszony rate limit, limit kosztu i testy anon access.
- **F:** nie odblokowywać w obecnym kształcie; najpierw rozdzielić trust boundaries albo zastąpić bezpiecznym workflow (invite, recovery, capability token, human approval).

Każde odblokowanie wymaga także ustawienia potrzebnych sekretów w panelu Supabase/operatora, ich rotacji, ograniczenia CORS oraz ponownego uruchomienia testów GATE 1. Brak któregokolwiek warunku oznacza pozostawienie `phaseABlockedResponse`.
