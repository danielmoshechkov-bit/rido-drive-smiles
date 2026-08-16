# Przełączanie języka: DZIAŁA. Moja wczorajsza diagnoza była błędna.

## Twoja pamięć była trafna — znalazłem trzy rozmowy

```
06.08 14:29  6r803n3e   KLIENT: Здравствуйте! Вы говорите по-русски?
                        AGENT:  Да, конечно! В чём я могу помочь?
06.08 14:30  qrgbn9cy   AGENT:  I notice you've written in Russian. Let me switch to Russian…
                        AGENT:  Да, говорю. В чём помочь?
06.08 16:34  r6c14bzp   AGENT:  Dobrze rozumiem. Да, конечно! В чём…
```

**Agent mówił po rosyjsku przy `agent.language = pl`, bez żadnej zmiany konfiguracji.**

## Co naprawdę się dzieje — i czego nie zrozumiałem

Kluczowa różnica jest w parametrze wywołania:

```
06.08   language_detection {"language":"pl"}   -> SUCCESS   (pl JEST dozwolony)
15.08   language_detection {"language":"ru"}   -> Invalid language  (ru NIE jest)
```

**Narzędzie `language_detection` nigdy nie było mechanizmem mówienia po rosyjsku.**
06.08 agent po prostu **napisał odpowiedź cyrylicą**, a synteza ją przeczytała.
15.08 model zamiast tego sięgnął po narzędzie — i utknął.

**Blokada dotyczy narzędzia, nie języka wypowiedzi.**

### Moja wczorajsza reguła w prompcie była szkodliwa

Wpisałem: *„JĘZYK ROZMOWY JEST USTALONY NA STARCIE I NIE ZMIENIA SIĘ"* —
i zablokowałem tym jedyną rzecz, która faktycznie działała. **Cofnięte.**
Nowa reguła mówi wprost: **zmiana języka polega na tym, że zaczynasz pisać
w tym języku; nigdy nie wołaj `language_detection` dla innego niż polski.**

## 🔴 ALE JEST DRUGI PROBLEM, POWAŻNIEJSZY: TTS CZYTA ROSYJSKI PO UKRAIŃSKU

Osiem syntez rosyjskiego powitania, `multilingual_v2`, głos Eric:
**tylko 3 z 8 dają się odczytać po rosyjsku.** Pozostałe pięć czyta się
**po ukraińsku**, i to czysto:

```
tekst wejściowy   "разговор записывается. Чем могу помочь?"
odczyt ru         (pusto)               pewność 0,000
odczyt uk         "розмов записується … чим можу допомогти"   pewność 0,77
```

To nie jest bełkot ani zacięcie — **to poprawna wymowa NIE TEGO języka.**
Model dostaje cyrylicę bez podpowiedzi, zgaduje język i trafia w ukraiński.

Wynik jest **stabilny per plik**: ten sam plik czytany trzy razy daje ten sam
wynik. Czyli różni się AUDIO, nie transkrypcja — sprawdzone rozdzieleniem
generowania od odczytu.

## ✅ ROZWIĄZANIE: `language_code` + INNY MODEL DLA ROSYJSKIEGO

```
                                      czytelnych po rosyjsku
bez podpowiedzi, multilingual_v2              3/8
language_code=ru, multilingual_v2             5/8
language_code=ru, turbo_v2_5                  8/8      <--
language_code=ru, flash_v2_5                  4/8
```

**Turbo v2.5 z `language_code: "ru"` — osiem na osiem.** Test dokładny Fishera
wobec wariantu bez podpowiedzi: `p = 0,026`.

### I to jest odwrotność tego, co ustaliliśmy dla polskiego

```
POLSKI     multilingual_v2  0/15 wtrętów   |  turbo_v2_5  8/15 wtrętów
ROSYJSKI   turbo_v2_5       8/8 czytelnych |  multilingual_v2  5/8
```

**Właściwy model jest INNY dla każdego języka.** Nie ma jednego dobrego.

`supported_voices` ma pole **`model_family`** — dotąd puste. To może być
dokładnie ten mechanizm: model per język, obok głosu per język.
**Do sprawdzenia na agencie testowym.**

## Czego ten pomiar NIE obejmuje

- Nie wiem, czy platforma Agents pozwala podać `language_code` — mierzyłem
  na gołym TTS API. W rozmowie nie mamy jak go przekazać inaczej niż przez
  `supported_voices.language`, a to dopiero do sprawdzenia.
- Nie wiem, jak rosyjski brzmi dla ucha — miernik mówi, że rosyjski ASR go
  czyta, nie że brzmi naturalnie. To rozstrzyga odsłuch.
- Ukraińskiego w tym trybie nie mierzyłem. Skoro TTS domyślnie ciąży ku
  ukraińskiemu, ukraiński może być czysty bez podpowiedzi — ale to zgadywanie,
  nie pomiar.
