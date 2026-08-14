# SPROSTOWANIE do zgłoszenia + prostsza reprodukcja

**Do wysłania W TYM SAMYM WĄTKU, pilnie.** Poprzednia wiadomość zawiera jedno
zdanie, które jest nieprawdziwe, i trzeba je odwołać, zanim oni się o to oprą.

---

Correction to our previous message, and a much simpler reproduction case.

## We were wrong about one thing

We wrote: *"the same sentence rendered through your TTS API is clean 20 times
out of 20."* **That is not true and we withdraw it.** We had only measured the
duration of those 20 renders, not their content. We have now transcribed them.

**12 of the 20 contain audible words that are not in the input text.**

## The defect reproduces with a single HTTP call to /v1/text-to-speech

No Agents platform, no WebRTC, no SIP, no custom LLM, no streaming. One POST.

    POST /v1/text-to-speech/{voice_id}?output_format=pcm_16000
    model_id: eleven_turbo_v2_5   (also reproduces on eleven_flash_v2_5)
    voice_settings: stability 0.5, similarity_boost 0.8, speed 1.0
    text: "Dzień dobry, Warsztat, rozmowa rejestrowana — w czym mogę pomóc?"

Transcribing the returned audio with an independent engine (Deepgram nova-2),
here is what comes back — inserted words that are in no input:

    "…rozmowa rejestrowana  ściamake      w czym mogę pomóc"
    "…rozmowa rejestrowana  krystyna      w czym mogę pomóc"
    "…rozmowa rejestrowana  freetonoka weź w czym mogę pomóc"
    "…rozmowa rejestrowana  czemotema coa  w czym mogę pomóc"
    "…rozmowa rejestrowana  wśród tata marszla w czym mogę pomóc"
    "…rozmowa rejestrowana  fanem tomaszem toma to już jest to możliwe w czym mogę pomóc"

**The insertion always lands in the same position — the pause in the middle of
the sentence.** The model appears to hallucinate speech into the silence.

## What we varied

    long sentence with a mid-sentence pause, Polish     4/6 renders defective
    the same sentence, different voice (English voice)  1/6
    the same sentence in ENGLISH                        3/6
    short sentence, no internal pause                   0/6
    medium sentence, no internal pause                  0/6

    "Poproszę numer rejestracyjny."          0/6
    "Poproszę imię oraz markę i model auta." 0/6

So: **not language-specific** (English reproduces), **not voice-specific**
(two unrelated voices), **not Agents-specific** (plain TTS API). It correlates
with a longer utterance containing an internal pause.

Punctuation at the pause makes no difference — em dash, comma, full stop and
ASCII hyphen all reproduce at similar rates.

## Why this matters to us

We run inbound customer calls. A caller who hears an invented word in the
middle of a sentence asks "what did you say?" or hangs up. Our agent's normal
utterances are exactly the long, multi-clause kind that reproduces this.

## Request

1. This should be reproducible on your side in one API call. Please try it.
2. Escalate to whoever owns the TTS models.
3. Tell us whether there is a setting that suppresses it — higher `stability`,
   a different model, anything. We will test whatever you suggest.

Our earlier messages blamed SIP, then the Agents audio pipeline. Both were
wrong, and we would rather say so than have you chase them.
