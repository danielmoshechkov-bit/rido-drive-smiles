# Zgłoszenie do ElevenLabs — wersja ostateczna: to defekt POLSKIEGO we Flash i Turbo

**Do wysłania W TYM SAMYM WĄTKU.** Zastępuje wszystko wcześniejsze.
Poprzednie wiadomości szukały przyczyny w SIP, potem w platformie Agents.
Obie były błędne i tak to opisujemy.

---

Final follow-up. We have isolated it, and it is much narrower than anything we
described before. Please disregard our earlier messages about SIP and about the
Agents audio pipeline — both were wrong.

## The defect: your Flash and Turbo models hallucinate words in Polish

One sentence, one voice, one session, `stability 0.5`, `similarity_boost 0.6`,
plain `POST /v1/text-to-speech` — no Agents, no telephony, no custom LLM,
no streaming. Each rendered audio transcribed with an independent engine
(Deepgram nova-2). "Defective" = the audio contains words that are not in the
input text.

    model                     POLISH      ENGLISH
    eleven_flash_v2_5          8/15        0/15
    eleven_turbo_v2_5          8/15        0/15
    eleven_multilingual_v2     0/15        0/15
    eleven_v3                  0/15        0/15

**Thirty English renders on the two broken models: zero defects.
Thirty Polish renders on the same two models: sixteen defects.**

This is not a general audio issue. **Flash and Turbo produce hallucinated
speech in Polish and not in English.**

Examples of what the audio actually contains, in place of a pause:

    input:  "Dzień dobry, Warsztat, rozmowa rejestrowana — w czym mogę pomóc?"

    heard:  "…rozmowa rejestrowana  ściamake             w czym mogę pomóc"
            "…rozmowa rejestrowana  krystyna             w czym mogę pomóc"
            "…rozmowa rejestrowana  freetonoka weź       w czym mogę pomóc"
            "…rozmowa rejestrowana  wśród tata marszla   w czym mogę pomóc"

The insertion always lands at the mid-sentence pause. Short sentences with no
internal pause are clean (0/6 on two different test sentences).

## What we already ruled out, so you don't have to

    voice            reproduces on two unrelated voices, one English-origin,
                     one native Polish
    similarity_boost 0.8 / 0.75 / 0.7 / 0.6 / 0.5 — no significant difference
                     (0.8: 14/25 vs 0.6: 9/25, Fisher exact p = 0.26)
    punctuation      em dash, comma, full stop and ASCII hyphen at the pause
                     all reproduce at the same rate
    text characters  zero { } [ ] < > in any input
    length           median utterance 71 chars, longest 314
    streaming        reproduces on non-streaming HTTP; also on the websocket
                     stream-input endpoint, whole-text and chunked
    telephony        reproduces in WebRTC Preview and in plain API calls

## What we need

1. **Confirm and fix it in Flash and Turbo for Polish.** This is one API call to
   reproduce; we can supply audio files and per-word confidence data.
2. **Until then, tell us the officially supported workaround.** We are moving to
   `eleven_multilingual_v2`, which is clean in our tests but costs us roughly
   **+785 ms** time-to-first-byte compared to Flash — a real problem for inbound
   phone calls. If `eleven_v3` is production-ready for Polish at lower latency,
   say so.
3. **Is Polish uniquely affected, or are other non-English languages too?**
   We only tested Polish and English. If this is broader, other customers are
   losing calls and do not know why.

## Why this is urgent for us

We answer inbound customer calls for car workshops. A caller who hears an
invented word mid-sentence asks "what did you say?" or hangs up. On the two
models you present as the low-latency default for real-time agents, this happens
in **more than half** of our agent's normal utterances in Polish.

Separately and unrelated: we still want our inbound number moved to the EU
endpoint (`sip-static.rtc.eu.residency.elevenlabs.io`, 35 ms from Warsaw vs
144 ms today). That is a latency and GDPR request, not part of this defect.
