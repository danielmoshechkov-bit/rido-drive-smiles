# Zgłoszenie do ElevenLabs — corrupt speech + cięcie TTS w połowie słowa (SIP, polski)

**Status: PRZYGOTOWANE, NIEWYSŁANE.** Czeka na akceptację.
Kanał: support@elevenlabs.io albo formularz w panelu (Help → Contact support).

---

Hi,

We run a production Conversational AI agent over SIP trunking in Polish
(agent `…0h11354g`, workspace GetRido). Two separate problems, both
reproducible in stored conversations.

## 1. Corrupt speech (your documented issue) — happening on telephony, in Polish

Callers repeatedly hear muffled, unintelligible fragments while the stored
transcript is clean. This matches the "Corrupt Speech" issue in your docs.
On telephony it is not cosmetic: the caller asks "what did it say?" and we
lose the booking.

Conversation IDs and timestamps:

    conv_…78qkrx0a    13 Aug 2026, 21:59 UTC+2   at 00:41
    conv_…d1c2f9s7    13 Aug 2026, 21:55 UTC+2   at 00:46

At 00:41 the agent text was `Dobrze, notuję. Poproszę numer rejestracyjny.`
The caller responded 6 seconds later asking what "CTM" meant — she heard
noise, not words. The garbling is audible in the recording you serve from
your own API, so it is not our SIP transport.

Config: `eleven_flash_v2_5`, `pcm_16000` in and out, `stability 0.5`,
`speed 1.0`, `similarity_boost 0.8`, `optimize_streaming_latency 0`.
No non-textual characters ever reach TTS — we checked all 630 agent
utterances across 59 conversations: zero occurrences of `{ } [ ] < >`
and zero leakage of our system-prompt markers. Median utterance length
is 71 characters, longest 314 — nothing near the 800-character guidance.

Questions:
- Is corrupt speech more frequent on `eleven_flash_v2_5` than `turbo_v2_5`?
- Is it voice-dependent, and can you tell us whether our voice is affected?
- Is it more frequent for Polish than English?

## 2. TTS is cut off mid-word when nobody is speaking

Separate and, for us, larger. **17% of agent utterances (90 of 540) are
truncated mid-word** and flagged `interrupted: true`. In 6 of them not a
single word was spoken.

We tested whether these are genuine barge-in by comparing when the agent
fell silent against the next caller utterance. **18 of 78 measurable cases
had no caller speech at all** — median gap after the agent stopped is
positive, and reaches 6.9 seconds.

Example, conversation `conv_…78qkrx0a` at 00:41:

    LLM produced : Dobrze, notuję. Poproszę numer rejestracyjny.
    actually said: Dobrze, notuję. Poproszę numer
    next caller utterance: 3.9 seconds later

Config: `turn_v3`, `mode: turn`, `turn_eagerness: normal`,
`turn_timeout 4.0`, `speculative_turn false`, ASR `scribe_realtime`,
quality `high`.

Questions:
- What triggers an interruption when the caller is silent? Is line noise
  or acoustic echo on the SIP leg being detected as speech?
- Is there a sensitivity control beyond `interruption_ignore_terms`?
- Does `turn_v3` behave differently on 8 kHz-sourced telephony audio
  upsampled to `pcm_16000`?

We are happy to share full conversation exports.
