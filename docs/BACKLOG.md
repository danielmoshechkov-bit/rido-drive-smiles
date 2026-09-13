# Backlog — rzeczy odłożone świadomie

Kolejność jest decyzją, nie listą życzeń. Pozycja 1 jest pierwsza dlatego,
że kosztuje pieniądze przy pierwszym kliencie, który policzy, co dostał.

Spisane 10.09.2026.

---

## 0. Demo agenta na numerze CART78GARAGE

Landing agenta dla wszystkich branż, z numerem demonstracyjnym, pod który
każdy może zadzwonić. Zamiast odsłuchu w panelu — prawdziwa rozmowa.

Zabezpieczenia do zaprojektowania **przed** uruchomieniem, bo każda rozmowa
kosztuje nas minuty u ElevenLabs:

- najwyżej 2 rozmowy z jednego numeru dzwoniącego,
- limit dzienny na cały numer (rząd 50 rozmów),
- rozłączanie przy ciszy.

**Rozłączanie przy ciszy JUŻ DZIAŁA i jest globalne:**
`conversation_config.turn.silence_end_call_timeout = 20 s` (zapisane
w `docs/voice-agent-status.md`, pilnowane przez złoty stan i
`scripts/voice-restore-golden.mjs`).

⚠️ Ale to nie znaczy, że cisza jest darmowa. Naliczanie zaokrągla **w górę do
pełnych minut**, więc rozmowa, w której klient milczy przez 20 sekund, kosztuje
warsztat CAŁĄ MINUTĘ. Przy demo na naszym numerze zapłacimy za to my. Przy
zwykłym warsztacie płaci on — i nie wie za co, bo w historii zobaczy rozmowę
bez ani jednego zdania.

Do rozstrzygnięcia razem z demem: czy rozmowa bez wypowiedzi klienta ma się
w ogóle naliczać.

---

## 1. Cennik obiecuje limity, których system nie pilnuje

> **„Cennik obiecuje limity, których system nie pilnuje. Darmowy plan mówi
> 10 zleceń miesięcznie, a warsztat może założyć tysiąc."**

To jest **ryzyko handlowe, nie techniczne** — i wyjdzie przy pierwszym kliencie,
który policzy, co dostał.

### Stan zmierzony 10.09.2026

`has_feature` i `feature_limit` **istnieją w bazie i nie są wołane znikąd**.
Jedyne dwa wystąpienia w kodzie to komentarze w `billing-admin-features`.
`billing_plan_features` czytają cztery miejsca: panel administratora, dwie
funkcje administracyjne i strona cennika. **Nic w produkcie nie pyta tej tabeli
o to, co wolno warsztatowi.**

Pilnowane naprawdę:

| mechanizm | co rozstrzyga |
|---|---|
| `moze_pracowac(warsztat, linia)` | czy jest JAKIKOLWIEK aktywny plan w tej linii — warsztat vs agent |
| `check_usage` / `billing_consume` | cztery liczone jednostki: SMS, VIN, Rido AI, minuty |

**Pilnowane: 4 z 33 funkcji. Niepilnowane: 29** — w tym te, które różnicują
pakiety: „Zlecenia i terminarz" (ma limit w ośmiu planach, nikt go nie
sprawdza), „Połączenia równoczesne", „Numery telefoniczne", TecRMI, KSeF,
Fiskalizacja, Magazyn, Panel pracowników, Analityka rozmów, Dedykowany opiekun.

Wewnątrz jednej linii pakiety różnią się **ceną i listą na kartce**, a nie tym,
co program pozwala zrobić.

### Kolejność naprawy (ustalona, niezaczęta)

1. **Plan ustawia `voice_agent_configs.max_rozmow_rownoczesnie`.** Dziś limit
   jest egzekwowany (`voice-agent-init` na produkcji), ale wartość stoi w
   kolumnie per warsztat, domyślnie 1, i nic jej z planu nie ustawia. Agent Pro
   sprzedaje „3 połączenia równoczesne", a klient dostanie jedno.
2. **Jedna bramka w jednym miejscu** — hak `useFunkcjaPlanu(klucz)` na froncie
   i pomocnik w funkcjach brzegowych, oba wołające istniejące `has_feature`
   i `feature_limit`. Funkcje w bazie są gotowe; brakuje wywołań.
3. **Limit zleceń** (`workshop_orders`) — jedyny metered, który obiecujemy
   i którego nie liczymy.
4. Reszta boolean (TecRMI, KSeF, Magazyn, Panel pracowników) — po kolei.

---

## 2. Minuty agenta naliczają się w teorii, nie w praktyce

Bramka minut (`voice_odmowic_brak_minut`) jest wdrożona i wpięta, ale:

- flaga `billing_settings.voice_minuty_blokuja` = **false** (wdrożona świadomie
  martwa, żeby wdrożenie nikogo nie odcięło),
- **saldo i tak by nie spadło**: z 10 rozmów od 22.08.2026 **dziewięć nie ma
  śladu naliczenia** (`minutes_charged IS NULL`), a jedyna naliczona — rozmowa
  55-sekundowa z 07.09 — dostała **0 minut**.

Sprawdzone: kod naliczający JEST na produkcji (pobrany i porównany —
`voice-call-postprocess` 268 linii, wersja z gałęzi, zawiera
`voice_nalicz_minuty`), `voice-call-postprocess` demonstracyjnie się wykonuje
(każda rozmowa ma transkrypt i podsumowanie), a wiersze rozmów mają unikalne
`elevenlabs_conversation_id`. Naliczenie jest więc **pomijane wewnątrz funkcji**
— miejsce nieustalone.

**To musi być naprawione przed sprzedażą pakietu Agent**, bo za minuty płacimy
realnymi pieniędzmi u ElevenLabs. Kolejność: najpierw naliczanie, potem flaga.

---

## 2a. Przejście na klucz produkcyjny Stripe = cały cennik od nowa

Produkty i ceny w Stripe żyją **osobno w trybie testowym i produkcyjnym**.
Wszystko, co dziś stoi w `billing_plans` w kolumnach `stripe_product_id`,
`stripe_price_id`, `stripe_price_id_target`, `stripe_price_id_rok`
i `stripe_price_id_rok_target`, wskazuje na obiekty założone kluczem
**testowym** (`sk_test_…`) i po podmianie sekretu na produkcyjny przestanie
istnieć po stronie operatora.

Objaw, gdyby o tym zapomnieć: klient klika „Kup", `billing-checkout` wysyła
cenę, której w produkcyjnym Stripie nie ma, i dostaje odmowę na ostatnim kroku
— czyli dokładnie tam, gdzie najdrożej.

**Co zrobić w dniu przełączenia**, w tej kolejności:

1. podmienić `STRIPE_SECRET_KEY` (i `STRIPE_WEBHOOK_SECRET`) na produkcyjne,
2. **wyczyścić** wszystkie pięć kolumn Stripe w `billing_plans` — inaczej
   `ensureProduct` znajdzie stary identyfikator, dostanie od operatora błąd
   i zostawi plan bez ceny,
3. uruchomić synchronizację cennika (`billing-stripe-sync`) — przyciskiem
   w panelu admina (Płatności → Plany) albo wołając funkcję kluczem serwisowym,
4. sprawdzić, że każdy aktywny plan ma `stripe_price_id`, i dopiero potem
   wpuszczać klientów.

Odpowiedź funkcji podaje `tryb` („test" albo „produkcja") — to jest miejsce,
w którym widać, czy klucz naprawdę się zmienił.

---

## 3. ZAMKNIĘTE 10.09 — `ai-chat`. Ale to nie była jedyna taka funkcja.

`ai-chat` naprawiony (odmowa bez zalogowanego użytkownika + pobranie `rido_ai`).
Opis niżej zostaje jako zapis przyczyny.

### Co pokazał przegląd pozostałych funkcji

`node scripts/funkcje-bez-bramki.mjs` — **139 funkcji ma `verify_jwt = false`,
40 z nich woła płatne API, a 23 NIE SPRAWDZAJĄ, KTO JE WOŁA.**

Sprawdzone ręcznie, nie tylko heurystyką:

| funkcja | co robi bez pytania o tożsamość |
|---|---|
| `admin-ai-agent` | mimo nazwy — brak kontroli roli; agent AI z narzędziami na kluczu `service_role` |
| `ai-search` | bierze `userId` **z ciała żądania** i mu wierzy |
| `seo-agent` | brak kontroli; Anthropic plus pełny dostęp do bazy |

To ta sama klasa błędu, którą naprawiono 16.08 w `getrido-ai-execute`
(„zdezorientowany zastępca"): funkcja o wysokich uprawnieniach wykonuje
polecenia kogoś, kto ich nie ma.

Kolejność: najpierw te trzy, potem reszta z listy skryptu. Skrypt nadaje się
do CI — wtedy nowa funkcja bez bramki nie wejdzie niezauważona.

---

## 3a. Przyczyna (zapis historyczny) — `ai-chat`

`supabase/functions/ai-chat` woła **Anthropic** (`api.anthropic.com/v1/messages`)
i **Gemini** na naszych kluczach. Zasila Rido Wycenę (przez `useGetRidoAI`),
czyli funkcję `ai_labor_pricing` — obecną w siedmiu planach.

- `verify_jwt = false`,
- nagłówek `Authorization` jest **opcjonalny**: przy braku albo złym tokenie
  `userId` zostaje `null` i funkcja **idzie dalej**, zamiast odmówić,
- **nie pobiera żadnej jednostki** — ani `check_usage`, ani `billing_consume`.

W `ai_requests_log`: 361 wywołań ogółem, **56 bez zalogowanego użytkownika**
(13 w ostatnich 30 dniach). Kolumna `cost_estimate` nie jest wypełniana, więc
rachunku nie da się odczytać z logu — trzeba go zobaczyć u dostawcy.

Dla porównania `rido-help` (Pomoc AI przy naprawie) robi to poprawnie: pobiera
`rido_ai` przez `billing_consume`.

**Najtańsza naprawa, w tej kolejności:** odmowa przy braku użytkownika →
pobranie jednostki `rido_ai` tak samo jak w `rido-help` → dopiero potem reszta
bramkowania z pozycji 1.
