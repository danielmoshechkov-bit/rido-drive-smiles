# Uzupełnienie do zgłoszenia — pełna lista wykluczeń + żądanie EU

**Do wysłania W TYM SAMYM WĄTKU.** Nie jako nowe zgłoszenie.

---

Follow-up on the same thread.

We have now eliminated every variable we can control. The corruption persists.
It happens **in every call, from every number, on every network we tested**,
including in the static `first_message` — before our custom LLM is involved at all.

## What we changed and re-tested — symptom unchanged in all cases

    ✗ our code, prompt, snapshot   symptom occurs in your static first_message
    ✗ non-textual characters       zero { } [ ] < > across 630 agent utterances
    ✗ utterance length             median 71 chars, longest 314
    ✗ optimize_streaming_latency   3 → 0, median TTFB moved +0.4 ms (deprecated)
    ✗ enable_phoneme_tags          true → false
    ✗ voice                        Eric (English) → native Polish voice
    ✗ TTS model                    eleven_flash_v2_5 → eleven_turbo_v2_5
    ✗ duplicate LLM requests       no correlation (26% of cut turns vs 31% intact)
    ✗ synthesis itself             20 renders of the same sentence via your TTS
                                   API, all clean on listening
    ✗ codec                        carrier now offers PCMA/PCMU only, G.722
                                   and AMR-WB removed from the trunk
    ✗ packet loss at the carrier   our SIP provider measures 133 ms to
                                   34.45.0.205 with ZERO packet loss
    ✗ caller's line or operator    tested from multiple phones, multiple mobile
                                   networks and landline — identical symptom

The 20 direct TTS renders matter most: **the same sentence, same voice, same
settings, synthesised through your own TTS API with no telephony involved, is
clean every time.** Through the SIP path, the same sentence is corrupted.

## What is left

Two things, both inside your infrastructure:

1. **RTP is routed transatlantically.** Media server `34.45.0.205`, 146 ms RTT
   from Warsaw, 133 ms from our carrier in Poland.
2. **Your SIP / media gateway layer** between that server and the TTS output.

## What we are asking for

**1. Move this number to the EU endpoint.** Your docs document
`sip-static.rtc.<region>.residency.elevenlabs.io`. Measured from Warsaw:

    sip.rtc.elevenlabs.io                       136.112.48.140   144 ms  (current)
    sip-static.rtc.eu.residency.elevenlabs.io   199.88.252.50     35 ms

Both answer on TCP 5061. The EU endpoint is **4x closer**. Our number is
`livekit_stack: standard`, `provider_config: null` — there is no region field
anywhere in `/v1/convai/phone-numbers/{id}`, so we cannot do this ourselves.

Tell us plainly: is this available on our plan, what does it cost, and what is
the procedure that does not lose the number?

This is also a **GDPR** matter for us independently of audio quality — the call
recordings contain personal data of EU residents and currently transit and rest
in the US.

**2. Escalate to engineering.** We are not asking for configuration advice any
more; we have exhausted it. We are asking someone to look at what happens to
audio between your TTS output and the RTP stream on this trunk.

## Reproduction

The simplest case needs no LLM at all — just call the number and listen to the
greeting. It is a fixed string in the agent config:

    "Dzień dobry, Warsztat, rozmowa rejestrowana — w czym mogę pomóc?"

Recent examples (all UTC+2):

    conv_…6dwpfgqm   13 Aug 23:53   corruption in the greeting itself
    conv_…78qkrx0a   13 Aug 21:59   at 00:41
    conv_…d1c2f9s7   13 Aug 21:55   at 00:46

We can supply recordings and full conversation exports on request.
