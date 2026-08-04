# GetRido — końcowy raport bezpieczeństwa Etapu 0

Data: 2026-08-01. Branch/worktree: `codex/test` w `/Users/moshechkov/rido-codex-test`.

## Decyzja

**NO-GO.** Lokalny kod zabezpieczeń A–F przechodzi 220/220 testów kontraktowych, `typecheck` i `build`, ale pozostają blokery P0: brak wykonania i walidacji migracji na izolowanym Supabase, brak runtime testu dwóch tenantów i Storage, brak gotowego podpisanego webhooka P24, brak rotacji historycznych poświadczeń oraz brak porównania repozytorium z faktycznie wdrożonym środowiskiem.

To nie jest deklaracja 100% bezpieczeństwa. Zmiany tworzą ochronę wielowarstwową i domyślnie blokują niedokończone ścieżki, lecz nie zastępują testów runtime, konfiguracji operatorów ani operacyjnego wdrożenia.

## 1. Podatności P0/P1 naprawione lokalnie

- **Edge Functions/service role:** wszystkie 174 wpisy `supabase/config.toml` są sklasyfikowane. Stan: 30 `HARDENED`, 144 `BLOCKED`, 0 `OPEN`; 131 legacy endpointów korzysta z bezwarunkowej bramki fail-closed.
- **Auth/admin:** aktor pochodzi z zweryfikowanego JWT, role i tenant z bazy; operacje admina używają wspólnej kontroli i audytu. Bootstrap jest flagowany, jednorazowy i bez stałego hasła. Destrukcyjne reset/link/merge pozostają zablokowane.
- **Finanse i wartości:** frontend nie ustala kwoty, waluty, benefitu, użytkownika ani tenanta. Intencja przyjmuje tylko kanoniczny `price_id` i UUID idempotencji. Klient nie może bezpośrednio zwiększać kredytów, SMS ani sald. Ledger i transakcyjny grant są przygotowane migracją.
- **Tenant/RLS/RPC:** dodano serwerowe helpery membership, deny-by-default dla prywatnych tabel, zamknięte `SECURITY DEFINER`, jawny `search_path`, odebranie `PUBLIC EXECUTE` i fixture Tenant A/Tenant B.
- **Storage:** prywatne buckety, serwerowy rejestr obiektów i ACL, pięciominutowy signed URL, audyt pobrania i brak publicznych polityk dla dokumentów prywatnych.
- **XSS:** centralny DOMPurify z allowlistą HTML, bezpieczne URL, izolowane `iframe/srcDoc`, escapowanie danych dokumentów i AI, bezpośrednie sinki HTML objęte testami stored/reflected XSS.
- **Sesja/cache:** prywatne odpowiedzi Supabase usunięto z ogólnego Workbox cache; logout anuluje/czyści QueryClient i wrażliwe Cache Storage; fingerprint sesji uwzględnia użytkownika i tenant.
- **Sekrety:** wspólne redagowanie błędów/audytu, blokada odczytu credential tables przez klienta, AES-GCM dla nowych haseł Rido Mail, brak sekretów w URL custom LLM i brak logowania pełnych wartości.
- **AI/ElevenLabs:** provider i tenant są wyznaczane serwerowo, klientowy `systemPrompt` jest ignorowany, tryb użytkownika zawsze `dry_run`, write tools są wyłączone, capability wiąże call/config/provider/tenant/personę/scope, istnieją kill switche, limity i kontrolowany workflow proposal → review → publish.
- **Webhook głosowy:** raw-body HMAC, krótkie okno podpisu, signed agent binding i atomowy replay inbox dla utwardzonej ścieżki postprocess.
- **Abuse/idempotencja:** atomowe limity AI/admin/import, timeouty i limity providerów; trwałe lease dla transkrypcji i importów; bezpieczny proxy obrazów z ochroną SSRF/DNS rebinding.
- **Zależności:** usunięto `@huggingface/transformers`, `sharp`, `html2pdf.js` i `xlsx`; eksport XLSX działa przez pasywny writer OOXML. Aktualny audit nie wykazuje critical ani moderate.

Szczegółowe zmiany opisują raporty `phase-a-implementation-report.md` do `phase-f-implementation-report.md` oraz pełna klasyfikacja `phase-a-edge-function-classification.md`.

## 2. Podatności i blokery nadal otwarte

### P0 — blokują publikację

1. Migracje `20260801110000`–`20260801161000` nie zostały wykonane ani zweryfikowane runtime.
2. Nie ma wykonawczego dowodu, że Tenant A nie odczyta/zapisze Tenant B przez PostgREST, RPC i Storage.
3. Storage wymaga manifestu, backupu oraz backfillu `private_storage_objects`/ACL. Bez migracji stare dokumenty mogą pozostać publiczne; bez backfillu po migracji istniejące odnośniki mogą przestać działać.
4. `payment-core-webhook` jest celowo zablokowany. Nie istnieje kompletny adapter P24: raw-body signature, weryfikacja u operatora, replay inbox, transakcja grant/ledger i DLQ.
5. Historyczne poświadczenia oraz wszystkie potencjalnie ujawnione klucze nie zostały obrócone; sama zmiana kodu ich nie unieważnia.
6. Nie porównano 174 lokalnych funkcji, migracji, RLS, cronów i sekretów z rzeczywistym deploymentem Supabase.
7. Nie uruchomiono browser E2E sesji/cache ani pełnych testów Storage. Security gates wymagają wyniku runtime, nie tylko statycznego kontraktu.

### P1 — wymagane przed szerokim uruchomieniem

- CAPTCHA, leaked-password protection, MFA i świeża reautoryzacja operacji krytycznych nie są skonfigurowane.
- `reminders`, `update-driver-debt` i `rental-dispatcher` wymagają podpisu z timestampem/nonce oraz pełnej ochrony replay.
- Upload wymaga magic-byte, re-encodingu obrazów, malware scan, rozproszonej quota i kwarantanny.
- Monitoring jest pasywny: brak centralnego collectora, alertów, tracingu, dyżurów i DLQ.
- `readJsonBody()` potrzebuje dodatkowego limitu body na gatewayu, bo przy braku `Content-Length` najpierw buforuje tekst.
- CSP jest `Report-Only`; brak collectora. HSTS jest krótki i wymaga inwentaryzacji TLS/subdomen.
- Lint pozostaje istniejącym długiem: 4279 błędów, bez błędów fatalnych.
- Aktualizacja `@supabase/supabase-js` do `2.111.0` wymaga osobnego usunięcia 24 niezgodności typów. Próba została bezpiecznie wycofana do `2.56.0`.

## 3. Sekrety wymagające obowiązkowej rotacji

Rotację wykonać w kontrolowanym oknie, z unieważnieniem starych sesji/tokenów i sprawdzeniem konsumentów:

- historyczny bootstrap/setup oraz hasło utworzonego konta, w szczególności ślady w `supabase/migrations/20251015155208_1385c78d-7ee9-4a15-b601-85de0386c9a3.sql` i `supabase/migrations/20260309202141_5eadbc55-aa08-413c-ac5f-c349f33f0196.sql`;
- Supabase `service_role`, `anon` jeżeli wyciekł, oraz plan rotacji JWT signing keys;
- sekrety cron/worker i capability AI;
- P24 merchant/CRC/API/webhook credentials;
- KSeF tokeny/certyfikaty;
- Twilio/SMS, Meta, Telegram i inne webhook secrets;
- ElevenLabs, VAPI, Deepgram i klucze dostawców modeli AI;
- Google OAuth/Calendar/Gmail, SMTP i Rido Mail;
- klucze map/geolokalizacji i pozostałych zewnętrznych API.

`.env` należy przestać śledzić dopiero w zatwierdzonej operacji (`git rm --cached .env` po weryfikacji), a następnie przeskanować pełną historię Git. W Etapie 0 nie zmieniano historii i nie wykonywano rotacji.

## 4. Wymagane działania w panelu Supabase

1. Utworzyć odseparowany projekt/staging bez danych produkcyjnych i wykonać pełne migracje od zera w kolejności.
2. Uruchomić `db lint`, testy SQL A/B, anon, RPC, Storage, równoległości i replay. Następnie odtworzyć migrację na kopii schematu zgodnej z produkcją.
3. Zinwentaryzować dokumenty, wykonać backup i backfill metadanych/ACL; przełączyć callsite'y na `private-storage-download`, przetestować odebranie dostępu i dopiero potem wyłączyć publiczne URL.
4. Ustawić dokładne `ALLOWED_ORIGINS`; usunąć stare wildcard CORS z deploymentów.
5. Skonfigurować CAPTCHA wraz z tokenem frontendowym, leaked-password protection, MFA i bezpieczną zmianę hasła/reauth.
6. Wprowadzić wyłącznie obrócone sekrety do vault/secrets; nie przechowywać ich w tabelach czytanych przez klienta.
7. Porównać listę wdrożonych funkcji, cronów, polityk, RPC i sekretów z repo; wyłączyć osierocone deploymenty.
8. Skonfigurować alerty na agregaty audytu, retencję logów, dostęp awaryjny i procedurę reagowania.

## 5. Wymagane działania u operatora płatności

- Utworzyć osobne dane staging i produkcyjne oraz obrócić dotychczasowe credentials.
- Zaimplementować podpis P24 dokładnie według bieżącej specyfikacji na surowym body.
- U operatora potwierdzać merchant ID, session ID, amount w minor units, currency i status transakcji.
- Skonfigurować jeden dokładny HTTPS webhook URL, allowlistę/ochronę sieciową dostępną u operatora i bezpieczny timeout.
- Przetestować brak/zły podpis, zmienioną kwotę/walutę, inne zamówienie, replay, dwa równoległe eventy i retry po częściowej awarii.
- Włączyć webhook dopiero po transakcyjnym grant/ledger, trwałym inboxie `external_event_id`, idempotency key, stanie processing/succeeded/failed, DLQ i alertach.

## 6. Zmiany RLS, RPC i Storage

| Obszar | Zmiana lokalna | Warunek operacyjny |
|---|---|---|
| tenant membership | helpery oparte na `auth.uid()` i aktywnym membership | test dwóch tenantów runtime |
| dane klientów/pojazdów/zleceń/kalendarzy/workspace | polityki deny-by-default i niezmienny tenant | fixture positive/negative na realnym Postgresie |
| raporty AI/follow-up/A-B/cache/tokeny | wyłącznie serwer lub tenantowy owner | sprawdzenie grantów przez `anon`/`authenticated` |
| uprzywilejowane RPC | `REVOKE PUBLIC`, jawne sygnatury, bezpieczny `search_path` | `has_function_privilege` runtime |
| dokumenty prywatne | prywatne buckety, metadata/ACL i krótki signed URL | backup, backfill i test revoke |
| publiczne obrazy | ograniczony MIME, rozmiar, ścieżka i właściciel | magic-byte/scanner pozostają P1 |

Migracje: `20260801140000_phase_c_tenant_isolation.sql`, `20260801141000_phase_c_rpc_lockdown.sql`, `20260801142000_phase_c_storage_lockdown.sql` oraz follow-up `20260801145000_phase_d_session_xss_tenant_followup.sql`.

## 7. Wynik testów dwóch tenantów

**FAIL / NIEZWERYFIKOWANE RUNTIME.** Statyczny fixture obejmuje:

- A czyta rekord A — oczekiwany sukces;
- A czyta lub aktualizuje B — oczekiwana odmowa;
- B podstawia ID A — oczekiwana odmowa;
- anon odczytuje dane prywatne — oczekiwana odmowa;
- service endpoint z błędnym tenantem — oczekiwana odmowa;
- transakcję zakończoną `ROLLBACK`.

`supabase status` potwierdził brak działającego daemona Docker, więc fixture nie został uruchomiony. GATE 2 pozostaje FAIL.

## 8. Wynik testów płatności

**22/22 testów statycznych PASS; produkcyjna płatność FAIL/wyłączona.** Testy obejmują zero, wartość ujemną, zmienioną kwotę, inną walutę, dodatkowe `user_id`/`tenant_id`, niekanoniczny produkt, próbę `admin_grant`, klientową zmianę salda i idempotency key. Migracja przewiduje integer minor units, katalog serwerowy, immutable ledger i atomowy grant.

Nie wykonano runtime testów transakcji/concurrency. Fałszywy/brak/zły podpis i replay webhooka kończą się obecnie bez skutku, ponieważ webhook P24 jest w całości fail-closed. GATE 4 pozostaje FAIL do czasu bezpiecznego adaptera.

## 9. Wynik testów AI

**PASS lokalnie dla dry-run i control plane; live/write pozostaje wyłączone.** Faza E: 54/54; Faza F zawiera dodatkowe testy limitów, kosztu i transkrypcji. Potwierdzono statycznie:

- brak klientowego tenant/provider/system prompt;
- cross-tenant capability rejection;
- wygasłe/zmanipulowane capability i replay rejection;
- dry-run dla JWT i brak skutków produkcyjnych;
- claim/finalize, idempotencję i audyt write tools;
- human approval wiedzy/skryptów;
- globalny i per-agent kill switch;
- limity kosztu, prób, body i timeouty.

Nie wykonano połączenia, SMS, e-mail ani narzędzia write. `AI_VOICE_LIVE_EXECUTION_ENABLED` i write tools muszą pozostać wyłączone do testów runtime/staging.

## 10. Wynik cache/logout

**PASS jednostkowo/statycznie; FAIL jako gate publikacyjny bez browser E2E.** Potwierdzono czyszczenie QueryClient, prywatnych cache i fingerprint zmian użytkownika/tenanta. Nadal trzeba wykonać w prawdziwej przeglądarce: A → logout → B, offline/throttling, ta sama karta, nowa karta i wiele kart.

## 11. Wynik `npm audit`

Końcowo: **0 critical, 0 moderate, 2 high**. Oba wpisy reprezentują jeden advisory React Router dotyczący RSC actions. GetRido używa klientowego `BrowserRouter`, bez RSC/SSR/loaders/actions. Nie ma opublikowanej poprawionej wersji `8.3.0`; sugerowany downgrade `7.11.0` przywraca inne advisories dotyczące klienta. Pozostaje `react-router-dom@7.18.2`, jawne ograniczenie architektoniczne i obowiązek ponownej aktualizacji po wydaniu poprawki.

Usunięcie `xlsx` zredukowało audit i bundle o osobny około 428 kB chunk. Nie użyto `npm audit fix --force`.

## 12–14. Build, typy i testy bezpieczeństwa

| Kontrola | Wynik |
|---|---|
| `npm run build -- --logLevel warn` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:security` | PASS — 220/220 |
| Faza A | 19/19 PASS |
| Faza B | 22/22 PASS |
| Faza C | 25/25 PASS statycznie |
| Faza D | 40/40 PASS |
| Faza E | 54/54 PASS |
| Faza F | 60/60 PASS |
| PHP syntax | PASS dla `foto-proxy.php` i `invoice-pdf.php` |
| `git diff --check` | PASS |
| lint | FAIL — 4279 istniejących błędów, 0 fatalnych |

Build ostrzega o dużych chunkach oraz jednoczesnym statycznym/dynamicznym imporcie `WorkshopEmployeesPage`; nie jest to regresja bezpieczeństwa Fazy F. Lokalny Node 23 jest poza zadeklarowanym zakresem; CI został ustawiony na Node 22, a wspierane środowisko to Node 22.13+ lub 24+.

## 15. Macierz security gates

| Gate | Stan lokalny | Stan publikacyjny | Powód |
|---|---|---|---|
| 1. Brak publicznych uprzywilejowanych funkcji | PASS statycznie | FAIL | deployment nieporównany; 144 endpointy muszą pozostać blocked |
| 2. Zero cross-tenant | fixture PASS statycznie | **FAIL** | brak testu Postgres/Storage runtime |
| 3. Brak klientowego zwiększania wartości | PASS statycznie | FAIL | brak testu bezpośredniego DB API runtime |
| 4. Podpis/replay/idempotencja płatności | webhook blocked | **FAIL** | brak adaptera P24 |
| 5. Brak publicznych dokumentów prywatnych | kod/migracja gotowe | **FAIL** | brak inwentaryzacji, backfillu i runtime |
| 6. Brak potwierdzonego stored XSS | PASS — 40/40 | PASS warunkowo | wymaga skanu historycznych danych i E2E przed release |
| 7. Logout usuwa dane poprzedniego użytkownika | PASS jednostkowo | **FAIL** | brak browser E2E A → B/offline/multi-tab |
| 8. AI test mode bez skutków | PASS | PASS lokalnie | live/write pozostaje wyłączone |
| 9. Sekrety nie trafiają do przeglądarki | PASS statycznie | **FAIL** | rotacje i porównanie deploymentu niewykonane |
| 10. Krytyczne testy bezpieczeństwa | 220/220 statycznie | **FAIL** | brak SQL/Storage/E2E/concurrency runtime |

## 16. Przywracanie funkcji zablokowanych bezpieczeństwem

- **131 legacy Edge Functions:** usuwać `phaseABlockedResponse` pojedynczo dopiero po wymaganiach klasy A–F z klasyfikacji, testach pozytywnych/negatywnych, limitach, audycie i idempotencji. Nie usuwać guardów zbiorczo.
- **Płatności/kredyty/SMS:** serwerowy katalog → podpis P24 → operator verify → inbox replay → jedna transakcja ledger/grant → DLQ/alerty → staging → dopiero odblokowanie.
- **Dokumenty:** manifest → backup → backfill metadata/ACL → signed URL callsites → test revoke/cross-tenant → wyłączenie publicznych URL.
- **AI live/write:** bootstrap rozmowy → krótkie capability → tenantowy claim/finalize → klasa ryzyka → potwierdzenie człowieka dla high/financial/legal/destructive → metering/audyt → staging → kontrolowane zwolnienie kill switcha.
- **Signup/reset/invite:** natywny Supabase Auth, CAPTCHA, anty-enumeracja, jednorazowy hash-token z expiry, limity, MFA/reauth. Nie przywracać admin-signup ani stałych haseł.
- **KSeF/SMS/e-mail/reminders:** canonical recipient/resource, zgoda i DNC, trwały claim, idempotencja, audyt, retry/DLQ oraz ręczne wznowienie.
- **Proxy obrazu:** zainstalować cURL/GD/CA bundle; nie przywracać fallbacku streamowego ani publicznego cache prywatnych danych.
- **CSP:** zbierać raporty, usunąć wymagane inline/eval zależności, testować modułami i dopiero przełączyć na enforcing.

## Końcowa rekomendacja

Nie publikować tej wersji. Następny krok to uruchomienie lokalnego Dockera lub izolowanego staging Supabase, wykonanie migracji i pełnych testów Tenant A/B, RPC, Storage, płatności oraz browser E2E. Równolegle należy obrócić wszystkie sekrety i wykonać inwentaryzację deploymentu. Dopiero po przejściu wszystkich dziesięciu bramek można ponownie rozważyć `CONDITIONAL GO`; przy dowolnym otwartym P0 decyzja pozostaje **NO-GO**.
