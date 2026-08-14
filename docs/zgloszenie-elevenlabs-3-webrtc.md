# Zgłoszenie do ElevenLabs — wersja rozstrzygająca (WebRTC, bez telefonii)

**Do wysłania W TYM SAMYM WĄTKU.** Zastępuje wcześniejszą narrację o SIP —
telefonia okazała się nieistotna.

---

Follow-up. **Disregard the SIP angle from our earlier messages — we were wrong,
and we can now show it.**

The corruption reproduces in **WebRTC, in your own Preview widget, with no
telephony in the path at all.** It affects the static `first_message`, which your
platform synthesises before our custom LLM is involved.

## Reproduction — 30 seconds, entirely inside your product

Open the agent in the dashboard, click Preview, listen to the greeting.
Agent `…0h11354g`, `first_message`:

    "Dzień dobry, Warsztat, rozmowa rejestrowana — w czym mogę pomóc?"

Conversation `conv_…qk3qqc6r`, 14 Aug 2026 17:50 CEST, `phone_call: null`.

We fed **your own stored recording** of that conversation into an independent
speech-to-text engine (Deepgram nova-2, Polish). It read:

    dzień dobry warsztat rozmowa rejestrowana
    w czepiesie      (confidence 0.42)   <-- not in the text, not Polish
    parszo-bazirę    (confidence 0.54)   <-- not in the text, not Polish
    w czym mogę pomóc

Two nonsense tokens are inserted **into the middle of a fixed string**, with
every surrounding word read at high confidence. The listener hears it as
garbled speech. Same conversation, at the end of the next utterance:

    generated: "W czym mogę pomóc — jaki problem z samochodem?"
    read     : "...jaki problem z samochodem tędy dosiadać i jej problem z samochodem"

Nonsense, then **the tail of the sentence repeated**. It sounds like two audio
streams played back-to-back.

Second WebRTC conversation, `conv_…7prs838h`, same evening 17:52, at 00:39:

    ta (0.30)  ta (0.10)  sama (0.16)  ta (0.17)  tak (0.42)

A stutter loop, again mid-utterance, again with clean words either side.

## This is not our LLM, and not request duplication

In `conv_…qk3qqc6r` the greeting is corrupted and our custom LLM was **called
zero times** for it — it is your static `first_message`. Across that whole
conversation there was **1 LLM request for 2 agent turns**.

We had suspected duplicate requests. The data rules it out — the WebRTC calls
with the **worst** corruption have the **fewest** requests per turn:

    conv_…qk3qqc6r   WebRTC    0.5 requests per agent turn   worst corruption
    conv_…7prs838h   WebRTC    1.2
    conv_…d5yjf9n8   phone     1.7
    conv_…m2eaasns   phone     2.1                            least reported

## Everything we eliminated, with the test that eliminated it

    ✗ our code / prompt / snapshot   occurs in your static first_message
    ✗ SIP, codec, carrier, route     occurs in WebRTC with no telephony
    ✗ caller's line, network, phone  multiple numbers, networks, landline
    ✗ non-textual characters         zero { } [ ] < > in 630 agent utterances
    ✗ utterance length               median 71 chars, longest 314
    ✗ optimize_streaming_latency     3 → 0, median TTFB +0.4 ms (deprecated)
    ✗ enable_phoneme_tags            true → false
    ✗ voice                          English voice → native Polish voice
    ✗ TTS model                      eleven_flash_v2_5 → eleven_turbo_v2_5
    ✗ direct TTS synthesis           20 renders of the same sentence via your
                                     TTS API — all clean
    ✗ duplicate LLM requests         inverse correlation, see above
    ✗ barge-in / speaking pace       occurs when the caller stays silent

The contrast that matters: **the same sentence, same voice, same settings,
rendered through your TTS API is clean 20 times out of 20. Rendered through
your Agents platform it is corrupted in every conversation we have logged.**

## What we are asking

1. Reproduce it in Preview on this agent — it happens on the greeting, in the
   first three seconds, so it costs you one click.
2. Escalate to engineering. The difference between your TTS API and your Agents
   audio pipeline is where this lives.
3. Separately, and regardless of the above: move our inbound number to the EU
   endpoint (`sip-static.rtc.eu.residency.elevenlabs.io`, 35 ms from Warsaw vs
   144 ms for the current US endpoint). This is now a latency and GDPR request,
   not a fix for the corruption.

Recordings, per-word confidence data and full conversation exports available
on request.
