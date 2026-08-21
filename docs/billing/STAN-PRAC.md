# Stan prac — płatności, kredyty, bezpieczeństwo zapisu

**Data spisania:** 19.08.2026, zaktualizowane 21.08.2026
**Gałąź robocza:** `wdrozenie` (worktree `/Users/moshechkov/rido-pay-lock`)
**Stan względem `origin/main`:** wszystko scalone poza jednym commitem (`c11710ba`,
poprawka kontroli w migracji podpisu najmu).

Dokument jest punktem powrotu między sesjami. Cztery grupy: co działa na produkcji,
co czeka na wdrożenie, co zostało w połowie, co świadomie odłożone.

> **Zasada nadrzędna, która obowiązuje w całej tej pracy:** wszystko, co dotyka
> pieniędzy, jest fail-closed — brak konfiguracji znaczy odmowa, nie domyślne
> przepuszczenie. Każdy webhook idempotentny. Żadnego „TODO" w miejscu weryfikacji.

---

## 1. WYKONANE I WDROŻONE

### 1.1 Migracje uruchomione na produkcji

| Migracja | Czego dotyczy |
|---|---|
| `20260818090000_vin_pula_warsztatu` | Sprawdzenia VIN rozliczane z puli warsztatu, nie z osobistych kredytów. Trzeci poziom (własne kredyty pracownika) za jawną zgodą — decyzja podejmowana w interfejsie, nie w `billing_consume`. |
| `20260819…` (limity VIN w planach) | VIN nie wchodzi w abonament: limit miesięczny 0 we **wszystkich** planach. Pakiet startowy 30 SMS + 5 sprawdzeń VIN. |
| `20260819100000_audyt_sms_balance_i_email` | Zamknięcie darmowych SMS-ów przez `sms_balance` (kolumna zapisywalna z przeglądarki, a czytana jako pierwsze źródło bramki). Normalizacja e-maila przy rejestracji. Kontrola kwoty w webhooku. |
| `20260819140000_zwroty` | Obsługa zwrotów i obciążeń zwrotnych — odebranie jednostek przy chargebacku. |
| `20260819170000_referral_uses_lockdown` | Zamknięcie najkrótszej drogi do wydawalnych pieniędzy: `referral_uses` pozwalał wpisać sobie 150 + 150 zł do `pln_balance`. |
| `20260819200000_program_polecen_wylaczony` | Program poleceń wyłączony **flagą**, nie usunięciem kodu — da się go włączyć z powrotem bez deployu. |
| `20260819230000_polityki_admin_public` | Zamknięcie dwudziestu polityk `FOR ALL USING(true)` na tabelach administracyjnych. |
| `20260820100000_tlumaczenia_i_ewidencja` | Cztery tabele tłumaczeń przestały być zapisywalne z przeglądarki (można było podmienić teksty w całym portalu). Ewidencja sprawdzeń VIN. |
| `20260821090000_paczki_niezaleznie_od_planu` | 🔴 Kupione paczki były **niewidoczne** dla warsztatu bez subskrypcji — `check_usage` wychodziła wcześniej i zerowała licznik. Kolejność została (pula planu → paczki → nadwyżka), ale brak pierwszego elementu już nie zeruje reszty. |
| `20260822090000_sms_fail_closed` | 🔴 SMS-y wychodziły **za darmo** przy odmowie zużycia: `deduct_sms_credit` robiła `RAISE WARNING`, a ostrzeżenie w PostgreSQL nie wraca do wywołującego jako błąd. Teraz odmowa to wyjątek. Wiersz księgi powstaje wyłącznie po potwierdzonym pobraniu. Dołożona `zwroc_sms_credit`. |
| `20260823090000_ksiega_rejestr_decyzji` | Księga SMS jako pełny rejestr: zakup też zapisuje wiersz, powody `zwrot`/`wygasniecie`/`wyrownanie`, jednorazowe wyrównanie wstecz z tabelą wycofania, kontrola `sms_saldo_kontrola`. |

**Kontrola po księdze (Twój wynik):** CART78GARAGE — księga 123, paczki 123;
CART sp. z o.o. — księga 197, paczki 197; `sms_saldo_kontrola` pusta. Zgodne co do sztuki.

### 1.2 Funkcje brzegowe wdrożone (SHA porównane z repozytorium)

| Funkcja | SHA-256 (skrót) | Czego dotyczy |
|---|---|---|
| `send-sms` | `6dc7887e…` | Pobranie jednostki **przed** wysyłką; odmowa → 402; zwrot przy odmowie operatora. |
| `workshop-send-sms` | `cc5c19bf…` | To samo dla wysyłek z warsztatu. |
| `rental-sign` | wdrożona (v1) | Podpis umowy najmu: porównanie **pełnego** tokenu, nieważny token blokuje podpis, IP i przeglądarka ustalane po stronie serwera, `.is('driver_signature_url', null)` w aktualizacji (podpis nie do nadpisania). |
| `billing-payu-webhook` | wdrożona | Idempotentna obsługa powiadomień PayU. |
| `vehicle-check` | wdrożona | Sprawdzenia VIN po nowym rozliczeniu trzypoziomowym. |
| `activate-workshop-trial`, `billing-checkout` | wdrożone | — |

### 1.3 Front

Ostatni wdrożony przebieg: **32132551107**, bundle `index-DJWsdd7v.js` zgodny z lokalnym.

Zawiera m.in.:
- **jedno źródło liczników** — `src/lib/dostepneJednostki.ts` + `src/hooks/useDostepneJednostki.ts`,
  jeden klucz pamięci podręcznej na jednostkę. Koniec trzech różnych sald tego samego konta
  (pasek pokazywał 28, modal 29) i koniec „kredyty pojawiają się dopiero po wylogowaniu";
- naprawa `useUserWallet` (zakładka Portfel w ogóle się nie renderowała — `ReferenceError`);
- ilości ułamkowe w karcie zlecenia (`1,5` i `1.5` traktowane tak samo);
- zgoda przy kosztorysie podpisywana **raz**, nie dwa razy;
- adres nabywcy na fakturze brany z kartoteki zamiast pustych pól;
- usunięta faktura nie blokuje już wystawienia nowej do tego samego zlecenia
  (blokowała, i zawyżała raport sprzedaży);
- daty w potwierdzeniu wykonania usługi ze zlecenia, nie „dzisiaj".

### 1.4 Poza produkcją, ale działające

- **`npm run typecheck` naprawdę sprawdza kod.** Był ślepy: korzeniowy `tsconfig.json`
  ma `"files": []` i `references`, więc `tsc --noEmit` sprawdzał **zero plików**.
  Udowodnione celowo wstawionym nieistniejącym identyfikatorem — zero trafień.
  Teraz sprawdza oba projekty i jest **twardą bramką w CI** (`.github/workflows/tests.yml`).
  Repozytorium na zerze błędów typów.
- **`scripts/sql-harness/sprawdz_kolumny.py`** — buduje schemat ze wszystkich migracji
  i wykrywa odwołania do nieistniejących kolumn. Powstał, bo trzy razy w jednej sesji
  założyłem nazwę kolumny zamiast ją odczytać.
- **`scripts/sql-harness/audyt_rls_pieniadze.sql`** — audyt prób zapisu przez RLS,
  z opisaną pułapką `SET LOCAL ROLE` poza transakcją i **wymaganą kontrolą pozytywną**.

---

## 2. GOTOWE, ALE NIEWDROŻONE

> **Stan na 21.08.2026:** wszystko z tej grupy poza migracją kont demonstracyjnych
> jest już na produkcji. `20260820140000` i `20260820180000` wykonane, `rental-portal-get`
> wdrożona 19.08, front scalony do `main` (PR #57) i wdrożony. Dziesięć funkcji
> brzegowych porównanych z `main` po przebudowie przez Lovable — wszystkie zgodne
> bajt w bajt. Pozycje niżej zostają jako zapis, co i dlaczego wchodziło w tej
> kolejności.

### 2.1 Migracja `20260820140000_podpis_najmu_i_widocznosc` — **następny krok**

**Co robi:** zdejmuje politykę `Public can sign contract via portal token`
(pozwalała każdemu z kluczem anonimowym oznaczyć **dowolną** umowę jako podpisaną,
własnym obrazkiem podpisu), zamyka zapis do dziennika podpisu, zawęża
`settlement_visibility_settings` do administratora.

**Stan:** poprawiona, niescalona (commit `c11710ba`).

**Dlaczego pierwsze uruchomienie padło:** nie z powodu polityki, tylko z powodu
**mojej własnej kontroli końcowej**. Pytała „czy istnieje polityka UPDATE dla `anon`" —
czyli pytała o **rolę**. W tej bazie prawie żadna polityka nie ma klauzuli `TO`, więc
wszystkie mają role `{public}`, łącznie z całkowicie bezpiecznymi (`Drivers can update
own rentals`, `Fleet can manage their rentals`, oba warunkowane po `auth.uid()`).
Kontrola wywalała się na nich i cofała całą transakcję — razem ze zdjęciem dziurawej
polityki. Dlatego po nieudanym przebiegu polityka nadal była widoczna: to skutek
wycofania, nie tego, że `DROP` szukał złej nazwy.

**Poprawka:** kontrola pyta teraz, czy warunek zapisu w ogóle odwołuje się do tożsamości
wołającego (`auth.uid()` albo `has_role`). Komunikat odmowy wypisuje nazwę polityki
i jej warunek. Sprawdzone na lokalnym PostgreSQL 16 z odwzorowaniem produkcyjnego
zestawu polityk: **trzy kolejne przebiegi zielone**, idempotentne, zdjęta dokładnie
jedna polityka, cztery bezpieczne nietknięte.

**Ograniczenie tej kontroli, świadome:** sprawdza, czy warunek o tożsamość **pyta**,
a nie czy pyta **dobrze**.

**Blokada:** brak — `rental-sign` jest wdrożona. Migracja wypisze zamierzone
`WARNING` o wciąż otwartym **odczycie** umów.

### 2.2 `rental-portal-get` + migracja `20260820180000_odczyt_umow_zamkniety`

**Co robi:** przenosi odczyt umowy najmu z przeglądarki do funkcji brzegowej, w dwóch
zakresach — `portal` (bez numeru PESEL) i `umowa` (pełny). Identyczna odmowa dla
„nie ma takiego zlecenia" i „zły token", żeby nie dało się zgadywać istnienia umów.

**Blokada:** funkcja **nie jest wdrożona** (potwierdzone: nie ma jej na liście funkcji
projektu). Migracja **musi** iść dopiero po deployu — inaczej zgaśnie ekran podpisu
wszystkim klientom.

**Kolejność:** deploy `rental-portal-get` + front → dopiero potem migracja.

**Zależy od tego:** zamknięcie ostatniej otwartej rzeczy z audytu najmu —
polityka `Public can read rentals with token` pozwala dziś **każdemu** odczytać
**każdą** umowę mającą token: dane najemcy z numerem PESEL, kwoty, pojazd.

### 2.3 `sms_wygas_paczki()`

Funkcja wygaszania paczek zbudowana i wdrożona w bazie, ale **bez `cron.schedule`** —
celowo, bo decyzja brzmiała: paczki zostają bezterminowe. Zadanie czeka gotowe na wypadek
zmiany zdania. Wszystkie 18 paczek jest dziś bezterminowych.

---

## 3. ZACZĘTE I NIEDOKOŃCZONE

### 3.1 Wariant A dla subskrypcji

**Decyzja podjęta**, budowa niezaczęta. Rzecz w tym, że **21 z 22 warsztatów nie ma
wiersza w `billing_subscriptions`** — trial zapisuje się gdzie indziej.

Do zrobienia, w tej kolejności:
1. `activate-workshop-trial` pisze wyłącznie do `billing_subscriptions`;
2. migracja uzupełniająca dla 21 warsztatów — ze stanem przed, kontrolą w transakcji
   i tabelą wycofania (wzór: `ksiega_wyrownanie_4_20`);
3. **wygasanie trialu** — dziś `moze_pracowac` i `useSubscriptionAccess` **ignorują**
   `current_period_end` dla statusu `trialing`, czyli trial nigdy się nie kończy;
4. `paid_service_subscriptions` staje się archiwum tylko do odczytu.

**Warunek postawiony wprost:** przed wdrożeniem pokazuję wynik sprawdzenia, czy bramkowanie
i `useSubscriptionAccess` nie zaczną liczyć trialu podwójnie.

**Czy da się zostawić na dłużej:** tak, ale **nie po starcie sprzedaży** — trial,
który nigdy nie wygasa, to darmowy dostęp bezterminowo.

### 3.2 Limity AI i zleceń

Zaplanowane, niezaczęte. Ten sam mechanizm co przy SMS-ach: `check_usage` przed,
`billing_consume` po, fail-closed, licznik w interfejsie, natychmiastowe zejście.

Kolejność: `ai_repair_help` i `ai_labor_pricing` → potem `workshop_orders`.
**`voice_minutes` zostaje nietknięte — zakaz obowiązuje.**

Komunikat odmowy ma prowadzić do rozwiązania, np.: *„Wykorzystałeś limit pytań AI
w tym miesiącu. Przejdź na plan Pro (300 pytań) albo dokup pakiet"* — z przyciskiem.

**Czy da się zostawić:** do startu sprzedaży tak. Po starcie to niepoliczony koszt
modeli AI na każdym koncie.

### 3.3 Wiarygodność podpisu umowy najmu

Kolejność ustalona przez Ciebie, punkt 1 gotowy:
1. ~~`rental-portal-get`~~ — kod gotowy, czeka na deploy (patrz 2.2);
2. **PDF ze skrótem SHA-256** w chwili podpisu — niezaczęte;
3. **kod SMS** jako potwierdzenie tożsamości — niezaczęte;
4. znacznik czasu trzeciej strony — dopiero gdy zobaczysz skalę.

**Czy da się zostawić:** punkty 2–4 tak. Dziś podpis jest technicznie poprawny
(pełny token, serwerowe IP i przeglądarka, brak nadpisania), ale w sporze sądowym
brakuje niezmienialnej postaci dokumentu.

### 3.4 Scenariusz testu dymnego na sandboxie

`docs/billing/test-dymny-sandbox.md` spisany, **nieprzeklikany**.
PayU sandbox `pos_id 300746`, produkcja `4436976`.
BLIK: `200201` sukces, `3932` brak środków, `3931` limit.

---

## 4. ZNANE, NIENAPRAWIONE

### 4.1 Odczyt umów najmu otwarty dla każdego — 🔴 PILNE

Polityka `Public can read rentals with token` sprawdza, czy umowa **ma** token,
a nie czy wołający go **zna**. Każdy z kluczem anonimowym (a klucz jest w bundlu)
odczyta wszystkie umowy: imię, nazwisko, **PESEL**, adres, kwoty, pojazd.

**Grozi:** wyciekiem danych osobowych najemców na skalę całej bazy.
**Pilność:** najwyższa z otwartych. Naprawa gotowa (2.2), brakuje deployu.

### 4.2 `viewing_slots` — polityka „by token", która tokenu nie sprawdza

```
CREATE POLICY "Anyone can view slots by token"   ON viewing_slots FOR SELECT USING (true);
CREATE POLICY "Anyone can update slots by token" ON viewing_slots FOR UPDATE USING (true);
```
Nazwa mówi o tokenie, warunek to `true`. Ta sama klasa błędu co przy najmie.

**Grozi:** odczytem i **zmianą** cudzych terminów oglądania nieruchomości.
**Pilność:** wysoka, ale niższa niż 4.1 — mniej wrażliwe dane, mniejszy moduł.

### 4.3 `anonymous_service_prices` — brak ograniczeń zapisu

```
CREATE POLICY "Anyone authenticated can insert anon prices" … WITH CHECK (true);
```
Każde zalogowane konto może dosypać dowolne wyceny do wspólnej bazy portalu,
z której liczy się podpowiedzi cen (`src/lib/pricingSuggestions.ts`).

**Grozi:** zatruciem podpowiedzi cenowych dla wszystkich warsztatów — bez włamania,
samym założeniem darmowego konta.
**Pilność:** średnia teraz, rosnąca z liczbą klientów. Decyzja: **po starcie**.

### 4.4 Siedem zadań `pg_cron` z tokenem jawnie w `cron.job.command`

Potwierdzone w migracjach: `20260419084520`, `20260426094344`, `20260426084309` (dwa),
`20260626_WYN6_dispatcher_cron`, `20260802_tire_reminders_dispatch`.
Wzorzec dobry jest tylko w jednym miejscu — `20260813_voice_recording_retention`
czyta token z `vault.decrypted_secrets`.

**Grozi:** token widoczny dla każdego, kto odczyta `cron.job`, i **zapisany w publicznym
repozytorium** razem z treścią migracji. Rotacja tokenu wywraca wszystkie zadania naraz.
**Pilność:** średnia–wysoka; wpisuje się w szerszy problem sekretów w repo
(patrz plan `sec/…` i notatki o rotacji).

### 4.5 `BuyCredits` czyta `user_credits` — piąte źródło salda

`src/hooks/useUserCredits.ts:37` i `src/hooks/usePayment.ts:84` czytają starą tabelę
`user_credits`, poza mechanizmem `dostepneJednostkiCechy`.

**Grozi:** powrotem dokładnie tej usterki, którą właśnie zamknęliśmy — dwa liczniki
pokazujące różne liczby dla tego samego konta.
**Pilność:** średnia. Dotyczy dziś zdjęć w giełdzie (`VehiclePhotoUpload`), nie SMS-ów.

### 4.6 `payment-core`: `sms_credits` opłacalne w 80% z portfela

Ścieżka pozwala pokryć zakup kredytów SMS w większości środkami z portfela,
z pominięciem nowej ewidencji.
**Grozi:** rozjazdem księgi z rzeczywistością (dokładnie to, co właśnie wyrównywaliśmy).
**Pilność:** średnia — do domknięcia razem z 4.5.

### 4.7 Jeden ekran ustawień usługodawcy zamiast trzech edytorów tych samych danych

Te same dane firmy edytuje się dziś w trzech miejscach.
**Grozi:** rozjazdem danych na dokumentach (faktura pokaże co innego niż karta klienta)
i pytaniami do wsparcia „gdzie to się zmienia".
**Pilność:** niska technicznie, **wysoka dla wrażenia z produktu** przed sprzedażą.

### 4.8 Bramkowanie ustawień po branży

Zakład detailingowy widzi ustawienia kasy fiskalnej, których nigdy nie użyje.
**Grozi:** wrażeniem produktu nie na miarę tej branży; ryzyko włączenia czegoś na oślep.
**Pilność:** niska technicznie, ta sama kategoria co 4.7.

### 4.9 Panel Asystenta głosowego — **wyłącznie czytanie i raport**

Zakaz zmian w `voice-agent-chat`, `voice-agent-llm`, `voice-agent-tools`, `voice-agent-init`,
`voice-call-commit`, `voice-call-postprocess`, `voice-call-reconcile`, `_shared/voice*`
oraz w konfiguracji ElevenLabs **obowiązuje**. Zaległe, wszystko jako opis:

1. raport z przeglądu ustawień panelu;
2. proponowana kolejność zakładek;
3. instrukcja uruchomienia — kody USSD są uniwersalne dla polskich sieci:
   `*61*NUMER*11*SEKUNDY#` (przekierowanie po nieodebraniu), `##61#` (kasowanie),
   `##002#` (kasowanie wszystkich); zwłoka **10/15/20 s, domyślnie 15**;
4. ukrycie sekcji ElevenLabs przed klientem — jako propozycja, nie zmiana.

**Grozi:** tym, że klient nie uruchomi funkcji, za którą płaci.
**Pilność:** przed sprzedażą modułu głosowego.

### 4.10 Uprawnienia tabelowe w całej bazie — DO ROZSTRZYGNIĘCIA

**530 z 561 tabel** daje rolom `anon` i `authenticated` pełne uprawnienia zapisu
(`INSERT`, `UPDATE`, `DELETE`). To domyślna konfiguracja platformy Supabase, nie
przeoczenie w konkretnej migracji — `GRANT SELECT` dopisany w migracji niczego nie
odbiera, a nowa tabela dostaje szerokie uprawnienia z automatu.

Skutek: **jedyną realną warstwą ochrony jest RLS.** Tabela bez polityki zapisu jest
zamknięta (RLS odmawia domyślnie), ale wystarczy, że ktoś dołoży politykę zbyt
szeroką, i uprawnienia nie stawiają żadnego oporu.

Wyszło przy `workshop_onboarding_usage` (licznik darmowego wprowadzenia): migracja
deklarowała `GRANT SELECT` dla `authenticated`, a produkcja pokazała pełen zestaw.

**Pytanie do rozstrzygnięcia:** czy odbieramy uprawnienia zapisu w całej bazie
i zostawiamy je tylko tam, gdzie są potrzebne — czy świadomie zostajemy przy RLS
jako jedynej warstwie.

Argument za domknięciem: dwie warstwy zamiast jednej; błąd w polityce przestaje
wystarczać do wycieku. Argument przeciw: 530 tabel to duża zmiana o szerokim
zasięgu, a każda nowa tabela wymagałaby pamiętania o `REVOKE` — czyli reguły,
o której się zapomina. Jeśli w tę stronę, to razem z kontrolą w CI.

**Czym grozi w międzyczasie:** niczym nowym — tak działa dziś cały projekt.
To decyzja o warstwie zapasowej, nie naprawa dziury.
**Pilność:** niska technicznie, ale **rozstrzygnąć przed wzrostem liczby tabel**.
Pojedynczych wyjątków nie robimy: jedna wyspa nie jest polityką, a następna
migracja i tak by ją cofnęła.

### 4.11 Ostrzeżenie o Lovable

Lovable nadpisuje funkcje brzegowe po scaleniu do `main`. **Po każdym deployu**
porównuj SHA-256 kodu z produkcji (`supabase functions download`) z zawartością `main`.
Numer wersji nie jest dowodem — zdarzało się, że rósł przy przywróconym starym kodzie.

---

## Zasady pracy, które obowiązują dalej

- Przed każdą zmianą: które pliki, czy któryś jest współdzielony z agentem głosowym.
  Jeśli tak — **zatrzymanie i pytanie**.
- Przed otwarciem PR do `main` — spis, co w nim jest.
- Migracje **podaję do wklejenia**, nie uruchamiam. Nie mam dostępu do produkcyjnej bazy.
- Nie zmieniam cen w `billing_plans`.
- Stripe = subskrypcje. PayU = jednorazówki. Bez `mode: 'payment'` w Stripe.
- Sekrety wyłącznie w panelu Supabase, nigdy w repozytorium.
- **Reguła trzech przebiegów:** weryfikacja trzy razy pod rząd; jedna czerwień —
  diagnoza, poprawka, licznik od zera. Bez udawania, że coś zostało sprawdzone.
- **Nie badamy, czy ktoś już wykorzystał lukę** — zamykamy.
- Budujemy tak, jakby jutro przyszło pięćdziesięciu płacących klientów, i zakładamy,
  że ktoś **będzie** szukał dróg do darmowych rzeczy.
- Moduł faktur jest gotowy i działa — **nie ruszamy go**.

## Kolejność następnych kroków

1. Migracja `20260820140000` (poprawiona) — do wykonania.
2. Deploy `rental-portal-get` + front → migracja `20260820180000`. **Zamyka 4.1.**
3. Wariant A z wygasaniem trialu (3.1).
4. Limity AI (3.2).
