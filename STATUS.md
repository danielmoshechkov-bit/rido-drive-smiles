# Moduł fiskalny (ELZAB Zeta Online) — stan prac

Gałąź: `feature/fiskalizacja-elzab`. Stan na 01.08.2026.
Ten plik jest punktem powrotu po resecie sesji — trzyma się w nim: co działa, czego brakuje i jak to uruchomić.

---

## 1. Jak to uruchomić (środowisko testowe)

| Element | Wartość |
|---|---|
| Drukarka | ELZAB Zeta Online, TCP `192.168.0.114:9100` (IP z DHCP — **potrzebna rezerwacja na routerze**, zmieniało się 3×) |
| Tryb drukarki | **szkoleniowy** — wszystkie wydruki są niefiskalne; do fiskalizacji nie przechodzimy bez decyzji |
| Mostek lokalny | `npm run fiscal:bridge` → `http://127.0.0.1:9110` (chmura nie widzi LAN, przeglądarka nie otworzy surowego TCP) |
| Kod firmy testowej | Warsztat Testowy, użytkownik `warsztat@test.pl` |
| Panel | Warsztat & Auto → **Kasa** → zakładka **Kasa fiskalna** |

**Po każdej zmianie w `supabase/functions/_shared/elzab/*` trzeba zrestartować mostek** — Node cachuje moduły
i inaczej drukuje starym kodem (to była przyczyna różnicy między paragonem 25 i 26).

---

## 2. Zrobione

### Faza 0 — protokół ElzabESC (biblioteka współdzielona)
`supabase/functions/_shared/elzab/` — używana i przez edge functions (Deno), i przez skrypty testowe (Node).

- `codepages.ts` — CP1250 (domyślna), Latin‑2, CP852, Mazovia; każdy znak zawsze daje ≥1 bajt (transliteracja → `?`)
- `codec.ts` — kwoty w groszach (bez błędów float), ilości, pola stałej długości, przycinanie nazw do granicy słowa
- `commands.ts` — pozycja sprzedaży, zakończenie pozycji, płatność, NIP nabywcy, otwarcie/zamknięcie/anulowanie
  paragonu, raport dobowy, status, zegar, numer ostatniego paragonu
- `client.ts` — ACK/NAK, obsługa sekwencji bez ACK (`sendSilent` + weryfikacja `Esc 50H`), NIP (`Esc 4BH` zwraca `0x00`, nie ACK)
- `receipt.ts` — walidacja **przed** wysłaniem na drukarkę (min. 5 znaczących znaków nazwy, ilość > 0, wartość > 0,
  suma płatności = suma paragonu)
- `README.md` — ustalenia z realnego sprzętu (tabele bajtów, limity układu, pułapki)

Skrypty sprzętowe: `scripts/elzab/01-healthcheck` … `13-probe-nip` + `bridge.ts`
(`03-edge-cases` = 23 asercje: 0 zł, krótka nazwa, polskie znaki, rozjazd sumy).

**Ustalenia, których nie wolno zgubić:**
- pozycja sprzedaży **nie potwierdza ACK-iem** — trzeba weryfikować statusem, inaczej wisi do timeoutu
- rozjazd sumy drukarka zgłasza dopiero przy zamknięciu paragonu (NAK) → mapowane na `RECEIPT_CANCELLED`
- `Esc 04H` **zawiesza drukarkę** (czeka na dane) — to nie jest linia opisu
- `Esc 66H` (licznik paragonów) **zeruje się z każdą dobą fiskalną** — automatyczne rozstrzyganie „czy się
  wydrukował" musi to wykrywać i zwracać `RESOLVE_UNDECIDED`

### Faza 1 — backend
Edge functions: `fiscalize-receipt`, `fiscal-printer-test`, `fiscal-day-report`,
`fiscal-receipt-session` (akcje: `reserve` / `finalize` / `resolve` / `register-correction`),
wspólne `_shared/fiscal-access.ts`, `_shared/fiscal-providers.ts`.
Każda funkcja uwierzytelnia się sama (`verify_jwt = false` w `config.toml`).

Migracje (wszystkie wykonane na bazie):

| Plik | Co wnosi |
|---|---|
| `20260730_fiscal_core.sql` | `fiscal_printers`, `fiscal_receipts`, helpery RLS |
| `20260730_fiscal_ereceipt_payments.sql` | `fiscal_ereceipts`, `fiscal_payment_intents` (interfejsy Faz 2/3) |
| `20260730_fiscal_no_double_receipt.sql` | `printer_number_before` + indeks blokujący podwójny paragon |
| `20260731_fiscal_name_catalog.sql` | `fiscal_name` w `inventory_products` i `provider_services` |
| `20260731_fiscal_returns.sql` | ewidencja zwrotów **B1** + trigger pilnujący kwot |
| `20260801_fiscal_returns_legal.sql` | 7 kolumn wymaganych przez § 3 ust. 3 rozporządzenia |
| `20260801_fiscal_corrections.sql` | **osobna** ewidencja pomyłek **B2** + `superseded_by_correction_id` |
| `20260801_fiscal_invoice_link.sql` | `user_invoices.fiscal_receipt_id` |
| `20260801_fiscal_cash_link.sql` | `workshop_payments.fiscal_receipt_id`, `workshop_expenses.fiscal_return_id` + indeksy antydublujące |

Zgodność prawna (rozp. MF z 25.06.2025, Dz.U. 2025 poz. 845): **dwie odrębne ewidencje** —
zwroty/reklamacje (B1) i oczywiste pomyłki kasjera (B2). Prawo zabrania ich łączenia, więc mają osobne
tabele, osobne numeracje i osobne dowody wewnętrzne.

### Interfejs
- **Kasa fiskalna** (5 zakładek): Paragony · Faktury · Zwroty · Korekty pomyłek · Raporty
- **Szybki paragon** — sprzedaż od ręki bez zlecenia; edytor pozycji jak w wycenie/fakturze:
  wiersze inline, kolejny pusty wiersz dokleja się sam, cena **netto albo brutto** (przeliczają się
  nawzajem), rabat per pozycja (% albo zł) i rabat na cały paragon, komunikat walidacji przy wierszu
  (zamiast cichego pomijania pozycji)
- **Drukuj paragon** ze zlecenia + znaczniki dokumentów na liście zleceń
- **Zwrot / reklamacja** (B1) i **Korekta pomyłki** (B2) — po korekcie system pozwala wystawić nowy,
  prawidłowy paragon do tego samego zlecenia
- **Nabywca**: osoba prywatna / firma z NIP-em (walidacja sumy kontrolnej, próg faktury uproszczonej 450 zł)
- **Powiązanie z kasą** (potwierdzane checkboxem, nie automatyczne):
  paragon → wpłata, zwrot → wypłata, pomyłka → **storno** błędnej wpłaty
- **Ustawienia drukarki**: Warsztat & Auto → Ustawienia → Fiskalizacja, w tym:
  - **„Znajdź drukarkę w sieci"** — mostek skanuje sieć lokalną (port 9100) i potwierdza kandydata
    odczytem zegara ElzabESC, więc zwykła drukarka sieciowa nie zostanie wzięta za fiskalną
  - **samonaprawa adresu** — gdy drukarka nie odpowiada (`CONNECTION`/`TIMEOUT`), system szuka jej sam
    i poprawia IP, o ile w sieci jest dokładnie jedna drukarka; przy dwóch pyta, bo zgadywanie
    oznaczałoby drukowanie na cudzym urządzeniu
  - checklista „co musi być ustawione w samej drukarce" i instrukcja pierwszego uruchomienia
- **Raporty**: raport dobowy z panelu, podsumowanie okresu i eksport **RO** do JPK_V7
- Skracanie nazw fiskalnych (`fiscalName.ts`) + pole `fiscal_name` w katalogu

### Faza 2/3
Tylko interfejsy i TODO — `fiscal_ereceipts`, `fiscal_payment_intents` (e‑paragon, terminal płatniczy).

---

## 3. Testy wykonane na sprzęcie

- healthcheck / zegar / status — OK
- pełny paragon, 23 przypadki brzegowe — OK
- paragon z 8–10 pozycjami (układ, przycinanie nazw) — OK
- polskie znaki — OK po ustawieniu CP1250 w menu drukarki
- **paragon → kasa (01.08.2026):** szybki paragon „Wycieraczki przod", netto 100 → brutto 123,00 zł,
  Gotówka + zaznaczona wpłata. Wynik: wydruk nr **9** (szkoleniowy), w Kasie gotówka **23 401,00 → 27 227,30 zł**,
  w Operacjach pozycja „Wpłata +123,00", w logu paragon nr 9 ze statusem *Wydrukowany*
- podwójne ujęcie obrotu: druga wpłata do tego samego paragonu → `23505` (indeks unikalny), po storno
  ponowna wpłata przechodzi
- posprzątane realne duplikaty (zlecenie `82952a85`: paragony 16/17/19/20 → zostaje 16, reszta `DUPLICATE_LEGACY`)
- **jeden paragon na zlecenie (01.08):** zlecenie z paragonem ma pozycję „Paragon fiskalny" wyszarzoną
  z wyjaśnieniem „To zlecenie ma już wystawiony paragon fiskalny"; w bazie pilnuje tego indeks unikalny
- **paragon ze zlecenia (01.08):** ZL-07/2026-037 → paragon nr 10 (300,00 zł, gotówka, wpłata do kasy),
  ZL-07/2026-042 → paragon nr 11 (13 224,00 zł, 14 pozycji, bez wpłaty — odznaczony checkbox)
- **skan sieci (01.08):** pełny skan /24 = 7,7 s (254 adresy), ścieżka ze znanym adresem = 0,8 s
- **samonaprawa adresu (01.08):** ustawiono błędne 192.168.0.199 → test połączenia sam znalazł
  192.168.0.114, zapisał w ustawieniach i połączył się; komunikat opisał zmianę wprost

---

## 4. Zostało (kroki 6–12)

| # | Zadanie | Stan |
|---|---|---|
| 6 | **Faktura do paragonu** — wystawienie faktury z paragonu (wraz z KSeF) i pilnowanie, żeby sprzedaż nie policzyła się dwa razy | zrobione tylko *pokazywanie* powiązania w zakładce Faktury; brak akcji „wystaw fakturę do paragonu" |
| 7 | **Ustawienia drukarki** + „znajdź drukarkę w sieci" + samonaprawa adresu | **zrobione 01.08** — zostaje tylko rezerwacja IP na routerze (czynność po stronie klienta) |
| 8 | **Automatyczne raporty dobowe/miesięczne** — backend ma już `skipIfDoneToday`; brak harmonogramu i przypomnienia przed 48 h blokady | do zrobienia |
| 9–10 | **Raporty + eksport RO** — podstawa działa (raport dobowy, podsumowanie okresu, eksport RO) | do dokończenia: raport miesięczny, zestawienie obu ewidencji na wydruku |
| 11 | **Skracanie nazw + pole nazwy fiskalnej w Magazynie** — biblioteka i kolumny w bazie są; brak pola w UI Magazynu i w usługach | do zrobienia |
| 12 | **Mostek jako usługa systemowa** — dziś odpalany ręcznie `npm run fiscal:bridge`; potrzebny autostart (launchd/systemd/usługa Windows) + token | do zrobienia |

### Dług i ryzyka
- **IP drukarki z DHCP** — bez rezerwacji na routerze moduł traci łączność po restarcie sieci
- **Tunel zamiast mostka** — uzgodnione „mostek teraz, tunel później"; chmura nadal nie sięga do LAN
- Faza 2 (e‑paragon) i Faza 3 (terminal płatniczy) — tylko interfejsy
- Automatyczne rozstrzyganie zawieszonych paragonów zwraca `RESOLVE_UNDECIDED` po zmianie doby fiskalnej —
  wymaga ręcznej decyzji operatora (świadoma decyzja: lepiej zapytać niż skłamać)

---

## 5. Zasady pracy w tym module

- push **wyłącznie** na `feature/fiskalizacja-elzab`, nigdy na `main`, i tylko po akceptacji
- migracje pokazywane do akceptacji **przed** wykonaniem
- `src/integrations/supabase/types.ts` generowany z Supabase, nigdy ręcznie
- drukarka zostaje w **trybie szkoleniowym** do odrębnej decyzji
- nieudokumentowanych sekwencji ESC nie zgadujemy — na tej drukarce jedna zła sekwencja ją zawiesza
- moduł jest **branżowo neutralny**: żadnych kluczy obcych do `workshop_*`, powiązanie tylko przez
  `document_type` + `document_id`
