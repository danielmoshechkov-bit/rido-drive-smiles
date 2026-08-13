# Zgłoszenie do ElevenLabs

**Status: PRZEPISANE, NIEWYSŁANE.** Czeka na akceptację.
Kanał: support@elevenlabs.io albo Help → Contact support w panelu.

Pierwsza wersja opisywała „corrupt speech". Po pomiarach to już nie jest główna
teza — zgłoszenie dotyczy trzech konkretnych, policzonych rzeczy.

---

Hi,

Production Conversational AI agent over SIP trunking, inbound, Polish
(agent `…0h11354g`, workspace GetRido). Three issues, all measured on stored
conversations, ordered by how much they cost us.

## 1. TTS is cut off mid-sentence while the caller is silent

We compared `original_message` (what our custom LLM returned) with `message`
(what was actually spoken) across **540 agent turns in 59 conversations**.
Counting only turns where at least 10 characters of real text are missing —
so not the trailing `...` you append to completed turns:

    truncated turns:                        59 / 540   (11%)
      genuine barge-in (caller spoke):      41
      caller said nothing at all:            6

For those 6 we measured when the agent fell silent (start time + spoken length
at 14 chars/sec) against the next caller utterance. Median silence after the cut
is **1.4 s**, maximum **3.9 s** — no one was speaking.

Clearest example, conversation `conv_…78qkrx0a`, 13 Aug 2026 21:59 CEST, at 00:41:

    LLM returned : Dobrze, notuję. Poproszę numer rejestracyjny.
    actually said: Dobrze, notuję. Poproszę numer
    next caller utterance: 3.9 seconds later

Second example, `conv_…d1c2f9s7`, same evening 21:55, at 01:34 — 77 characters
lost, 1.3 s of silence after.

Relevant config: `turn_v3`, `mode: turn`, `turn_eagerness: normal`,
`turn_timeout 4.0`, `speculative_turn false`, `background_voice_detection: true`,
ASR `scribe_realtime` quality `high`.

- What can trigger an interruption when the caller is silent?
- Is `background_voice_detection` expected to suppress line noise and codec
  artifacts, or only competing human voices?
- Does `turn_v3` behave differently on telephony audio that originated at
  8 kHz and was upsampled?

## 2. G.722 is negotiated even though we offer uncompressed codecs

Our SIP provider offers four codecs in the INVITE; your `200 OK` picks G.722:

    offered:  PCMA/8000, AMR-WB/16000, G722/8000, PCMU/8000
    chosen:   G722/8000

G.722 is sub-band ADPCM with a stateful predictor, so a single lost or reordered
packet degrades audio until the predictor reconverges — which sounds exactly like
the muffled speech our callers report. PCMA/PCMU have no such state.

- Can we pin the codec per phone number or per SIP trunk? We see no such field
  on `/v1/convai/phone-numbers/{id}` (`provider_config` is null,
  `livekit_stack: standard`).
- If not, what determines the preference order?

## 3. Media server is transatlantic for a Polish number

The SDP in your `200 OK` points at `34.45.0.205`. Measured from Warsaw:

    ElevenLabs media (34.45.0.205):     146 ms RTT
    our SIP provider (213.199.246.208):  23 ms RTT

A Polish caller's audio crosses the Atlantic twice. Combined with a stateful
codec that is a plausible cause of both issues above.

- Can inbound SIP media be pinned to an EU region?
- Is there a region setting we are missing on the phone number or the trunk?

## Ruled out on our side

Not to send you down these paths:
- No non-textual characters reach TTS. Zero `{ } [ ] < >` and zero prompt-marker
  leakage across all 630 agent utterances.
- Utterance length is not a factor: median 71 characters, longest 314.
- `optimize_streaming_latency` 3 → 0 changed median `convai_tts_service_ttfb`
  by +0.4 ms (0.0898 → 0.0902 s), consistent with it being deprecated/ignored.
- Duplicate LLM requests do not correlate with the cuts (26% of cut turns vs
  31% of intact turns had a request arrive mid-speech).
- SIP signalling is clean: one INVITE per call, no re-INVITE, no error_message.

Happy to share full conversation exports and the recordings.
