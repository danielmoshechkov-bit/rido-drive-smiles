# Faza F — rate limiting, monitoring, zależności i testy

Data walidacji: 2026-08-01. Zakres: wyłącznie lokalny worktree `codex/test`; bez migracji runtime, produkcyjnych danych, wiadomości, płatności, połączeń, commitów i wdrożeń.

## Wynik

**PASS dla lokalnej implementacji Fazy F. FAIL dla publikacji całego systemu. Globalnie: NO-GO.** Wszystkie 60 testów Fazy F, pełne 220 testów bezpieczeństwa A–F, `typecheck`, produkcyjny `build`, walidacja PHP i `git diff --check` przechodzą. Testy SQL/RLS/Storage nie zostały wykonane, ponieważ lokalny daemon Docker nie działa.

## Co naprawiono

- Dodano atomowe, fail-closed limity per zweryfikowany użytkownik, tenant lub zasób dla aktywnych endpointów AI, transkrypcji, administracji i importów. Identyfikator z body nie jest kluczem limitu.
- Ograniczono rozmiary body, liczbę prób providerów, timeouty, koszt dzienny i współbieżność. Sekret jest pobierany dopiero po autoryzacji i przyznaniu budżetu.
- `deepgram-transcribe` otrzymał trwały lease single-flight oraz ochronę przed zapisaniem transkrypcji do zmienionego nagrania.
- `csv-import` i `import-drivers` otrzymały trwały claim całego joba, SHA-256 payloadu i klucza idempotencji, 30-minutowy lease, maksymalnie pięć prób oraz bezpieczną finalizację. Retry nie duplikuje importu.
- Ustawiono politykę nowych haseł: minimum 12 znaków, mała i wielka litera, cyfra oraz znak specjalny. Wyłączono konta anonimowe, ograniczono Auth i ujednolicono formularze bez enumeracji e-maila.
- `foto-proxy.php` ma allowlistę HTTPS, ochronę SSRF/DNS rebinding, przypięcie IP, walidację obrazu, limity czasu/rozmiaru/współbieżności, negative cache i prywatny cache. Brak cURL/GD zamyka funkcję bezpiecznie.
- Dodano nagłówki bezpieczeństwa i CSP `Report-Only`; bezpośredni dostęp do `crm-import` jest blokowany.
- Usunięto nieużywane `@huggingface/transformers`, `sharp`, `html2pdf.js` i podatny `xlsx`. Eksport arkusza zachowano przez minimalny writer OOXML na `fflate`, bez parsera, formuł, makr, hiperłączy i relacji zewnętrznych.
- Podniesiono kompatybilne zależności: Vite/PWA, Router, DOMPurify, PostCSS, Tailwind, ESLint, TypeScript ESLint, MapLibre i zależności transytywne. CI używa Node 22 oraz `npm ci`; projekt deklaruje wspierany Node `^22.13.0 || >=24`.
- Dodano indeksy sygnałów audytowych i serwerowy agregat zdarzeń: próby cross-tenant/replay, błędy płatności/AI i operacje administracyjne.

## Ataki możliwe wcześniej i sposób blokady

| Ryzyko przed zmianą | Zabezpieczenie |
|---|---|
| kosztowy abuse AI i wielokrotne fallbacki | atomowy limit przed sekretem/providerem, limit prób i timeout |
| równoległa transkrypcja tego samego nagrania | trwały claim, lease, fingerprint audio i finalizacja właściciela |
| replay lub dwa równoległe importy | hash payloadu, klucz idempotencji, atomowy claim i stabilne ID |
| brute force i słabe nowe hasła | limity Auth, wspólna polityka 12 znaków i odpowiedzi anty-enumeracyjne |
| SSRF, DNS rebinding i cache poisoning proxy | stały upstream, publiczne IP, pinning, brak redirectów, lock i atomowy rename |
| formula injection oraz podatny parser SheetJS | wyłącznie komórki `inlineStr`/liczbowe, neutralizacja prefiksu i brak `xlsx` |
| znane podatności transitives | przypięte poprawione wersje przez wąskie `overrides` |

## Zmienione pliki Fazy F

Główne pliki wykonawcze:

- `supabase/config.toml`
- `supabase/functions/_shared/security.ts`
- `supabase/functions/_shared/aiSecurity.ts`
- `supabase/functions/ai-chat/index.ts`
- `supabase/functions/ai-assistant/index.ts`
- `supabase/functions/deepgram-transcribe/index.ts`
- `supabase/functions/rido-mail/index.ts`
- `supabase/functions/admin-ai-agent/index.ts`
- `supabase/functions/admin-ai-secrets/index.ts`
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-list-users/index.ts`
- `supabase/functions/admin-users/index.ts`
- `supabase/functions/csv-import/index.ts`
- `supabase/functions/import-drivers/index.ts`
- `public/foto-proxy.php`, `public/.htaccess`
- `src/security/passwordPolicy.ts`
- `src/utils/exportElementToPdf.ts`, `src/utils/exportFlatXlsx.ts`
- `src/components/SettlementPreview.tsx`
- `src/components/fleet/BankTransferExportDialog.tsx`
- `src/components/FleetSettlementsView.tsx`
- formularze Auth wskazane w `phase-f-auth-abuse-security.test.mjs`
- `package.json`, `package-lock.json`, `vite.config.ts`
- `.github/workflows/deploy.yml`

Testy:

- `scripts/security/phase-f-active-ai-rate-limits-security.test.mjs`
- `scripts/security/phase-f-admin-import-abuse-security.test.mjs`
- `scripts/security/phase-f-auth-abuse-security.test.mjs`
- `scripts/security/phase-f-cost-abuse-security.test.mjs`
- `scripts/security/phase-f-import-idempotency-security.test.mjs`
- `scripts/security/phase-f-public-web-security.test.mjs`
- `scripts/security/phase-f-xlsx-writer-security.test.mjs`
- `supabase/tests/security/phase_f_import_idempotency.sql`

## Migracje

- `20260801160000_phase_f_abuse_controls.sql` — prywatne joby transkrypcji, claim/finalize, indeksy audytu i agregat sygnałów.
- `20260801161000_phase_f_import_job_idempotency.sql` — prywatny rejestr importów, claim/finalize, lease, retry i ochrona replay.

Migracje nie zostały uruchomione. Edge Functions korzystające z nowych RPC zamykają się błędem `503`, dopóki migracje nie zostaną wdrożone w prawidłowej kolejności.

## Wyniki testów

| Kontrola | Wynik |
|---|---|
| `npm run test:security:phase-f` | PASS — 60/60 |
| `npm run test:security` | PASS — 220/220 A–F |
| `npm run typecheck` | PASS |
| `npm run build -- --logLevel warn` | PASS; pozostają ostrzeżenia o dużych chunkach i mieszanym imporcie `WorkshopEmployeesPage` |
| `php -l public/foto-proxy.php` | PASS |
| `php -l public/invoice-pdf.php` | PASS |
| `git diff --check` | PASS |
| `npm audit --json` | 0 critical, 0 moderate, 2 high; oba wpisy dotyczą jednego advisora React Router RSC |
| `npm run lint -- --quiet` | FAIL — istniejący dług: 4279 błędów w 626 plikach, 0 fatalnych |
| SQL/RLS/Storage runtime | NIEURUCHOMIONE — Docker daemon niedostępny |

`react-router-dom@7.18.2` pozostaje celowo: advisory dotyczy trybu RSC/actions, których portal nie używa (`BrowserRouter` bez SSR/RSC/loaders/actions). Registry nie udostępnia poprawionej wersji `8.3.0`; sugerowany przez audit downgrade `7.11.0` przywraca inne, istotne dla klienta advisories. Ryzyko jest ograniczone architekturą, ale wpis pozostaje jawnie otwarty.

Próba aktualizacji `@supabase/supabase-js` do `2.111.0` spowodowała 24 błędy typów w istniejących payloadach. Zgodnie z zasadą regresji wycofano wyłącznie tę aktualizację do `2.56.0`; nie maskowano problemu rzutowaniami. Bezpieczna aktualizacja wymaga osobnego etapu kompatybilności.

## Ryzyka pozostałe i działania ręczne

1. Uruchomić Docker i odtworzyć Supabase od zera, potem wykonać migracje, fixture dwóch tenantów, concurrency/replay oraz testy Storage.
2. Włączyć CAPTCHA dopiero po dodaniu widgetu i przekazywania `captchaToken`; w panelu Auth włączyć leaked-password protection, MFA i reautoryzację operacji krytycznych.
3. Skonfigurować centralny alerting/Sentry, tracing, scheduler agregatu, progi kosztowe i procedurę obsługi incydentów. Obecny monitoring jest pasywny.
4. Ustawić twardy limit body również na gatewayu; `readJsonBody()` buforuje tekst przed sprawdzeniem długości, jeśli klient pominie `Content-Length`.
5. Uruchomić CSP collector, zinwentaryzować naruszenia i dopiero potem przejść z `Report-Only` na wymuszanie. HSTS zwiększać po potwierdzeniu TLS wszystkich subdomen.
6. Wykonać browser E2E: A → logout → B, offline, throttling, wiele kart i pobieranie XLSX. Plik należy dodatkowo ręcznie otworzyć w Excelu/LibreOffice.
7. Nie używać Node 23; lokalne ostrzeżenie `EBADENGINE` znika na wspieranym Node 22.13+ lub 24+.

## Świadomie zablokowane funkcje

- P24/webhook płatności: przywrócić dopiero po raw-body signature, weryfikacji merchant/session/amount/currency/status u operatora, trwałym inboxie replay, transakcyjnym ledgerze i DLQ.
- AI live/write: pozostawić globalny i per-agent kill switch; włączyć dopiero po capability, tenantowym claim/finalize, potwierdzeniu człowieka, limitach kosztu i testach cross-tenant.
- KSeF, SMS, e-mail i remindery: każda ścieżka wymaga kanonicznego odbiorcy, zgody, trwałego claimu, idempotencji i audytu.
- Importy: wymagają obu migracji Fazy F; bez nich pozostają poprawnie fail-closed.
- `foto-proxy.php`: wymaga cURL, GD i prawidłowego CA bundle. Nie przywracać fallbacku `file_get_contents`.

## Decyzja Fazy F

**PASS lokalnie.** Globalna publikacja pozostaje **NO-GO**, ponieważ nie przeszły bramki runtime RLS/Storage, bezpieczny webhook płatniczy nie istnieje, rotacje sekretów nie zostały wykonane, a produkcyjny deployment nie został porównany z repozytorium.
