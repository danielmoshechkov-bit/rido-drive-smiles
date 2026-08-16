# Numer per warsztat — projekt przed kodowaniem

Stan wejściowy (zmierzony, nie założony):

- numer stacjonarny: **1,23 zł brutto/mc, aktywacja 0 zł**, 8 824 wolnych
- limity API: odczyty **1/s**, zapisy **1/10 s**, przekroczenie = 429
- jedno konto SIP obsługuje wiele numerów (`Sip.voipNumbers` to tablica)
- `VoipNumber.incomingCallLimit` = 0 i **tylko do odczytu** — limitu rozmów
  po stronie operatora nie ustawimy
- webhook inicjujący ElevenLabs **niesie `called_number`** (sprawdzone w logach)

---

## 0. Decyzja, która zmienia punkt 3: PULA KUPOWANA Z WYPRZEDZENIEM

Zanim opiszę obsługę awarii w połowie zakupu — proponuję **usunąć zakup
z <u>ścieżki aktywacji</u>**.

Numer kosztuje 1,23 zł miesięcznie. Utrzymywanie **pięciu numerów w zapasie
kosztuje 6,15 zł/mc** — mniej niż jedna kawa. W zamian:

| | zakup przy aktywacji | pula z wyprzedzeniem |
|---|---|---|
| czas aktywacji | ≥ 20 s (POST 1/10 s ×2) | ~2 s (PUT + ElevenLabs) |
| co się psuje przy awarii | **zakupiony numer bez agenta** | nic — numer już był nasz |
| ryzyko podwójnego zakupu | realne (timeout na POST) | brak w ścieżce klienta |
| skąd bierze się numer | z API operatora | z naszej tabeli |

Zakup przenosi się do **zadania w tle**, które uzupełnia pulę do progu
(np. „zawsze ≥ 5 wolnych"). Jeśli tam coś padnie, nie ucierpi żaden warsztat —
awaria dotyczy zapasu, nie klienta.

**Rekomendacja: pula.** Poniżej opisuję obie ścieżki, bo uzupełnianie puli to
ten sam przepływ, tylko bez klienta czekającego po drugiej stronie.

---

## 1. Tabele

```sql
-- NUMERY: jeden wiersz na numer, który należy do nas u operatora.
CREATE TABLE public.voice_numbers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number        text UNIQUE NOT NULL,        -- 48221015896, same cyfry
  provider_id         uuid REFERENCES public.service_providers(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'kupowany',
  -- kupowany | wolny | przypisywany | aktywny | wymaga_uwagi | zwalniany | zwolniony
  supervoip_number_id text,        -- /api/numbers/{id}   — pozycja z puli operatora
  supervoip_voip_id   text,        -- /api/voip_numbers/{id} — nasza instancja numeru
  supervoip_sip_id    text,        -- /api/sips/{id}      — konto z trunkiem
  elevenlabs_phone_id text,
  elevenlabs_agent_id text,
  region              text,
  koszt_miesieczny    numeric(8,2),
  kupiony_at          timestamptz,
  przypisany_at       timestamptz,
  zwolniony_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Jeden AKTYWNY numer na warsztat. Indeks częściowy, nie trigger:
-- warunek egzekwuje baza, a nie kod, który ktoś kiedyś ominie.
CREATE UNIQUE INDEX voice_numbers_jeden_aktywny_na_warsztat
  ON public.voice_numbers (provider_id) WHERE status = 'aktywny';

CREATE INDEX voice_numbers_lookup ON public.voice_numbers (phone_number)
  WHERE status IN ('aktywny', 'przypisywany');

-- HISTORIA: kto, kiedy, jaki numer dostał. Dopisywana, nigdy nadpisywana.
CREATE TABLE public.voice_number_events (
  id            bigserial PRIMARY KEY,
  number_id     uuid REFERENCES public.voice_numbers(id) ON DELETE CASCADE,
  phone_number  text NOT NULL,       -- powtórzone, żeby historia przeżyła usunięcie numeru
  provider_id   uuid,
  zdarzenie     text NOT NULL,       -- kupiony | przypisany | zwolniony | awaria | adoptowany
  status_przed  text,
  status_po     text,
  aktor         text,                -- 'cron' | 'admin:<uuid>' | 'warsztat:<uuid>'
  szczegoly     jsonb NOT NULL DEFAULT '{}',
  at            timestamptz NOT NULL DEFAULT now()
);

-- KOLEJKA ZADAŃ: aktywacja jest asynchroniczna, więc musi mieć stan.
CREATE TABLE public.voice_number_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ            text NOT NULL,      -- aktywacja | uzupelnienie_puli | zwolnienie | rekoncyliacja
  provider_id    uuid,
  number_id      uuid REFERENCES public.voice_numbers(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'oczekuje',   -- oczekuje|w_toku|zrobione|wymaga_uwagi
  krok           text,               -- ostatni UKOŃCZONY krok — stąd wznawiamy
  proby          integer NOT NULL DEFAULT 0,
  nastepna_proba timestamptz NOT NULL DEFAULT now(),
  ostatni_blad   text,
  dane           jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX voice_number_jobs_do_wziecia
  ON public.voice_number_jobs (nastepna_proba)
  WHERE status IN ('oczekuje', 'w_toku');
```

RLS: wszystkie trzy tabele włączone; odczyt admin (`has_role(auth.uid(),'admin')`),
plus warsztat widzi **swój** wiersz w `voice_numbers` (`provider_id` przez
istniejącą ścieżkę uprawnień). Zapis tylko service_role.

---

## 2. `called_number` → `provider_id` w `voice-agent-init`

Dziś: `agent_id` → `voice_agent_configs` → `provider_id`.
Ma być: `called_number` → `voice_numbers` → `provider_id`, z **fallbackiem**
na dzisiejszą ścieżkę.

Kolejność jest istotna i jest odwrotna do „naturalnej": numer ma pierwszeństwo,
bo to on identyfikuje warsztat; `agent_id` jest wspólny dla wszystkich i
identyfikuje tylko personę.

```
1. called_number z ładunku (also: call.to_number, agent_number) → tylko cyfry
2. SELECT provider_id FROM voice_numbers
     WHERE phone_number = $1 AND status = 'aktywny'
3. trafienie      → provider_id, droga = 'numer'
   brak trafienia → dotychczasowa ścieżka agent_id, droga = 'agent_id'
   brak obu       → pusty snapshot (jak dziś — to POPRAWNA odpowiedź)
```

**Rozpoznanie wydzielone do czystej funkcji** `rozpoznajWarsztat(body, szukaj)`
w `_shared/voiceRozpoznanieWarsztatu.ts` — żeby dało się je testować bez bazy
i bez telefonu. Testy: numer znany, numer nieznany, brak `called_number`,
numer w innym formacie (+48 / 0048 / 9 cyfr), numer nieaktywny.

**Regresja przed wdrożeniem:** obecny numer testowy MUSI trafić w gałąź
`agent_id` dopóki nie ma go w `voice_numbers`, a po dodaniu — w gałąź `numer`,
z tym samym `provider_id`. Sprawdzam to zapytaniem do bazy przed i po,
plus jeden scenariusz symulacji (0,15 zł). Log dostaje pole `droga`,
żeby po wdrożeniu było widać, którą ścieżką idą prawdziwe rozmowy.

Koszt: jedno zapytanie po indeksie unikalnym, dokładane do istniejącego
`Promise.all` — nie wydłuża ścieżki o osobną rundę.

---

## 3. Aktywacja — asynchroniczna, z wznawianiem

### Przepływ

```
warsztat klika  →  INSERT voice_number_jobs (typ='aktywacja', status='oczekuje')
                →  odpowiedź NATYCHMIAST: „numer będzie gotowy za chwilę"
cron co minutę  →  voice-numbers-worker bierze zadania z nastepna_proba <= now()
                →  wykonuje kroki od ostatniego UKOŃCZONEGO
                →  po ostatnim kroku: status='aktywny', powiadomienie
```

Kroki (wariant z pulą — bez zakupu w ścieżce klienta):

| # | krok | operacja | idempotentny? |
|---|---|---|---|
| 1 | `rezerwacja` | UPDATE wolnego numeru na `przypisywany` + `provider_id` | tak (warunek na status) |
| 2 | `konfiguracja` | `PUT /api/voip_numbers/{id}` — localConnection na nasze konto SIP, prefiks +48 | tak (PUT) |
| 3 | `import_11l` | `POST /v1/convai/phone-numbers` | **nie** — patrz niżej |
| 4 | `agent_11l` | `PATCH /v1/convai/phone-numbers/{id}` — przypisanie agenta | tak |
| 5 | `weryfikacja` | odczyt obu stron i porównanie z oczekiwanym | tak |
| 6 | `finał` | status `aktywny`, wpis do historii, powiadomienie | tak |

Wariant bez puli dokłada na początku kroki `wybor` (GET wolnych) i `zakup`
(POST) — to one niosą całe ryzyko finansowe.

### Awaria w połowie — decyzja: **WZNAWIAMY DO PRZODU, NIE WYCOFUJEMY**

Uzasadnienie:

1. Każdy krok po zakupie jest powtarzalny. Wycofanie oddawałoby opłacony
   zasób, żeby dojść do stanu, do którego prowadzi zwykłe ponowienie.
2. `DELETE /api/voip_numbers/{id}` to zapis niszczący. Automat, który kasuje
   przy błędzie, przy **fałszywym** błędzie (429 policzone jako awaria)
   skasuje działający numer płacącego warsztatu. To gorsze niż złotówka strat.
3. Pieniądze tracimy tylko wtedy, gdy **zapomnimy, że numer jest nasz**.
   Zabezpieczeniem nie jest więc wycofanie, tylko nietracenie śladu.

Cztery mechanizmy, które to realizują:

**a) Zapis intencji przed zapisem u operatora.** Wiersz `voice_numbers` ze
statusem `kupowany` i wybranym `/api/numbers/{id}` powstaje **przed** POST-em.
Nawet twardy zgon procesu zostawia ślad, co kupowaliśmy.

**b) Kontrola przed każdą próbą zakupu (najważniejsza).**
Klasyczny przypadek: POST doszedł, odpowiedź nie wróciła (timeout). Ponowienie
kupiłoby DRUGI numer. Dlatego przed każdą próbą — również pierwszą —
`GET /api/voip_numbers?number=/api/numbers/{id}`. Jeśli numer już jest nasz:
**adoptujemy, nie kupujemy**. Zamienia „podwójny zakup" w „ponowne odczytanie".

**c) Rekoncyliacja (cron, raz dziennie).** `GET /api/voip_numbers` i porównanie
z naszą tabelą:
- u operatora jest, u nas nie ma → **sierota**: dopisujemy jako `wolny`, alert;
- u nas jest, u operatora nie ma → **duch**: `wymaga_uwagi`, alert.

To jest odpowiedź na pytanie „czy straciliśmy pieniądze" liczbą, nie nadzieją.

**d) Ponawianie z odstępem i twardym końcem.** `nastepna_proba` rośnie
(1, 2, 4, 8, 16 min); po **5 próbach** zadanie → `wymaga_uwagi` + wpis do
`system_alerts`. Nigdy po cichu. Numer zostaje w naszej tabeli — jako `wolny`,
jeśli nie zdążył trafić do warsztatu, więc pójdzie do następnego zamiast leżeć.

**Krok 3 (`POST /v1/convai/phone-numbers`) jest jedynym nieidempotentnym po
stronie ElevenLabs** — dlatego przed nim zawsze `GET /v1/convai/phone-numbers`
i szukanie po numerze. Ta sama zasada, co przy zakupie.

**Warsztat widzi numer dopiero po kroku 5** — po odczycie z obu systemów
i porównaniu z oczekiwanym. Kod odpowiedzi nie jest dowodem; dwa razy już nas
to kosztowało przy ElevenLabs.

### Odstępy

Worker bierze **jedno zadanie na cykl** i śpi 1 s między wywołaniami API.
Przy zapisach 1/10 s to i tak wąskie gardło — dlatego pula, uzupełniana
w tle, jest lepsza niż kolejka klientów czekających na POST.

---

## 4. Limit rozmów równoczesnych — po naszej stronie

Operator nam tego nie da (`incomingCallLimit` read-only), ElevenLabs limituje
per agent, a agent mamy jeden. Zostaje nasza baza.

```sql
CREATE TABLE public.voice_active_calls (
  conversation_id text PRIMARY KEY,
  provider_id     uuid NOT NULL,
  phone_number    text,
  started_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_active_calls_prov ON public.voice_active_calls (provider_id, started_at DESC);
```

- `voice-agent-init` wstawia wiersz, `voice-call-postprocess` go usuwa.
- Liczymy **tylko wiersze z ostatnich 30 minut** — rozłączenie, o którym się
  nie dowiedzieliśmy, ma wygasać samo. Osobny cron sprząta starsze.
- Limit z `service_providers.voice_max_concurrent` (domyślnie 1).
- Zapytanie dokładane do istniejącego `Promise.all` w init: jeden `count`
  po indeksie, kilkanaście ms. Budżet 300 ms zachowany.

**Uczciwie o „pustej odpowiedzi z komunikatem zajętości":** webhook inicjujący
**nie może odrzucić połączenia**. Może tylko ukształtować rozmowę. Więc:
po przekroczeniu limitu zwracamy `rido_zajete: "tak"` i pusty snapshot, a prompt
dostaje jedną regułę: gdy `rido_zajete = tak`, powiedz jedno zdanie
(„Przepraszam, wszystkie linie są w tej chwili zajęte — proszę zadzwonić
za chwilę") i zakończ rozmowę. Zdanie idzie do wzorców w czterech językach,
tak jak komunikaty awarii.

To kosztuje kilka sekund TTS zamiast pełnej rozmowy — ale nie udaję, że
umiemy nie odebrać.

---

## 5. Czego nie robię teraz

Panelu warsztatu, instrukcji przekierowania, licznika minut. Ścieżka
techniczna najpierw.

## Kolejność wdrożenia

1. Tabele + RLS (migracja do akceptacji).
2. `rozpoznajWarsztat` + testy — czysta funkcja, bez wdrożenia.
3. Wpięcie w `voice-agent-init` z fallbackiem + regresja na numerze testowym.
4. Ręczne dodanie obecnego numeru do `voice_numbers` (bez API — już go mamy).
5. Limit rozmów równoczesnych.
6. Worker i kolejka.
7. Uzupełnianie puli w tle.

Punkty 1–5 nie wydają ani złotówki. Pierwszy zakup zdarza się w punkcie 7
i wtedy przechodzi przez `supervoipZakup.ts`.
