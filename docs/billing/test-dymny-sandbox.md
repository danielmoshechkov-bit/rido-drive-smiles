# Test dymny ścieżki płatniczej — sandbox PayU

Stan na 16.08.2026, po audycie. Opisuje zachowanie **po** poprawkach, nie przed.

## Zanim zaczniesz

Wykonaj wszystko z tej listy, inaczej połowa kroków da wynik, którego nie da
się zinterpretować:

- [ ] migracja `20260819100000_audyt_sms_balance_i_email.sql` (poprawiona, z DROP)
- [ ] migracja `20260819200000_program_polecen_wylaczony.sql`
- [ ] deploy `billing-payu-webhook` (rozgałęzienie zwrotu)
- [ ] deploy frontu (ukrycie programu poleceń)
- [ ] `billing_gateways`: `payu` ma `is_enabled = true`, `is_sandbox = true`
- [ ] sekrety `PAYU_CLIENT_ID`, `PAYU_CLIENT_SECRET`, `PAYU_POS_ID`, `PAYU_SECOND_KEY`

**Testuj na osobnym koncie**, nie na głównym. Kilka kroków celowo zużywa
jednostki do zera.

Karty testowe BLIK: **200201** = sukces, **3932** = brak środków,
**3931** = przekroczony limit.

---

## 1. Nowe konto → pakiet startowy

1. Wyloguj się. Zarejestruj konto warsztatowe na świeży adres.
2. Wejdź w panel usługodawcy.

**Czego oczekiwać:** górny pasek pokazuje **30** przy ikonie wiadomości
i **5** przy ikonie auta.

> ⚠️ To jest zmiana z dziś. Wcześniej pakiet szedł do `sms_balance`, którą
> migracja 4.10 uczyniła martwą — konto dostawało pakiet, którego nie widziało.
> Jeśli zobaczysz zera, migracja `20260819100000` nie została wykonana.

**Sprawdź też normalizację adresu.** Zarejestruj drugie konto na
`ten.sam+cokolwiek@gmail.com` (ten sam adres z dopiskiem po `+`).
Konto ma powstać, ale **pakietu startowego już nie dostać** — paski pokazują 0.
To samo dla wariantu z kropkami i dla `@googlemail.com`.

---

## 2. Zużycie do zera

1. Wyślij SMS-y z karty zlecenia, aż licznik dojdzie do zera (30 sztuk).
2. Sprawdź pojazd po VIN pięć razy — po piątym pula ma być pusta.

**Czego oczekiwać:** liczniki na pasku maleją po każdej operacji.

---

## 3. Próba przy zerze

1. Spróbuj wysłać kolejny SMS.

**Oczekiwane:** komunikat „Brak pakietu SMS. Doładuj pakiet, aby kontynuować"
i okno doładowania.

2. Spróbuj sprawdzić kolejny pojazd.

**Oczekiwane, jeśli jesteś właścicielem:** „Brak sprawdzeń. Doładuj pakiet."

**Oczekiwane, jeśli testujesz na koncie PRACOWNIKA warsztatu** (osobny
scenariusz, wart sprawdzenia): okno **„Pula warsztatu wyczerpana. Użyć Twojego
kredytu? Zostanie Ci N"** z trzema wyjściami — „Użyj mojego kredytu",
„Poproś właściciela o doładowanie", „Nie teraz". Pracownik bez własnych
kredytów dostaje od razu „Poproś właściciela o doładowanie".

---

## 4. Zakup 100 SMS

1. W oknie doładowania ustaw suwak na 100 SMS. Cena ma wyjść **24,60 zł brutto**
   (100 × 0,20 zł netto + 23% VAT).
2. Zapłać BLIK-iem **200201**.

**Czego oczekiwać po powrocie:**
- pasek pokazuje 100 (może wymagać odświeżenia — patrz „Znane braki"),
- w `billing_orders` zamówienie ma `status = 'oplacone'` i wypełnione `wydane_at`,
- w `billing_addon_packs` jest paczka na 100 z `source = 'purchase'`,
- **`odzwierciedlone_at` jest PUSTE** — to jest kontrola, że poprawka podwójnego
  zapisu weszła. Wypełniony znacznik przy nowym zakupie oznacza, że migracja
  4.12 nie została wykonana.

---

## 5. Zakup 10 sprawdzeń VIN

Suwak na 10, cena **20,91 zł brutto** (10 × 1,70 zł + VAT), BLIK 200201.
Kontrola jak wyżej.

---

## 6. Zużycie z paczek — kolejność

Ten krok ma sens tylko przy **dwóch** paczkach o różnych terminach ważności.
Jeśli masz jedną, pomiń.

Kup drugą paczkę, potem zużyj jedną jednostkę i sprawdź w bazie, z której
paczki zeszła.

**Oczekiwane:** ubywa z paczki, która wygasa **najwcześniej**. Sprawdzone
lokalnie; tu potwierdzasz na prawdziwych danych.

---

## 7. Płatność odrzucona

1. Rozpocznij zakup 100 SMS. Zapłać BLIK-iem **3932** (brak środków).

**Oczekiwane:**
- paczka **nie powstaje**,
- saldo bez zmian,
- zamówienie zostaje w `oczekuje` albo przechodzi w `odrzucone`.

> **Znany brak:** po powrocie z bramki klient **nie zobaczy żadnego
> komunikatu**. Adres powrotu niesie `?platnosc=payu`, ale nic tego parametru
> nie czyta. To jest na liście braków, nienaprawione.

---

## 8. Płatność porzucona

1. Rozpocznij zakup, otwórz stronę płatności i **zamknij kartę** bez płacenia.
2. Sprawdź `billing_orders` — zamówienie stoi w `oczekuje`.
3. Odczekaj ponad 6 godzin (albo wywołaj ręcznie
   `SELECT billing_wygas_porzucone(6);`).

**Oczekiwane:** status zmienia się na `porzucone`. Zamówienie **nie blokuje**
kolejnej próby zakupu.

---

## 9. Powtórzone powiadomienie

Nie da się tego wywołać z interfejsu — potrzebne narzędzie do wysłania żądania
z poprawnym podpisem. Jeśli PayU ma w panelu przycisk „wyślij ponownie
powiadomienie", użyj go dla zamówienia z kroku 4.

**Oczekiwane:** **jedna** paczka, nie dwie. W `billing_events` drugie zdarzenie
albo nie powstaje (unikalny indeks), albo wraca z `duplikat: true`.

---

## 10. Wygasły abonament a doładowania

1. W bazie przestaw subskrypcję warsztatu na wygasłą.
2. Wejdź w panel — gating ma zablokować pracę (zakładanie zleceń, wysyłkę).
3. **Spróbuj kupić SMS-y.**

**Oczekiwane: zakup DZIAŁA.** `billing-payu-order` nie woła bramki
abonamentowej — sprawdza tożsamość, konfigurację i produkt. Warsztat bez
opłaconego abonamentu może kupić pakiet.

To jest zamierzone: blokada odcinałaby przychód od kogoś, kto właśnie chce
zapłacić.

---

## 11. Zwrot (nowe)

Zwrot robisz **Ty** w panelu PayU — klient nie ma jak go zażądać.

1. Dla zamówienia z kroku 4 (100 SMS) **zużyj 40 sztuk**.
2. W panelu PayU zrób **pełny zwrot** 24,60 zł.

**Oczekiwane:**
- z paczki znika pozostałe **60**, klient zatrzymuje 40 wysłanych,
- w `billing_zwroty` wiersz z `zdjete = 60`, `nierozliczone = 40`,
  `status = 'rozliczony'`,
- **`billing_orders.status` NADAL `oplacone`** — to jest najważniejsza
  kontrola tego kroku. Zmiana na `oczekuje` oznacza, że rozgałęzienie zwrotu
  nie zadziałało.

3. Zrób **częściowy** zwrot innego zamówienia (np. 10 zł z 24,60).

**Oczekiwane:** jednostki **nietknięte**, wiersz ze statusem
`do_rozpatrzenia`. Rozliczasz ręcznie.

> ⚠️ **Kształt powiadomienia PayU o zwrocie jest w kodzie ZGADYWANY** — nie
> miałem dostępu do panelu. Jeśli ten krok nie zadziała, przyślij surową treść
> powiadomienia z logów funkcji `billing-payu-webhook`; poprawię nazwy pól.
> Funkcja jest fail-safe: czego nie rozpozna, tego nie rozlicza.

---

## 12. Program poleceń — ma być niewidoczny

1. Wejdź w portal klienta.

**Oczekiwane:** zakładki **Polecenia nie ma**. Wejście na adres z parametrem
`?ref=KOD` nie pokazuje banera i nie zapamiętuje kodu.

2. Zarejestruj konto z adresu z `?ref=`.

**Oczekiwane:** portfel **0 zł**, żadnego bonusu powitalnego ani nagrody.

Włączenie z powrotem, gdy zdecydujesz — jedna komenda, bez wdrożenia:
`UPDATE referral_settings SET is_enabled = true;`

---

## Znane braki (nie są usterkami tego testu)

Wyszły w audycie, **nienaprawione**, żeby nie zgłaszać ich jako niespodzianek:

- brak ostrzeżenia przy niskim saldzie SMS (żaden próg),
- brak licznika dni do końca okresu próbnego,
- brak ekranu powrotu z płatności — po odrzuconym BLIK-u klient nie widzi nic,
- brak potwierdzenia zakupu („kupiłeś N za X"),
- brak historii zakupów — nic nie czyta `billing_orders` w interfejsie,
- nowe saldo bywa widoczne dopiero po odświeżeniu strony,
- przekroczenie limitu planu nie jest odróżnione od braku środków.
