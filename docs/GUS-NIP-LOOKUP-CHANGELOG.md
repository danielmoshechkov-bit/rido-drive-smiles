# GUS NIP Lookup — changelog dla Lovable (branch `feat/gus-nip-lookup`)

> **UWAGA DLA LOVABLE:** poniższe pliki zostały zmienione/dodane na branchu
> `feat/gus-nip-lookup` (lipiec 2026). Prosimy NIE nadpisywać tych zmian.
> Cała platforma używa teraz JEDNEGO mechanizmu lookupu NIP: Edge Function
> **`gus-lookup`** (GUS REGON BIR1.1 SOAP) + hook **`useGusLookup`** +
> współdzielony komponent **`src/components/shared/NipLookupField.tsx`**.
> Nie dodawać nowych lookupów per-formularz i nie wracać do `lookup-nip` /
> `registry-gus` (oznaczone @deprecated).

## Architektura (nowa)

- **`supabase/functions/gus-lookup/`** — jedyne źródło danych rejestrowych firm.
  - `bir.ts` — klient BIR1.1: SOAP 1.2 na `https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc`;
    flow Zaloguj → DaneSzukajPodmioty (NIP) → DanePobierzPelnyRaport
    (`BIR11OsPrawna` / `BIR11OsFizycznaDzialalnosc*` wg typu podmiotu) + raport PKD
    (`BIR11OsPrawnaPkd` / `BIR11OsFizycznaPkd`). Cache sesji `sid` ~50 min w pamięci
    instancji + retry z nowym logowaniem po wygaśnięciu. Pełna nazwa rejestrowa
    (`praw_nazwa`/`fiz_nazwa`) — bez ucinania; pola adresowe OSOBNO (ulica, nr domu,
    nr lokalu, kod, miasto) — zero parsowania regexami. Kod pocztowy normalizowany do `XX-XXX`.
  - `index.ts` — walidacja NIP (10 cyfr + suma kontrolna), klucz **WYŁĄCZNIE** z secreta
    `GUS_BIR_API_KEY` (Deno.env; NIE z tabeli `external_integrations`); opcjonalny
    `GUS_BIR_ENV=test` przełącza na środowisko testowe GUS. Kody błędów:
    `INVALID_NIP`, `NOT_FOUND`, `INVALID_KEY`, `LIMIT`, `SESSION`, `GUS_ERROR`.
  - Odpowiedź: `{ success, data: { nazwa, nazwa_skrocona, nip, regon, krs, ulica,
    nr_domu, nr_lokalu, kod_pocztowy, miasto, wojewodztwo, gmina, powiat,
    forma_prawna, pkd_glowne: {kod, nazwa}, status, data_zakonczenia,
    typ_podmiotu, adres, zrodlo } }` — `adres` to złożone "Ulica Nr/Lokal".
- **`src/hooks/useGusLookup.ts`** — hook: `lookup(nip)` (walidacja checksumy PRZED
  wywołaniem, zwraca `GusCompanyData | null`), `loading`, `error`, `company`, `reset`;
  eksportuje też `isValidNip()` i `cleanNip()`.
- **`src/components/shared/NipLookupField.tsx`** — współdzielone pole NIP z lupką
  (maska, spinner, toast błędów, karta podglądu, `onCompanyFound`, opcje
  `autoLookup`/`compact`). Do używania w nowych formularzach.
  Ma checkbox **„Skróć formę prawną (sp. z o.o.)"** (domyślnie ZAZNACZONY):
  do formularza trafia nazwa ze skróconą formą prawną
  („DR NATURA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ" → „DR NATURA sp. z o.o.");
  przełączenie checkboxa PO lookupie ponownie emituje `onCompanyFound`
  z podmienioną nazwą (oryginał trzymany w stanie hooka). Dotyczy TYLKO nazwy
  wstawianej do formularza — dane z GUS pozostają niezmienione.
- **`src/utils/legalFormShortener.ts`** — util skracania form prawnych
  (`shortenLegalForm`, `hasShortenableLegalForm`); case-insensitive, na końcu
  i w środku nazwy, dopasowanie od najdłuższego wzorca (sp. z o.o. sp.k. przed
  sp. z o.o., P.S.A. przed S.A., S.K.A. przed sp.k.). Obsługiwane: sp. z o.o. sp.k.,
  sp. z o.o., P.S.A., S.K.A., S.A., sp.k., sp.j., sp.p., s.c.
  Granice słów przez `(?<!\p{L})…(?!\p{L})` (klasyczne `\b` nie działa na polskich znakach).
- **`src/utils/legalFormShortener.test.ts`** — testy utila (15 przypadków, w tym
  sp. z o.o. sp.k. i P.S.A.); repo nie ma test runnera, plik odpala się samodzielnie:
  `node src/utils/legalFormShortener.test.ts` (Node ≥22.6).
- **`supabase/config.toml`** — dodany wpis `[functions.gus-lookup]` z `verify_jwt = false`.

## Deprecated (zostawione martwe, NIE używać; usunięcie po potwierdzeniu produkcyjnym)

| Plik | Status |
|---|---|
| `supabase/functions/lookup-nip/index.ts` | @deprecated — biała lista MF, ucinane nazwy |
| `supabase/functions/registry-gus/index.ts` | @deprecated — błędny endpoint BIR, zawsze fallback do MF |
| `src/hooks/useNipLookup.ts` | @deprecated — używaj `useGusLookup` |
| `src/components/NipLookupField.tsx` (stary, top-level) | @deprecated — używaj `shared/NipLookupField` |
| wpis `gus_regon` w `external_integrations` + panel `RegistryIntegrationsPanel` | @deprecated — klucz GUS jest w secrecie `GUS_BIR_API_KEY` |

**Zostają bez zmian (celowo, wymóg prawny):** `registry-whitelist` (biała lista MF —
weryfikacja statusu VAT i rachunków przy płatnościach ≥15 tys. zł) oraz `verify-vat`
(VIES). Działają RÓWNOLEGLE z lookupem GUS (np. ContractorWizard/ContractorEditDialog).

## Zmienione pliki — co i gdzie

### Backend / konfiguracja
| Plik | Zmiana |
|---|---|
| `supabase/functions/gus-lookup/index.ts` | NOWY — endpoint lookupu |
| `supabase/functions/gus-lookup/bir.ts` | NOWY — klient BIR1.1 |
| `supabase/config.toml` | + `[functions.gus-lookup]` |
| `supabase/functions/lookup-nip/index.ts` | tylko nagłówek @deprecated |
| `supabase/functions/registry-gus/index.ts` | tylko nagłówek @deprecated |

### Współdzielone
| Plik | Zmiana |
|---|---|
| `src/hooks/useGusLookup.ts` | NOWY — hook lookupu |
| `src/components/shared/NipLookupField.tsx` | NOWY — współdzielone pole NIP |
| `src/hooks/useNipLookup.ts` | @deprecated |
| `src/components/NipLookupField.tsx` | @deprecated |

### Faktury / Księgowość (przepięte z registry-gus/lookup-nip → gus-lookup)
| Plik | Zmiana |
|---|---|
| `src/components/invoices/ContractorSelector.tsx` | invoke `gus-lookup`, checksum przed strzałem, mapowanie nazwa/adres/kod/miasto |
| `src/components/accounting/ContractorWizard.tsx` | goły fetch z hardcoded anon key → `supabase.functions.invoke('gus-lookup')`; krok weryfikacji pokazuje KRS + formę prawną; whitelist bez zmian |
| `src/components/invoices/ContractorEditDialog.tsx` | `gus-lookup` (adres z `adres` zamiast składania street/propertyNumber); whitelist bez zmian |
| `src/components/invoices/CostInvoiceModal.tsx` | `gus-lookup` (dostawca faktury kosztowej) |
| `src/components/invoices/CompanySetupWizard.tsx` | `gus-lookup`; usunięty regex rozbijający adres — nr domu/lokalu z pól GUS |
| `src/components/invoices/SimpleFreeInvoice.tsx` | nabywca: `useNipLookup` → `useGusLookup` (fix ucinanej nazwy, np. CEIDG); NOWA lupka przy NIP sprzedawcy |
| `src/components/invoices/InvoiceEditDialog.tsx` | NOWA lupka przy NIP nabywcy |
| `src/components/accounting/RecipientEditor.tsx` | stub `searchByNip` podpięty do realnego `gus-lookup` |
| `src/components/accounting/AIExtractionPanel.tsx` | NOWA lupka przy NIP dostawcy (korekta po ekstrakcji AI) |

### Warsztat (przepięte)
| Plik | Zmiana |
|---|---|
| `src/components/workshop/WorkshopAddClientDialog.tsx` | `lookup-nip` → `useGusLookup` |
| `src/components/workshop/WorkshopEditClientDialog.tsx` | `lookup-nip` → `gus-lookup` |
| `src/components/workshop/SettingsPanel.tsx` | `registry-gus` → `gus-lookup` |
| `src/components/workshop/WorkshopSettingsPage.tsx` | `registry-gus` → `gus-lookup`; short name z `nazwa_skrocona` |

### Flota / Wynajem (NOWE lupki)
| Plik | Zmiana |
|---|---|
| `src/pages/FleetRegister.tsx` | lupka przy NIP w kroku 1 — wypełnia nazwę, skrót, pełny adres |
| `src/components/fleet/FleetContractSettings.tsx` | lupka — nazwa, KRS, forma prawna (mapowanie na LEGAL_FORMS), adres |
| `src/components/fleet/FleetOwnersTab.tsx` | lupka — nazwa firmy właściciela |
| `src/components/fleet/VehicleOwnerSelector.tsx` | lupka — nazwa firmy właściciela |
| `src/components/fleet/DriverInfoModal.tsx` | lupka w sekcji B2B — nazwa + pełny adres |
| `src/components/rental/RentalWizard.tsx` | lupka — firma najemcy B2B |
| `src/components/rental/RentalOwnersTab.tsx` | lupka — firma właściciela |
| `src/components/rental/RentalOwnerSelector.tsx` | lupka — firma właściciela |
| `src/components/rental/RentalPartnerFleets.tsx` | lupka — nazwa/miasto/adres partnera |

### Kierowca / rejestracje / portale (NOWE lupki)
| Plik | Zmiana |
|---|---|
| `src/components/driver/DriverB2BProfile.tsx` | przycisk „GUS" (pobranie danych: nazwa, REGON, adres) OBOK istniejącego „Sprawdź" (VIES — bez zmian) |
| `src/pages/RealEstateAgentRegister.tsx` | przepięty na `shared/NipLookupField` (`GusCompanyData`) |
| `src/components/services/ServiceRegistrationModal.tsx` | lupka — nazwa, REGON, KRS, adres |
| `src/pages/ServiceProviderDashboard.tsx` | lupka w formularzu aktywacji — nazwa, adres, short name |
| `src/pages/InsuranceAgentRegister.tsx` | lupka — nazwa + adres |
| `src/components/marketplace/AddListingWizard.tsx` | lupka w kroku danych firmy (konto business) |
| `src/components/marketing/MarketingClientsTab.tsx` | lupka — nazwa, miasto, adres klienta agencji |
| `src/components/sales/SalesLeadForm.tsx` | lupka (react-hook-form `setValue`) — nazwa, miasto, adres |
| `src/components/realestate/AgentCRM.tsx` | lupka w dodawaniu kontaktu — nazwa firmy |

### KSeF / Admin / OCR (NOWE lupki)
| Plik | Zmiana |
|---|---|
| `src/components/admin/KsefSettingsPanel.tsx` | lupka — nazwa, REGON, adres (pola osobno) |
| `src/components/admin/KsefAdminPanel.tsx` | lupka — jw. (ustawienia globalne) |
| `src/components/admin/AICallAdminPanel.tsx` | lupka przy dodawaniu firmy do whitelist AI Call |
| `src/components/inventory/InventoryPurchaseOCR.tsx` | lupka przy NIP dostawcy (korekta po OCR) |
| `src/components/admin/AccountingModuleSettings.tsx` | test integracji „gus" woła `gus-lookup` |
| `src/components/admin/RegistryIntegrationsPanel.tsx` | wpis `gus_regon` opisany jako PRZESTARZAŁY |

### Świadomie pominięte
- `NewInvoiceWizard.tsx` — „ręczne pola sprzedawcy" nie mają UI (`setManualSellerData`
  nieużywane); dane firmy wchodzą przez `CompanySetupWizard`, który ma lupkę.
- DB-lookupy NIP floty (szukanie istniejącej floty w tabeli `fleets`, nie w GUS):
  `PartnerFleetsManagement`, `AddPartnerFleetModal`, `DriverOnboardingWizard`,
  `DriverRegister`, `MarketplaceDashboard` — bez zmian, inny cel.

## Wdrożenie
1. Secret `GUS_BIR_API_KEY` — już dodany w Supabase Dashboard (klucz produkcyjny BIR).
2. Wdrożyć Edge Function `gus-lookup` (deploy przez Lovable/Supabase).
3. Migracje SQL: BRAK (zero zmian schematu).
4. Po potwierdzeniu działania na produkcji: usunąć `lookup-nip`, `registry-gus`,
   stary `NipLookupField`, `useNipLookup` i sekcję `gus_regon` z panelu integracji.

## Testy wykonane
Logika BIR (`bir.ts`) przetestowana lokalnie na środowisku testowym GUS
(publiczny klucz testowy, `GUS_BIR_ENV=test`):
- os. prawna z długą nazwą (NIP 5250007738): pełna nazwa
  „POWSZECHNA KASA OSZCZĘDNOŚCI BANK POLSKI SPÓŁKA AKCYJNA", KRS 0000026438,
  forma prawna, PKD przeważające, kod pocztowy `02-515`;
- CEIDG (NIP 5441387597 — zgłoszony bug ucinania): pełna nazwa
  „USŁUGI GEODEZYJNO - KARTOGRAFICZNE \"GEOMATIC\" ROMAN …" + PKD 7112Z;
- NIP z błędną sumą kontrolną: odcięty walidacją przed wywołaniem GUS;
- NIP nieistniejący: kod `NOT_FOUND`.
`tsc --noEmit` czyste; eslint bez nowych błędów (tylko pre-existing warningi).
