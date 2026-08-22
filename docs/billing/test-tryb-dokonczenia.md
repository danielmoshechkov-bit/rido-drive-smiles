# Test trybu dokończenia — co kliknąć i co ma się stać

Napisany pod **stan faktyczny na 22.08.2026**, nie pod zapowiadany.
Czego jeszcze nie ma, jest wypisane na końcu — żeby nie szukać błędu tam,
gdzie funkcji po prostu nie zbudowaliśmy.

---

## Zanim zaczniesz

Jutro o **3:00 UTC** (5:00 czasu polskiego) zadanie `billing-koniec-trialu`
wprowadzi w tryb dokończenia warsztaty z wygasłym okresem próbnym. To **siedem
kont testowych**: Aktywacja Test, Anatoli Liudvichenka, daniel, Daniel,
Daniel Moshechkov, Rola Test, Warsztat Testowy.

Nie musisz czekać do rana. Jeśli chcesz zacząć od razu, poproś mnie —
uruchomię zadanie ręcznie i podam wynik.

**Konta z prawdziwymi zleceniami nie zostaną ruszone**: CART78GARAGE,
AUTO-SERWIS HAWRYLUK, Beata Smosarska i CART78 sp. z o.o. mają ważny dostęp.

---

## 1. Pasek u góry — na każdym ekranie

Zaloguj się na konto testowe, które weszło w tryb, i wejdź do panelu warsztatu.

**Ma być:** czerwonawy pasek pod nagłówkiem, z treścią w rodzaju
„Okres próbny zakończony. Zostały 3 dni — do 27 sierpnia." i przyciskiem
„Wybierz plan".

**Sprawdź trzy rzeczy:**
- pasek jest widoczny na **liście zleceń**, po wejściu w **kartę zlecenia**
  i w **karcie pojazdu** — nie tylko na pierwszym ekranie,
- **nie da się go zamknąć** (nie ma krzyżyka) — to zamierzone,
- licznik dni zgadza się z datą obok.

**Czerwona flaga:** pasek znika po wejściu w zlecenie. To znaczy, że nie
opakowuje wszystkich gałęzi panelu.

## 2. Nowe zlecenie — ma odmówić z drogą wyjścia

Kliknij **Nowe zlecenie** i spróbuj je zapisać.

**Ma być:** komunikat „Nie możesz teraz założyć nowego zlecenia" z wyjaśnieniem,
co nadal wolno, i **przyciskiem „Wybierz plan"** prowadzącym do cennika.
Komunikat wisi dłużej niż zwykły błąd, bo jest co przeczytać.

**Czerwona flaga:** surowe „new row violates row-level security policy" albo
komunikat bez przycisku.

## 3. Zmiana statusu istniejącego zlecenia — ma przejść

Otwórz zlecenie, które już istnieje, i zmień jego status (np. na „Gotowy
do odbioru" albo „Zakończone").

**Ma być:** status zmienia się normalnie, bez komunikatu.

## 4. Dopisanie części do zlecenia — ma przejść

W tym samym zleceniu dopisz pozycję (część albo usługę).

**Ma być:** pozycja dodaje się normalnie. To jest celowe — mechanik, który
rozebrał auto i znalazł usterkę, musi móc ją dopisać.

## 5. Podmiana klienta albo auta — ma odmówić

W karcie zlecenia spróbuj zmienić klienta albo pojazd (wyszukiwarka po
nazwisku, telefonie, rejestracji albo VIN-ie).

**Ma być:** „Nie możesz zmienić klienta ani pojazdu w tym zleceniu" z przyciskiem.

**To jest najważniejszy punkt testu.** Bez tej blokady warsztat podmieniałby
parę klient–pojazd w starym zleceniu i obsługiwał nim kolejne osoby.

## 6. Kartoteka klientów i pojazdów — ma odmówić

Spróbuj dodać nowego klienta albo pojazd z poziomu kartoteki.

**Ma być:** odmowa. To druga droga obejścia — przepisanie istniejącego klienta
na inne nazwisko zamiast podmiany go w zleceniu.

## 7. Faktura i księgowość — mają działać

Wystaw fakturę do istniejącego zlecenia i wejdź w moduł Księgowość.

**Ma być:** wszystko działa bez ograniczeń, także po twardym bloku.
Księgowość jest świadomie poza blokadą.

## 8. Terminarz i rezerwacje — bez zmian

Wejdź w kalendarz.

**Ma być:** obsługa istniejących rezerwacji działa (potwierdzenie, odwołanie,
przełożenie). Zakładanie nowego terminu z poziomu warsztatu jest zablokowane
— to zachowanie sprzed trybu dokończenia, nie nowość.

## 9. Twardy blok — po trzech dniach roboczych

Nie musisz czekać. Poproś mnie, przestawię jednemu kontu termin na przeszłość
i uruchomię zadanie — zobaczysz stan docelowy od razu.

**Ma być:** panel przykryty nakładką z komunikatem, który **najpierw** mówi,
że dane są bezpieczne i że księgowość działa dalej, a dopiero potem prosi
o wybór planu. Pod spodem widać przyciemnione dane — celowo, żeby klient
widział, że nic nie zginęło.

## 10. Powrót po opłaceniu

Tego **nie da się dziś przetestować do końca** — patrz sekcja niżej.

Można natomiast sprawdzić sam mechanizm powrotu: poproś mnie o ustawienie
subskrypcji na `active`. Tryb dokończenia czyści się natychmiast,
pasek znika, wszystko wraca.

---

## Czego jeszcze NIE MA — nie szukaj tu błędu

**Płatności BLIK-iem za miesiąc.** Jedyna droga zakupu prowadzi dziś przez
Stripe z kartą. Przycisk „Wybierz plan" doprowadzi Cię do cennika, a stamtąd
do formularza karty. Warsztat bez karty nie ma dziś jak zapłacić — to jest
w budowie i wchodzi jako następne.

**Faktura po zakupie.** Nie powstaje żadna. W budowie zaraz po BLIK-u.

**Ostrzeżenia 7 i 1 dzień przed.** Wejdą po wykonaniu migracji ostrzeżeń
i wdrożeniu funkcji `billing-ostrzezenia`. Konta testowe są już po terminie,
więc ostrzeżenia i tak by nie dostały — zobaczysz je dopiero na koncie,
któremu okres próbny dopiero się kończy.

---

## Co zgłosić

Przy każdej rozbieżności napisz **którym krokiem** i **co zobaczyłeś**.
Dla kroków 2, 5 i 6 przydatna jest treść komunikatu co do słowa —
po niej poznam, czy odmowa przyszła z wyzwalacza, czy z polityki.
