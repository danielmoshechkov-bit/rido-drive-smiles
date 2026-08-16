# Duplikacja ustawień usługodawcy — raport

Stan na 16.08.2026. **Diagnoza, nic nienaprawione.**

Oznaczenia: ✅ sprawdzone przeze mnie osobiście (przeczytany kod po obu
stronach), ⚠️ z przeglądu, do potwierdzenia przed zmianą.

---

## 0. Założenie z listy trzeba odwrócić

**To nie są dwa panele ustawień. To jeden komponent renderowany dwa razy.**

- „Warsztat & Auto → Ustawienia" → `WorkshopSettingsStandalone.tsx:39` → `SettingsPanel`
- „Ustawienia" w panelu usługodawcy → `ServiceProviderDashboard.tsx:1200` → `SettingsPanel`

✅ Sprawdzone. Różnią się **wyłącznie propsami**, i to jest źródłem części usterek.

To zmienia sens pytania „co gdzie ma być": nie trzeba niczego scalać, bo już
jest scalone. Trzeba naprawić rozjazd danych pod spodem i rozstrzygnąć, czy
ekran ma być jeden, czy dwa różne.

Prawdziwa duplikacja jest gdzie indziej — **trzy edytory tych samych danych firmy**:

| # | Ekran | Komponent |
|---|---|---|
| S1 | „Konto i firma" | `SettingsPanel.tsx:364-521` |
| S2 | „Zakład" (zakładka wewnątrz S1) | `WorkshopSettingsPage.tsx` |
| S3 | Dialog aktywacji + „Moje usługi" + modal mediów | `ServiceProviderDashboard.tsx:954-1112`, `MyServicesPanel.tsx`, `ProviderMediaModal.tsx` |

---

## 1. 🔴 Godziny pracy — dwa formaty w jednej kolumnie

**To jedyna usterka z tej listy, która uderza w KLIENTA KOŃCOWEGO.**

✅ Sprawdzone we wszystkich trzech miejscach:

- `MyServicesPanel.tsx:558,818` — `hours` to **obiekt** z kluczami dni
  (`{...p, [d]: {...}}`), zapisywany do `service_providers.working_hours`
  **oraz** do `workshop_settings.working_hours` (`:582,587`).
- `WorkshopSettingsPage.tsx:55,480` — `workingHours` to **tablica**
  (`workingHours[i]`), zapisywana do `workshop_settings.working_hours` (`:192`).
- `ServiceBookingModal.tsx:151-155` — czyta `workshop_settings.working_hours`
  i robi `if (!Array.isArray(wh)) { setWorkingHours([]); return; }`.

**Skutek:** zapisanie godzin przez „Moje usługi" wkłada obiekt w kolumnę,
z której formularz rezerwacji oczekuje tablicy. Czytelnik cicho zwraca pustkę,
więc **klient końcowy nie zobaczy żadnych wolnych terminów**. Bez błędu, bez
ostrzeżenia — po prostu pusty kalendarz.

Trzeci, niepowiązany magazyn: `workshop_finance_settings.work_days/work_start/work_end`
(`WorkshopCashSettings.tsx:17-19`).

---

## 2. 🔴 Wejście przez moduł Warsztat kasuje numer konta

✅ Sprawdzone.

`WorkshopSettingsStandalone.tsx:18-28` ładuje trzynaście pól z `service_providers`
i **nie ładuje `bank_account`** (tej kolumny tam nie ma — numer konta żyje
w `workshop_settings`).

`SettingsPanel.tsx:250` przy zapisie robi `bank_account: settingsForm.bank_account || ''`.

**Skutek:** wchodząc przez „Warsztat & Auto → Ustawienia" pole startuje puste,
a zapisanie czegokolwiek na tym ekranie **nadpisuje zapisany numer konta pustym
łańcuchem**. Wejście przez „Ustawienia" w panelu działa poprawnie.

---

## 3. 🔴 Cztery pola nie pokazują się w wersji warsztatowej

✅ Sprawdzone.

`SettingsPanel.tsx:421` renderuje nazwę firmy, NIP, nazwę skróconą i adres
warunkowo: `{settingsForm.business_type === 'firma' && (…)}`.

`WorkshopSettingsStandalone.tsx:22-28` **nie ustawia `business_type`** →
`undefined` → warunek fałszywy → **te cztery pola w ogóle się nie renderują**,
choć zapis je obsługuje. W panelu usługodawcy działają, bo tam jest domyślne
`'firma'` (`ServiceProviderDashboard.tsx:193`).

Sam przełącznik „Typ konta" (`:411-420`) jest **martwy**: `business_type` nie
trafia do żadnego zapisu i nie ma takiej kolumny ani w `service_providers`,
ani w `workshop_settings`. To czysty stan lokalny — ginie po odświeżeniu.

---

## 4. Pola zapisywane do RÓŻNYCH kolumn

| Pole | Gdzie A | Gdzie B | Widoczne wzajemnie? |
|---|---|---|---|
| **nazwa skrócona** | S1/S2 → `workshop_settings.short_name` | dialog aktywacji → `service_providers.short_name` | ⚠️ NIE — a każdy z hostów czyta z innej tabeli, więc ten sam ekran pokaże dwie różne wartości |
| **e-mail** | S1/S2 → `service_providers.owner_email` | dialog aktywacji, „Moje usługi" → `service_providers.company_email` | ⚠️ NIE. Dialog aktywacji **czyta** `owner_email`, a **zapisuje** `company_email` — wpis znika przy następnym otwarciu |
| **stanowiska** | S1 → tabela `workshop_workstations` | S2 → `workshop_settings.work_stations` (jsonb) | ⚠️ NIE — dwa niezależne zestawy stanowisk, dwa ekrany, zero synchronizacji |
| **logo** | ta sama kolumna, ale trzy różne ścieżki w storage (`documents/workshop-logos`, `entity-logos`) | | kolumna wspólna, wygrywa ostatni zapis |

**Reszta pól jest bezpieczna:** nazwa firmy, NIP, adres, miasto, kod, telefon,
WWW, opis — S1 i S2 zapisują do **obu** tabel naraz (`SettingsPanel.tsx:220-260`,
`WorkshopSettingsPage.tsx:198-236`), więc zmiana w jednym miejscu jest widoczna
w drugim.

---

## 5. Martwy interfejs

| Kontrolka | Plik | Dlaczego martwa |
|---|---|---|
| „Typ konta" (firma/osoba) | `SettingsPanel.tsx:411` | ✅ brak kolumny i brak zapisu |
| Kasa fiskalna — auto-raporty | `FiscalPrinterSettings.tsx` | ⚠️ zero `.from(` — konfiguracja w `localStorage`, czyli **per przeglądarka, nie per konto** |
| „Co klient widzi na wycenie" (netto/VAT/brutto) | `WorkshopSettingsPage.tsx:186-188` | ⚠️ zapisywane, zero czytelników poza tym samym formularzem |
| Termin płatności, forma płatności, rabaty, brutto/netto | `WorkshopSettingsPage.tsx:185-191` | ⚠️ jak wyżej — generator faktur i wycen ich nie czyta |
| Numer konta bankowego | `workshop_settings.bank_account` | ⚠️ faktury biorą IBAN z `user_invoice_companies`, nie stąd — praktycznie write-only |
| `workshop_settings.currency` | DDL `20260407120736:33` | ⚠️ brak UI i brak czytelnika |
| „Kalendarz Google" | `SettingsPanel.tsx:704` | jawna zaślepka, `disabled` |
| Ustawienia kalendarza | `CalendarSettingsPage.tsx:105` | ⚠️ **nierozstrzygnięte z repo** — pisze po `provider_id` do kolumny `calendar_settings`, a edge `booking-available-slots:58` czyta po `user_id`. Żadnej z tych kolumn nie tworzy migracja w repo (znany rozjazd repo↔produkcja) |

Efekt uboczny propsów: `WorkshopSettingsStandalone` nie przekazuje
`websiteBuilderEnabled` ani `onPrimaryTabsSaved` (`:39`). ⚠️ Zapis „Menu główne"
z wersji warsztatowej odfiltruje `website` z listy i **usunie zakładkę Strona WWW**
komuś, kto ma ją włączoną.

---

## 6. Zakres: co jest czyje

| Klasa | Ustawienia |
|---|---|
| **PANEL** | Menu główne / kolejność modułów, typ konta (martwy), powiadomienia |
| **USŁUGODAWCA** | nazwa, NIP, adres, telefon, e-mail, WWW, logo, cover, opis, właściciel, konto bankowe, godziny pracy, kategoria i status wizytówki, pracownicy, kalendarz, stanowiska (`workshop_workstations` — kod jawnie wymienia Detailing i Myjkę, `SettingsPanel.tsx:526,590`) |
| **WARSZTAT** | kasa, kasa fiskalna, statusy zleceń, rodzaje zleceń, szablony zadań, listy kontrolne, numeracja dokumentów, integracje hurtowni, Rido Price, „pula zleceń" dla pracowników, stanowiska w wersji jsonb (duplikat) |
| **niejednoznaczne** | stawka roboczogodziny, brutto/netto, terminy płatności — z natury usługodawcze, ale nazewnictwo i konsument (`WorkshopOrderTasksTab.tsx:283`) są warsztatowe |

---

## 7. Bramkowanie po branży: NIE MA

⚠️ `settingsSubTabs` (`SettingsPanel.tsx:342-358`) ma `visible: true`
**zahardkodowane w każdym wierszu**. Żadnego warunku, żadnego
`useModuleVisibility` ani `useTabPermissions` — te hooki istnieją, ale panel
usługodawcy ich nie używa.

Jedyne bramkowanie to **płatność** (`ModuleLock` w module Warsztat). Zakładka
„Ustawienia" w panelu usługodawcy nie jest nią objęta w ogóle
(`ServiceProviderDashboard.tsx:1199`), więc **cały warsztatowy panel ustawień
jest dostępny każdemu usługodawcy** — detailing widzi „Kasę fiskalną",
„Statusy zleceń" i „Szablony zadań".

---

## 8. Co proponuję — do Twojej decyzji

Twój kierunek („jedno źródło prawdy, widać w obu miejscach") jest słuszny, ale
badanie pokazuje, że **samo pokazywanie nie wystarczy** — bo w trzech miejscach
dane naprawdę się rozjeżdżają. Kolejność:

**Najpierw trzy naprawy, niezależne od decyzji o układzie ekranów:**

1. **Godziny pracy** — jeden format. Jedyna rzecz z tej listy, która psuje
   rezerwacje klientowi końcowemu. Nie czeka na nic.
2. **`bank_account`** — dociągnąć w `WorkshopSettingsStandalone` albo przestać
   go zapisywać stamtąd. Dziś kasuje dane.
3. **`business_type`** — usunąć martwy przełącznik i warunek, który na nim
   wisi. Cztery pola przestaną znikać.

**Potem decyzja o układzie**, gdzie widzę dwie sensowne drogi:

- **Jeden ekran ustawień** w panelu usługodawcy, a z modułu Warsztat tylko
  odnośnik. Najmniej kodu, koniec problemu propsów.
- **Dwa ekrany o różnym zakresie**: w panelu dane firmy i konta, w module
  Warsztat wyłącznie warsztatowe (statusy, szablony, kasa fiskalna, numeracja).
  Więcej pracy, ale detailing przestaje oglądać rzeczy, których nie używa.

Drugą drogę można połączyć z bramkowaniem po module, o którym wspominałeś —
ale wtedy trzeba najpierw rozstrzygnąć, po czym poznajemy „warsztat":
`jest_klientem_linii(provider,'warsztat')` już to potrafi.

**Nie ruszam niczego, dopóki nie zdecydujesz.**
