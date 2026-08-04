# Faza A — raport implementacji zabezpieczeń

Data analizy lokalnej: 2026-08-01. Zakres: worktree `rido-codex-test`, branch `codex/test`. Nie wykonano migracji, deployu, połączeń z produkcją ani operacji zewnętrznych.

## Werdykt

**Wynik statycznej implementacji: PASS. Wynik publikacyjny Fazy A: FAIL. Globalnie: NO-GO.**

Kod lokalny zamyka GATE 1 przez niezależne uwierzytelnienie/autoryzację albo bezwarunkowe fail-closed. Nie można jednak uznać Fazy A za gotową do publikacji bez wykonania migracji i testów integracyjnych na izolowanym Supabase, rotacji poświadczeń oraz porównania repozytorium z funkcjami faktycznie wdrożonymi. GATE 2–10 należą również do kolejnych faz.

## Co naprawiono

- Zinwentaryzowano 174/174 sekcje `supabase/config.toml`: 171 ma `verify_jwt=true`; jawne wyjątki to `admin-bootstrap`, `voice-agent-llm` i `voice-call-postprocess`, które mają własne granice uwierzytelnienia. Klasy: A65, B28, C39, D8, E8 i F26.
- 28 endpointów otrzymało kontrolę tożsamości, roli, tenanta, audytu lub podpisu właściwą dla ich obecnego zakresu. 145 pozostaje jawnie zablokowanych: 132 używa wspólnego guardu `phaseABlockedResponse` jako pierwszej instrukcji handlera, 11 ma własną blokadę/local-only, a dwa wpisy konfiguracyjne nie mają kodu. Stan: **0 OPEN**.
- Wspólna warstwa bezpieczeństwa odrzuca brakujące, niepoprawne i wygasłe JWT, nie uznaje `service_role` za JWT użytkownika, wyznacza role i członkostwa z bazy, ogranicza CORS do allowlisty, zwraca `Cache-Control: no-store`, redaguje metadata oraz zatrzymuje operację, gdy nie można zapisać audytu.
- Operacje administratora nie ufają roli ani identyfikatorom z body. Niebezpieczne resetowanie/usuwanie kont, zmiana roli administratora, masowe tworzenie kont i `force_first_import` są zablokowane do czasu osobnych, reautoryzowanych workflow.
- `admin-bootstrap` wymaga wyłączonej domyślnie flagi, silnego sekretu i jednorazowego, atomowego claimu. Stałe hasła i stały sekret instalacyjny usunięto z aktywnego kodu.
- KSeF wymaga JWT i ownership podmiotu/faktury, używa kanonicznych referencji oraz szyfrowania AES-GCM nowych poświadczeń. Legacy plaintext i produkcyjne wywołania są fail-closed; wysyłka pozostaje bezwarunkowo wyłączona do czasu atomowej idempotencji.
- Agent głosowy wyznacza providera po stronie serwera. Test użytkownika zawsze wymusza `dry_run_tools`; narzędzia write zwracają 503. Klientowy `systemPrompt` jest ignorowany. Analiza rozmowy może utworzyć wyłącznie nieaktywną propozycję wiedzy/skryptu.
- Webhook ElevenLabs weryfikuje HMAC surowego body, czas, podpisane powiązanie agenta oraz atomowo zajmuje `external_event_id`, blokując replay.
- Nowe hasła Rido Mail są szyfrowane; stare plaintext są blokowane, a odpowiedź nie zwraca kolumn poświadczeń. Bezpośrednia przeglądarkowa konfiguracja/wysyłka została usunięta z aktywnych ścieżek.
- Dodano append-only audit trail, inbox zdarzeń webhookowych, blokadę bezpośrednich mutacji ról/referral/kredytów oraz ograniczenia uprzywilejowanych `SECURITY DEFINER` i RPC.
- Zablokowano klientowy dostęp do 18 tabel przechowujących poświadczenia oraz do sekretnego wpisu `rido_settings_env`.

## Jakie ataki były możliwe i jak są blokowane

| Ryzyko przed zmianą | Zabezpieczenie Fazy A |
|---|---|
| Publiczne użycie `service_role` do masowych odczytów, zapisów, importów i wysyłek | Endpoint ma zweryfikowaną tożsamość/rolę/tenant albo kończy się 503 przed pierwszym I/O. |
| Podstawienie `user_id`, `company_id`, `fleet_id` lub `provider_id` | Aktor pochodzi z `auth.getUser()`, a dozwolone członkostwa z tabel serwerowych; body nie rozstrzyga uprawnień. |
| Przejęcie admina przez stały sekret lub publiczne utworzenie potwierdzonego konta | Jednorazowy bootstrap jest domyślnie wyłączony; niebezpieczne signup/reset/recreate są fail-closed. |
| Zmiana ról, kredytów, referral lub sekwencji bezpośrednim RPC/DML | `REVOKE ALL`, jawne minimalne granty, bezpieczny `search_path`, kontrola aktora i blokady advisory. |
| Kradzież sekretów z tabel lub frontendu | Tabele poświadczeń są serwerowe; nowe wartości są szyfrowane; odpowiedzi i logi są redagowane. |
| Prompt injection uruchamiający narzędzia produkcyjne | Brak klientowego promptu systemowego; ponowna autoryzacja providera; write tools i user-test są dry-run/fail-closed. |
| Replay podpisanego webhooka ElevenLabs | Podpis raw body, ograniczone okno czasu i unikalny, atomowo zajęty event. |
| Dowolna wysyłka maila/SMS/KSeF z body | Ogólne ścieżki wysyłkowe są zablokowane; KSeF `send` pozostaje 503. |
| Ujawnianie szczegółów błędów i cache odpowiedzi uprzywilejowanych | Ustandaryzowane błędy bez danych wewnętrznych i `Cache-Control: no-store`. |

## Zmienione pliki

Główne nowe pliki:

- `supabase/functions/_shared/security.ts`
- `supabase/functions/_shared/securityPrimitives.ts`
- `supabase/functions/_shared/phaseABlock.ts`
- `supabase/migrations/20260801110000_phase_a_security_foundation.sql`
- `supabase/migrations/20260801112000_phase_a_credential_table_lockdown.sql`
- `scripts/security/phase-a-security.test.mjs`
- `docs/security/phase-a-edge-function-inventory.md`
- `docs/security/phase-a-edge-function-classification.md`

Zmodyfikowano także `.env.example`, `.gitignore`, `package.json`, pięć minimalnych integracji frontendowych (`RidoSettings`, `UserRolesManager`, `AgencyCRMSettings`, `VoiceInput`, `RidoMailPage`), `supabase/config.toml`, `_shared/aiSecrets.ts` oraz implementacje Edge Functions. `phase-a-edge-function-inventory.md` dokumentuje historyczny stan wejściowy; aktualnym źródłem stanu i warunków odblokowania jest pełna klasyfikacja 174 funkcji w `phase-a-edge-function-classification.md`. `AGENTS.md` jest istniejącym, niepowiązanym plikiem użytkownika i nie został zmieniony.

Endpointy ocenione jako `HARDENED` i nieobjęte wspólnym globalnym guardem (część ryzykownych akcji wewnątrz nadal jest celowo wyłączona):

`reminders`, `settlements`, `csv-import`, `admin-bootstrap`, `cleanup-fake-auth-accounts`, `update-driver-debt`, `rebuild-drivers`, `sanitize-getrido`, `import-drivers`, `ksef-integration`, `ai-assistant`, `admin-list-users`, `admin-create-user`, `admin-ai-agent`, `admin-ai-secrets`, `voice-agent-chat`, `voice-agent-tools`, `voice-call-analyze`, `voice-agent-llm`, `voice-call-postprocess`, `voice-agent-simulate`, `getrido-ai-execute`, `admin-users`, `ai-generate-call-scripts`, `ai-chat`, `rental-dispatcher`, `deepgram-transcribe`, `rido-mail`.

## Migracje

`20260801110000_phase_a_security_foundation.sql`:

- tworzy `security_audit_log`, `security_webhook_events` i `security_bootstrap_claims` z FORCE RLS i minimalnymi grantami;
- odbiera publiczne wykonanie uprzywilejowanych RPC oraz bezpośrednie mutacje ról, członkostw, mapowań kierowców, referral, kredytów i sekwencji;
- wzmacnia `link_auth_user_to_driver`, `increment_driver_debt`, claim kolejki domenowej, numerację zleceń i faktur oraz funkcje referral;
- ustawia jawny `search_path` i odbiera aplikacji `CREATE` w schemacie `public`.

`20260801112000_phase_a_credential_table_lockdown.sql` blokuje klientom: `agency_api_connections`, `agency_settings`, `agent_calendar_tokens`, `ai_providers`, `ai_secret_store`, `ai_settings`, `email_accounts`, `external_integrations`, `external_lead_sources`, `ic_catalog_integrations`, `intercars_token_cache`, `invoice_email_configs`, `ksef_settings`, `location_integrations`, `payment_gateway_config`, `secure_app_settings`, `sms_settings` i `workshop_parts_integrations`.

Migracji nie uruchomiono. Nie usunięto ani nie zmieniono migracji historycznych.

## Celowo zablokowane funkcje i bezpieczne przywrócenie

- Wszystkie 132 funkcje z guardem: usuwać guard pojedynczo dopiero po wdrożeniu wymagań klasy A–F opisanych w pełnej klasyfikacji, testach pozytywnych/negatywnych i ponownej kontroli GATE 1.
- Płatności, saldo, kredyty, SMS, webhook P24 i finansowe workery: pozostawić zablokowane do Fazy B; wymagają serwerowego katalogu, integer minor units, podpisu operatora, inboxu replay i atomowego ledgera.
- Tabele poświadczeń i odpowiadające im panele: przywrócić wyłącznie przez wąskie endpointy DTO, które zapisują credential reference/vault i nigdy nie zwracają sekretu. Dotyczy m.in. konfiguracji marketingu, AI, KSeF, SMS, poczty, lokalizacji i katalogów części.
- Rejestracja, zaproszenia i reset hasła: zastąpić natywnym Supabase signup/invite/recovery, jednolitą odpowiedzią anty-enumeracyjną, trwałym rate limitingiem i reautoryzacją dla operacji destrukcyjnych.
- `rido-mail`: dowolną wysyłkę przywrócić jako osobne akcje domenowe z kanonicznym odbiorcą, ownership, szablonem, idempotency key i audytem. Obecne stare wywołania `to/subject/html` są celowo odrzucane.
- `REMINDERS_DELIVERY_ENABLED`: nie ustawiać na `true`, dopóki wysyłka nie ma trwałego claimu, idempotencji, DNC/consent i limitów.
- `KSEF_EXTERNAL_OPERATIONS_ENABLED` i `KSEF_PRODUCTION_ENABLED`: pozostawić `false` do testów integracyjnych, SSRF/rate limits i zatwierdzenia konfiguracji. Samo ustawienie flag nie odblokuje `send`; wymaga ono atomowego workflow.
- Narzędzia AI write: przywrócić przez dedykowany executor z risk class, ponowną autoryzacją, tenantem, idempotencją, audytem, limitami i human confirmation. Nie usuwać `dry_run_tools` z trybu testowego.
- Krytyczne akcje administratora: przywrócić dopiero po reautoryzacji/MFA, jawnej allowliście zakresu, idempotencji i pełnym audycie.

## Testy

| Kontrola | Wynik |
|---|---|
| `npm run test:security:phase-a` | PASS — 19/19 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| Parsowanie `esbuild` Edge Functions | PASS — 171/171 implementacji |
| `git diff --check` | PASS |
| `npm audit --offline` | PASS — 0 znanych podatności w lokalnych metadanych |
| `npm run lint` | FAIL bazowy — 4301 błędów i 304 ostrzeżenia w całym repozytorium; nie jest to regresja Fazy A |
| `supabase db reset` / `supabase db lint --local` | NIEURUCHOMIONE — brak dostępnego lokalnego Supabase/Dockera |
| Testy dwóch tenantów, RLS i storage | NIEURUCHOMIONE — Faza C i lokalne fixtures |

Build pozostawia ostrzeżenia o dużych chunkach, nieaktualnych danych Browserslist i mieszanym statycznym/dynamicznym imporcie `WorkshopEmployeesPage`; nie jest to błąd kompilacji ani zmiana bezpieczeństwa Fazy A.

## Pozostałe ryzyka

- Stan produkcyjnych Edge Functions, sekretów, cronów, RLS i grantów nie został odczytany ani zmieniony. Repozytorium nie dowodzi stanu wdrożenia.
- `reminders`, `update-driver-debt` i `rental-dispatcher` używają silnych sekretów wewnętrznych, ale pełny timestamp/nonce/replay protection pozostaje P1.
- Operacje krytyczne administratora wymagają docelowej reautoryzacji/MFA; część jest dlatego zablokowana.
- Pełne RLS, izolacja dwóch tenantów i storage są jeszcze nieukończone.
- Płatności, kredyty i SMS ledger są tylko odcięte przez guard, a nie przebudowane.
- Mieszane tabele domenowo-sekretowe (`ai_sales_agents`, `agency_clients`, `ad_orders`, `company_settings`, `service_providers`, historyczne `rido_settings` oraz token-bearing rental/viewing) wymagają wydzielenia sekretów.
- `get_next_invoice_number` nie rezerwuje numeru pomiędzy odczytem a insertem; trigger blokuje duplikat, a klient musi ponowić operację po konflikcie.
- Kolejka zdarzeń nie ma jeszcze odzyskiwania wygasłych lease ani DLQ.
- Audit odczytów administracyjnych i dostępu do dokumentów nie jest kompletny; część workflow zapisuje audyt po skutku i wymaga docelowej transakcyjności/outboxu.
- Brakuje rozproszonego rate limitingu, limitów kosztu AI i testów concurrency.
- XSS, cache/logout, storage, zależności i nagłówki webowe należą do Faz D/F.

## Działania ręczne wymagane przed publikacją

### Supabase i baza

1. Porównać 174 wpisy klasyfikacji z funkcjami rzeczywiście wdrożonymi; wyłączyć stare/config-only deploymenty.
2. W izolowanym środowisku wykonać `supabase db reset`, `supabase db lint --local`, testy dwóch tenantów, wygasłego JWT, roli odebranej w trakcie sesji, runtime Deno oraz równoległych webhooków/replay. Dopiero po review zastosować migracje w staging.
3. Po migracji sprawdzić `pg_policies`, `proacl`, granty tabel/funkcji, FORCE RLS i brak `PUBLIC execute`.
4. Sprawdzić niestandardowe numery zleceń i sekwencje `>= 999999`; przetestować konflikt/retry numerów faktur i zleceń.
5. Ustawić `ALLOWED_ORIGINS`, `APP_PUBLIC_URL` i osobne losowe sekrety o długości co najmniej 32 znaków. Nie współdzielić sekretu między workerami.
6. Wyłączyć stare cron jobs z historycznych skryptów i odtworzyć je przez Vault z podpisem, timestampem, nonce i minimalnymi uprawnieniami.
7. Obrócić i ponownie zapisać zaszyfrowane rekordy AI/mail/KSeF; constraint `ai_secret_store_encrypted_only` jest początkowo `NOT VALID`, więc po oczyszczeniu danych trzeba wykonać jego `VALIDATE CONSTRAINT`.
8. Zbudować serwerowe endpointy konfiguracji przed ponownym włączeniem paneli zależnych od zablokowanych tabel poświadczeń.

### Rotacja poświadczeń

Obowiązkowo obrócić historyczny stały sekret bootstrap/setup i hasło konta zapisane w historycznej migracji; unieważnić aktywne sesje tego konta. Następnie zinwentaryzować i — jeśli były użyte lub mogły zostać ujawnione — obrócić: Supabase `service_role`/JWT signing plan, sekrety cron/worker, P24/payment signing, KSeF, Twilio/SMS, Meta, Google OAuth/Calendar/Mail, ElevenLabs/VAPI/Deepgram, klucze modeli AI oraz SMTP/mail. Nie kopiować wartości do issue, raportu ani logu.

Plik `.env` pozostaje śledzony historycznie, choć obecnie zawiera tylko konfigurację publikowalną. Należy w osobnej, zatwierdzonej operacji przestać go śledzić i sprawdzić historię Git; sama zmiana `.gitignore` nie usuwa pliku z indeksu.

### Operatorzy zewnętrzni

- Nie konfigurować jeszcze produkcyjnego webhooka płatności ani nie odblokowywać P24 przed Fazą B.
- Nie włączać produkcyjnego KSeF, SMS, e-mail, reminderów, połączeń ani AI write tools.
- Dla każdego przyszłego webhooka ustawić podpis raw body, timestamp/nonce, krótki window, unikalny event ID, idempotencję i alerty.

## Podsumowanie

Faza A redukuje potwierdzone P0 przez kontrolę serwerową lub utratę dostępności ryzykownej funkcji, bez usuwania jej logiki. Nie jest to deklaracja pełnego bezpieczeństwa. Do zmiany decyzji z **NO-GO** potrzebne są co najmniej: wykonawcza walidacja migracji, rotacja sekretów, Faz B–F oraz przejście wszystkich dziesięciu security gates.
