# Zgłoszenie do ElevenLabs nr 6 — `supported_voices` przyjmuje `model_family`, ale platforma go nie używa

**Do wysłania w wątku ticketu #706154** (ten sam, w którym poprosili o conversation ID).
Poprzednie zgłoszenia dotyczyły syntezy jako takiej. To dotyczy mechanizmu
przełączania modelu per język — i po raz pierwszy da się je poprzeć rozmową
z prawdziwym klientem.

Najmocniejszy punkt nie brzmi „pole się nie zapisuje", tylko: **przez niedziałający
mechanizm nasi rosyjskojęzyczni klienci słyszą model o trzykrotnie gorszej
czytelności, a telemetria raportuje tę rozmowę jako jednojęzyczną.**

---

Follow-up on #706154, with the conversation IDs you asked for.

## Summary

`conversation_config.tts.supported_voices` accepts a per-language `model_family`.
We set it, the API stores it, and it returns in `GET`. **The platform never acts
on it.** In a fully Russian conversation the agent rendered every second of audio
with `eleven_multilingual_v2` — the model we explicitly moved *away from* for
Russian — and reported `multivoice.used: false`.

For us this is not a cosmetic issue. On our own measurements
`eleven_multilingual_v2` is roughly **three times less intelligible in Russian**
than `eleven_turbo_v2_5`, so every Russian-speaking caller currently hears the
worse of the two models, and your telemetry records the call as monolingual
Polish.

## Conversation

    conversation_id  conv_0801m03bcdt3eer89sbnc0yn9bxn
    agent_id         agent_8301ky7ve28ee6jsb3h30h11354g
    date             2026-08-15, 63 s, inbound SIP

Eleven turns. After turn 2 the entire conversation is in Russian — the caller
speaks Russian, the agent answers in Cyrillic. Sample:

    [12s] caller  Я хотел бы договориться на сервис машины.
    [16s] agent   Да, конечно! Какая проблема с машиной?
    [33s] agent   Вторник, восемнадцатого августа — у нас есть свободные места…

What your telemetry says about that same conversation:

    metadata.main_language                    "pl"
    metadata.features_usage.multivoice        {"enabled": true, "used": false}
    metadata.charging.tts_usage.primary_tts_model   "eleven_multilingual_v2"
    metadata.charging.tts_usage.per_voice_usage     one voice, 27.7 s

Three separate things are wrong here:

1. `model_family: "turbo"` was configured for `ru` and was not applied.
2. `multivoice.used: false` for a conversation that is demonstrably bilingual.
3. `main_language: "pl"` for a conversation that is ~85 % Russian by audio time.

This is the third consecutive call in which we observe `multivoice.used: false`.

## Configuration we set (and which `GET` returns unchanged)

    supported_voices:
      { language: "pl", model_family: "multilingual", voice_id: cjVigY5q…, speed: 1.15 }
      { language: "en", model_family: "multilingual", voice_id: cjVigY5q…, speed: 1.15 }
      { language: "ru", model_family: "turbo",        voice_id: cjVigY5q…, speed: 1.15 }
      { language: "uk", model_family: "multilingual", voice_id: cjVigY5q…, speed: 1.15 }

We also tried `language_presets`. It accepts writes and stores `null`.

## Why the model choice matters this much

Same sentence, same voice, same settings, plain `POST /v1/text-to-speech` —
no Agents, no telephony. Each render transcribed with an independent engine
(Deepgram nova-2). "Defective" = the audio contains words that are not in the
input text.

    language   eleven_multilingual_v2   eleven_turbo_v2_5   renders
    ru                   7/20                 19/20            20
    uk                    8/8                  5/8              8
    en                    8/8                  8/8              8
    pl                   20/20                 7/15            20

Russian on `multilingual_v2`: **7 usable renders out of 20.** On `turbo`: 19/20.
Fisher exact test on the Russian pair: `p = 0.000137`.

And the ordering **reverses between languages**: Ukrainian is the opposite way
round, Polish is the opposite way round again. There is no single model that is
correct for all four. Per-language model selection is not a nice-to-have for us —
it is the only configuration in which all four languages are usable, and
`supported_voices.model_family` is exactly the field your API offers for it.

## What we are asking

1. Does `model_family` in `supported_voices` do anything today? If it is not
   implemented for Agents, please say so plainly — we will stop building on it
   and pick the least-bad single model instead of shipping a config that reads
   as working and is not.
2. If it is implemented, what triggers it? We never call `language_detection`
   for non-Polish languages (the tool rejects any value other than the agent's
   base language with "Invalid language"), so the agent switches language by
   simply writing in it. If `model_family` only activates via that tool, then
   the two features are mutually exclusive and neither is usable.
3. `main_language` and `multivoice.used` appear to be derived from the same
   signal. If that signal is the `language_detection` tool call rather than the
   audio, both fields are wrong for every conversation like the one above.

Happy to provide more conversation IDs — we have three with the same pattern.
