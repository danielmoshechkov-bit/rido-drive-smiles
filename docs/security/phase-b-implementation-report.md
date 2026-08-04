# Faza B — płatności, kredyty, SMS, webhooki i idempotencja

## Wynik

**PASS dla lokalnej implementacji fail-closed. FAIL dla uruchomienia płatności i publikacji.**

Kod nie ufa już wartościom finansowym przesłanym przez przeglądarkę, a niegotowe ścieżki wartościowe są zablokowane. Migracja nie została wykonana, podpisany adapter P24 nie istnieje, a testy integracyjne Postgresa nie mogły zostać uruchomione bez lokalnego Dockera. Security Gate 3 wymaga jeszcze testu na uruchomionej bazie; Security Gate 4 pozostaje **FAIL**. Cała wersja nadal ma status **NO-GO**.

## Co naprawiono

- `payment-core` akceptuje wyłącznie `price_id` oraz UUID `x-idempotency-key`. Odrzuca kwotę, walutę, benefit, `user_id`, `tenant_id`, `company_id`, `provider_id`, `status`, `paid`, `return_url` i metadane klienta.
- Użytkownik pochodzi ze zweryfikowanego JWT, a odbiorca i tenant są ustalane serwerowo. Właściciel firmy oraz aktywny członek są obsługiwani jawnie.
- Cena, waluta i wartość benefitu pochodzą z kanonicznego `billing_products` i są zapisywane jako niezmienny snapshot w najmniejszych jednostkach waluty (`bigint`).
- Dodano unikalne klucze idempotencji zamówień i eventów, blokady transakcyjne, append-only ledger oraz atomową funkcję „zweryfikowana płatność → wpis ledgeru → saldo → status”. Funkcja pozostaje bez `GRANT` do czasu gotowego webhooka.
- Bezpośredni DML sald, płatności, portfeli i tabel wartości został odebrany również `service_role`; zapis ma docelowo przechodzić wyłącznie przez wąskie RPC.
- `sms_balance` chroni trigger z markerem ustawianym wyłącznie wewnątrz transakcyjnego RPC.
- Ledger usługodawcy używa tenanta zapisanego w wierszu. Zmiana `service_providers.company_id` nie przenosi historii ani salda; rozbieżność kończy się `provider_tenant_changed`.
- `credit_packages` jest historycznym katalogiem tylko do odczytu. UI zakupu i podgląd administracyjny czytają kanoniczny `billing_public_products`.
- Pakiety `ai_photo` i `listing_featured` pozostają nieaktywne, dopóki nie otrzymają odrębnych, zgodnych konsumentów salda.
- Frontend nie przyznaje już sam kredytów, SMS, salda portfela, płatnego statusu wynajmu, promocji, sesji parkingowej ani wyróżnienia.
- Przekierowanie płatnicze wymaga HTTPS i jawnej allowlisty `VITE_PAYMENT_REDIRECT_ORIGINS`; klucz idempotencji przeżywa retry w tej samej sesji użytkownika.

## Ataki możliwe przed zmianą i blokada

| Atak przed zmianą | Obecna blokada |
|---|---|
| Kwota `0`, ujemna, zmieniona waluta lub dowolna liczba kredytów | Ścisła allowlista body i katalog serwerowy |
| Podstawienie innego użytkownika, firmy lub providera | JWT + serwerowe ustalenie aktora i membership |
| Zwykły użytkownik wykonuje `admin_grant` | Akcja usunięta z endpointu; RPC bez `GRANT` |
| Bezpośrednie zwiększenie salda przez Supabase API | RLS, odebrane DML, trigger i ledger |
| Powtórzenie lub równoległe wykonanie płatności | Unikalne eventy, idempotency key i blokady transakcyjne |
| Przeniesienie providera do innej firmy i przejęcie historii | Tenant z wiersza ledgeru + odmowa rebindingu |
| Open redirect do fałszywego operatora | HTTPS + jawna allowlista originów |
| „Płatność testowa” oznaczona jako opłacona | Brak symulacji; brak zewnętrznego requestu; status 202 fail-closed |

## Zmienione pliki Fazy B

- `.env.example`
- `package.json`
- `scripts/security/phase-a-security.test.mjs`
- `scripts/security/phase-b-security.test.mjs`
- `supabase/functions/payment-core/index.ts`
- `supabase/functions/_shared/paymentSecurity.ts`
- `supabase/functions/_shared/securityPrimitives.ts`
- `supabase/functions/_shared/security.ts`
- `supabase/migrations/20260801130000_phase_b_billing_integrity.sql`
- `src/hooks/usePayment.ts`
- `src/hooks/useUserCredits.ts`
- `src/hooks/useUserWallet.ts`
- `src/hooks/useVehicleLookup.ts`
- `src/pages/BuyCredits.tsx`
- `src/components/admin/AdminPaymentsTab.tsx`
- `src/components/admin/MapWalletPanel.tsx`
- `src/components/quota/QuotaGuardProvider.tsx`
- `src/components/vehicle/VehicleLookupCreditsModal.tsx`
- `src/components/maps/parkingService.ts`
- `src/components/maps/ParkingPurchaseSheet.tsx`
- `src/components/rental/rentalListing.ts`
- `src/components/rental/RentalPaymentsPanel.tsx`
- `src/components/rental/RentalBookingsList.tsx`
- `docs/security/phase-a-edge-function-classification.md`
- `docs/security/phase-b-implementation-report.md`

## Migracja

Dodano `20260801130000_phase_b_billing_integrity.sql`. Nie została uruchomiona. Tworzy katalog, intencje, eventy, salda i ledger; ogranicza DML tabel historycznych; dodaje bezpieczne odczyty oraz wyłącza niezabezpieczone RPC. Migracja wymaga najpierw uruchomienia na kopii stagingowej i weryfikacji rzeczywistego schematu.

## Testy

| Kontrola | Wynik |
|---|---|
| `npm run test:security:phase-b` | PASS — 22/22 |
| `npm run test:security:phase-a` | PASS — 19/19 |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, wyłącznie istniejące ostrzeżenia bundle/import |
| Parsowanie `esbuild` Edge Functions | PASS — 171/171 |
| `git diff --check` | PASS |
| `npm audit --offline --audit-level=low` | PASS — 0 według lokalnych danych |
| Lokalny Supabase/Postgres | NIEURUCHOMIONE — brak działającego Docker daemon |
| Testy przeciw produkcji | ŚWIADOMIE NIEURUCHOMIONE |

Testy statyczne obejmują m.in. kwotę zero/ujemną/zmienioną, obcą walutę, podstawienie aktora i tenanta, niepoprawny podpis/brak webhooka przez fail-closed, replay, równoległość, `admin_grant`, bezpośrednią zmianę salda, kanoniczny katalog i rebinding tenanta.

## Funkcje celowo zablokowane i sposób bezpiecznego przywrócenia

- **P24 i webhook:** `payment-core` nie rejestruje transakcji u operatora, a `payment-core-webhook`, `billing_attach_gateway_session` i `billing_apply_verified_payment` są niewykonywalne. Przywrócić dopiero po implementacji podpisu na surowym body, weryfikacji u P24 merchant/session/amount/currency/status, okna czasowego, replay/DLQ, testów równoległości i stagingu. Dopiero wtedy nadać `GRANT EXECUTE ... TO service_role` wyłącznie wymaganym RPC.
- **`admin_grant`:** RPC istnieje, ale jest bez `GRANT`. Przywrócić przez osobny endpoint z JWT administratora, świeżą reautoryzacją/MFA, limitem, powodem, idempotencją i audytem; aktor nie może pochodzić z body.
- **Zużycie SMS i sprawdzeń pojazdu:** stare RPC są wyłączone, ponieważ nie przyjmują stabilnego `event_id`. Zastąpić kontraktem serwerowym z aktorem, tenantem i idempotency key.
- **Marketplace, parking, promocje, wynajem i portfele:** bezpośrednie ścieżki DML są zablokowane. Przywrócić osobnymi RPC domenowymi z serwerową wyceną/snapshotem, autoryzacją, transakcją, idempotencją i audit logiem. Ręczna płatność gotówkowa wymaga jawnej roli i audytu, nie klientowego `status=paid`.
- **Zakup `ai_photo` i `listing_featured`:** pozostaje nieaktywny do czasu osobnych sald i atomowych konsumentów; nie wolno mapować kilku benefitów na jedną kolumnę `user_credits.credits_balance`.
- **Wyświetlanie sald w `useCredits`:** zwraca bezpieczne zero. Przywrócić po zastosowaniu migracji, regeneracji typów i podłączeniu tenantowego widoku `billing_value_balances`.

## Działania ręczne

1. Uruchomić cały zestaw migracji i testów dwóch tenantów wyłącznie na izolowanym stagingu; nie wykonywać od razu na produkcji.
2. Przejrzeć anomalie istniejących sald oraz historię zmian `service_providers.company_id` przed baseline ledgeru.
3. Wygenerować ponownie typy Supabase dopiero po zatwierdzeniu migracji.
4. Pozostawić `PAYMENT_INTENT_CREATION_ENABLED=false` i pustą `VITE_PAYMENT_REDIRECT_ORIGINS` do czasu gotowego adaptera.
5. Obrócić poświadczenia P24, ustawić je jako sekrety serwerowe i zapisać w tabeli jedynie referencje `P24_*`, nigdy wartości.
6. Skonfigurować dokładne originy produkcji i stagingu; bez wildcardów.
7. Utworzyć audytowany panel/RPC zarządzania `billing_products`; nie przywracać DML `credit_packages`.

## Ryzyko pozostałe

- SQL nie został wykonany ani przetestowany na realnym schemacie; statyczny PASS nie dowodzi poprawności RLS w Postgresie.
- Płatności, webhook i część operacji wartościowych są bezpiecznie niedostępne, ale funkcjonalnie niegotowe.
- Stare tabele mogą zawierać anomalie, które wymagają raportu przed baseline.
- `service_providers.company_id` wymaga dalszego uszczelnienia w Fazie C.
- Test offline `npm audit` nie zastępuje aktualnej bazy advisory; pełny audyt zależności należy wykonać w Fazie F po zgodzie na dostęp do rejestru.
