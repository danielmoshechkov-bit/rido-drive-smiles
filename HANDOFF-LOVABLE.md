# Moduł fiskalny GetRido — przekazanie do Lovable

**Gałąź:** `feature/fiskalizacja-elzab` (nie scalona z `main`)
**Stan:** 01.08.2026 · gotowe do wdrożenia po trzech krokach z sekcji 6
**Sprzęt:** ELZAB Zeta Online, protokół ElzabESC po TCP, bez pośredników i bez płatnych integracji

---

## 1. Co powstało

Kompletny moduł kasy fiskalnej dla wielu firm naraz (multi-tenant), sterujący drukarką
fiskalną bezpośrednio protokołem producenta.

**Sprzedaż**
- paragon ze zlecenia warsztatowego oraz **szybki paragon** (sprzedaż od ręki, bez zlecenia)
- edytor pozycji jak w fakturze: cena netto albo brutto (przeliczają się nawzajem),
  rabat procentowy lub kwotowy per pozycja, kolejny pusty wiersz dokleja się sam
- nabywca prywatny albo firma z NIP-em (walidacja sumy kontrolnej, próg faktury uproszczonej 450 zł)
- **jeden paragon na dokument** — pilnowane indeksem unikalnym w bazie, nie tylko w interfejsie
- **bramka terminala płatniczego**: przy karcie i BLIK-u paragon drukuje się dopiero po
  potwierdzeniu płatności

**Dokumenty i zgodność**
- dwie **odrębne** ewidencje wymagane rozporządzeniem: zwroty/reklamacje oraz oczywiste pomyłki
  (prawo zabrania prowadzenia ich razem)
- protokół zwrotu do podpisu klienta i sprzedawcy, dowód wewnętrzny do pomyłek
- wydruk całych ewidencji dla księgowej i kontroli
- faktura do paragonu z powiązaniem `fiscal_receipt_id` (bez niego obrót policzyłby się dwa razy)
- raport dobowy (ręczny i automatyczny), podsumowanie okresu, **eksport RO do JPK_V7**

**Infrastruktura**
- mostek lokalny (`scripts/elzab/bridge.ts`) — chmura nie widzi sieci warsztatu, przeglądarka nie
  otworzy surowego TCP; mostek zamyka tę lukę i instaluje się jako usługa systemowa
- **wyszukiwanie drukarki w sieci** i **samonaprawa adresu IP** po zmianie z DHCP

---

## 2. Architektura — czego nie psuć

| Zasada | Dlaczego |
|---|---|
| Moduł jest **branżowo neutralny** — zero kluczy obcych do `workshop_*` | powiązanie tylko przez `document_type` + `document_id`, żeby ten sam moduł obsłużył kolejne branże |
| `fiscal_receipts` to **log niemodyfikowalny** (RLS: tylko SELECT i INSERT) | paragon trafia do pamięci fiskalnej drukarki; edycja wpisu rozjechałaby bazę z raportami dobowymi |
| Zwroty i pomyłki w **osobnych tabelach** | wymóg rozporządzenia, nie preferencja |
| Biblioteka `supabase/functions/_shared/elzab/` działa w **Deno i w Node** | ten sam kod drukuje z edge function i z mostka — rozjazd protokołu byłby niewykrywalny |
| **Nie zgadujemy sekwencji ESC** | `Esc 04H` zawiesił drukarkę podczas testów; nieudokumentowana sekwencja to zablokowane urządzenie u klienta |
| Mostek po zmianie w `_shared/elzab/` **wymaga restartu** | Node cachuje moduły i drukowałby starym kodem |

**Ustalenia ze sprzętu, których nie da się odtworzyć z dokumentacji:**
- pozycja sprzedaży **nie potwierdza ACK-iem** — trzeba weryfikować statusem (`Esc 50H`)
- rozjazd sumy drukarka zgłasza dopiero przy zamknięciu paragonu
- `Esc 4BH` (NIP) zwraca `0x00`, nie ACK — obsługa jak ACK wieszała każdy paragon z NIP-em
- `Esc 66H` (licznik paragonów) **zeruje się z każdą dobą fiskalną**

---

## 3. Nowe tabele i kolumny

| Migracja | Zawartość |
|---|---|
| `20260730_fiscal_core.sql` | `fiscal_printers`, `fiscal_receipts`, funkcje RLS |
| `20260730_fiscal_ereceipt_payments.sql` | `fiscal_ereceipts`, `fiscal_payment_intents` (Faza 2/3) |
| `20260730_fiscal_no_double_receipt.sql` | indeks blokujący podwójną fiskalizację |
| `20260731_fiscal_name_catalog.sql` | `fiscal_name` w `inventory_products` i `provider_services` |
| `20260731_fiscal_returns.sql` + `20260801_fiscal_returns_legal.sql` | ewidencja zwrotów z kompletem pól z § 3 ust. 3 |
| `20260801_fiscal_corrections.sql` | odrębna ewidencja pomyłek |
| `20260801_fiscal_invoice_link.sql` | `user_invoices.fiscal_receipt_id` |
| `20260801_fiscal_cash_link.sql` | powiązanie z kasą + indeksy antydublujące |
| `20260802_fiscal_month_report.sql` | **jedyna niewykonana** — ślad raportu miesięcznego |

---

## 4. Zmiany poza modułem fiskalnym

Trzy naprawy w istniejących ekranach, wynikłe z testów:

1. **Wyszukiwarka zleceń** pytała bazę tylko o numer i opis, więc numer rejestracyjny i dane
   klienta (osobne tabele) nigdy się nie znajdowały. Teraz fraza jest tłumaczona na pojazdy
   i klientów, z pominięciem spacji i myślników („WY 996EU" = „wy996eu").
2. **Pasek podzakładek** (`UniversalSubTabBar`, wspólny dla całej aplikacji) gubił początek listy:
   `justify-center` na przewijanym kontenerze obcina overflow po obu stronach. Wyśrodkowanie robi
   teraz wewnętrzny `w-max`, a aktywna zakładka sama wjeżdża w pole widzenia.
3. **Wycena zlecenia** — pozycja wpisana bez Entera żyła tylko w przeglądarce i znikała przy
   odświeżeniu listy. Teraz kompletny wiersz zapisuje się sam, a pusty dokleja się automatycznie.

---

## 5. Czego celowo NIE zrobiono

| Rzecz | Powód |
|---|---|
| Automatyczna wysyłka kwoty na terminal | w Polsce nie ma jednego protokołu ECR — sterownik zależy od agenta rozliczeniowego. Przebieg i warstwa sterowników są gotowe, brakuje jednej implementacji |
| Wykonanie raportu **miesięcznego** z programu | udokumentowana lista sekwencji ElzabESC zawiera tylko raport dobowy. System pilnuje terminu i trzyma ślad; sam raport wychodzi z menu drukarki |
| E-paragon | tylko interfejs; nie jest obowiązkowy |
| Scalenie do `main` | świadoma decyzja właściciela projektu |

---

## 6. Zanim to pójdzie na produkcję

1. Wykonać migrację `20260802_fiscal_month_report.sql`.
2. Uruchomić `scripts/sql/cleanup-fiscal-test-data.sql` — kasuje paragony szkoleniowe i powstałe
   z nich wpłaty. Skrypt pokazuje liczby przed skasowaniem i kończy się `COMMIT`.
3. Zainstalować mostek jako usługę na komputerze przy drukarce (`scripts/elzab/service/`).
4. Zarezerwować adres IP drukarki na routerze.
5. Przełączyć drukarkę w tryb fiskalny — **dopiero po fiskalizacji urządzenia przez serwis**.
   Do tego czasu wszystkie wydruki są niefiskalne i tak ma zostać.
6. Włączyć automatyczny raport dobowy z godziną po zamknięciu warsztatu.

---

## 7. Gdzie szukać szczegółów

- `STATUS.md` — pełny stan modułu, testy wykonane na sprzęcie, lista pozostałych zadań
- `supabase/functions/_shared/elzab/README.md` — ustalenia protokołu, tabele bajtów, pułapki
- `scripts/elzab/service/README.md` — instalacja mostka jako usługi
