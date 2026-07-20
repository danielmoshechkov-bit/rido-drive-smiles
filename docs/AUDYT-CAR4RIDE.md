# AUDYT: dane spółki CAR4RIDE SP. Z O.O. w repozytorium

Data audytu: 2026-07-20 · Zakres: całe repo (src, public, supabase/functions, supabase/migrations, pliki konfiguracyjne i ukryte, binaria) · Metoda: ripgrep case-insensitive (`--hidden --no-ignore-vcs`) + grep binarny dla `public/` i `.github/`.

Docelowy podmiot: **GETRIDO SP. Z O.O.** — uwaga: ta nazwa **nie występuje jeszcze nigdzie w repo**, więc nic nie zostało dotąd podmienione.

## Tabela wystąpień

| Plik | Linia | Znaleziona wartość | Typ | Kontekst |
|---|---|---|---|---|
| `src/pages/LegalPage.tsx` | 128 | CAR4RIDE SP. Z O.O. | nazwa | Komponent `AdminInfo` — ramka z danymi administratora, wyświetlana w Polityce Prywatności (RODO) |
| `src/pages/LegalPage.tsx` | 129 | ul. Borsucza 13 | adres | `AdminInfo` — adres siedziby |
| `src/pages/LegalPage.tsx` | 130 | 02-213 Warszawa | adres | `AdminInfo` — kod pocztowy i miasto |
| `src/pages/LegalPage.tsx` | 131 | 5223252793 | NIP | `AdminInfo` |
| `src/pages/LegalPage.tsx` | 132 | 524746171 | REGON | `AdminInfo` |
| `src/pages/LegalPage.tsx` | 133 | 0001025395 | KRS | `AdminInfo` |
| `src/pages/LegalPage.tsx` | 135 | rodo@getrido.pl | mail | `AdminInfo` — kontakt RODO (już w domenie getrido.pl, bez zmian) |
| `src/pages/LegalPage.tsx` | 472 | CAR4RIDE SP. Z O.O. + Borsucza 13, 02-213 Warszawa + NIP 5223252793 + REGON 524746171 + KRS 0001025395 | nazwa/adres/NIP/REGON/KRS | **Regulamin** — §1, pełne dane operatora platformy |
| `src/pages/LegalPage.tsx` | 490 | CAR4RIDE SP. Z O.O. | nazwa | Regulamin — definicja „Administrator" |
| `src/pages/LegalPage.tsx` | 617 | CAR4RIDE SP. Z O.O. + pełne dane jw. | nazwa/adres/NIP/REGON/KRS | **Polityka Cookies** — pełne dane operatora |
| `src/components/driver/DriverB2BProfile.tsx` | 656 | CAR4RIDE SP. Z O.O. | nazwa | Regulamin **autofakturowania** (art. 106d ustawy o VAT) — upoważnienie operatora do wystawiania faktur w imieniu użytkownika |
| `src/components/driver/DriverB2BProfile.tsx` | 666 | CAR4RIDE SP. Z O.O., ul. Borsucza 13, 02-213 Warszawa | nazwa/adres | Ten sam modal — pole „Administrator" |
| `src/components/admin/KsefAdminPanel.tsx` | 26–30 | `Car4RideSettings`, `company_name: 'CAR4RIDE'`, `nip: '5223252793'` | nazwa/NIP | **Domyślne wartości formularza** globalnych ustawień firmy do faktur/KSeF (nazwa komponentu + stan początkowy) |
| `src/components/admin/KsefAdminPanel.tsx` | 45, 79 | `admin-car4ride-settings` | nazwa | Klucz cache TanStack Query |
| `src/components/admin/KsefAdminPanel.tsx` | 80, 142, 229 | „Ustawienia (globalne) CAR4RIDE" | nazwa | Teksty UI panelu admina (toast, nagłówek karty, przycisk) |
| `src/components/admin/KsefAdminPanel.tsx` | 144 | „Główna firma portalu — NIP: 5223252793" | NIP | Opis karty w panelu admina |
| `src/components/admin/KsefAdminPanel.tsx` | 664 | `<Car4RideSettings />` | nazwa | Użycie komponentu |
| `src/components/admin/KsefSettingsPanel.tsx` | 49 | `company_name: 'CAR4RIDE'` | nazwa | `DEFAULT_SETTINGS` — domyślna nazwa firmy w ustawieniach KSeF |
| `src/components/admin/KsefSettingsPanel.tsx` | 250 | „Dane CAR4RIDE do faktur i KSeF" | nazwa | Opis karty ustawień |
| `src/components/admin/AICallAdminPanel.tsx` | 259 | `placeholder="np. 5223252793"` | NIP | Placeholder pola NIP (przykład = realny NIP starej spółki) |
| `src/components/admin/AICallAdminPanel.tsx` | 280 | `placeholder="np. Car4Ride Sp. z o.o."` | nazwa | Placeholder pola nazwy firmy |
| `src/components/admin/AICallAdminPanel.tsx` | 699 | `"5223252793\n1234567890\n9876543210"` | NIP | Placeholder listy NIP-ów (pierwszy = realny NIP starej spółki) |
| `src/components/fleet/FleetContractSettings.tsx` | 406 | `placeholder="np. Car4Ride sp. z o.o."` | nazwa | Placeholder nazwy firmy w ustawieniach umów floty |
| `src/components/fleet/FleetContractSettings.tsx` | 411 | `placeholder="np. 5223252793"` | NIP | Placeholder pola NIP |
| `src/utils/contractHelpers.ts` | 7 | „KRS: 0001025395" | KRS | Komentarz JSDoc — przykład formatu przechowywanej wartości (realny KRS starej spółki) |
| `supabase/migrations/20260323214326_….sql` | 5 | `company_name text DEFAULT 'CAR4RIDE'` | nazwa | **DEFAULT kolumny** w tabeli `company_settings` — każdy nowy wiersz bez podanej nazwy dostaje 'CAR4RIDE' |
| `supabase/migrations/20260106092101_….sql` | 1 | „Link all drivers without fleet to Car4Ride sp. z o.o." | nazwa | Komentarz migracji; UPDATE przypisuje kierowców do floty `b780dbf2-586b-4034-9176-be5431604f3e` (flota Car4Ride w bazie) |
| `supabase/migrations/20260110191931_….sql` | 21 | warszawa@car4ride.pl | mail | Komentarz migracji — nadanie roli `real_estate_agent` użytkownikowi `b85d1e29-…` (konto na domenie car4ride.pl) |
| `supabase/migrations/20260504203043_….sql` | 12 | Cart78Garage | podmiot | Komentarz migracji seed — „ta sama kategoria co Cart78Garage" |
| `src/components/invoices/SimpleFreeInvoice.tsx` | 964 | „(Borsucza 13 13)" | adres | Komentarz w kodzie — przykład błędnego dublowania numeru budynku |
| `src/components/maps/autocompleteService.ts` | 81, 211–213 | „borsucza" | adres | Przykłady fuzzy-matchingu ulic w komentarzach/kodzie (nazwa ulicy jako testowy przykład) |
| `rido_test.csv` (katalog główny) | całość | realne imiona, nazwiska, e-maile, telefony kierowców | telefon/mail (PII) | Testowy plik CSV rozliczeń z **prawdziwymi danymi osobowymi** — nie dotyczy danych spółki, ale istotne przy audycie RODO |

## PRIORYTET WYSOKI (prawnie istotne — do podmiany na GETRIDO SP. Z O.O.)

1. **`src/pages/LegalPage.tsx`** — jedno źródło wszystkich dokumentów prawnych portalu:
   - linia 128–133: blok `AdminInfo` (dane administratora w Polityce Prywatności / RODO),
   - linia 472: **Regulamin** — pełne dane operatora (nazwa, adres, NIP, REGON, KRS),
   - linia 490: definicja „Administrator" w Regulaminie,
   - linia 617: **Polityka Cookies** — pełne dane operatora.
2. **`src/components/driver/DriverB2BProfile.tsx:656,666`** — regulamin **autofakturowania** (art. 106d VAT): upoważnienie do wystawiania faktur w imieniu użytkownika wskazuje CAR4RIDE jako operatora + adres administratora. To dokument o skutkach podatkowych — zmiana podmiotu prawdopodobnie wymaga też podbicia `TERMS_VERSION` i ponownej akceptacji przez użytkowników.
3. **`src/components/admin/KsefAdminPanel.tsx:29–30`** — domyślne dane „głównej firmy portalu" do **faktur i KSeF**: nazwa `CAR4RIDE` + NIP `5223252793` jako stan początkowy formularza. Faktura wystawiona z tych ustawień będzie miała dane sprzedawcy starej spółki.
4. **`src/components/admin/KsefSettingsPanel.tsx:49`** — drugi panel z domyślną nazwą `CAR4RIDE` dla ustawień KSeF.
5. **`supabase/migrations/20260323214326_….sql:5`** — `DEFAULT 'CAR4RIDE'` na kolumnie `company_settings.company_name`. Starych migracji nie wolno edytować — zmiana DEFAULT-u i **istniejących wierszy w bazie** wymaga nowej migracji. Uwaga: tabela `company_settings` w produkcyjnej bazie niemal na pewno zawiera już zapisane dane CAR4RIDE (NIP, adres, konto bankowe) — audyt repo tego nie obejmuje, trzeba sprawdzić w bazie.
6. **Baza danych (poza repo, ale wynikające z migracji):** flota `b780dbf2-586b-4034-9176-be5431604f3e` („Car4Ride sp. z o.o." w tabeli `fleets`) oraz konto użytkownika `warszawa@car4ride.pl` (`b85d1e29-…`). Rebranding musi objąć te rekordy.

Generatory faktur (`src/utils/invoiceHtmlGenerator.ts`, Dompdf w `public/invoice-pdf.php`) **nie mają** twardo wpisanych danych sprzedawcy — pobierają je dynamicznie, więc kluczowe jest wyczyszczenie ustawień w panelach KSeF i w tabeli `company_settings`.

## PRIORYTET NISKI (placeholdery, komentarze, seed/test data)

- `src/components/admin/AICallAdminPanel.tsx:259,280,699` — placeholdery pól formularza z realnym NIP-em i nazwą Car4Ride (warto podmienić na dane fikcyjne, np. `1234567890`).
- `src/components/fleet/FleetContractSettings.tsx:406,411` — jw., placeholdery.
- `src/utils/contractHelpers.ts:7` — komentarz z realnym KRS jako przykładem formatu.
- `src/components/admin/KsefAdminPanel.tsx` — nazwy techniczne: komponent `Car4RideSettings`, klucz query `admin-car4ride-settings` (działają, ale mylące po rebrandingu).
- `supabase/migrations/20260106092101`, `20260110191931`, `20260504203043` — komentarze w historycznych migracjach; **nie edytować** (zasada repo), wystarczy świadomość.
- `src/components/invoices/SimpleFreeInvoice.tsx:964`, `src/components/maps/autocompleteService.ts:81,211–213` — „Borsucza" jako przykład w komentarzach/fuzzy-matchingu; kosmetyka.
- ⚠️ `rido_test.csv` w katalogu głównym — realne PII kierowców (nazwiska, e-maile, telefony) w publicznej historii gita. Nie dotyczy danych spółki, ale to osobne ryzyko RODO — rekomendacja: usunąć z repo (usunięcie pliku nie czyści historii gita).

## Czego NIE znaleziono (sprawdzone, wynik negatywny)

- **Rachunki bankowe:** brak realnych numerów — wszystkie wystąpienia to placeholdery `00 0000 0000 …` w polach formularzy.
- **Telefony firmowe:** brak twardo wpisanych numerów spółki; `+48 …` występują tylko w seed-danych demo (`supabase/functions/seed-services-demo` — fikcyjne) i w `rido_test.csv` (PII kierowców, patrz wyżej).
- **CART / CART78 / STARTGO:** jedyne trafienie to „Cart78Garage" w komentarzu migracji `20260504203043`. „CART" samodzielnie i „STARTGO" — zero wystąpień.
- **Szablony e-mail / SMTP:** wszystkie adresy nadawców (`_shared/smtpSend.ts`, funkcje `send-*`) używają już domeny **getrido.pl** — nic do zmiany.
- **`public/`, `.github/`, `index.html`, `.htaccess`, pliki binarne i ukryte:** brak wystąpień Car4Ride / Borsucza / NIP-u (sprawdzone też grepem binarnym).
- **„Car 4 Ride" (ze spacjami):** zero wystąpień.

## Unikalne adresy e-mail (domeny firmowe)

Na domenie starej spółki:
- `warszawa@car4ride.pl` — tylko w komentarzu migracji `20260110191931` (konto istnieje w bazie produkcyjnej)

Na domenie docelowej (już używane, bez zmian):
- `kontakt@getrido.pl`, `noreply@getrido.pl`, `no-reply@getrido.pl` (uwaga: dwa warianty pisowni), `rodo@getrido.pl`, `ksef@getrido.pl`, `klient@getrido.pl`

## Unikalne numery identyfikacyjne

| Numer | Typ | Przypisanie |
|---|---|---|
| 5223252793 | NIP | CAR4RIDE SP. Z O.O. (regulamin, cookies, defaulty KSeF, placeholdery) |
| 524746171 | REGON | CAR4RIDE SP. Z O.O. (LegalPage) |
| 0001025395 | KRS | CAR4RIDE SP. Z O.O. (LegalPage + komentarz w `contractHelpers.ts`) |
| 1234567890 / 9876543210 / 12345678901 | — | wyłącznie fikcyjne przykłady w placeholderach |

Innych realnych NIP/KRS/REGON (np. GETRIDO SP. Z O.O.) w repo nie ma — dane nowej spółki trzeba będzie dopiero wprowadzić.
