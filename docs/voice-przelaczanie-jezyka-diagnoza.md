# Przełączanie języka nie działa — przyczyna ustalona

## Dowód: narzędzie ZADZIAŁAŁO, platforma je ODRZUCIŁA

Rozmowa `conv_…hjg0hyhv`, 15.08 18:19. Model zrobił dokładnie to, co miał:

```
[ 4s] KLIENT  Dobry dzień. Wy gwarzycie po ruski?
[ 8s] AGENT   Tak, mówimy po rosyjsku. Czy chciałbyś przejść na rozmowę w tym języku?
[12s] KLIENT  Da.
        >>> language_detection  {"language":"ru"}
        <<< "Invalid language. Keep speaking Polish."   is_error: true
        >>> language_detection  {"language":"ru"}      (druga próba)
        <<< "Invalid language. Keep speaking Polish."   is_error: true
        >>> language_detection  {"language":"ru"}      (trzecia próba)
        <<< "Invalid language. Keep speaking Polish."   is_error: true
[20s] KLIENT  Halo?
```

**Model wywołał narzędzie trzy razy. Platforma trzy razy odmówiła.**
To nie jest błąd promptu ani modelu — to blokada po ich stronie.

## Odpowiedź wprost: TAK, wymaga czegoś, czego nie mamy

**Brakującym elementem są `language_presets`** — lista języków, na które agentowi
wolno się przełączyć. Bez nich `language_detection` widzi rosyjski jako
„invalid language".

`supported_voices` **nie wystarcza**. Przypisuje głos do języka, ale nie
autoryzuje samego języka — rosyjski był tam wpisany i mimo to został odrzucony.

### Czego jeszcze spróbowałem, żeby to obejść

```
language_presets przez PATCH          200, zapisuje null    (4 kształty)
language_presets przy TWORZENIU       200, zapisuje null
agent.language = "multi"              422 odrzucone
agent.language = "auto"               422 odrzucone
agent.language = "any"                422 odrzucone
```

`agent.language` przyjmuje **dokładnie jeden** język: `pl`, `ru`, `uk`, `en` —
osobno, nigdy razem.

**Wniosek: wielojęzyczność w rozmowie jest zablokowana**, dopóki ElevenLabs
nie udostępni `language_presets`. To ta sama klasa co „Expressive TTS" przy v3:
pole istnieje, API przyjmuje żądanie, i nic się nie zapisuje.

## 🎯 ALE JEST OBEJŚCIE, I MAMY NA NIE POZWOLENIE

`platform_settings.overrides` mówi, co wolno nadpisać **przy starcie rozmowy**,
przez odpowiedź webhooka inicjującego. Sprawdzone na naszym agencie:

```
WOLNO   conversation_config_override.agent.language
WOLNO   conversation_config_override.agent.first_message
WOLNO   conversation_config_override.agent.prompt.prompt
WOLNO   conversation_config_override.tts.voice_id
```

**Możemy ustawić język rozmowy z naszej strony — w `voice-agent-init`.**

### Czego to obejście NIE robi

Nadpisanie działa **przy starcie**, nie w trakcie. **Nie da się przełączyć języka
w połowie rozmowy** — to zostaje zablokowane.

### Co za to daje, i to jest więcej, niż się wydaje

**Dzwoniący, którego znamy, dostaje swój język od pierwszej sekundy** —
razem z powitaniem, głosem i promptem.

```
klient dzwoni  ->  init rozpoznaje numer  ->  czyta zapamiętany język
               ->  zwraca conversation_config_override:
                     agent.language     = "ru"
                     agent.first_message = "Здравствуйте, автосервис…"
                     tts.voice_id        = głos przypisany do rosyjskiego
```

To jest **lepsze niż przełączanie w trakcie**, bo klient nie słyszy najpierw
polskiego powitania, którego nie rozumie. Cena: pierwszą rozmowę prowadzimy
po polsku i dopiero z niej zapamiętujemy język.

Język zapamiętujemy z transkryptu po rozmowie — mamy go w `voice-call-postprocess`,
a nasz LLM widzi każdą wypowiedź klienta i może go rozpoznać bez pytania.

**To rozwiązanie mamy pod kontrolą w całości.** Nie zależy od `language_detection`
ani od odblokowania czegokolwiek przez ElevenLabs.

## 🐛 DRUGI BŁĄD Z TEJ SAMEJ ROZMOWY — nasz, do naprawy w prompcie

```
AGENT: „Tak, mówimy po rosyjsku. Czy chciałbyś przejść na rozmowę w tym języku?"
```

Dwa błędy w jednym zdaniu:

1. **ZAPOWIEDZIAŁ przełączenie zamiast po prostu przejść.** Prompt mówi
   „natychmiast PRZEŁĄCZ się na ten język", a model zapytał o zgodę.
2. **„chciałbyś" — forma na Ty**, przy regule zakazującej jej bezwzględnie.
   Trzeci raz w tym tygodniu ta sama reguła złamana.

Naprawa punktu 1 ma sens dopiero, gdy przełączanie w ogóle działa — czyli
przy obejściu opisanym wyżej reguła musi brzmieć inaczej: nie „przełącz się",
tylko „mów dalej po polsku i nie obiecuj zmiany języka, której nie możesz zrobić".
