# Backlog — rzeczy odłożone świadomie

Kolejność jest decyzją, nie listą życzeń. Pozycja 1 jest pierwsza dlatego,
że kosztuje pieniądze przy pierwszym kliencie, który policzy, co dostał.

Spisane 10.09.2026.

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

## 3. `ai-chat` — zewnętrzny rachunek bez bramki i bez logowania

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
