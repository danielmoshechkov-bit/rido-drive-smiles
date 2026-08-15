# Wielojęzyczność — rozpoznanie przed projektem

Odpowiedzi na cztery pytania, zanim cokolwiek zaprojektujemy.
Wszystko sprawdzone na **agentach testowych, kasowanych po próbie** — nie na produkcji.

---

## 4. NAJWAŻNIEJSZE: TAK, snapshot generuje polszczyznę NA SZTYWNO

**Odpowiadam na to pierwsze, bo od tego zależy skala całej reszty.**

`voiceSnapshot.ts` ma 302 linie, z czego **70 (23%) to polszczyzna wpisana w kod**:

```
liczbaSlownie          23 linie    liczby na słowa, z odmianą
czasDoWypowiedzenia    15 linii    „około godziny", „cały dzień"
doWypowiedzenia         6 linii    „wtorek, osiemnastego sierpnia"
przyimekZDniem          5 linii    „we wtorek" wobec „w poniedziałek"
cenaDoWypowiedzenia     5 linii    „od stu pięćdziesięciu do dwustu pięćdziesięciu"
JEDNOSTKI/DZIESIATKI/SETKI + formy dopełniacza   16 linii
```

Co z tego ląduje w snapshocie jako gotowy tekst do wypowiedzenia:

```
dni[].do_wypowiedzenia            "wtorek, osiemnastego sierpnia"
dni[].powod                       "zamknięte" / "brak wolnych terminów"
uslugi[].do_powiedzenia           "sto pięćdziesiąt złotych"
uslugi[].czas_do_powiedzenia      "około pół godziny"
ustawienia.polityka_wyceny_tekst  "Kosztorys pokażemy przed rozpoczęciem naprawy…"
```

**Przy rosyjskim agent dostanie polskie daty i ceny do wypowiedzenia.**
I zrobi jedną z dwóch rzeczy: przeczyta je po polsku w środku rosyjskiego zdania
albo przetłumaczy sam — czyli dokładnie to, przed czym cały snapshot miał chronić.

### Skala pracy — i dlaczego to NIE jest tylko tłumaczenie

Cztery języki to nie „przetłumaczyć 70 linii". To **cztery niezależne systemy
odmiany liczebnika**:

```
polski     „osiemnastego sierpnia"     liczebnik porządkowy w dopełniaczu
rosyjski   „восемнадцатого августа"    porządkowy w dopełniaczu, inne końcówki
ukraiński  „вісімнадцятого серпня"     jak wyżej, inny zestaw
angielski  „the eighteenth of August"  najprostszy z całej czwórki
```

Plus ceny („od stu pięćdziesięciu" — dopełniacz liczebnika głównego) i godziny
(„o jedenastej" — miejscownik liczebnika porządkowego w rodzaju żeńskim).

**Uczciwa wycena: to jest większa praca niż cała reszta wielojęzyczności razem.**
Sam moduł polski ma 22 asercje i powstawał przez trzy dni poprawek — bo
„dziewiętnaście sierpnia" zamiast „dziewiętnastego" wyszło dopiero na prawdziwej
rozmowie.

### Dwie drogi, obie do decyzji

**A. Napisać moduły odmiany dla ru/uk/en.** Kosztowne, ale daje tę samą pewność
co po polsku: model czyta gotowy tekst, nie odmienia sam.
Wymaga kogoś, kto zna te języki na tyle, żeby ocenić poprawność form —
mnie nie wolno tego oceniać.

**B. Dać modelowi liczby surowe i pozwolić mu odmieniać.** Tanie i natychmiastowe,
ale **wracamy do klasy błędów, którą snapshot wyeliminował**: agent trzy razy
powiedział „wtorek dziewiętnaście sierpnia", zanim daty poszły w pole gotowe.
Przy rosyjskim nikt z nas tego nie wychwyci w odsłuchu.

**Rekomendacja: B dla angielskiego, A dla rosyjskiego i ukraińskiego.**
Angielski ma najprostszą odmianę i model radzi sobie z nią dobrze. Rosyjski
i ukraiński mają odmianę porównywalną z polską — tam pole gotowe jest konieczne.

---

## 1. Presety językowe: pole istnieje, ale API je MILCZĄCO IGNORUJE

```
agent.language_presets = null
```

Sprawdzone na agencie testowym, cztery różne kształty:

```
lista                       PATCH 200 -> null
słownik płaski              PATCH 200 -> null
słownik + overrides         PATCH 200 -> null
słownik + overrides + tts   PATCH 200 -> null
```

**Każdy PATCH zwraca 200 i nic nie zapisuje.** To najgorszy rodzaj odpowiedzi —
gdybym sprawdził tylko kod odpowiedzi, zaraportowałbym „ustawione".

**Wniosek: presetów nie ustawimy przez API.** Zostaje panel albo są niedostępne
na naszym planie, jak „Expressive TTS" przy v3. **Do zapytania w zgłoszeniu.**

## 2. Głos per język: DZIAŁA, i to lepiej niż zakładaliśmy

```
tts.supported_voices = []      <- puste, ale pole DZIAŁA
```

PATCH przeszedł i zapisał się poprawnie. Każdy wpis ma **własne parametry**,
nie tylko `voice_id`:

```json
{"label":"rosyjski","voice_id":"…","language":"ru","model_family":null,
 "optimize_streaming_latency":null,"stability":null,"speed":null,"similarity_boost":null}
```

**To znaczy, że możemy mieć inny głos, inną stabilność i inne tempo dla każdego
języka.** Przy różnych głosach o różnej charakterystyce to istotne — polski głos
może potrzebować innego `stability` niż rosyjski.

⚠️ Czego ta próba NIE sprawdziła: czy platforma faktycznie **przełączy** głos
w trakcie rozmowy po wykryciu języka. Sprawdziłem tylko, że pole się zapisuje.
Rozstrzygnie dopiero rozmowa testowa.

## 3. Scribe: nie jest przypięty do polskiego

```
asr = {"quality":"high","provider":"scribe_realtime",
       "user_input_audio_format":"pcm_16000","keywords":[]}
```

**W konfiguracji ASR nie ma pola języka w ogóle.** Język bierze się z
`agent.language` i z narzędzia `language_detection`, które mamy włączone
z `only_at_conversation_start: false` — czyli wykrywa język **w dowolnym momencie
rozmowy**, nie tylko na starcie.

Że Scribe radzi sobie z rosyjskim i ukraińskim, wiemy z własnego pomiaru:
nagranie od klienta odczytał po rosyjsku z pewnością **0,925**, po ukraińsku 0,712.
To inny produkt (Deepgram), ale sam fakt, że nagranie telefoniczne po rosyjsku
jest czytelne maszynowo, mamy potwierdzony.

⚠️ Czego to NIE dowodzi: że `scribe_realtime` w rozmowie na żywo rozpozna
rosyjski równie dobrze. Mierzyliśmy inny silnik na nagraniu, nie ten na strumieniu.

---

## 🔴 Rzecz, która wyszła przy okazji i idzie do zgłoszenia

Przy zakładaniu agenta testowego **bez podanego modelu** platforma odrzuciła go:

```
400  "Non-english Agents must use turbo or flash v2_5."
```

Czyli ich własna walidacja mówi, że **agent nieanglojęzyczny ma używać turbo
albo flash v2_5** — dokładnie tych dwóch modeli, które **udowodniononą
psują polską fonetykę** (8/15 wtrętów wobec 0/15 po angielsku).

Sprawdzone dalej: agent z **jawnie podanym** `eleven_multilingual_v2` i `language: pl`
zakłada się bez problemu. Więc nasza konfiguracja jest dozwolona — walidacja
dotyczy tylko przypadku bez jawnego modelu.

**Ale to zestawienie warto im pokazać:** wasza walidacja kieruje
nieanglojęzycznych na modele, które dla polskiego są zepsute.
