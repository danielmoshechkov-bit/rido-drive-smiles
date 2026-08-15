# Dlaczego agent wraca na polski — rozstrzygnięte

Rozmowa `c0yn9bxn`, 15.08 20:36:41, 63 s, telefon, prowadzona po rosyjsku.

## Hipoteza do sprawdzenia

> „Prompt ma 20 975 znaków i cały jest po polsku, z polskimi zdaniami
> przykładowymi. Model kopiuje je zamiast tłumaczyć."

## Co pokazał pomiar

**Detektor języka działał.** Log `jezyk_rozmowy` z ośmiu tur:

| czas | język | snapshot przerobiony | znaków |
|---|---|---|---|
| 7,6 s | `pl` | nie | 8605 |
| 15,9 s | `ru` | **tak** | 8605 → 7372 |
| 23,7 s | `ru` | **tak** | 8605 → 7372 |
| 24,0 s | `ru` | **tak** | 8605 → 7372 |
| 33,2 s | `ru` | **tak** | 8605 → 7372 |
| **44,9 s** | **`ru`** | **tak** | 8605 → 7372 |
| **46,5 s** | **`ru`** | **tak** | 8605 → 7372 |
| **55,0 s** | **`ru`** | **tak** | 8605 → 7372 |

Trzy pogrubione wiersze to dokładnie te tury, w których agent **odezwał się
po polsku**. Detektor trzymał `ru`. Snapshot był przerobiony na rosyjski
(1233 znaki mniej — polskie pola wycięte, `polityka_wyceny_tekst` usunięta).

Nic po naszej stronie nie kazało modelowi mówić po polsku.

## Skąd wzięły się polskie zdania

Obie polskie wypowiedzi to **wzorce przepisane z promptu**:

| agent powiedział | wzorzec w prompcie |
|---|---|
| „Przepraszam, nie dosłyszałem. Chodzi o dziewiątą rano czy o cztery po południu?" | `„Nie dosłyszałam godziny — czy chodzi o dziewiątą rano?"` + `„Przepraszam, dziewiąta czy jedenasta?"` |
| „Poproszę imię oraz markę i model auta." | `„Poproszę imię oraz markę i model auta."` — **słowo w słowo** |

Trzecia wypowiedź, `[8s] „Tak, oczywiście! В чём я могу помочь?"`, to ten sam
mechanizm w drugą stronę: wzorzec `„Да, конечно! В чём я могу помочь?"`
skopiowany w połowie, druga połowa przełożona na polski.

## Ile jest tych wzorców

Liczone na bloku budującym prompt (`voice-agent-chat/index.ts`, 35 328 znaków):

| kategoria | liczba |
|---|---|
| pełne zdania gotowe do wypowiedzenia (wielka litera + `.` / `?` / `!`) | **34** |
| z tego po polsku | **34** |
| z tego po rosyjsku, ukraińsku, angielsku | **0** |
| krótsze frazy i wtrącenia w cudzysłowie | 90 |
| znaków cyrylicy w całym bloku | 70 na 35 328 (**0,2 %**) |

Frazy niepolskie w całym prompcie są dwie: `замена масла` i
`Да, конечно! В чём я могу помочь?` — obie w sekcji o przełączaniu języka.

**Hipoteza potwierdzona.** Model dostaje 34 gotowe polskie zdania i zero
gotowych zdań w jakimkolwiek innym języku. Reguła „mów po rosyjsku" jest
jedna; przykładów, jak brzmi dobra odpowiedź, ma 34 i wszystkie są polskie.
Przy odpowiedzi rutynowej (prośba o dane, dopytanie o godzinę) sięga po
wzorzec, bo wzorzec jest konkretniejszy niż reguła.

## Co w tej rozmowie zadziałało

- **Godziny po rosyjsku renderowane w kodzie** — padło `„в девять часов"`
  i `„в двенадцать тридцать"`, obie formy poprawne. Poprawka z 15.08 działa
  poza polskim.
- **Data** — `„вторник, восемнадцатого августа"`, zgodna z kalendarzem.
- **Zero wywołań narzędzi.** Terminy (9:00 / 12:30 / 16:00) przyszły ze
  snapshotu, nie z `check_availability`. Tak miało być.
- **`language_detection` nie zostało wywołane ani razu.** Blokada z 15.08 trzyma.
- **Opóźnienia LLM**: TTFB 1,12–1,86 s, mediana 1,25 s.

## Pozostałe błędy tej rozmowy

1. **Trzy terminy zamiast dwóch** `[33s]` — prompt wymaga dwóch. Klient
   odpowiedział niezrozumiale i stracił 9 s.
2. **Dopytanie pominęło środkowy termin** `[47s]` — agent wymienił dziewiątą
   i szesnastą, klient chciał 12:30. Wyszło dobrze przypadkiem.
3. **„Полный сервис"** `[24s]` — klient prosił o olej i przegląd stanu,
   agent nazwał to „pełnym serwisem". Nazwa usługi, której nie ma w cenniku.
4. **`multivoice.used: false`** — trzecie potwierdzenie z rzędu, że platforma
   nie przełącza głosu mimo `model_family` w `supported_voices`.
   `primary_tts_model: eleven_multilingual_v2`, `main_language: pl`.
   Cała rozmowa po rosyjsku poszła przez model, który w rosyjskim
   ma 7/20 czytelności. To osobny wątek — zgłoszenie do ElevenLabs.

## Wniosek dla FAZY C

Przepisanie promptu musi objąć wzorce, nie tylko reguły. Trzy warianty:

- **(a)** usunąć gotowe zdania i zostawić same reguły — model układa sam,
  ryzyko utraty jakości polskiego;
- **(b)** wstawić wzorce w czterech językach — prompt rośnie ~4×, koszt
  cache'owania rośnie proporcjonalnie;
- **(c)** wstrzykiwać wzorce **tylko w języku rozmowy**, tak jak już
  wstrzykujemy snapshot — rozmiar bez zmian, jeden zestaw wzorców na turę.

(c) jest tańsze niż (b) i bezpieczniejsze niż (a): polski zostaje dokładnie
taki, jaki jest dziś, a pozostałe języki dostają swoje wzorce. Mechanizm
podmiany już istnieje (`snapshotWJezyku`).
