# Nagrania rozmów w karcie zlecenia — specyfikacja

**Status: BACKLOG. Nie budujemy przed progiem pięciu udanych rozmów.**
Spisane w całości, żeby nie projektować od nowa.

---

## Punkt wyjścia — co już jest

Zakładka **„Rozmowa telefoniczna"** istnieje w karcie zlecenia
(`src/components/workshop/OrderCallPanel.tsx`, wpięta w `WorkshopOrderDetail.tsx`).
Czyta `voice_calls` po `linked_entity_id` i `voice_transcripts` po `call_id`,
pokazuje transkrypcję. Przy braku powiązania wyświetla „Brak powiązanej rozmowy
telefonicznej dla tego zlecenia".

**Dodajemy odtwarzacz do istniejącego widoku — nie budujemy nowej zakładki.**

---

## Zakres

- odtwarzacz audio **nad** transkrypcją (rozmowy słucha się przed czytaniem)
- przewijanie
- **pobranie pliku** — warsztat może chcieć zachować dowód przy reklamacji
- gdy nagrania nie ma (starsze niż retencja): transkrypcja zostaje, w miejscu
  odtwarzacza komunikat „nagranie usunięte po 90 dniach"

## Retencja: 90 DNI, nie miesiąc

**Powód, dla którego miesiąc nie wystarcza:** reklamacja przy naprawie auta wychodzi
często po dwóch–trzech miesiącach, a nagranie jest wtedy jedynym dowodem, na co się
umawialiśmy. Przy retencji miesięcznej dowód znika dokładnie wtedy, gdy staje się
potrzebny.

**Po 90 dniach znika nagranie, transkrypcja ZOSTAJE** — jest tania i wystarcza
w większości przypadków.

## Format: 64 kbps mono

Źródło z ElevenLabs to 16 kHz mono, więc 64 kbps nie odbiera niczego słyszalnego,
a kosztuje połowę. ElevenLabs oddaje MP3 128 kbps — przekodowujemy przy kopiowaniu.

## Gdzie: kopiujemy do siebie

**Nie polegamy na ElevenLabs.** `deletion_settings` mają dziś `null`/`false`, czyli
nagrania nie są kasowane — ale to **ustawienie konta, nie gwarancja umowna**. Zmiana
ich polityki zabrałaby warsztatowi historię bez ostrzeżenia.

Kopiowanie po zakończeniu rozmowy, w `voice-call-postprocess`, po commicie
(zapis jest krytyczny, nagranie jest dodatkiem — awaria kopiowania nie może wywrócić
webhooka).

---

## Koszt — policzony na zmierzonych danych

Podstawa: **0,92 MB/min** zmierzone na prawdziwym nagraniu (MP3 128 kbps, 16 kHz mono),
czyli **0,46 MB/min** po przekodowaniu na 64 kbps.

| | 64 kbps |
|---|---|
| jedna rozmowa 2 min | 0,92 MB |
| 1 warsztat/dzień (20 rozmów) | 18 MB |
| **1 warsztat, stan ustalony po 90 dniach** | **1,62 GB** |
| **50 warsztatów, stan ustalony** | **81 GB** |

Transfer (odsłuchania), 50 warsztatów:

| odsetek odsłuchiwanych rozmów | miesięcznie |
|---|---|
| 10% | 2,7 GB |
| 25% | 6,7 GB |

**Koszt orientacyjny** przy stawkach rzędu 0,021 $/GB składowania i 0,09 $/GB transferu
(**do zweryfikowania na Waszym planie Supabase**):

    składowanie 81 GB     ~1,70 $/miesiąc
    transfer 2,7 GB       ~0,24 $/miesiąc
    RAZEM                 ~1,94 $/miesiąc przy 50 warsztatach
                          ~0,04 $/miesiąc na warsztat

Przy 128 kbps samo składowanie byłoby dwa razy większe: 162 GB ≈ 3,40 $/miesiąc.

**Wniosek: koszt nie jest argumentem przeciw.** Cztery centy na warsztat miesięcznie.
Argumentem przeciw jest RODO i praca do wykonania, nie rachunek.

---

## RODO — do zaprojektowania RAZEM z funkcją, nie po niej

Nagranie rozmowy to dane osobowe.

- **retencja 90 dni**, egzekwowana cronem, nie ręcznie
- **kasowanie na żądanie klienta** — musi istnieć droga, którą warsztat to wykona
- **usunięcie zlecenia usuwa nagranie** — dziś usunięcie zlecenia nie usuwa nawet
  transkryptu (`voice_transcripts` zostaje, `linked_entity_id` wisi). To trzeba
  naprawić RAZEM z tą funkcją, inaczej dokładamy dane osobowe do mechanizmu,
  który już przecieka
- **informacja w powitaniu już jest**: „rozmowa rejestrowana" — spełnione

## Kolejność, gdy wrócimy

1. naprawa kasowania: usunięcie zlecenia usuwa transkrypt i nagranie (dług, już dziś)
2. kopiowanie nagrania w `voice-call-postprocess` + przekodowanie na 64 kbps
3. cron retencji 90 dni
4. odtwarzacz w `OrderCallPanel`
5. kasowanie na żądanie klienta
