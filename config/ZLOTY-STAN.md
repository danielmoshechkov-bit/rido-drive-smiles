# ZŁOTY STAN agenta głosowego — konfiguracja docelowa

**Ustalona 15.08.2026, po tygodniu diagnozy bełkotu.**
Trzy rozmowy po polsku bez ani jednego wtrętu — pierwszy taki dzień.

`elevenlabs-agent-ZLOTY-STAN.json` obok to pełny zrzut konfiguracji z produkcji
(sekrety zamaskowane). Ten plik mówi, **dlaczego** każda wartość jest taka,
a nie inna — bo bez tego za miesiąc ktoś „posprząta" ustawienie, które kosztowało
tydzień pracy.

Przywrócenie: `node scripts/voice-restore-golden.mjs --wykonaj`
Sprawdzenie bez zmian: `node scripts/voice-restore-golden.mjs`

---

## SYNTEZA — tu siedziała przyczyna całego tygodnia

```
model_id     eleven_multilingual_v2
voice_id     cjVigY5qzO86Huf0OWal        (Eric)
stability    0.5
similarity_boost  0.6
speed        1.0
enable_phoneme_tags   false
optimize_streaming_latency  0
agent_output_audio_format   pcm_16000
```

**`eleven_multilingual_v2`, nie Flash ani Turbo.** Flash i Turbo **gubią polską
fonetykę**: wstawiają w wypowiedź słowa, których nie ma w tekście — „ściamake",
„krystyna", „freetonoka", „wśród tata marszla". Zmierzone na jednym zdaniu,
20 syntez każdy model, transkrypcja niezależnym silnikiem:

```
                     POLSKI    ANGIELSKI
eleven_flash_v2_5     8/15       0/15
eleven_turbo_v2_5     8/15       0/15
eleven_multilingual_v2 0/15      0/15
eleven_v3              0/15      0/15
```

**Trzydzieści syntez angielskich na zepsutych modelach: zero wtrętów.**
To defekt polskiego, nie ogólny.

**`eleven_v3` byłby lepszy** — równie czysty i o 203 ms szybszy — ale platforma
Agents go blokuje: `400 feature_not_available, "Expressive TTS is not allowed"`.
Działa przez TTS API, nie działa w agencie. Gdyby kiedyś odblokowali, to jest
pierwszy kandydat na zmianę.

**Cena Multilingual: około +145 ms** do pierwszego dźwięku wobec Turbo
(zmierzone 0,342 → 1,095 s z Warszawy; w rozmowie przenosi się stosunek, nie
różnica bezwzględna). Świadomie zapłacone — rozmówca, który nie rozumie agenta,
rozłącza się, a rozmówca, który czeka ćwierć sekundy dłużej, nie.

**Głos Eric, nie Kamil.** Kamil (klon z Voice Library) robi **trzy razy więcej**
wtrętów niż Eric (głos gotowy od ElevenLabs): 45% wobec 15%, `p = 0,007`,
na 80 syntezach. Zmiana na Kamila 13.08 była zmianą na gorsze, zrobioną
w poszukiwaniu poprawy.

**`similarity_boost 0.6`** — sprawdzone 0,8 / 0,75 / 0,7 / 0,6 / 0,5 po 10 syntez,
potem 0,8 wobec 0,6 po 25. **Różnica nieistotna** (`p = 0,26`). Wartość 0,6
wybrana, bo jest w zalecanym zakresie i nie wypadła gorzej — nie dlatego,
że coś naprawia.

**`enable_phoneme_tags false`** — zmienione 13.08 w poszukiwaniu przyczyny.
Nie pomogło, ale też nie zaszkodziło. Zostaje jako stan zbadany.

**`optimize_streaming_latency 0`** — parametr jest **martwy**. Zejście z 3 na 0
zmieniło medianę TTFB o **+0,4 ms** (0,0898 → 0,0902 s przy 571 i 31 pomiarach).
Dokumentacja oznacza go jako przestarzały i to prawda. Wartość 0 zgodna z nią.

## ROZPOZNAWANIE MOWY

```
provider   scribe_realtime
quality    high
keywords   []          <- PUSTE, CELOWO
```

**`keywords` MUSZĄ zostać puste.** Wpisane słowa kluczowe powodowały, że ASR
„dosłyszał" je tam, gdzie nie padły — halucynacje rozpoznawania. Lista wracała
też podwójnie po zapisie z panelu. Jeśli ktoś je znowu wpisze, agent zacznie
słyszeć słowa, których klient nie powiedział.

## WYKRYWANIE MOWY W TLE

```
vad.background_voice_detection   true
```

Filtruje konkurujące ludzkie głosy. **Nie filtruje szumu linii ani artefaktów
kodeka** — sprawdzone przy diagnozie ucięć.

## TURA I PRZERWANIA

```
turn_model                turn_v3
mode                      turn
turn_eagerness            normal
turn_timeout              4.0
silence_end_call_timeout  20.0
speculative_turn          false
soft_timeout_config       8.0 s, "Dobrze rozumiem", maks 1 na generację
interruption_ignore_terms 34 pozycje w pl/ru/uk/en
```

**`soft_timeout` podniesiony z 4 na 8 s.** Wypełniacz „Dobrze rozumiem" doklejał
się do wypowiedzi bez spacji: *„Do zobaczenia w czwartek o dziesiątej.
Dziękuję!Dobrze rozumiem."*. **Całkowitego wyłączenia API nie przyjmuje** —
`null` odrzucone, pusty `message` odrzucony („Input should be a valid string").
8 sekund to najbliższe wyłączeniu, co się dało.

**`speculative_turn false`**, a mimo to platforma wysyła **1,2–2,4 żądania na
turę**. To osobny, niezamknięty problem: płacimy dwa razy za to samo.
Cache tury czeka w backlogu.

**`interruption_ignore_terms`** — 34 słowa („mhm", „tak", „nie", „halo", „dzień
dobry"…), żeby potakiwanie nie ucinało agentowi wypowiedzi.

## ROZMOWA

```
max_duration_seconds  600
text_only             false
client_events         audio, interruption, agent_response, user_transcript,
                      agent_response_correction, agent_tool_response
```

## POWITANIE I PROMPT

```
first_message  "Dzień dobry, Warsztat, rozmowa rejestrowana — w czym mogę pomóc?"
language       pl
disable_first_message_interruptions  true
```

⚠️ **TO POWITANIE JEST NAJGORSZYM ZDANIEM, JAKIE MAMY** — 9/20 wtrętów na Turbo,
przy czym normalne wypowiedzi agenta dają 0–1/20. Przygotowany wariant czysty
w 20/20, zachowujący obowiązek RODO:

```
"Dzień dobry, Warsztat. Rozmowa jest nagrywana. W czym mogę pomóc?"
```

**Niewdrożony — czeka na decyzję**, bo to tekst do klienta z treścią prawną.
Na `multilingual_v2` problem prawdopodobnie znika, ale wariant zostaje
przygotowany na wypadek powrotu do szybszego modelu.

🔗 **SPRZĘŻENIE:** powitanie jest w **dwóch miejscach**. `voice-agent-chat`
cytuje je dosłownie w regule powitania („Rozmówca usłyszał już DOKŁADNIE TO: …").
Zmiana `first_message` bez zmiany tamtej linii rozjeżdża prompt z rzeczywistością.

```
prompt.llm         custom-llm
prompt.temperature 0.0
prompt.max_tokens  600
prompt (193 znaki):
  Instrukcje pochodzą z serwera LLM.
  <<RIDO conv={{system__conversation_id}} caller={{system__caller_id}} called={{system__called_number}}>>
  <<RIDO_SNAPSHOT>>
  {{rido_snapshot}}
  <</RIDO_SNAPSHOT>>
```

**Te trzy znaczniki są krytyczne.** `<<RIDO conv=…>>` niesie tożsamość rozmowy —
ElevenLabs nie przekazuje `conversation_id` do Custom LLM w żaden inny sposób.
`<<RIDO_SNAPSHOT>>` niesie snapshot z webhooka inicjującego (~5000 znaków:
dni, godziny, wolne terminy, cennik). **Skasowanie któregokolwiek nie wywoła
błędu** — agent po prostu przestanie wiedzieć, z kim rozmawia albo jakie ma
terminy, i zacznie zmyślać.

`max_tokens 600` w panelu, ale **realny limit narzuca nasz serwer: 400**.
Historia: 600 dawało ogon generowania p90 3,70 s; 150 ucinało wypowiedzi
w połowie i zniszczyło rozmowę z klientką mówiącą po rosyjsku; 400 to
kompromis z ~5× zapasem.

## NARZĘDZIA

```
narzędzia klienta  end_call, language_detection
knowledge_base     []           <- puste, celowo
```

**`end_call` bez pola `reason`.** Nasz serwer wycina `reason` i `spoken` ze
schematu przed wysłaniem do modelu — pole `reason` kosztowało **1236 ms na
każdym rozłączeniu**, bo model je wypełniał, a nikt nigdy go nie czytał.
Po wycięciu: 406 ms.

**`knowledge_base` puste.** Baza wiedzy była wstrzykiwana do promptu i zawierała
zmyślone godziny otwarcia oraz dane osobowe klientów, dopisane przez pętlę
samouczenia. Wyzerowana 11.08. Wraca wyłącznie przez bramkę uczenia.

## WEBHOOKI

```
conversation_initiation_client_data_webhook
  https://…/functions/v1/voice-agent-init      (nagłówek Authorization z sekretu)
post_call_webhook_id  a9f9457cf459465297f20b3c3c6c6648
  zdarzenia: transcript
```

Webhook inicjujący odpala się **0,3–0,8 s od początku połączenia** i dostarcza
snapshot do **pierwszej tury włącznie** (sprawdzone w logach 11 rozmów).
**W kanale WebRTC (Podgląd) NIE działa** — `rido_snapshot` jest wtedy pusty,
agent nie zna terminów i zmyśla dni. Podgląd nadaje się do oceny brzmienia,
nie do sprawdzania terminów.

## NADPISANIA

```
overrides.conversation_config_override
  tts.voice_id        true
  agent.first_message true
  agent.language      true
  reszta              false
```

⚠️ **Nikt z tego nie korzysta.** W 69 rozmowach ElevenLabs zapisał
`conversation_config_override` z samymi wartościami `null`. Nasze funkcje nie
wysyłają żadnych nadpisań — `voice-agent-init` odsyła wyłącznie `type`
i `dynamic_variables`.

**Osobny dług:** `voice_agent_configs` w naszej bazie ma wypełnione
`voice_id`, `voice_similarity`, `voice_stability`, `voice_speed`,
`voice_per_language` — i **żadna funkcja brzegowa ich nie czyta**. Panel
warsztatu obiecuje kontrolę nad głosem, której nie ma. Przy wielu warsztatach
to przestaje być kosmetyką.

## WORKFLOW

```
4 węzły (start + 3 × override_agent), 2 krawędzie, start_node_id: null
```

⚠️ **NIE POTWIERDZONE, ŻE ODŁĄCZONY.** Struktura istnieje, `start_node_id`
jest pusty, a `prompt.llm` to `custom-llm` — co sugeruje, że przepływ nie jest
używany. **Ale nie mam na to dowodu z rozmowy** i nie zapisuję domysłu jako
faktu. Węzły `override_agent` z definicji potrafią wstrzykiwać własne prompty.
**Do sprawdzenia:** czy w którejkolwiek rozmowie zadziałał węzeł przepływu.

---

## Zasada, która wynikła z dzisiejszej wpadki

**Sondowanie, które zapisuje, nie jest sondowaniem.**

Żeby ustalić, które modele platforma przyjmuje, puściłem pętlę `PATCH` po pięciu
nazwach. Każdy udany `PATCH` **zmieniał konfigurację produkcyjną** — po pętli
agent stał na `eleven_flash_v2_5`, modelu z najgorszym wynikiem. Naprawione
w tej samej minucie, telefon nie dzwonił.

Sprawdzanie możliwości przez próbę zapisu na produkcji jest zmianą produkcji.
Jeśli nie da się inaczej — przywracaj stan po **każdej** próbie, nie po pętli.
