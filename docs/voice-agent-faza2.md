# FAZA 2 — przepisanie: zapis po rozłączeniu

Spec. **Nie ma tu kodu i nie ma go pisać przed akceptacją.**

Zasada: **w trakcie rozmowy agent tylko ZBIERA. Cały zapis startuje po rozłączeniu.**

---

## Dlaczego, na własnych pomiarach

Atomowe przejęcie rozmowy (wdrożone 05.08) usuwa duplikaty w bazie, ale **nie usuwa
duplikatów żądań** — a te szkodzą także wtedy, gdy nic nie zapisują:

| Objaw | Dowód |
|---|---|
| duplikat narzuca czas gorszej kopii | tura 24 s: `first_text` 1554 ms i 4954 ms, ElevenLabs zmierzył `ttfb` **5,81 s** — czekał na wolniejszą |
| duplikat przerywa turę przed `end_call` | tura 112 s: `interrupted: true`, ElevenLabs zarejestrował **zero** wywołań narzędzi, mimo `client_tool_requested: end_call` w obu żądaniach |
| duplikat prawdopodobnie skleja audio | w transkrypcie zlepki „Dobrze rozumiem. Rozumiem — chodzi o…", dokładnie na turach z duplikatem |
| tura z zapisem jest długa | 8316 ms (05.08 02:05), 15218 ms (05.08 17:56) wobec ~1700 ms tury bez narzędzi |

**Tura tylko-do-odczytu jest na to odporna z definicji.** Duplikat czegoś, co nic nie
zmienia, jest nieszkodliwy. Nie walczymy z ElevenLabs — przestajemy być podatni.

### Duplikaty są ZAMIERZONE — potwierdzone oficjalnie

Blog ElevenLabs o silniku orkiestracji: orkiestrator zmniejsza odczuwalną latencję,
przewidując koniec wypowiedzi użytkownika, i w niektórych przypadkach skutkuje to
wieloma żądaniami generacji LLM z tym samym kontekstem w jednej turze.

To projekt platformy, nie usterka. **Nigdy tego nie wyłączymy.** Trzy próby znalezienia
wyłącznika (`speculative_turn`, `turn_eagerness`, hipoteza retry) szukały czegoś, co
nie istnieje. FAZA 2 przestaje być optymalizacją i staje się jedyną drogą.

### Dodatkowy zysk: definicje narzędzi to gruby kawałek promptu

Pomiar prompt cachingu z 05.08 19:42 pokazał cachowany prefiks **9427 tokenów** —
ponad trzy razy więcej niż sam prompt systemowy (~2650). Różnicę stanowią definicje
narzędzi przekazywane modelowi w każdym żądaniu.

Usunięcie `create_booking` i `create_order` z listy narzędzi modelu daje więc większy
zysk, niż zakładaliśmy: to nie tylko krótsza tura bez zapisów, ale i wyraźnie mniejszy
kontekst wejściowy. Zostaje `check_availability` i `end_call`.

---

## Dziesięć zasad wyprowadzonych z błędów

Każda ma za sobą konkretną awarię. Wpisane tu, żeby nie powtórzyć ich w nowym kodzie.

1. **ElevenLabs PODMIENIA ostatnią wypowiedź i odpala turę od nowa.** Dowód: 14 żądań
   na 9 tur, identyczna liczba wiadomości (5/5, 9/9, 17/17, 19/19) przy różnych skrótach
   treści w 3 z 4 przypadków. `speculative_turn: false` i `turn_eagerness: "normal"`
   tego nie zatrzymały. **Architektura ma być odporna, nie walcząca.**
2. **`maybeSingle()` tam, gdzie duplikaty są możliwe, to błąd.** Przy więcej niż jednym
   wierszu PostgREST zwraca BŁĄD, nie wiersz — bez odebrania `error` wygląda to jak brak
   dopasowania i kod wstawia kolejny duplikat, przez co następne sprawdzenie pasuje do
   jeszcze większej liczby wierszy. Tak powstały 3 rezerwacje i 6 SMS-ów.
   **Zawsze `limit(1)` + tablica.**
3. **Model schowa tekst w każdym polu, które dostanie.** Pożegnanie trafiło do
   `system__message_to_speak` zamiast do mowy, bo takie pole istniało w schemacie.
   **Nie dawać modelowi pól, w których może schować to, co ma powiedzieć.**
4. **Model relacjonuje to, co robi.** Cztery kolejne wersje zakazu nie usunęły
   „Teraz tworzę rezerwację", bo model faktycznie ją tworzył — zakaz był sprzeczny
   z rzeczywistością. **Jedyny sposób na „nie mów, że tworzysz rezerwację" to jej
   nie tworzyć.** Ten objaw znika sam wraz z FAZĄ 2.
5. **Klucz idempotencji: `conversation_id`. Jedno miejsce. Nigdy telefon + data.**
   Klucz telefon+data+godzina powodował, że każdy kolejny test zderzał się z poprzednim:
   dedup zwracał wczorajszą rezerwację, `create_order` widział wczorajsze zlecenie
   i nie powstawało nic.
6. **Daty w `Europe/Warsaw`.** Runtime chodzi w UTC; między północą a 2:00 lokalnego
   data UTC jest o dzień wcześniejsza — czyli dokładnie w porze testów.
7. **`dynamic_variables` — zawsze wartość zastępcza, nigdy `null`.** Brak jednej zmiennej
   użytej w prompcie = ElevenLabs odrzuca inicjację i rozmowa startuje na konfiguracji
   domyślnej.
8. **Webhook staje się nośny → cron rekoncyliacyjny PRZED przełączeniem.** Dziś 3 z 7
   rozmów miało `elevenlabs_conversation_id = NULL`. Teraz to koszt analizy; po
   przełączeniu byłby to koszt klienta.
9. **Dopasowanie POPRAWIA dane, nigdy nie WSTRZYMUJE zapisu.** Zapis następuje zawsze,
   gdy komplet jest zebrany.
10. **Budżet 300 ms na inicjację; przy przekroczeniu pusty snapshot, nie błąd.**
    Rozmowa bez snapshotu jest gorsza. Rozmowa, która się nie zaczęła, jest stracona.
11. **Zakaz musi być WYKONALNY i nie może cytować tego, czego zakazuje.**
    Dwie odmiany tego samego błędu, obie potwierdzone:
    *niewykonalny* — „nie witaj się drugi raz" nie mogło zadziałać, bo model nie widzi
    pierwszej wiadomości (jest usuwana z kontekstu, Anthropic wymaga startu od użytkownika);
    *podpowiadający* — lista zakazanych zwrotów cytowała „już sprawdzam" dosłownie.
    Przed dodaniem reguły sprawdź: czy model widzi to, czego reguła dotyczy, i czy da się
    ją opisać bez cytowania zakazanej frazy.
12. **Połknięty `error` z zapytania to niewidoczna awaria.**
    `const { data } = await …` bez `error` daje `null` nie do odróżnienia od braku
    dopasowania. Trzy incydenty: `maybeSingle()` przy wielu wierszach (3 rezerwacje,
    6 SMS-ów), nieistniejące kolumny `address`/`city` w `service_providers` (SMS bez
    nazwy firmy przy poprawnych danych), nieodebrany błąd zapisu do grafiku.
    **Zawsze odbieraj `error` i loguj go.** W `voice-call-commit` błąd zapytania musi
    przerwać transakcję, a nie po cichu zmienić wynik.

**Kontrola przed każdym commitem do tego modułu:** przejdź listę i wskaż, którą zasadę
zmiana realizuje albo mogłaby złamać. Pięć klas sprzeczności w prompcie v1 powstało
dlatego, że nikt tego nie robił.

---

## Co ZNIKA

| Element | Gdzie dziś | Dlaczego znika |
|---|---|---|
| **dedup po telefon+data+godzina** | `voice-agent-tools`, `create_booking` | zły klucz (zasada 5). Zastąpiony idempotencją po `conversation_id` w jednym miejscu |
| **deterministyczne `create_order` wewnątrz `create_booking`** | `create_booking`, wywołanie HTTP do samego siebie | zlecenie powstaje w `voice-call-commit`, w jednej transakcji z resztą. Znika też wywołanie funkcji przez samą siebie i jego `AbortSignal.timeout(10_000)` |
| **heurystyka powiązania po numerze telefonu** | `voice-call-analyze` (okno 60 min, `norm9`, dopasowanie klienta) | zastąpiona `conversation_id`. Heurystyka myliła się w ~60% rozmów |
| **rozsiana idempotencja** | `conversationCall?.linked_entity_id` w `create_booking`, dedup po `booking_id` w `create_order`, sprawdzenie SMS po `appointment_id`, sprawdzenie wpisu w grafiku, atomowe przejęcie rozmowy | **pięć różnych mechanizmów w trzech miejscach.** Jedna blokada w `voice-call-commit` po `conversation_id` |
| **`voice_booking_claim`** | wartownik w `linked_entity_type` | łata na wyścig, który przestaje istnieć |
| **zapis w trakcie tury** | `create_booking`, `create_order` jako narzędzia modelu | cały powód FAZY 2 |

Do czasu przełączenia **wszystko powyżej zostaje na produkcji i działa** — usuwamy
dopiero w kroku 7 kolejności z `voice-agent-faza1.md`.

## Co zostaje NIETKNIĘTE

- **`voice-agent-llm`** — proxy, autoryzacja, parser znacznika RIDO, sonda, przekazywanie
  `client_tools`, pomiary. Kontrakt z ElevenLabs się nie zmienia.
- **`workshop-send-sms`** i cały tor SMS — zmienia się tylko **kiedy** jest wołany
- **logika grafiku** — `station_id` z pierwszego wolnego stanowiska,
  `WorkshopScheduler` mapujący `station_id → scheduled_station_id`. Przenosi się bez zmian
- **keep-warm** — dwa crony co minutę, potrzebne tym bardziej
- **`scripts/diagnose-call.sh`** — sekcja 5 (stan bazy) zyskuje na znaczeniu
- **post-call webhook ElevenLabs** — ten sam endpoint, HMAC, `agent_id` → tenant
- **`voice-call-analyze`** — uczenie i destylacja reguł zostają; traci tylko
  fallback po telefonie
- **canary, `verify_jwt=false` + autoryzacja w kodzie, `getSecret`** — bez zmian
- **KSeF, płatności, faktury, fiskalizacja, pozostali agenci** — nie dotykamy

---

## Kontrakt `voice-call-commit`

Nowa akcja. Jedno wejście, jedno wyjście, jedna transakcja.

### Wejście
```jsonc
{
  "action": "commit_call",
  "conversation_id": "conv_…",     // KLUCZ IDEMPOTENCJI, wymagany
  "provider_id": "…",
  "persona_key": "workshop_secretary",
  "caller_id": "+48519474583",     // z system__caller_id — fakt, nie ASR
  "transcript": [ { "role": "user|agent", "message": "…" } ],
  "extracted": {                    // z _shared/voiceExtraction.ts
    "complaint": "…",               // SŁOWA KLIENTA, zwięźle
    "date": "2026-08-06", "time": "09:00",
    "first_name": "…", "last_name": "…", "phone": "…",
    "brand": "…", "model": "…", "plate": "…",
    "confidence": { "plate": "low" }
  }
}
```

### Wyjście
```jsonc
{
  "ok": true,
  "status": "committed | duplicate | queued",
  "conversation_id": "conv_…",
  "order_id": "…", "order_number": "ZLP-08/2026-00X",
  "booking_id": "…", "calendar_row_id": "…", "station_id": "…",
  "sms": { "sent": true, "type": "booking_confirmation_ai" },
  "matched": { "client": "by_phone", "vehicle": "by_plate", "needs_review": false },
  "queued_reason": null            // wypełnione tylko przy status: "queued"
}
```

### Zachowanie

- **Idempotencja po `conversation_id`** — jedno miejsce, gwarantowane unikalnym indeksem
  `voice_calls_conversation_uniq` (założony 05.08). Powtórka zwraca `duplicate`
  z tymi samymi identyfikatorami. Bez sprawdzania „czy istnieje, potem wstaw".
- **Transakcja.** Klient Supabase w Deno nie ma transakcji wielozapytaniowych, więc
  całość jako funkcja SQL `SECURITY DEFINER`, wołana przez `admin.rpc('voice_commit_call', …)`.
  Rollback obejmuje: rezerwację, wpis w grafiku, klienta, pojazd, zlecenie, powiązanie
  transkryptu. **SMS jest POZA transakcją** — wysyłany po jej sukcesie, bo nie da się
  go wycofać.
- **Kolejność w transakcji:** klient → pojazd → rezerwacja → wpis w grafiku (`station_id`)
  → zlecenie (`booking_id`) → powiązanie `voice_calls.linked_entity_*`.
- **`status: "queued"`** wyłącznie gdy zapisu NIE DA SIĘ wykonać: brak terminu,
  rozmowa urwana przed kompletem, klient się rozmyślił. **Nigdy z powodu „nazwisko
  brzmi dziwnie"** (zasada 9).

### Dopasowanie (`_shared/voiceReconcile.ts`)

```
a) telefon — system__caller_id ma PIERWSZEŃSTWO nad ASR → workshop_clients
   trafienie -> imię, nazwisko, historia Z BAZY zamiast z ASR
b) rejestracja → workshop_vehicles
   trafienie -> marka, model, właściciel, historia Z BAZY
c) rejestracja wskazuje pojazd znanego klienta, telefon się NIE zgadza
   -> dane pojazdu wygrywają, needs_review = true, ale ZAPISUJEMY
d) nic nie pasuje -> nowy klient z danymi z ASR
```

Uzasadnienie z danych: w pięciu rozmowach testowych ASR podał **pięć różnych nazwisk**
(Macioskowski, Mosleczko, Noszeczkow, Moszeczkow, Mosaczkowski) i **dwa błędne telefony
z pięciu**. `system__caller_id` jest faktem z sygnalizacji SIP, nie zgadywanką.

---

## Co zostaje z `voice-agent-tools`

Po przełączeniu funkcja **tylko czyta**. Traci klucz service-role do zapisu w ścieżce
rozmowy — to także zysk bezpieczeństwa przy `verify_jwt = false`.

| Akcja | Los |
|---|---|
| `check_availability` | **zostaje** — jedyny wyjątek, dla terminów spoza snapshotu, z jawną zapowiedzią „Chwileczkę, sprawdzę dalsze terminy". Musi być **jawnie dopisany do bloku ZAKAZ RELACJONOWANIA**, inaczej prompt zaprzecza sam sobie |
| `create_booking` | znika z narzędzi modelu; logika wnętrza (stanowisko, wpis w grafiku, token) przenosi się do `voice_commit_call` |
| `create_order` | jw. |
| `lock_slot` | **nowa, jedyny zapis w trakcie** — `EdgeRuntime.waitUntil`, bez `await`, idempotentna po `conversation_id`, TTL 15 min, wygasanie leniwe. Zapis po rozmowie **nie zakłada, że blokada istnieje** |

Rozważane i **odrzucone**: przeniesienie `check_availability` do osobnej funkcji.
Zysk żaden, a `diagnose-call.sh` i pomiary trzeba by przepisać.

---

## Kolejność (bez zmian wobec zaakceptowanej)

1. FAZA 1A — korelacja ✅ wdrożone 05.08, czeka na potwierdzenie telefonem
2. FAZA 1B — webhook inicjujący + snapshot
3. FAZA 1C — zero odczytów per tura + prompt caching
4. **cron rekoncyliacyjny + alert** ← przed 6 i 7
5. **kolejka weryfikacji w panelu** ← przed 6 i 7
6. FAZA 2 — `voice-call-commit`
7. wyłączenie narzędzi zapisujących

Kroki 4 i 5 są przed 6 i 7 celowo (zasada 8).

## Kryteria odbioru FAZY 2

- rozmowa z kompletem danych → zlecenie + wpis w grafiku + SMS + transkrypt, **zawsze**
- powtórzony webhook → `duplicate`, zero nowych wierszy
- świadomie zgubiony webhook → odzyskany przez cron w ≤ 15 min
- `diagnose-call.sh` sekcja 6: zero czerwonych flag na czystej rozmowie
- tura poniżej 1,2 s, zero narzędzi zapisujących w osi czasu
