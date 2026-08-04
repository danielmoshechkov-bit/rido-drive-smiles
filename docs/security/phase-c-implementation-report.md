# Faza C — RLS, RPC, storage i izolacja tenantów

## Wynik

**PASS dla lokalnej implementacji fail-closed. FAIL dla publikacji. Globalnie: NO-GO.**

Migracje i kontrakty statyczne ograniczają potwierdzone ścieżki cross-tenant, dostęp anonimowy, nieautoryzowane RPC oraz ujawnianie tokenów i plików prywatnych. Nie zostały jednak wykonane na działającym Postgresie. Brak lokalnego Docker daemon uniemożliwił `supabase db reset`, uruchomienie fixture dwóch tenantów oraz testy signed URL na rzeczywistym Storage. Bez tych testów Security Gate 2, 5 i 10 nie mogą otrzymać wyniku PASS.

## Co naprawiono

- Dodano kanoniczne helpery dostępu i zarządzania firmą, providerem, flotą, kierowcą, pojazdem, workspace, kalendarzem i oględzinami. Decyzje opierają się na `auth.uid()`, aktywnym membership i stanie tenanta.
- Prywatne dane pozbawione wiarygodnej kotwicy tenanta są fail-closed. Historyczne osobiste pojazdy otrzymały `owner_user_id`; rekordy bez zweryfikowanego właściciela pozostają niedostępne.
- Zamknięto pivot w `driver_vehicle_assignments`: kierowca, pojazd i flota muszą tworzyć spójną relację, a pola kotwiczące są niemodyfikowalne. Stare polityki `USING (true)` zostały usunięte.
- `company_modules` stało się tylko do odczytu dla przeglądarki. Właściciel firmy nie może sam aktywować płatnego modułu ani przedłużać trialu.
- `workspace_project_members` nie pozwala przepiąć zaproszenia do obcego projektu. Akceptację przeniesiono do audytowanego RPC, które wiąże użytkownika z e-mailem z JWT i blokuje zmianę roli/projektu.
- Zadania, historia, komentarze, checklisty, czas pracy, zależności, kanały, DM, uczestnicy, reakcje, przypięcia, dokumenty, wersje, komentarze dokumentów i automatyzacje dziedziczą bieżący dostęp do projektu. Autorstwo, przypisanie lub historyczny participant nie utrzymują dostępu po odebraniu membership.
- Role workspace mają osobne poziomy: `guest/viewer` są tylko do odczytu i nie widzą komunikacji wewnętrznej ani definicji automatyzacji; `member` współtworzy projekt i zmienia własne/przypisane zadania; automatyzacje oraz zarządzanie treścią uprzywilejowaną wymagają `owner/manager`.
- Historia zmian zadań nie jest już zapisywalna z klienta. Niezmienny wpis tworzy trigger po rzeczywistej aktualizacji zadania, z aktorem z JWT i wartościami odczytanymi przez bazę.
- Zmiana roli i usunięcie członka korzystają z audytowanych RPC z blokadą wiersza. Manager nie może nadać/usunąć roli managera ani dotknąć ownera; operacje klientowe zostały przepięte na te komendy.
- Pola `user_id`, `email`, `role`, `status`, `hierarchy_role` i `invited_by` członka workspace są chronione triggerem oraz nie występują w klienckim grancie `UPDATE`. Akceptacja zaproszenia używa oznaczonej komendy i audit logu.
- Stare `workspace_invitations` i `workspace_project_invitations`, zawierające jawne bearer tokeny generowane także po stronie klienta, są zachowane w bazie, ale niedostępne dla przeglądarki.
- Pełne rekordy `viewing_slots`, `service_bookings`, `service_calendar_blocks` i `calendar_events` nie są publiczne. Token potwierdzenia oględzin nie jest udostępniany w projekcji przeglądarkowej.
- `rental_payments` ukrywa `link_url`, `link_token` i `gateway_session_id`, wymaga dodatniej kwoty oraz wiąże płatność z bookingiem tej samej firmy przez złożony FK `NOT VALID`.
- Aktualizacja `rating_avg`/`rating_count` po recenzji pozostaje zgodna wstecznie, ale trigger akceptuje ją wyłącznie jako zagnieżdżoną operację i tylko wtedy, gdy wartości dokładnie odpowiadają agregatom widocznych recenzji.
- Wszystkim funkcjom `SECURITY DEFINER` w `public` odebrano domyślne `PUBLIC EXECUTE`, ustawiono bezpieczny `search_path` i zastosowano jawne allowlisty sygnatur. Uprzywilejowane RPC finansowe, tokenowe i kontraktowe są niewykonywalne przez role gateway.
- Prywatne buckety zostały oznaczone jako prywatne i pozbawione bezpośrednich polityk klientowych. Dodano serwerowy endpoint signed URL: JWT, kontrola ACL/tenanta, limit rozmiaru body, audyt, `Cache-Control: no-store` i TTL 300 sekund.
- Publiczne buckety obrazów mają ograniczenia typu MIME, rozszerzenia, rozmiaru i ścieżki właściciela.

## Ataki możliwe przed zmianą i blokada

| Atak przed zmianą | Obecna blokada |
|---|---|
| Tenant A odczytuje lub aktualizuje rekord Tenant B przez podstawienie UUID | RLS powiązane z `auth.uid()`, membership i kotwicą rekordu |
| Kierowca A przypisuje sobie pojazd z floty B | Walidacja driver–vehicle–fleet w polityce i triggerze |
| Odbiorca zaproszenia przepina membership do obcego workspace | Niemodyfikowalne kotwice i audytowane RPC akceptacji |
| Były członek nadal czyta task/DM/dokument jako autor, assignee lub participant | Każdy rekord potomny ponownie wymaga aktywnego dostępu do projektu |
| Użytkownik dopisuje komentarz/historię do znanego `task_id` innej firmy | Kontrola task → project → aktywny membership w `WITH CHECK` |
| Viewer/guest modyfikuje zadania, dokumenty lub automatyzacje projektu | Oddzielne helpery read/contribute/manage i restrykcyjne polityki DML |
| Członek fałszuje historię zadania albo treść cudzego komentarza dokumentu | Brak klientowego INSERT historii, trigger DB oraz UPDATE komentarza tylko dla autora/managera |
| Owner zmienia `role`, `status` lub `user_id` bez audytu | Column-level grant + trigger wymagający oznaczonej komendy |
| Właściciel sam włącza płatny moduł | Brak klientowego DML `company_modules` |
| Anonimowy odczyt blokad kalendarza, rezerwacji i pełnych wydarzeń | Brak polityk anon; planowany wyłącznie redagowany endpoint dostępności |
| Odczyt tokenu oględzin albo linku płatniczego najmu | Column-level grants i jawne projekcje bez sekretów |
| Wywołanie historycznego uprzywilejowanego RPC przez PostgREST | Deny-by-default, jawna allowlista i migracyjne assertions |
| Zgadywanie ścieżki prywatnego dokumentu | Prywatny bucket, metadata ACL i krótki signed URL po autoryzacji |

## Zmienione pliki Fazy C

- `supabase/migrations/20260801140000_phase_c_tenant_isolation.sql`
- `supabase/migrations/20260801141000_phase_c_rpc_lockdown.sql`
- `supabase/migrations/20260801142000_phase_c_storage_lockdown.sql`
- `supabase/functions/private-storage-download/index.ts`
- `supabase/functions/_shared/privateStorageSecurity.ts`
- `supabase/functions/_shared/security.ts`
- `supabase/tests/security/phase_c_tenant_isolation.sql`
- `scripts/security/phase-c-security.test.mjs`
- `package.json`
- `src/components/accounting/EntityLogoUpload.tsx`
- `src/components/invoices/CompanySetupWizard.tsx`
- `src/components/realestate/MyViewingsPanel.tsx`
- `src/components/rental/RentalPaymentsPanel.tsx`
- `src/components/workspace/WorkspaceInvitationBell.tsx`
- `src/components/workspace/WorkspaceInvitations.tsx`
- `src/components/workspace/WorkspaceMembersView.tsx`
- `src/components/workspace/WorkspaceTasksView.tsx`
- `src/hooks/useWorkspace.ts`
- `docs/security/phase-c-implementation-report.md`

Nie zmieniono `AGENTS.md`. Nie wykonano migracji, commitów ani operacji na danych.

## Migracje

1. `20260801140000_phase_c_tenant_isolation.sql` — helpery tenantowe, RLS, kotwice i polityki domenowe.
2. `20260801141000_phase_c_rpc_lockdown.sql` — deny-by-default dla `SECURITY DEFINER`, bezpieczne zamienniki i jawne granty.
3. `20260801142000_phase_c_storage_lockdown.sql` — prywatne buckety, metadata/ACL, ograniczone publiczne obrazy i audytowany dostęp.

Migracje są addytywne i nie usuwają migracji historycznych. Constraints oznaczone `NOT VALID` chronią nowe zapisy, ale wymagają audytu i późniejszego `VALIDATE CONSTRAINT`.

## Testy

| Kontrola | Wynik |
|---|---|
| `npm run test:security:phase-c` | PASS — 25/25 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; pozostały wcześniejsze ostrzeżenia bundle/import |
| `git diff --check` | PASS |
| Fixture Tenant A/Tenant B/anon | PRZYGOTOWANY, runtime nieuruchomiony |
| `supabase db reset` / `supabase db lint --local` | NIEURUCHOMIONE — Docker daemon niedostępny |
| Testy produkcji | ŚWIADOMIE NIEURUCHOMIONE |

Fixture obejmuje pozytywne i negatywne odczyty tenantów, podstawienie identyfikatorów, DVA cross-fleet, workspace reparenting, historię i komentarze obcego zadania, próbę fałszowania własnej historii, role `member/viewer`, obcy komentarz dokumentu, automatyzacje, osieroconego uczestnika/nadawcę DM, dokument autora bez membership, audytowane komendy roli/usunięcia, token oględzin, wydarzenie w obcym kalendarzu, zmianę entitlementu, sekrety płatności najmu oraz anonimowy storage, kalendarz i booking. Całość działa w transakcji zakończonej `ROLLBACK`.

## Funkcje celowo zablokowane i bezpieczne przywrócenie

- **Publiczne rezerwacje usług i dostępność:** bezpośredni insert/update `service_bookings` oraz pełny publiczny odczyt kalendarza są zablokowane. Przywrócić przez rate-limitowany endpoint zwracający wyłącznie wolne sloty i idempotentną komendę rezerwacji. Provider, usługa, czas, cena, prowizja, klient i status muszą wynikać z bazy; OTP przechowywać jako hash z expiry i limitem prób.
- **Potwierdzanie oględzin tokenem:** publiczny klient nie odczyta ani nie zaktualizuje `viewing_slots`. Przywrócić przez podpisany, jednorazowy, wygasający token przechowywany jako hash, z limitem prób, replay protection i audytem. Nie przywracać `SELECT confirmation_token`.
- **Linki workspace i krytyczne przejścia ownera:** zwykła zmiana roli/usunięcie członka działa już przez audytowane RPC. Nadal zablokowane są oba stare tokenowe modele zaproszeń oraz nadawanie/przenoszenie roli `owner`. Przywrócić je dopiero przez świeżą reautoryzację, idempotencję i serwerowo generowany token przechowywany jako hash, wygasający, jednorazowy i rate-limitowany.
- **Link płatności najmu:** UI nie pobiera `link_url`. Przywrócić endpointem generującym krótko żyjący link po autoryzacji i audycie; nie ujawniać `link_token` ani `gateway_session_id`.
- **Prywatne dokumenty:** istniejące bezpośrednie URL-e mogą przestać działać po zastosowaniu migracji. Najpierw wykonać manifest obiektów, backfill `private_storage_objects`/ACL i przepiąć każdy callsite na `private-storage-download`; następnie włączyć prywatność bucketów. Nie usuwać ani nie przenosić danych bez kopii i kontroli referencji.
- **RPC kontraktów, tokenów i raportów:** pozostają bez `GRANT`. Przywracać pojedynczo przez autoryzowany endpoint z tenantem, idempotencją, audytem i testami negatywnymi, nigdy przez ponowne `GRANT ... TO anon` na tabelę domenową.
- **Tworzenie/aktualizacja providera:** pola uprzywilejowane są fail-closed. Przywrócić dedykowanym RPC/Edge Function, która wiąże `user_id` z JWT, wyznacza `company_id`, pozwala tylko na jawne pola profilu i osobno audytuje status, weryfikację, integracje i saldo.

## Działania ręczne

1. Uruchomić migracje od zera na izolowanym Supabase i wykonać fixture: `psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security/phase_c_tenant_isolation.sql`.
2. Przed stagingiem sporządzić raport rekordów osobistych `vehicles.owner_user_id IS NULL`; po ręcznym potwierdzeniu właściciela wykonać kontrolowany backfill. Nie przypisywać właściciela na podstawie niezaufanego pola klienta.
3. Zidentyfikować niespójne i zduplikowane aktywne `driver_vehicle_assignments`, dopiero potem dodać częściowe indeksy unikalne i walidację.
4. Audytować dane naruszające nowe constraints płatności najmu i kalendarza, naprawić je na stagingu oraz wykonać `VALIDATE CONSTRAINT`.
5. Zbudować manifest prywatnych plików, tenantów, właścicieli i aktywnych URL-i; wykonać kompatybilny backfill metadata/ACL oraz test odwołania dostępu.
6. Przeskanować istniejące publiczne uploady, poddać kwarantannie aktywną treść i dodać serwerową weryfikację magic bytes/re-encoding, quota i rate limiting przed pozostawieniem uploadu publicznego.
7. Wygenerować ponownie typy Supabase po zatwierdzeniu schematu i sprawdzić wszystkie callsite'y zablokowanych workflow.

## Ryzyko pozostałe

- Najważniejsze: brak wykonawczego testu SQL/RLS. Statyczne dopasowanie tekstu nie dowodzi zachowania Postgresa, grantów, triggerów ani Storage API.
- Migracja prywatności bucketów nie może trafić na produkcję przed backfillem ACL i przepięciem callsite'ów; inaczej bezpiecznie, ale realnie zablokuje dokumenty.
- Publiczne media nie mają jeszcze kompletnego pipeline magic-byte, re-encodingu, skanowania malware, quota i rozproszonego rate limitingu.
- Model `personal workspace` (`tenant_id IS NULL`) i `tenant workspace` wymaga jawnego rozdzielenia. Obecny tryb jest kompatybilny fail-closed, lecz część zaproszeń/presence będzie niedostępna.
- Stare osobiste pojazdy bez `owner_user_id` są bezpiecznie niedostępne do czasu zweryfikowanego backfillu.
- Audit trail dostępu do dokumentów istnieje w nowym endpointcie, ale centralna obserwowalność, alerty i analiza prób cross-tenant należą do Fazy F.

## Ocena bramek związanych z Fazą C

| Bramka | Wynik |
|---|---|
| GATE 2 — zero cross-tenant | FAIL do czasu runtime fixture |
| GATE 5 — brak publicznych dokumentów prywatnych | FAIL do czasu backfillu i testu Storage |
| GATE 10 — krytyczne testy | FAIL do czasu lokalnego Supabase |

Kod lokalny jest przygotowany do testów, ale wersja pozostaje **NO-GO**.
