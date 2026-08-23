# Zmiana planu — jedno przejście do przeklikania

Wszystko, czego nie da się sprawdzić bez prawdziwej karty. Ułożone tak, żeby
przejść **raz, po kolei**, bez wracania. Około 20 minut.

Konta testowe: hasło `AudytRido!2026x`.
Karta testowa Stripe: **4242 4242 4242 4242**, dowolna data w przyszłości, CVC 123.

> **Zanim zaczniesz:** `rido.audyt.s7` ma w bazie wpisaną atrapę subskrypcji
> (`sub_audyt_test`), której u operatora nie ma. Do tego przejścia **nie używaj
> s7** — załóż prawdziwą subskrypcję na `s1`, jak w kroku 1.

---

## Krok 1 — kup Standard kartą (`rido.audyt.s1`)

1. Zaloguj się jako `rido.audyt.s1@gmail.com`, wejdź na `/uslugi/panel`.
2. Kliknij plakietkę przy nazwie firmy → okno zakupu.
3. Wybierz **Standard**, okres **miesiąc**, metodę **karta**.
4. Zapłać kartą testową.

**Co ma się stać:** powrót do panelu, plakietka pokazuje **Standard** bez licznika
okresu próbnego.

**Zapisz sobie:** kwotę z potwierdzenia Stripe i datę końca okresu z plakietki.

---

## Krok 2 — wejście W GÓRĘ (Standard → Pro)

1. Tym samym kontem otwórz okno zakupu ponownie.
2. Wybierz **Pro**, okres **miesiąc**, metodę **karta**.

**Co ma się stać — i to jest sedno kroku:**

- **NIE otwiera się bramka płatności.** Żadnego przekierowania, żadnego
  formularza karty. Jeśli zobaczysz bramkę, to znaczy, że podmiana pozycji nie
  zadziałała i sprzedajemy drugą subskrypcję obok pierwszej — **przerwij i zgłoś**.
- Zielony komunikat: **„Plan zmieniony na Pro. Działa od teraz."**
- Plakietka od razu pokazuje **Pro**, bez odświeżania strony.

**Sprawdź u operatora** (dashboard Stripe → Customers → to konto):
- subskrypcja jest **jedna**, nie dwie,
- jej pozycja wskazuje cenę **Pro**,
- pojawił się rachunek na **RÓŻNICĘ** (nie na pełne 169 zł) — to jest
  `always_invoice` w działaniu,
- rachunek ma status **opłacony**.

**Czerwona flaga:** rachunek na pełną kwotę Pro zamiast na różnicę znaczy, że
klient zapłacił dwa razy za ten sam miesiąc.

---

## Krok 3 — BLIK obok karty ma odmówić

Tym samym kontem otwórz okno zakupu i spróbuj kupić okres **BLIK-iem**.

**Co ma się stać:** odmowa ze zdaniem *„Ten warsztat ma abonament odnawiany
kartą. Zmiana planu odbywa się bez nowej płatności…"*.

**To jest zabezpieczenie przed podwójnym obciążeniem** — bez niego BLIK dokłada
czas na wierzchu, a karta i tak pobiera swoje przy odnowieniu.

*(Ten krok sprawdziłem już z linii poleceń — kod `MASZ_KARTE`, HTTP 409.
Przeklikaj go mimo to: chcę wiedzieć, czy okno pokazuje ten komunikat czytelnie,
czy tylko „coś poszło nie tak".)*

---

## Krok 4 — zejście W DÓŁ (Pro → Standard)

Tym samym kontem: okno zakupu → **Standard**, okres **miesiąc**, **karta**.

**Co ma się stać:**

- znowu **żadnej bramki**,
- komunikat z **datą**: *„Plan zmieni się na Standard 22 września. Do tego czasu
  działasz na obecnym — masz go opłacony."*,
- **plakietka nadal pokazuje Pro.** To nie jest błąd — to jest cała zasada.
  Klient ma opłacone Pro do końca okresu i nie odbieramy mu tego.

**Sprawdź u operatora:**
- pozycja subskrypcji wskazuje już cenę **Standard**,
- **NIE MA nowego rachunku** i nie ma zwrotu — to jest `proration_behavior: none`,
- następny rachunek (zakładka „Upcoming invoice") opiewa na kwotę **Standard**.

**Czerwona flaga:** zwrot za niewykorzystane dni Pro. Nie umawialiśmy się na to
i psuje rachunek.

---

## Krok 5 — wycofanie zejścia

Tym samym kontem: okno zakupu → **Pro** (czyli plan, który faktycznie masz).

**Co ma się stać:** odmowa **„Ten plan i okres już masz."**

**Uwaga — tu jest luka, o której musisz wiedzieć.** Dziś to jedyna droga
wycofania, a ona **nie wycofuje zejścia**: odłożony Standard nadal siedzi
w bazie i wejdzie przy odnowieniu. Funkcja `billing_wycofaj_zmiane_planu`
istnieje i działa, ale **nic jej jeszcze nie woła z interfejsu**. Przycisku
„wycofaj zmianę" nie ma.

Do czasu jego dorobienia wycofanie robi się zapytaniem w bazie.

---

## Krok 6 — dokupienie paczki obok abonamentu kartowego

Tym samym kontem kup **100 SMS**.

**Co ma się stać:** bramka BLIK otwiera się normalnie. Paczki to jednorazowe
doładowania, nie okresy — blokada z kroku 3 ich nie dotyczy i dotyczyć nie ma.

*(Sprawdzone z linii poleceń: HTTP 200 i adres bramki, także dla konta
z subskrypcją kartową.)*

---

## Krok 7 — odnowienie z odłożonym zejściem

Tego **nie przeklikasz w 20 minut** — trzeba doczekać końca okresu albo
przesunąć czas w Stripe (Test clocks). Jeśli chcesz to sprawdzić od razu,
powiedz — przygotuję konto z zegarem testowym.

**Co ma się stać przy odnowieniu:** rachunek na kwotę Standard, a nasza
plakietka przechodzi na Standard.

---

## Czego ten scenariusz NIE sprawdza

- **zmiany okresu przy tym samym planie** (miesiąc ↔ rok). Kierunek liczy się
  wtedy z okresu, nie z ceny planu. Osobne przejście, te same kroki 2 i 4.
- **nieudanej karty w trakcie wejścia w górę.** Stripe wystawia rachunek
  z `always_invoice`, a karta może go odrzucić — wtedy plan jest już zmieniony
  u nas, a pieniądze nie przyszły. **Nie wiem, jak to dziś wygląda**, i to jest
  najpoważniejsza luka w mojej wiedzy o tej ścieżce.
- **zmiany planu przy abonamencie BLIK-owym.** Klient bez karty nie ma dziś
  ścieżki zmiany planu w oknie zakupu — kupuje po prostu inny plan, a zakup
  unieważnia odłożoną zmianę.
