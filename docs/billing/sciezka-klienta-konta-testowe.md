# Ścieżka klienta — konta do przejścia w przeglądarce

Przygotowane 23.08.2026 audytem. **Hasło do wszystkich: `AudytRido!2026x`**

Konta założone **prawdziwą rejestracją** (`/auth/v1/signup` + `activate-workshop-trial`),
nie wstawianiem wierszy. Stany ustawione podstawieniem dat.

Zrzuty wrzucaj do `docs/billing/zrzuty/` z nazwą stanu, np. `04-tryb-dokonczenia.png`.

---

## Czego NIE wiem, jak wygląda

Nie mam przeglądarki, więc **wszystko poniżej opisuje, co ma się stać wg kodu i bazy**,
a nie co widziałem. Rozbieżność między tym opisem a ekranem jest znaleziskiem —
i po to ten dokument.

Nie opisuję rozmieszczenia elementów ani kolorów poza tym, co wynika z kodu.

---

## 1. `rido.audyt.s1@gmail.com` — okres próbny, 30 dni

**Plakietka przy nazwie firmy:** `Pro · okres próbny, 30 dni` z przyciskiem **„Wybierz plan"**.
Kolor: obwódka w kolorze wiodącym (nie bursztyn — bursztyn wchodzi przy ≤ 7 dniach).

**Pasek u góry:** brak. Pasek trybu dokończenia pojawia się dopiero po wygaśnięciu.

**Przyciski:** wszystko aktywne — nowe zlecenie, kartoteka, kasa, kalendarz.

**Po kliknięciu „Wybierz plan":** otwiera się okno zakupu na kroku **wyboru okresu**
(bo plan `warsztat_pro` znamy z rejestracji), z zaznaczonym **rokiem**.

**Liczniki:** 50 SMS, 5 VIN, 50 Rido AI.

---

## 2. `rido.audyt.s2@gmail.com` — okres próbny, 7 dni

**Plakietka:** `Pro · okres próbny, 7 dni`, **na bursztynowo**, przycisk
**„Wybierz plan, zanim skończy się okres próbny"**.

Reszta jak wyżej.

**Ostrzeżenie mailem:** ma wyjść przy najbliższym przebiegu zadania `billing-ostrzezenia`
(2:30 UTC). Temat: *„Za 7 dni kończy się Twój dostęp — GetRido"*.

---

## 3. `rido.audyt.s3@gmail.com` — okres próbny, 1 dzień

**Plakietka:** `Pro · okres próbny, 1 dzień` (nie „1 dni") na bursztynowo.

**Ostrzeżenie mailem:** temat *„Jutro kończy się Twój dostęp — GetRido"*.

---

## 4. `rido.audyt.s4@gmail.com` — tryb dokończenia, pierwszy dzień

**Pasek u góry, na każdym ekranie panelu:**
> Okres próbny zakończony. Zostało 5 dni — do 28 sierpnia.
> Możesz dokończyć rozpoczęte zlecenia. Nie założysz nowego ani nie zmienisz
> w istniejącym klienta i pojazdu. Potem dostęp zostanie wstrzymany, a dane pozostaną nietknięte.

Z przyciskiem **„Wykup dostęp"**. **Paska nie da się zamknąć** — nie ma krzyżyka.

**Plakietka:** `Dokończenie · 5 dni`, czerwonawa.

**Ma działać:** zmiana statusu zlecenia, dopisanie pozycji, wystawienie faktury,
usunięcie zlecenia, cała Księgowość, kalendarz.

**Ma odmówić:**
- **nowe zlecenie** → *„Nie możesz teraz założyć nowego zlecenia"* + przycisk „Wybierz plan"
- **podmiana klienta albo auta w zleceniu** → *„Nie możesz zmienić klienta ani pojazdu w tym zleceniu"*
- **dodanie klienta lub pojazdu w kartotece** → odmowa

**Sprawdź, czy pasek jest widoczny także po wejściu w kartę zlecenia i w kartę pojazdu.**
Jeśli znika — to znaczy, że nie opakowuje wszystkich gałęzi panelu.

---

## 5. `rido.audyt.s5@gmail.com` — tryb dokończenia, ostatnie godziny

Jak wyżej, ale licznik pokazuje **„To ostatnie godziny"** albo „Został 1 dzień”
(termin: dziś ok. 18:55).

Plakietka: `Dokończenie · 1 dzień`.

---

## 6. `rido.audyt.s6@gmail.com` — twardy blok

**Panel przykryty nakładką.** Pod spodem widać przyciemnione dane — celowo, żeby klient
widział, że nic nie zginęło.

**Treść nakładki** zaczyna się od danych, nie od prośby o pieniądze:
> Okres próbny dobiegł końca
> Twoje dane są bezpieczne — zlecenia, kartoteka klientów i pojazdów czekają w całości
> i wrócą od razu po opłaceniu. Księgowość i faktury działają bez przerwy, także teraz.

Przycisk **„Odblokuj dostęp"** → okno zakupu.

**Plakietka:** `Odblokuj dostęp`.

**Ma nadal działać:** Księgowość i faktury. Jeśli i one są zasłonięte — to znalezisko.

---

## 7. `rido.audyt.s7@gmail.com` — opłacone kartą, miesiąc

**Plakietka:** nazwa planu (`Pro`), bez licznika i bez zachęty do zakupu.
Pasek: brak. Wszystko aktywne.

Koniec okresu za 20 dni, więc **nie** pokazujemy jeszcze „Przedłuż” (próg to 14 dni).
Plakietka po kliknięciu prowadzi do zakładki rozliczeń.

---

## 8. `rido.audyt.s8@gmail.com` — opłacone BLIK-iem, miesiąc

Jak wyżej, ale przycisk zakupu (gdziekolwiek się pojawi) ma brzmieć
**„Dokup kolejny miesiąc"** — bo płatność jednorazowa **nie odnawia się sama**
i klient musi to wiedzieć.

---

## 9. `rido.audyt.s9@gmail.com` — opłacone rocznie

Jak 7, koniec okresu za 11 miesięcy.

---

## 10. `rido.audyt.s10@gmail.com` — Pro opłacone, BEZ odłożonej zmiany

**Tego stanu nie przygotowałem** — mechanizm odłożonej zmiany planu
(`plan_od_nastepnego_okresu`) **nie jest jeszcze zbudowany**. Konto stoi na Pro
opłaconym BLIK-iem, żeby nie było puste.

---

## Przejścia między stanami

| Z → do | Kiedy | Co klient dostaje | Co znika z panelu |
|---|---|---|---|
| próbny → próbny 7 dni | 7 dni przed końcem, 2:30 UTC | mail „Za 7 dni kończy się Twój dostęp" | nic; plakietka robi się bursztynowa |
| próbny 7 → 1 dzień | dzień przed końcem, 2:30 | mail „Jutro kończy się Twój dostęp" | nic |
| próbny → dokończenie | w dniu wygaśnięcia, 3:00 | **nic mailem** — patrz uwaga niżej | przycisk „Nowe zlecenie" przestaje działać |
| dokończenie → blok | po 3 dniach roboczych, 3:15 | **nic mailem** | cały panel operacyjny; zostaje księgowość |
| dowolny → opłacone | natychmiast po zaksięgowaniu | mail z fakturą **(jeszcze nie zbudowany)** | pasek i plakietka trybu |

**Uwaga:** dziś **nie wysyłamy maila w chwili wejścia w tryb dokończenia ani w chwili
blokady**. Klient dowiaduje się z panelu. Ostrzeżenia idą tylko przed końcem.
Warto to dołożyć — zapisane w raporcie.
