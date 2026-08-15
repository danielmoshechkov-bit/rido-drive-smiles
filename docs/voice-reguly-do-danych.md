# Które z 30 reguł da się jeszcze zamienić na dane

**Backlog, nie do zrobienia teraz.** Powód: „dwie godziny zamiast trzech" była
regułą w prompcie dwa razy, za drugim razem mocniej sformułowaną, i łamała się
3/3. Po zamianie na pole `zaproponuj` przestała być łamana — bo nie ma już
trzeciej godziny do przeczytania.

**Reguła kosztuje przy każdej turze. Pole kosztuje raz.**

## Nadają się wprost

| reguła | pole, które by ją zastąpiło |
|---|---|
| „nie proponujesz dnia zamkniętego" | dni zamknięte już mają `otwarte: false` — ale wciąż są w tablicy. Wystarczy ich **nie wysyłać** |
| „nie mów o przyjeździe wcześniej ani o dokumentach" | te teksty i tak generuje SMS — prompt nie musi o nich wiedzieć |
| „przy widełkach mów «orientacyjnie»" | `do_powiedzenia` może już zawierać słowo „orientacyjnie", tak jak zawiera odmienioną kwotę |
| „nie pytasz o nazwisko" | pole `pola_do_zebrania: ["imie","marka","model","rejestracja"]` — lista zamiast zakazu |
| „dane bierzesz w dwóch turach" | ta sama lista, pogrupowana: `[["imie","marka","model"],["rejestracja"]]` |
| „nie wymyślasz nazw usług" | `uslugi[].nazwa` to zamknięta lista — mogłaby przyjść z adnotacją „wolno użyć wyłącznie tych nazw" jako pole, nie jako reguła |

## Nadają się częściowo

| reguła | co zostaje regułą |
|---|---|
| „bezosobowo do poznania imienia" | pole `forma_zwrotu: "bezosobowo" \| "pan" \| "pani"` przeliczane po podaniu imienia — ale model i tak musi je zastosować |
| „najwyżej dwa zdania na turę" | limit `max_tokens` już to wymusza twardo; reguła jest miękkim dublem |

## Nie da się

Reguły o **zachowaniu w czasie rozmowy**: „mówisz wynik, nie proces",
„nie odsyłasz do telefonu", „najwyżej dwie odmowy pod rząd", „milkniesz po
pytaniu domykającym". Nie mają reprezentacji w danych, bo dotyczą sekwencji,
nie stanu.

## Zasada z tego

Zanim dopiszesz regułę, sprawdź, czy nie jest to **fakt o warsztacie** albo
**lista** — jedno i drugie należy do snapshotu. Regułą zostaje wyłącznie to,
co dotyczy PRZEBIEGU rozmowy.
