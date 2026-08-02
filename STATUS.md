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
- **Lista paragonów**: domyślnie bieżący miesiąc (wybór miesiąca + „Wszystkie"), strony po 20/50/100,
  szukanie po numerze, kwocie, NIP-ie, nazwie klienta, numerze zlecenia, nazwach pozycji i formie płatności
- **Wydruk całych ewidencji** (zwroty i pomyłki osobno, całość albo zaznaczone wpisy) — dla księgowej i kontroli
- **Dokumenty do podpisu** drukowane od razu po wpisie i ponownie z listy ewidencji:
  - zwrot → *protokół zwrotu/reklamacji* z podpisami klienta i sprzedawcy
  - pomyłka → *dowód wewnętrzny* z opisem okoliczności, polem na dołączenie oryginału paragonu
    i podpisami kasjera oraz osoby upoważnionej (klient nie podpisuje — pomyłka jest po stronie sprzedawcy)
- **Bramka terminala płatniczego** — przy karcie i BLIK-u paragon drukuje się dopiero po potwierdzeniu
  płatności; odrzucona transakcja nie zostawia paragonu do korygowania, wystarczy zmienić formę płatności.
  Sterownik `manual` (potwierdzenie kasjera) działa z każdym terminalem; sterowniki `auto`
  (API agenta rozliczeniowego albo protokół ECR przez mostek) wpina się bez zmian w interfejsie
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
- e‑paragon (`fiscal_ereceipts`) — tylko interfejs
- terminal płatniczy — **przebieg gotowy** (bramka płatności przed wydrukiem, sterownik `manual`);
  brakuje sterownika `auto` dla konkretnego agenta rozliczeniowego. W Polsce nie ma jednego
  protokołu ECR, więc wybór sterownika zależy od tego, czyj terminal stoi w warsztacie:
  API chmurowe (SumUp, Viva, PayTel) wołamy wprost, protokół lokalny (Ingenico/PAX u Polcard,
  eService) poszedłby przez mostek, który i tak już siedzi w sieci warsztatu.

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
| 6 | **Faktura do paragonu** | **zrobione** — akcja „Faktura" przy paragonie, prefill pozycji i NIP-u, powiązanie `fiscal_receipt_id`, ostrzeżenie o art. 106b ust. 5 przy paragonie bez NIP-u; KSeF idzie tą samą ścieżką co każda faktura |
| 7 | **Ustawienia drukarki + znajdź w sieci + samonaprawa adresu** | **zrobione** — zostaje rezerwacja IP na routerze (po stronie klienta) |
| 8 | **Automatyczny raport dobowy** | **zrobione** — harmonogram na stanowisku (godzina do wyboru), zaległy raport wykonuje się przy otwarciu panelu, ostrzeżenie w Kasie fiskalnej |
| 9–10 | **Raporty + eksport RO + ewidencje** | **zrobione** poza jednym: raport fiskalny **miesięczny** drukuje się z menu drukarki, a system pilnuje terminu (do 25.) i trzyma ślad wykonania. Wykonanie z programu wymaga dokumentacji ELZAB-a — udokumentowana lista sekwencji zawiera tylko raport dobowy (Esc 25H), a sekwencji nie zgadujemy |
| 11 | **Nazwa fiskalna w Magazynie i usługach** | **zrobione** — pole „Nazwa na paragon fiskalny" w kartotece produktu i w usłudze, z podpowiedzią automatycznego skrótu |
| 12 | **Mostek jako usługa systemowa** | **zrobione** — skrypty dla macOS (launchd), Linuksa (systemd --user) i Windows (harmonogram zadań) + `scripts/elzab/service/README.md` |

## 4a. Zanim wdrożysz na produkcję

1. ~~Wykonaj migrację `20260802_fiscal_month_report.sql`~~ — wykonana 2.08 wraz z dwiema pozostałymi.
2. **Wyczyść dane testowe**: `scripts/sql/cleanup-fiscal-test-data.sql` (paragony szkoleniowe
   i powstałe z nich wpłaty). Skrypt najpierw pokazuje liczby, kasuje dopiero po `COMMIT`.
3. **Zainstaluj mostek jako usługę** na komputerze przy drukarce (`scripts/elzab/service/`).
4. **Zarezerwuj IP drukarki** na routerze — samonaprawa adresu działa, ale rezerwacja usuwa problem u źródła.
5. **Przełącz drukarkę w tryb fiskalny** dopiero po fiskalizacji urządzenia przez serwis
   (Ustawienia → Fiskalizacja → Tryb pracy). Do tego czasu wszystko jest niefiskalne.
6. **Włącz automatyczny raport dobowy** i ustaw godzinę po zamknięciu warsztatu.

### Dług i ryzyka
- **IP drukarki z DHCP** — bez rezerwacji na routerze moduł traci łączność po restarcie sieci
- **Tunel zamiast mostka** — uzgodnione „mostek teraz, tunel później"; chmura nadal nie sięga do LAN
- Faza 2 (e‑paragon) i Faza 3 (terminal płatniczy) — tylko interfejsy
- Automatyczne rozstrzyganie zawieszonych paragonów zwraca `RESOLVE_UNDECIDED` po zmianie doby fiskalnej —
  wymaga ręcznej decyzji operatora (świadoma decyzja: lepiej zapytać niż skłamać)

---

## 4b. Prace poza modułem fiskalnym (ta sama gałąź)

Branch urósł poza fiskalizację — w trakcie testów wyszły błędy w całym portalu i zostały
naprawione tutaj, bo blokowały pracę z kasą.

**Naprawione błędy**
- historia napraw pojazdu **pomijała zlecenia zakończone** (widok „aktywne" wycina je serwerowo);
  ten sam błąd był w statystykach i raportach dodatkowych
- kolejność pozycji w kosztorysie u klienta **różniła się** od kolejności w wycenie warsztatu
- „Podgląd / Drukuj / Pobierz" kosztorysu i protokołu **były atrapami** (pokazywały komunikat)
- wyszukiwarka zleceń nie znajdowała po numerze rejestracyjnym ani danych klienta
- kartoteka klientów nie znajdowała klienta po jego aucie
- pozycja wyceny bez ceny **nie zapisywała się** i znikała po odświeżeniu
- Enter w wycenie tworzył dodatkowy wiersz i przeskakiwał przez jeden
- „null" zamiast nazwiska w 38 miejscach portalu
- fioletowa ramka focusu wokół całych paneli (TabsContent z shadcn)
- kopia paragonu drukowała się **bez nazwy firmy i NIP-u**
- rejestr zwracał **zamaskowany VIN** („W0L**…8071") i trafiał do bazy
- duplikaty pojazdów: wyszukiwarka porównywała numer dosłownie, więc „wy996eu" nie znajdowało
  „WY 996EU" i użytkownik zakładał nowy rekord

**Dodane**
- kolumna „Płatność" przy zakończonych zleceniach (opłacone/częściowo/nieopłacone + edycja)
- stronicowanie: zlecenia, pojazdy, klienci, magazyn, przechowalnia
- raport kasowy z tożsamością (stan początkowy + wpływy − wydatki = stan końcowy), osobno
  gotówka i konto z rozbiciem na kartę, BLIK i przelew
- archiwum raportów miesięcznych + przypomnienie i automat zamknięcia miesiąca
- przechowalnia opon: wydanie kompletu, historia wydanych, pokwitowanie do podpisu
- logo firmy na dokumentach wystawianych przez system
- podział klientów na prywatnych i firmy

---

## 4c. Checklista przed scaleniem do `main`

| # | Krok | Stan |
|---|---|---|
| 1 | Migracja `20260802_fiscal_month_report.sql` | ✅ wykonana 2.08 |
| 2 | Migracja `20260802_cash_auto_close.sql` | ✅ wykonana 2.08 |
| 3 | Migracja `20260802_tire_reminder_channel.sql` | ✅ wykonana 2.08 |
| 4 | Skrypt `merge-duplicate-vehicles.sql` | ✅ 2.08 — scalono 35 grup, 37 rekordów, 1 zlecenie przepięte |
| 5 | Sprzątnięcie danych testowych fiskalizacji | ✅ wykonane (log pusty) |
| 6 | Scalenie do `main` | ✅ PR #11 i PR #12, deploy na getrido.pl |
| 7 | `npm run build` i `tsc --noEmit` | ✅ czyste |

Duplikaty: 3 numery (KWA57168, WU3111L, WY5257K) zostały **świadomie pominięte** — mają
dwóch różnych właścicieli, a to zwykle zmiana właściciela auta, nie duplikat. Scala je
człowiek, po sprawdzeniu VIN-u.

Migracje wykonane przez `supabase db query --linked -f <plik>`. To jedyna działająca droga:
`supabase db push` odmawia, bo historia migracji w bazie (Lovable nadaje własne, 14-cyfrowe
wersje) nie zgadza się z nazwami plików w repo — naprawa historii ruszyłaby setki starych
wpisów, więc jej nie robimy. Po DDL trzeba jeszcze `notify pgrst, 'reload schema'`, inaczej
API zwraca `PGRST204` mimo istniejącej kolumny.

---

## 4d. Etap domykający (2.08) — co zostało uruchomione

| Rzecz | Stan |
|---|---|
| Przypomnienia o odbiorze opon | ✅ działają: widok + funkcja `workshop-tire-reminders` + cron 8:00 UTC |
| Faktury: logo, podgląd stronicowany, dwa przełączniki uwag | ✅ wdrożone (gałąź `fix/faktura-logo-podglad`) |
| KSeF: procedura marży w XML FA(3) | ✅ wdrożone (gałąź `fix/ksef-pobieranie`) |
| Duplikaty pojazdów | ✅ scalone |

**Przypomnienia o oponach — jak to działa.** Funkcja nie wysyła SMS-a sama: wkłada go do
istniejącej kolejki `workshop_sms_log`, którą co minutę opróżnia `workshop-send-scheduled-sms`.
Dzięki temu dziedziczy ustawienia bramki SMS warsztatu, obsługę błędów i ochronę przed
podwójną wysyłką. Mail idzie bezpośrednio Resendem.

Okno wysyłki: **od 7 dni przed terminem do 30 dni po**. Górna granica jest celowa — bez niej
pierwsze uruchomienie rozesłałoby przypomnienia o kompletach sprzed kilku sezonów. Zaległości
starsze niż miesiąc to temat na telefon, nie na automat.

Tryb `dryRun` (`{"dryRun": true}` w ciele wywołania) pokazuje, komu poszłoby przypomnienie,
bez wysyłania czegokolwiek — używać przed każdą zmianą reguł.

**Konflikt KSeF rozwiązany na korzyść `main`:** gałąź `fix/ksef-pobieranie` była starsza i
miała prymitywne mapowanie stawek; `main` ma pełne rubryki P_13/P_14 i korekty różnicowe.
Przeszczepiona została wyłącznie logika marży, reszta została z `main`.

---

## 5. Zasady pracy w tym module

- push **wyłącznie** na `feature/fiskalizacja-elzab`, nigdy na `main`, i tylko po akceptacji
- migracje pokazywane do akceptacji **przed** wykonaniem
- `src/integrations/supabase/types.ts` generowany z Supabase, nigdy ręcznie
- drukarka zostaje w **trybie szkoleniowym** do odrębnej decyzji
- nieudokumentowanych sekwencji ESC nie zgadujemy — na tej drukarce jedna zła sekwencja ją zawiesza
- moduł jest **branżowo neutralny**: żadnych kluczy obcych do `workshop_*`, powiązanie tylko przez
  `document_type` + `document_id`
