# optimize_streaming_latency — zmiana 13.08 i jak ją cofnąć

**Pole NIE JEST edytowalne w panelu.** Zakładka Voice pokazuje tylko rodzinę modelu,
stabilność, prędkość i podobieństwo. `optimize_streaming_latency` istnieje wyłącznie
w API, w `conversation_config.tts`.

## Co zmieniono

    3  →  0     (13.08.2026, 18:27)

Właściciel jednorazowo cofnął zasadę „konfigurację ElevenLabs zmieniam ręcznie",
bo nie miał jak tego zrobić z panelu.

## Dlaczego

Klient (`+48 450 022 088`, 13.08 16:01) usłyszał bełkot zamiast zdania:

    original_message: "Dobrze, piątek czternastego o dziesiątej.
                       Poproszę imię oraz numer rejestracyjny."     ← tekst CZYSTY
    klient:           "A przed chwilą co pan powiedział? »Męcząc rurczce«? Co to znaczy?"

Nagranie **z ElevenLabs** zawiera ten sam objaw, więc transmisja i kodek SIP są niewinne.
Poziom 3 każe TTS wysyłać audio, zanim skończy syntezę — kosztem jakości.

## Punkt odniesienia przed zmianą

    convai_tts_service_ttfb   mediana 0,090 s   średnia 0,132 s   n = 547
    rozmowy z dopytaniem klienta ("nie rozumiem", "proszę powtórzyć")   5 z 48 = 10%
    sklejone wypowiedzi (osobna przyczyna, duplikaty żądań)             21 z 501 = 4,2%

## Jak cofnąć

    curl -X PATCH "https://api.elevenlabs.io/v1/convai/agents/agent_8301ky7ve28ee6jsb3h30h11354g" \
      -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
      -d '{"conversation_config":{"tts":{"optimize_streaming_latency":3}}}'

Pełna kopia konfiguracji sprzed zmiany: `backups/elevenlabs/agent-20260813-182746.json`.

## Co sprawdzono po zmianie

Różnice wobec kopii zapasowej: **tylko to jedno pole** (plus `version_id` i znacznik czasu).
Nietknięte i potwierdzone: `asr.keywords` puste, `turn_timeout` 4 s, `first_message`,
oraz **oba znaczniki w prompcie** — `<<RIDO …>>` i `<<RIDO_SNAPSHOT>> {{rido_snapshot}}`.
