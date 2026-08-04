# DIAGNOZA: błędne linki w SMS do klientów końcowych

Data: 2026-07-20 · Status: **diagnoza, nic nie naprawione** · Metoda: analiza kodu + testy RPC na produkcji (tylko odczyt, bez zapisu)

---

## ZADANIE 1 — Objaw A: skąd bierze się domena w linkach

Znalazłem **6 miejsc** budujących adres bazowy. Kolumna „co zwróci na produkcji" to stan faktyczny.

| # | Plik:linia | Sposób | Co zwraca na produkcji | Do klienta końcowego? |
|---|---|---|---|---|
| A1 | `supabase/functions/booking-reminders/index.ts:156` | **hardcoded** `https://rido-drive-smiles.lovable.app/r/${token}` | **rido-drive-smiles.lovable.app** — zawsze, bez wyjątku | ✅ TAK — SMS przypomnienia o wizycie |
| A2 | `src/components/workshop/WorkshopScheduler.tsx:1484` | `${window.location.origin}/r/${token}` | **domena, na której pracuje warsztat** — `getrido.pl` albo `*.lovable.app` jeśli pracownik ma otwarty podgląd Lovable | ✅ TAK — SMS potwierdzenia rezerwacji (ręczne dodanie z kalendarza) |
| A3 | `src/components/workshop/WorkshopScheduler.tsx:211` | `${window.location.origin}/r/${b.confirmation_token}` | jw. | ✅ TAK — SMS po akceptacji zmiany terminu |
| A4 | `src/components/workshop/WorkshopSmsDialog.tsx:72` | `${window.location.origin}/warsztat/klient/${order.client_code}` | jw. | ✅ TAK — SMS z linkiem do karty zlecenia |
| A5 | `src/components/workshop/WorkshopNewOrderDialog.tsx:291` | `${window.location.origin}/warsztat/klient/${clientCode}` | jw. | ✅ TAK — SMS przy tworzeniu zlecenia |
| A6 | `src/components/workshop/WorkshopOrderDetail.tsx:230` | `${window.location.origin}/warsztat/klient/${code}` | jw. | ⚠️ pośrednio — kopiowanie linku do schowka |

Dodatkowo **poza torem klienta końcowego** (mail do admina / usługodawcy, też zepsute):

| # | Plik:linia | Wartość | Odbiorca |
|---|---|---|---|
| A7 | `supabase/functions/send-notification/index.ts:65` | hardcoded `…lovable.app/admin/marketing?tab=orders` | admin (notification_email) |
| A8 | `supabase/functions/send-notification/index.ts:95` | hardcoded `…lovable.app/uslugi` | usługodawca (company_email) |
| A9 | `supabase/functions/send-notification/index.ts:119` | hardcoded `…lovable.app/uslugi?tab=leads` | usługodawca |
| A10 | `supabase/functions/ksef-monitor/index.ts:20` | `const APP_BASE_URL = "https://rido-drive-smiles.lovable.app"` | alerty KSeF |
| A11 | `supabase/functions/voice-agent-tools/index.ts:164` | `Deno.env.get("APP_PUBLIC_URL") \|\| "https://preview--rido-drive-smiles.lovable.app"` | klient końcowy (agent głosowy) — **fallback na preview!** |

**Dla kontrastu — miejsca zrobione poprawnie** (wzorzec do naśladowania):
- `resend-activation-email/index.ts:76` → `Deno.env.get("SITE_URL") || "https://getrido.pl"`
- `register-marketplace-user/index.ts:241` → j.w.
- `schedule-viewings/index.ts:217` → hardcoded `https://getrido.pl/...`

### Wniosek — objaw A ma DWIE niezależne przyczyny

1. **A1 (cron, co 15 min)** — `booking-reminders` jest wywoływany przez `cron.schedule('booking-reminders-cron', '*/15 * * * *')` (migracja `20260426094344`). Każdy SMS przypomnienia o wizycie zawiera link na `lovable.app`. To działa **niezależnie od tego, co robi warsztat** — awaria ciągła.
2. **A2–A6 (`window.location.origin`)** — jeśli pracownik warsztatu ma aplikację otwartą w podglądzie Lovable (albo w PWA zainstalowanej ze starej domeny), **każdy SMS wysłany z jego przeglądarki dostaje link na lovable.app**. To tłumaczy, dlaczego objaw jest „raz taki, raz taki".

---

## ZADANIE 2 — Objaw B: dlaczego token nie znajduje rezerwacji

### Prześledzona ścieżka

| Etap | Gdzie | Szczegóły |
|---|---|---|
| Generowanie | **baza, nie kod** — `DEFAULT gen_random_uuid()` na kolumnie | migracja `20260426073548`, kolumna `confirmation_token uuid`, UNIQUE INDEX |
| Zapis | `WorkshopScheduler.tsx:1407` — INSERT **nie podaje** tokenu, polega na DEFAULT; odczytuje go przez `.select('id, confirmation_token')` | ręczne dodanie z kalendarza |
| Odczyt | `BookingConfirm.tsx:28` → RPC `get_workshop_booking_by_token(p_token)` | SECURITY DEFINER, migracja `20260613140000` |
| Filtr RPC | `WHERE p_token IS NOT NULL AND length(p_token) >= 10 AND b.confirmation_token = p_token` | brak filtra po statusie, **brak kolumny `expires_at`** |

### Weryfikacja hipotez — testy na produkcji

Wywołałem RPC anonimowo (dokładnie tak, jak robi to klient końcowy):

| Test | Wynik | Wniosek |
|---|---|---|
| `get_workshop_booking_by_token` z poprawnym UUID (nieistniejącym) | `null`, **HTTP 200** | RPC istnieje, anon ma GRANT, brak błędu |
| ten sam RPC z ciągiem NIE-uuid | `null`, HTTP 200 | brak błędu castu — porównanie działa tekstowo |
| ten sam RPC z tokenem uciętym o 2 znaki | `null`, HTTP 200 | ucięty token = „nie znaleziono", bez śladu w logach |
| `confirm_workshop_booking_by_token` | HTTP 204 | istnieje, dostępny dla anon |
| `cancel_workshop_booking_by_token` | HTTP 204 | j.w. |
| `get_workshop_order_by_client_code` | HTTP 200 | j.w. (karta klienta działa tym samym wzorcem) |

### Werdykt po hipotezach

| Hipoteza | Werdykt | Uzasadnienie |
|---|---|---|
| **(c) RLS blokuje anon** | ❌ **WYKLUCZONA** | Strona nie czyta tabeli bezpośrednio — idzie przez 4 RPC `SECURITY DEFINER` z GRANT dla `anon`. Wszystkie 4 odpowiadają 200/204. `BookingConfirm.tsx` nie ma ani jednego `.from('workshop_client_bookings')`. |
| **(d) token wygasł** | ❌ **WYKLUCZONA** | W tabeli **nie ma kolumny `expires_at`**, a RPC nie filtruje po statusie ani dacie. |
| **(e) ręczna rezerwacja nie dostaje tokenu** | ❌ **WYKLUCZONA w warstwie kodu** | Token nadaje **baza** (DEFAULT), nie kod — ścieżka ręczna i portalowa piszą do tej samej tabeli. Gdyby tokenu nie było, `manageUrl` byłoby puste i **SMS w ogóle nie zawierałby linku**. Klient link dostał → token istniał w chwili wysyłki. |
| **(a) token nie zapisany / zapis pada po cichu** | ⚠️ **mało prawdopodobna** | Jw. — DEFAULT bazy. Możliwa tylko, gdyby migracja `20260426073548` nie była wdrożona na produkcji (patrz „Do zweryfikowania" niżej). |
| **(b) zapytanie ma inny filtr** | ⚠️ **mało prawdopodobna** | RPC filtruje wyłącznie po tokenie. |
| **(f) TOKEN JEST UCIĘTY W SMS** ⭐ | ✅ **NAJBARDZIEJ PRAWDOPODOBNA** | patrz niżej |

### ⭐ Hipoteza (f) — ucięcie tokenu przez limit 160 znaków

`booking-reminders/index.ts:175` kończy budowanie wiadomości bezwarunkowym:

```js
return msg.slice(0, 160)
```

a link doklejany jest **na samym końcu** (`:165`: `msg += ' Potwierdz: ' + confirmUrl`). Logika skracania usuwa najpierw adres, potem usługę — ale jeśli po tym wiadomość nadal ma >160 znaków, **`slice` tnie w środku UUID**.

Arytmetyka: `" Potwierdz: "` (12) + `https://rido-drive-smiles.lovable.app/r/` (40) + UUID (36) = **88 znaków** na sam link. Zostaje 72 znaki na `„<nazwa warsztatu>: przypominamy o wizycie DD.MM.RRRR o GG:MM."` — przy nazwie warsztatu dłuższej niż ~20 znaków limit pęka i token traci ogon.

To spina oba objawy w jedną całość: **ten sam SMS ma i złą domenę, i ucięty token**. A ucięty token daje dokładnie komunikat „Ups! Nie znaleziono rezerwacji." — bo `BookingConfirm.tsx:31` traktuje `error` i `!data` identycznie:

```js
if (error || !data) setError('Nie znaleziono rezerwacji.');
```

**Uwaga:** dla ścieżki ręcznej (`WorkshopScheduler`, limit 320 znaków, bez `slice`) ucięcie nie występuje — więc jeśli klient dostał **getrido.pl/r/<token>** i to nie działa, przyczyna leży w bazie i wymaga zapytań SQL poniżej.

### Czego nie ustalę bez dostępu do SQL

Nie mam uprawnień do odczytu tabeli (RLS, słusznie). Żeby domknąć (a)/(b)/(f), uruchom w SQL Editor:

```sql
-- 1) Czy DEFAULT tokenu w ogóle istnieje na produkcji?
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'workshop_client_bookings' AND column_name = 'confirmation_token';

-- 2) Czy są rezerwacje BEZ tokenu? (hipoteza a)
SELECT count(*) FILTER (WHERE confirmation_token IS NULL) AS bez_tokenu,
       count(*) AS wszystkie
FROM workshop_client_bookings;

-- 3) Konkretna rezerwacja z reklamacji — podstaw pełny token z SMS klienta:
SELECT id, confirmation_token, status, appointment_date, created_at
FROM workshop_client_bookings
WHERE confirmation_token::text LIKE '4bbe%';
--    ^ jeśli zwróci wiersz, a link nie działał → token w SMS był UCIĘTY (hipoteza f)
--      jeśli nie zwróci nic → token nigdy nie istniał (hipoteza a)

-- 4) Faktyczna definicja RPC na produkcji (czy zgodna z migracją):
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_workshop_booking_by_token';

-- 5) Polityki RLS — potwierdzenie, że lockdown został wdrożony:
SELECT policyname, cmd, roles, qual FROM pg_policies
WHERE schemaname='public' AND tablename='workshop_client_bookings';
```

---

## ZADANIE 3 — Audyt wszystkich powiadomień do klienta końcowego

| Typ powiadomienia | Funkcja / plik | Kanał | Budowany URL | Trasa istnieje | Publiczna dla anon | RLS/odczyt | Status |
|---|---|---|---|---|---|---|---|
| Przypomnienie o wizycie (24h/2h) | `booking-reminders/index.ts:156` | SMS | `lovable.app/r/<token>` | ✅ `/r/:token` | ✅ | ✅ RPC | 🔴 **ZEPSUTE** — zła domena + ryzyko ucięcia tokenu |
| Potwierdzenie rezerwacji (ręczna) | `WorkshopScheduler.tsx:1484` | SMS | `origin/r/<token>` | ✅ | ✅ | ✅ RPC | 🟠 **RYZYKOWNE** — domena zależna od przeglądarki pracownika |
| Zmiana terminu zaakceptowana | `WorkshopScheduler.tsx:211` | SMS | `origin/r/<token>` | ✅ | ✅ | ✅ RPC | 🟠 **RYZYKOWNE** — j.w. |
| Link do karty zlecenia | `WorkshopSmsDialog.tsx:72` | SMS | `origin/warsztat/klient/<code>` | ✅ `/warsztat/klient/:code` | ✅ | ✅ RPC `get_workshop_order_by_client_code` | 🟠 **RYZYKOWNE** — j.w. |
| Nowe zlecenie | `WorkshopNewOrderDialog.tsx:291` | SMS | `origin/warsztat/klient/<code>` | ✅ | ✅ | ✅ RPC | 🟠 **RYZYKOWNE** — j.w. |
| Kosztorys / protokół / podpis | karta klienta (`/warsztat/klient/:code`) | — (w karcie) | — | ✅ | ✅ | ✅ RPC `sign_workshop_document_by_client_code` (GRANT anon) | 🟢 OK |
| Rezerwacja z portalu (wstępna/potwierdzona/zmiana/odwołanie) | `booking-notify/index.ts:53-64` | SMS | **brak linku** (tylko telefon warsztatu) | — | — | — | 🟢 OK |
| Prośba o opinię | `booking-review-reminder` | SMS | brak linku | — | — | — | 🟢 OK |
| Agent głosowy — link do rezerwacji | `voice-agent-tools/index.ts:164-165` | SMS | `APP_PUBLIC_URL \|\| preview--…lovable.app` | ✅ | ✅ | ✅ RPC | 🔴 **ZEPSUTE, jeśli `APP_PUBLIC_URL` nie ustawione** |
| SMS zaplanowane (centrum SMS) | `workshop-send-scheduled-sms` | SMS | treść z `workshop_sms_log.message` (zbudowana wcześniej) | — | — | — | 🟠 dziedziczy błąd z miejsca utworzenia |
| Alerty reklamowe / leady | `send-notification/index.ts:65,95,119` | e-mail | hardcoded `lovable.app` | ✅ | ❌ (panel) | — | 🔴 **ZEPSUTE** — ale odbiorca to admin/usługodawca, nie klient końcowy |
| Alerty KSeF | `ksef-monitor/index.ts:20` | e-mail | hardcoded `lovable.app` | ✅ | ❌ | — | 🔴 **ZEPSUTE** — odbiorca wewnętrzny |

Ani jeden przypadek nie jest zepsuty z powodu RLS — **wszystkie publiczne ścieżki klienta końcowego idą przez RPC `SECURITY DEFINER` z GRANT dla `anon` i działają**. Problem jest wyłącznie w budowaniu URL-i (+ ucięcie SMS).

---

## ZADANIE 4 — Czy SMS-y w ogóle dochodzą

**Nie ustaliłem — brak dostępu do danych.** Tabela logów to `public.workshop_sms_log` (kolumny: `status`, `error_message`, `external_id`, `parts_count`, `sent_at`, `sms_type`, `phone`, `provider_id`). Odczyt jako `anon` zwraca `[]` — RLS działa poprawnie, ale odcina też mnie.

Dostawca: `justsend` (domyślny, `https://justsend.io/api/sender/bulk/send`) lub `smsapi` — zależnie od `workshop_sms_settings.provider`. Funkcja `workshop-send-sms` **nie skraca** treści (limit tnie tylko `booking-reminders`).

Uruchom w SQL Editor, wkleję wyniki do raportu:

```sql
-- Podsumowanie 7 dni
SELECT status, count(*), sum(parts_count) AS czesci
FROM workshop_sms_log
WHERE created_at > now() - interval '7 days'
GROUP BY status ORDER BY count(*) DESC;

-- Nieudane z powodem
SELECT created_at, sms_type, left(phone, 6) || '***' AS tel,
       error_message, external_id
FROM workshop_sms_log
WHERE created_at > now() - interval '7 days' AND status IN ('failed','error')
ORDER BY created_at DESC LIMIT 50;

-- Ile SMS-ów wyszło z linkiem na lovable.app (skala objawu A):
SELECT count(*) AS z_lovable, min(created_at), max(created_at)
FROM workshop_sms_log
WHERE created_at > now() - interval '30 days' AND message ILIKE '%lovable.app%';

-- Ile SMS-ów zostało uciętych dokładnie na 160 znakach (skala objawu B):
SELECT count(*) FROM workshop_sms_log
WHERE created_at > now() - interval '30 days'
  AND length(message) = 160 AND message ILIKE '%/r/%';
```

Logi edge functions (uzupełniająco): https://supabase.com/dashboard/project/wclrrytmrscqvsyxyvnn/functions/booking-reminders/logs

---

## PROPOZYCJA NAPRAWY

### Naprawialne SAMĄ ZMIENNĄ ŚRODOWISKOWĄ (bez zmiany kodu)

| Co | Jak | Efekt |
|---|---|---|
| **A11 — agent głosowy** | Ustaw sekret `APP_PUBLIC_URL = https://getrido.pl` w Supabase → Settings → Edge Functions → Secrets | Fallback na preview przestaje działać. **Jedyna naprawa niewymagająca kodu.** |

To wszystko — pozostałe miejsca mają domenę **wpisaną na stałe** albo biorą ją z przeglądarki, więc żadna zmienna ich nie ruszy.

### Naprawialne POLITYKĄ RLS

**Żadne.** RLS nie jest przyczyną ani jednego z objawów — hipoteza (c) wykluczona testami.

### Wymagające ZMIANY KODU

| Priorytet | Zmiana | Pliki |
|---|---|---|
| 🔴 **P0** | Wspólny helper `getPublicBaseUrl()` po stronie edge (`Deno.env.get("SITE_URL") ?? "https://getrido.pl"`, **bez** fallbacku na lovable) i użycie go zamiast literałów | `booking-reminders:156`, `send-notification:65,95,119`, `ksef-monitor:20`, `voice-agent-tools:164` |
| 🔴 **P0** | Frontend: stała `PUBLIC_BASE_URL` (np. w `src/config/legal.ts` obok `website`) zamiast `window.location.origin` we wszystkich SMS-ach | `WorkshopScheduler:211,1484`, `WorkshopSmsDialog:72`, `WorkshopNewOrderDialog:291`, `WorkshopOrderDetail:230` |
| 🔴 **P0** | **Nie skracać wiadomości z linkiem.** Zamiast `msg.slice(0,160)`: budować link jako element nienaruszalny — skracać tylko część opisową, a jeśli i tak >160, wysłać jako SMS wieloczęściowy (dostawca to obsługuje) | `booking-reminders:175` |
| 🟠 **P1** | Rozdzielić komunikaty błędu w `BookingConfirm`: inny tekst dla błędu RPC, inny dla „brak rekordu", inny dla „token wygląda na ucięty" (`length < 36`). Dziś wszystko to jedno „Nie znaleziono rezerwacji." i diagnostyka jest niemożliwa | `BookingConfirm.tsx:31` |
| 🟠 **P1** | Skrócić same tokeny — zamiast 36-znakowego UUID krótki kod (8–10 znaków, np. base32) w osobnej kolumnie; oszczędza ~26 znaków SMS i odporne na ucięcie | migracja + `/r/:token` |
| 🟡 **P2** | Zapisywać w `workshop_sms_log` wysłany URL osobno — dziś nie da się odtworzyć, co dokładnie dostał klient | `workshop-send-sms` |

### Kolejność działania (rekomendacja)

1. **Teraz:** ustaw `APP_PUBLIC_URL` (1 minuta, zamyka A11).
2. **Teraz:** uruchom zapytania SQL z zadań 2 i 4 — dopiero one rozstrzygną, czy objaw B to ucięcie (f) czy brak tokenu (a), i pokażą skalę.
3. **Pilna poprawka:** P0 — trzy zmiany, wszystkie w plikach spoza modułu warsztatu poza `WorkshopScheduler.tsx`/`WorkshopSmsDialog.tsx`/`WorkshopNewOrderDialog.tsx` (**uwaga: to pliki modułu warsztatu — wymagają uzgodnienia z drugą sesją**).
4. Po wdrożeniu: SMS testowy na własny numer i sprawdzenie pełnej długości linku.

### ⚠️ Konflikt zakresów

Cztery z sześciu plików frontendowych do naprawy leżą w `src/components/workshop/` — obszarze objętym zakazem edycji (druga sesja). Naprawa A2–A6 wymaga albo zdjęcia blokady, albo przekazania tych zmian drugiej sesji. Poprawki po stronie edge functions (A1, A7–A11) są całkowicie poza tym obszarem i można je zrobić od razu.
