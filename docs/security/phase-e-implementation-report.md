# GetRido — Faza E: agenci AI, narzędzia i kontrolowane uczenie

## Status

**PASS lokalnie dla zabezpieczeń Fazy E / NO-GO dla uruchomienia produkcyjnej telefonii i całego portalu.** Testy kontraktowe, składnia zmienionych funkcji, `typecheck`, produkcyjny `build` i `git diff --check` przechodzą. Telefonia live oraz wszystkie narzędzia zapisujące pozostają celowo zablokowane. Migracja nie została wykonana runtime, ponieważ lokalny Docker/Supabase jest niedostępny.

Nie jest to deklaracja pełnego bezpieczeństwa. Zmiany zamykają potwierdzone ścieżki wspólnego sekretu, podszywania się pod providera, produkcyjnych skutków trybu testowego, automatycznej publikacji wiedzy i częściowego zapisu analizy. Testy stagingowe dwóch tenantów, metering kosztów i zaufany bootstrap połączenia nadal są obowiązkowe.

## Co naprawiono

- Wycofano `VOICE_INTERNAL_SECRET` i `VOICE_LLM_TOKEN` z całego kodu funkcji. Token w URL jest jawnie odrzucany.
- Dodano HMAC capability ważne maksymalnie 300 sekund, związane jednocześnie z `provider_id`, `config_id`, `call_id`, `persona_key`, zakresem, czasem i nonce. Zmiana któregokolwiek pola unieważnia podpis.
- Łańcuch `voice-agent-llm → voice-agent-chat → voice-agent-tools` deleguje coraz węższe capability. `voice-call-postprocess` po weryfikacji podpisu surowego body wydaje osobne capability tylko do `voice.call.analyze`.
- Każde wywołanie JWT użytkownika wymusza dry-run. Klient nie może wyłączyć dry-run przez body. `create_booking` i `create_order` zwracają `503` przed historycznym kodem zapisu.
- Dodano cztery niezależne warstwy zatrzymania live: ogólny feature flag, globalny kill switch, kill switch i skończone limity agenta oraz wdrożeniowe `AI_VOICE_LIVE_EXECUTION_ENABLED=false`.
- Zwolnienie globalnego lub tenantowego kill switcha nie jest możliwe przez bezpośredni zapis browser/service-role. Wymaga odpowiednio audytowanego RPC system-admin albo manager/admin, uzasadnienia, `correlation_id` i transakcyjnego markera.
- Klient nie może przekazać system promptu, modelu, narzędzi ani uprawnień. Historyczny `custom_prompt_override` nie jest ładowany do runtime, dopóki treść nie przejdzie wersjonowania i zatwierdzenia.
- Stała polityka promptu traktuje rozmowę, kontekst firmy i wiedzę jako niezaufane dane. Egzekutor narzędzi ponownie sprawdza tenant i uprawnienia; wynik modelu nie jest autoryzacją.
- Dodano fail-closed rate limiting dla symulacji, czatu, LLM bridge, narzędzi, post-processingu, analizy, generatora skryptów i wykonania GetRido AI. Subject pochodzi z JWT lub zweryfikowanego provider/config, nie z dowolnego `userId` w body.
- Dodano limity rozmiaru surowego JSON, także dla transferu chunked bez wiary w `Content-Length`.
- Podpis ElevenLabs jest liczony na dokładnym raw body, ma ograniczone okno czasowe i atomowy claim `security_webhook_events`. Replay nie uruchamia analizy ponownie.
- Analiza rozmowy zapisuje `voice_calls`, `voice_transcripts`, `voice_call_outcomes`, wersjonowane propozycje i audyt w jednej transakcji RPC. Unikalność obejmuje event ElevenLabs oraz idempotency key.
- Wyniki analizy mogą utworzyć wyłącznie `pending_review`. Człowiek może zatwierdzić lub odrzucić tenantową wersję; osobny service-only publisher ponownie sprawdza uprawnionego aktora i tworzy niezmienną opublikowaną wersję z audytem.
- Dodano atomowy claim/lease/finalize i append-only ledger dla przyszłych narzędzi write, z klasami `read_only`, `write_low`, `write_high`, `financial`, `legal`, `destructive`, fingerprintem, idempotencją, limitami i audytem.
- Panel AI nie sugeruje już, że sam URL Custom LLM uruchamia bezpieczną telefonię. Użytkownik może testować dry-run oraz odbierać uprawnienia, ale nie może sam aktywować live ani zwiększać zakresu narzędzi.

## Ataki możliwe przed zmianą

Wyciek jednego wspólnego sekretu pozwalał wywołać funkcje jako dowolny provider, a trwały token w URL mógł trafić do historii, proxy i logów. Body mogło wybrać tenant lub wyłączyć test mode. Model mógł dostać klientowy prompt i wywołać historyczny kod zapisu. Równoległe webhooki mogły pozostawić częściowo zapisane rozmowy, a wygenerowana „wiedza” nie miała kanonicznego, audytowanego workflow akceptacji i rollbacku.

## Główne zmienione pliki

- `.env.example`
- `src/components/ai-sales/VoiceAgentPanel.tsx`
- `supabase/functions/_shared/aiSecurity.ts`
- `supabase/functions/_shared/security.ts`
- `supabase/functions/voice-agent-chat/index.ts`
- `supabase/functions/voice-agent-tools/index.ts`
- `supabase/functions/voice-agent-llm/index.ts`
- `supabase/functions/voice-call-postprocess/index.ts`
- `supabase/functions/voice-call-analyze/index.ts`
- `supabase/functions/voice-agent-simulate/index.ts`
- `supabase/functions/ai-generate-call-scripts/index.ts`
- `supabase/functions/getrido-ai-execute/index.ts`
- `scripts/security/phase-e-*.test.mjs`
- `package.json`
- `docs/security/phase-a-edge-function-inventory.md`

Dodano migrację `20260801150000_phase_e_ai_control_plane.sql`. Nie została uruchomiona na żadnej bazie.

## Testy

- `npm run test:security:phase-e`: **PASS, 54/54**.
- parser składni Node dla ośmiu zmienionych plików Edge/shared: **PASS**.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `git diff --check`: **PASS**.
- runtime SQL/RLS dwóch tenantów: **NIEWYKONANY** — brak lokalnego Dockera/Supabase.
- prawdziwe połączenie, SMS, e-mail, płatność i KSeF: **celowo niewykonane**.

Build zachowuje wcześniejsze ostrzeżenia o mieszanym imporcie `WorkshopEmployeesPage`, starych danych Browserslist i dużych chunkach; nie są nową regresją Fazy E.

## Celowo zablokowane funkcje i poprawne przywrócenie

1. **Telefonia live / Custom LLM:** pozostawić `AI_VOICE_LIVE_EXECUTION_ENABLED=false`. Przywrócić dopiero po zbudowaniu zaufanego call-bootstrapu, który mapuje podpisane źródło na provider/config, tworzy `call_id`, wydaje i odświeża krótkotrwałe capability bez URL/logów oraz obsługuje transfer i awarię.
2. **Tworzenie klienta, pojazdu, terminu i zlecenia przez AI:** podłączyć każde narzędzie do `phase_e_claim_ai_tool_execution`, jednej tenantowej transakcji domenowej i `phase_e_finalize_ai_tool_execution`. Idempotency key ma pochodzić z orchestration, a koszt i klasa ryzyka z serwerowego katalogu narzędzi.
3. **SMS/e-mail z rozmowy:** dodać odrębne capability, zgodę/podstawę kontaktu, allowlistę szablonów i odbiorców, quota ledger, idempotencję i audyt. Nie przywracać wspólnego sekretu.
4. **Indywidualny prompt firmy:** importować jako draft/proposal, przeprowadzić human review i test regresyjny, opublikować przez audytowany publisher. Runtime powinien czytać wyłącznie najnowszą opublikowaną wersję; obecny `custom_prompt_override` pozostaje wyłączony.
5. **Uczenie z rozmów:** analiza już tworzy propozycje, ale opublikowane wersje nie są jeszcze źródłem runtime. Dodać tenantowy adapter retrieval, testy A/B i rollback; model nigdy nie może sam wywołać publishera.
6. **Aktywacja agenta i zwiększenie limitów:** wdrożyć reautoryzowany endpoint control-plane, który ustala aktora z JWT, sprawdza managera/admina, wymaga uzasadnienia i zapisuje audyt. Nie aktualizować uprzywilejowanych pól bezpośrednio z przeglądarki.

## Ryzyko pozostałe i działania ręczne

- Wygenerować nowy losowy `AI_CAPABILITY_SIGNING_SECRET` (minimum 32 bajty) wyłącznie w sekretach Edge. Obrócić `ELEVENLABS_WEBHOOK_SECRET`. Usunąć po użyciu zależności wszystkie wartości `VOICE_INTERNAL_SECRET` i `VOICE_LLM_TOKEN` z paneli oraz rotować je, jeśli kiedykolwiek były wdrożone.
- Przed migracją stagingową wykryć duplikaty `(provider_id, trim(elevenlabs_conversation_id))`. Nie usuwać automatycznie: wykonać backup i ręcznie scalić/oznaczyć niejednoznaczne rekordy, inaczej unikalny indeks bezpiecznie zatrzyma migrację.
- Na lokalnym/stagingowym Supabase wykonać testy: A→A, A→B, anon, zmiana provider/config/call/persona, wygasłe capability, dwa równoległe webhooki, replay, częściowy błąd transakcji, review przez obcy tenant i publikacja bez zatwierdzenia.
- Zbudować rzeczywisty metering LLM/TTS/STT, limit współbieżnych rozmów i trwałą kolejkę. Obecne limity narzędzi są fundamentem, ale nie rozliczają całego kosztu rozmowy; dlatego live nie może być włączone.
- Ustalić podstawę prawną kontaktu, komunikat o AI/nagrywaniu, retencję, usuwanie i dostęp do transkrypcji przed pierwszym połączeniem.
- Nie ustawiać `AI_VOICE_LIVE_EXECUTION_ENABLED=true`, nie zwalniać globalnego kill switcha i nie zwiększać limitów agenta, dopóki powyższe testy oraz Faza F nie przejdą.

## Wynik fazy

**PASS dla lokalnego fail-closed hardeningu. Produkcyjna funkcja głosowa: zablokowana zgodnie z założeniem. Globalna decyzja publikacyjna: NO-GO.**
