# Licznik minut — projekt do akceptacji

Zakres z 19.08. Odpowiadam po kolei na trzy pytania, które postawiłeś na końcu:
**gdzie trzymamy salda, jak wygląda tabela transakcji, co się dzieje przy
odnowieniu okresu.** Plus dwie rzeczy, których nie da się zrobić tak, jak
zakładałeś, i jedna, która jest gotowa.

---

## 0. STAN BAZY 19.08 — połowa tego jest już założona

Sprawdzone, nie założone:

```
billing_features (kind='metered'):
  voice_minutes           unit='minuta'      overage_price_net = NULL   ← ISTNIEJE
  voice_concurrent_calls  unit='połączenie'  overage_price_net = NULL   ← ISTNIEJE
  voice_numbers           unit='numer'       overage_price_net = NULL   ← ISTNIEJE
  sms                     unit='SMS'         overage_price_net = 0,20
  vehicle_lookup          unit='sprawdzenie' overage_price_net = 1,70

billing_plan_features dla cech voice_*:   BRAK — żaden plan nie ma limitu minut
billing_addon_products:                   sms, vehicle_lookup — BRAK minut
```

Czyli cecha rozliczana `voice_minutes` **już jest w bazie** (założona przy
pracy nad rozliczeniami). Brakuje trzech rzeczy: ceny nadwyżki, limitów
w planach i produktu do dokupienia.

**Ścieżka zakupu też już istnieje i jest ogólna:**
`DoladowanieModal` przyjmuje `productCode`, czyta `billing_addon_products`
(`code, name, unit_price_net, step, min_units`) i woła `billing-payu-order`.
Dołożenie minut to **jeden wiersz produktu**, nie nowy przepływ płatności.

---

## 1. GDZIE TRZYMAMY SALDA — nigdzie nowego

To jest najważniejsze ustalenie i zmienia rozmiar pracy.

**`billing_consume` już robi dokładnie to, co opisałeś w punkcie 2.** Nie
„coś podobnego" — dokładnie to. Przeczytałem definicję funkcji z bazy:

```
1. PULA Z PLANU     v_wolne := GREATEST(limit − used, 0)
2. PACZKI, FIFO     ORDER BY expires_at ASC NULLS LAST, created_at ASC
3. NADWYŻKA         billing_overage + sufit kwotowy (billing_settings.overage_cap_net)
```

Czyli: **najpierw pakietowe, potem dokupione** — bo tak jest napisane, nie dlatego,
że o to poprosimy. A paczki bezterminowe (`expires_at IS NULL`) idą **na końcu
kolejki FIFO**, więc zużywają się jako ostatnie. To ta sama zasada, którą podałeś:
najpierw to, co i tak przepadnie.

Salda nie trzymamy w żadnej kolumnie — **liczymy je**:

| Co | Skąd | Wygasa? |
|---|---|---|
| pula z pakietu | `feature_limit(...) − billing_usage.used` dla bieżącego okresu | tak, z końcem miesiąca — automatycznie |
| dokupione | `billing_addon_packs.amount_remaining` z `expires_at IS NULL` | nie |
| nadwyżka | `billing_overage.units` / `amount_net` | rozliczana w okresie |

Zero nowego mechanizmu. Sam licznik to **jedna cecha rozliczana i dwa wiersze
limitów.**

⚠️ Jest też pusta tabela **`voice_usage_monthly`** (minuty, koszt, tokeny) —
zero wierszy i zero kodu, który do niej pisze. Do usunięcia, bo przy każdym
kolejnym pytaniu „ile ten warsztat wydzwonił" będzie mylić.

---

## 2. TABELA TRANSAKCJI — nie ma jej, i tak jest lepiej

Chciałem osobny rejestr `voice_call_minutes`. **Twoja wersja jest prostsza
i wystarczająca** — idempotencja na kolumnie w `voice_calls`. Rezygnuję ze swojej.

```sql
ALTER TABLE voice_calls
  ADD COLUMN minutes_charged      integer,        -- ile naliczono
  ADD COLUMN minutes_charged_at   timestamptz,    -- kiedy; NULL = jeszcze nie
  ADD COLUMN minutes_charge_detail jsonb;         -- {z_puli, z_paczek, nadwyzka}

CREATE UNIQUE INDEX voice_calls_conversation_unikalny
  ON voice_calls (elevenlabs_conversation_id)
  WHERE elevenlabs_conversation_id IS NOT NULL;
```

Rozmowa **jest** transakcją — nie potrzebuje drugiego wiersza obok siebie.
`minutes_charge_detail` trzyma to, co zwraca `billing_consume`: ile poszło z puli,
ile z paczek, ile w nadwyżkę. Bez tego nie odpowiemy warsztatowi, dlaczego
przy 137 minutach zużycia zapłacił za 12.

**Indeks unikalny na `elevenlabs_conversation_id` jest częścią idempotencji,
nie ozdobą.** Sama kolumna `minutes_charged_at` broni przed powtórnym
naliczeniem tej samej rozmowy, ale nie broni przed **dwoma wierszami** tej samej
rozmowy — a webhook ElevenLabs potrafi przyjść dwa razy.

---

## 3. NALICZANIE

W `voice-call-postprocess`, po zapisaniu rozmowy:

```
minuty = ceil(call_duration_secs / 60)        ← źródło: metadata.call_duration_secs
                                                 z ElevenLabs, już tam jest
jeśli minutes_charged_at IS NOT NULL          → koniec, nie naliczamy drugi raz
jeśli duration_seconds = 0                    → 0 minut, ale minutes_charged_at
                                                 ustawiamy — inaczej kontrola
                                                 „rozmowa bez naliczenia" krzyczy
                                                 na próby techniczne
billing_consume(..., 'voice_minutes', minuty, p_pozwol_nadwyzke := true)
UPDATE voice_calls SET minutes_charged, minutes_charged_at, minutes_charge_detail
```

**Kolejność: `billing_consume` PRZED zapisem znacznika.** Zgon między krokami
powoduje wtedy naliczenie bez znacznika, czyli **ryzyko podwójnego naliczenia
przy powtórce webhooka** — i dlatego znacznik zapisujemy w tej samej instrukcji
`UPDATE`, co resztę, natychmiast po. Odwrotna kolejność (znacznik pierwszy)
gubiłaby minuty po cichu.

Wybór jest między dwoma niedoskonałościami i wybieram tę **wykrywalną**:
codzienna kontrola porównuje sumę `minutes_charged` z `billing_usage.used` za
okres. Rozjazd = alert. Przy zgubionych minutach nie ma czego porównać.

`p_pozwol_nadwyzke := true` jest konieczne: minuty naliczamy PO rozmowie, więc
odmowa naliczenia nie cofnie rozmowy, tylko zgubi jej ślad.

**Rozmowy testowe** (`is_test`) — nie naliczamy, ale znacznik ustawiamy
i pokazujemy je w oknie z etykietą „test".

---

## 4. CO SIĘ DZIEJE PRZY ODNOWIENIU OKRESU

**Nic. I to jest zaleta, nie niedoróbka.**

`billing_usage` jest kluczowane `(subscriber, feature, period_start)`, gdzie
`period_start = date_trunc('month', now())`. 1 września `billing_consume`
zakłada nowy wiersz z `used = 0` — pula wraca do 200 minut, a niewykorzystane
**przepadają, bo nigdzie ich nie ma.** Nie ma zadania cyklicznego, nie ma nic
do zepsucia. Paczki leżą w innej tabeli i odnowienie ich nie dotyka.

🔴 **Ale jest tu rzecz do rozstrzygnięcia i nie chcę jej przemilczeć.**

Okres jest **kalendarzowy**, a subskrypcja niekoniecznie. Warsztat, który
wykupi Agenta 20 sierpnia, dostanie 200 minut na jedenaście dni i 1 września
kolejne 200. To hojne, ale niespójne: zapłacił za miesiąc, dostał 400 minut.

Trzy drogi:
1. **zostawić kalendarzowy** — zgodne z SMS-ami i zapytaniami o pojazdy,
   zero pracy, klient nigdy nie traci
2. proporcjonalnie w pierwszym miesiącu — uczciwe, ale trzeba tłumaczyć
   klientowi, dlaczego ma 129 minut
3. okres subskrypcji zamiast kalendarza — najuczciwsze i **najdroższe**:
   `billing_usage` i `check_usage` obsługują dziś tylko kalendarz, więc
   zmiana dotyka też SMS-ów

**Rekomendacja: 1.** Spójność z tym, co już działa, jest warta więcej niż
kilkadziesiąt minut podarowanych przy pierwszym zakupie.

---

## 5. STATUS REALIZACJI — sprawdziłem, NIE DA SIĘ ze statusu zlecenia

Prosiłeś, żebym sprawdził. Sprawdziłem i odpowiedź brzmi: nie.

**Statusy zleceń są definiowane osobno przez KAŻDY warsztat**, jako dowolne
napisy w `workshop_order_statuses`. Nie ma słownika, nie ma flagi „końcowy".
Fragment z produkcji:

```
664ed87b: Przyjęcie do serwisu, Zadania wykonane, Gotowy do odbioru, Zakończone
0307fd12: Przyjęcie do serwisu, Gotowy do odbioru
3901c323: Nowe zlecenie, W trakcie naprawy, Zadania wykonane
95a99e7c: ..., Oddzwonić
```

Trzy warsztaty, trzy różne zestawy. **Żaden nie ma statusu „nie stawił się"** —
a to akurat nie przypadek: tego nie da się wywnioskować z niczego. Zlecenie
klienta, który nie przyjechał, wygląda w bazie identycznie jak zlecenie, którym
nikt się jeszcze nie zajął.

`workshop_client_bookings` mają `scheduled / cancelled / confirmed` — też bez
„nie stawił się".

**Propozycja: jedna kolumna na słowniku statusów.**

```sql
ALTER TABLE workshop_order_statuses
  ADD COLUMN znaczenie text
  CHECK (znaczenie IN ('wykonane','anulowane','nie_stawil_sie'));
```

Warsztat raz przypisuje znaczenie swoim statusom („Zakończone" → `wykonane`),
a my dostajemy maszynowo czytelną odpowiedź dla wszystkich warsztatów naraz.
Domyślnie `NULL` — czyli **„nie wiemy", a nie „nie stawił się"**.

To jest większa robota niż reszta punktu 4 i **proponuję ją odłożyć**: licznik
minut działa bez niej, a bez tej kolumny raport „ilu klientów przyjechało"
byłby zgadywaniem po nazwach statusów. Zgadywanie po nazwach jest gorsze niż
brak liczby, bo wygląda na pomiar.

W pierwszej wersji okna pokazuję to, co **wiemy na pewno**: czy rozmowa
utworzyła zlecenie, czy wymaga uwagi, czy była odwołaniem. To już jest
odpowiedź na „ile mi agent przyniósł", tylko słabsza.

---

## 6. DUBLOWANIE — rozszerzamy „Połączenia", nie robimy drugiego widoku

Sprawdziłem `WorkshopCallsList.tsx` (189 linii, wpięty w zakładkę usługodawcy).
Ma już: datę, długość, status, wynik, podsumowanie, nazwisko, powiązane
zlecenie, transkrypcję z `voice_call_transcripts` i przycisk „utwórz zlecenie".

**To jest 80% okna, o które prosisz.** Brakuje: kolumny minut, podsumowania
na górze, wyszukiwarki po numerze, zakresu dat, sortowania.

**Propozycja: jedno miejsce.** Kafelek w nagłówku prowadzi do tej samej listy,
rozszerzonej o brakujące elementy. Dwa widoki na te same rozmowy to dwa miejsca
do poprawiania i dwie odpowiedzi na pytanie „ile było rozmów w sierpniu".

---

## 7. PROGI — zasady z 19.08, i jedna rzecz, której NIE DA SIĘ zrobić

```
saldo > 0          → agent odbiera normalnie
saldo ≤ 0          → agent NIE ODBIERA. Bez komunikatu, bez zlecenia.
15 minut zostało   → ostrzeżenie w panelu i mailem
rozmowa rozpoczęta → IDZIE DO KOŃCA, choćby zeszła na −10 minut
sprawdzenie salda  → TYLKO przy odbieraniu, NIGDY w trakcie rozmowy
```

Sprawdzenie salda trafia w to samo miejsce, co dzisiejszy limit rozmów
równoczesnych w `voice-agent-init` — czyli raz, przy odebraniu. W `voice-agent-chat`
nie ma go wcale i nie może być: tam jesteśmy już w środku rozmowy.

### 🔴 „Agent nie odbiera" — webhook tego NIE UMIE

To jest ograniczenie platformy, nie nasze niedopatrzenie, i zapisaliśmy je już
wcześniej przy limicie rozmów równoczesnych:

> **Webhook inicjujący nie może odrzucić połączenia — może tylko ukształtować
> rozmowę.** ElevenLabs odbiera telefon, ZANIM zapyta nas o cokolwiek.

Do chwili odpowiedzi webhooka połączenie jest już odebrane. Wszystko, co możemy
zrobić z poziomu `voice-agent-init`, to kazać agentowi powiedzieć jedno zdanie
i się rozłączyć — a Ty prosisz wprost o coś innego: **żadnego komunikatu.**

**Jedyna droga do prawdziwego „nie odbiera" to odpięcie numeru od agenta
po stronie ElevenLabs.** Umiemy to zrobić — tak samo przypinaliśmy numer przy
aktywacji. Ale to jest operacja asynchroniczna, więc potrzebuje dwóch zadań
w istniejącej kolejce `voice_number_jobs`:

```
zawieszenie  — saldo spadło ≤ 0  → odepnij numer od agenta w ElevenLabs
wznowienie   — doładowano minuty → przypnij z powrotem
```

**Skutek uboczny, który musisz znać:** dzwoniący na odpięty numer usłyszy to,
co operator robi z połączeniem bez odbiorcy — sygnał zajętości albo komunikat
SuperVoIP, nie nasz. Nie mamy nad tym kontroli i nie da się tego ustawić
z naszej strony.

**Opóźnienie:** worker chodzi co minutę, więc między zejściem na zero
a odpięciem numeru mija do minuty. W tym czasie agent może jeszcze odebrać
jedną rozmowę. Uważam to za akceptowalne — alternatywą jest sprawdzanie salda
synchronicznie przy każdym połączeniu i tak już mamy je w `init`, więc
**dokładam tam także miękką blokadę**: przy saldzie ≤ 0 agent mówi jedno
zdanie i kończy, dopóki numer nie zostanie odpięty. To nie jest to, o co
prosisz, ale jest lepsze niż pełna rozmowa na koszt, którego nikt nie zapłaci.

### Debet i jego spłata

Minus zapisujemy w `billing_overage` (tabela istnieje, `billing_consume` już
tam pisze przy przekroczeniu limitu — wraz z kwotą i sufitem kwotowym).

**Spłata przy doładowaniu** nie dzieje się sama: `billing_consume` odejmuje
z paczek przy ZUŻYCIU, a nie wstecz. Więc przy przyznaniu paczki minut
najpierw pomniejszamy ją o zaległe jednostki z `billing_overage`, potem resztę
zapisujemy jako `amount_remaining`. Jedna funkcja, wołana przy wydaniu paczki.

### Flaga — nadal obowiązuje

```sql
ALTER TABLE billing_settings
  ADD COLUMN voice_minuty_blokuja boolean NOT NULL DEFAULT false;
```

```
blokujemy ⟺ voice_minuty_blokuja = true
            ORAZ warsztat ma aktywną, OPŁACONĄ subskrypcję
```

Drugi warunek jest twardy i niezależny od flagi. Pierwszy warsztat i CART nie
mają dziś subskrypcji — działają bez ograniczeń automatycznie, bez listy
wyjątków, która kiedyś by się zdezaktualizowała.

## 8. MIGRACJA — do akceptacji, NIEWYKONANA

```sql
-- 1. cecha rozliczana
INSERT INTO billing_features (key, name, description, kind, unit,
                              overage_price_net, is_active, sort_order)
VALUES ('voice_minutes', 'Minuty rozmów agenta',
        'Minuty rozmów telefonicznych obsłużonych przez agenta głosowego',
        'metered', 'minuta', 1.15, true, 55)
ON CONFLICT (key) DO NOTHING;

-- 2. limity w planach: 200 i 440, soft_limit na 80%
--    (przez billing_set_plan_features, żeby nie omijać istniejącej reguły)

-- 3. naliczenie na rozmowie
ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS minutes_charged       integer,
  ADD COLUMN IF NOT EXISTS minutes_charged_at    timestamptz,
  ADD COLUMN IF NOT EXISTS minutes_charge_detail jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS voice_calls_conversation_unikalny
  ON voice_calls (elevenlabs_conversation_id)
  WHERE elevenlabs_conversation_id IS NOT NULL;

-- 4. flaga blokowania, domyślnie WYŁĄCZONA
ALTER TABLE billing_settings
  ADD COLUMN IF NOT EXISTS voice_minuty_blokuja boolean NOT NULL DEFAULT false;
```

✅ **Sprawdzone przed pokazaniem migracji:** w `voice_calls` jest 67 rozmów,
36 z identyfikatorem konwersacji, **zero duplikatów**. Indeks unikalny założy
się bez sprzątania.

Warto odnotować, że **31 rozmów nie ma `elevenlabs_conversation_id`** —
to rozmowy sprzed wpięcia webhooka i symulacje. Ich nie naliczymy i nie da się
ich naliczyć: nie mamy dla nich ani długości z ElevenLabs, ani klucza
idempotencji. Naliczanie startuje od rozmów przyszłych, nie wstecz.

---

## 9. Kolejność prac

| # | Co | Ile |
|---|---|---|
| 1 | migracja + sprawdzenie duplikatów | 1 h |
| 2 | naliczanie w `voice-call-postprocess` | 2 h |
| 3 | codzienna kontrola: `minutes_charged` vs `billing_usage` | 1 h |
| 4 | kafelek w nagłówku (usługodawca + zwykły użytkownik) | 1 h |
| 5 | rozszerzenie „Połączeń": minuty, podsumowanie, filtry, sortowanie | pół dnia |
| 6 | próg 20% — kafelek na czerwono + mail | 2 h |
| 7 | progi 0 i −30 za flagą | 3 h |
| 8 | *(osobno)* `znaczenie` statusów + raport „ilu przyjechało" | 1 dzień |

Punkty 1–5 mają sens same i nikomu nic nie grożą: warsztat widzi zużycie,
my widzimy, czy naliczanie jest szczelne, nikt nie zostaje odcięty.
