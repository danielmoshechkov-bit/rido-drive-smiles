# Zapytania biorące jeden wiersz z wielu — lista do przejrzenia

Powstała 19.08 po znalezieniu remisu priorytetów person (zasada 43).
Skaner: łańcuch od `.from("tabela")` do `.limit(1)` albo `.maybeSingle()`,
z oceną, czy po drodze jest `.order(...)` albo filtr po kluczu jednoznacznym.

```
edge functions:  271 zapytań  →  29 z .order   113 po kluczu   129 bez obu
frontend:        330 zapytań  →  48 z .order   165 po kluczu   117 bez obu
```

**To nie jest lista błędów.** Większość tych zapytań filtruje po czymś, co i tak
zwraca jeden wiersz — skaner tego nie wie. Lista mówi, gdzie warto spojrzeć.

---

## Naprawione 19.08

| Miejsce | Co było | Co jest |
|---|---|---|
| `voice_agent_personas` (panel) | `order by priority desc limit 1` przy remisie 8/8 | persona stała, plus indeks unikalny w bazie |
| `voice_agent_configs` (`voice-agent-init`) | `.eq(provider_id).limit(1)` bez sortowania | `wybierzKonfiguracjeWarsztatu()` — wybór deterministyczny |
| kolejka zadań (`voice-numbers-worker`) | `select ... limit 1`, potem osobny `update` | `voice_pobierz_zadanie()` — `FOR UPDATE SKIP LOCKED` |
| rezerwacja numeru z puli | `update ... .limit(1)` (semantyka PostgREST niesprawdzona) | `voice_zarezerwuj_numer()` — jeden wiersz, atomowo |

---

## Do przejrzenia — kolejność według tego, co się stanie, gdy trafi źle

### 1. `voice-agent-init:240` — ścieżka zapasowa po `agent_id`

```ts
.eq(agentId ? "elevenlabs_agent_id" : "persona_key", agentId || "workshop_secretary")
.limit(1);
```

Gdy `agentId` jest — filtr jednoznaczny, bez ryzyka. **Gdy go nie ma, warunek
brzmi „dowolny warsztat z personą workshop_secretary"** i bierze pierwszy
z brzegu. Wynikiem jest snapshot z danymi klientów CUDZEGO warsztatu — ta sama
klasa wycieku, którą zamknęliśmy 16.08 dla nieznanych numerów.

Ścieżka uruchamia się tylko wtedy, gdy w zdarzeniu nie ma ani `called_number`,
ani `agent_id` — w praktyce przy wywołaniach ręcznych i testowych.

**Proponowana naprawa:** bez `agentId` zwracać `null` zamiast zgadywać — odmowa,
nie losowanie (zasada 41). To zmiana zachowania na ścieżce zapasowej, więc
wymaga decyzji: może komuś zabrać obsługę.

### 2. `billing_subscriptions` — `billing-checkout:101`

`maybeSingle()` bez sortowania. Dziś nieszkodliwe, bo **żaden warsztat nie ma
ani jednej subskrypcji**.

🔴 **Do domknięcia PRZED uruchomieniem płatności.** Gdy bramka subskrypcji
zacznie działać, warsztat z dwiema aktywnymi subskrypcjami dostanie losową —
a od tego wiersza zależy `current_period_end` i (docelowo)
`max_rozmow_rownoczesnie` z planu. Skutkiem jest klient, który zapłacił za
Agent Pro i dostaje limit z pakietu podstawowego, albo odwrotnie.
Warsztat z dwiema subskrypcjami to nie fantazja: zmiana pakietu, która nie
zamknęła poprzedniej, wystarczy.

**Proponowana naprawa:** `order by current_period_end desc nulls last, id` —
i osobno sprawdzenie w kontroli stanu, czy ktoś ma więcej niż jedną aktywną.

### 3. `voice_numbers` — `voice-number-activate:81`, worker (rekoncyliacja)

`maybeSingle()` **wywala się przy dwóch wierszach**, zamiast losować — awaria
głośna, nie cicha. Zostawiamy; sprawdzenie „numer w dwóch warsztatach" jest już
w `scripts/voice-punkt-odniesienia.mjs`.

### 4. Dopasowanie klienta i pojazdu (`voice-agent-tools`, `voice-call-commit`)

`workshop_clients` i `vehicles` po numerze telefonu / rejestracji. Duplikaty
w tych tabelach są realne (ten sam klient wpisany dwa razy). Skutek: rozmowa
dopięta do jednego z dwóch wierszy tego samego klienta — brzydkie, ale nie
groźne i nie po cichu.

### 5. Reszta — 129 miejsc w funkcjach, 117 we froncie

Głównie `drivers` (18), `driver_platform_ids` (8), `ai_settings` (6) — moduł
floty i ustawienia AI, poza tą pracą. `ai_settings` bierze „pierwszy wiersz
ustawień" w sześciu funkcjach; jeśli kiedyś powstanie drugi wiersz, sześć
funkcji zacznie czytać różne ustawienia w zależności od dnia.
