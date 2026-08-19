# Licznik minut — projekt (przed kodowaniem)

Zakres z 19.08: pakiety **Agent 199 zł → 200 minut**, **Agent Pro 399 zł → 440 minut**,
poza pakietem **1,15 zł/min**. Trzeci licznik w nagłówku, okno z rozmowami,
naliczanie w `voice-call-postprocess`, pełne minuty w górę, idempotencja po
`conversation_id`. Progi: 20% ostrzeżenie, 0 minut → agent mówi o oddzwonieniu,
−30 minut → nie odbiera.

---

## 1. Czego NIE budujemy — to już działa

Sprawdzone w bazie, nie założone. **Mechanizm licznika jednostek rozliczanych
istnieje i jest używany przez SMS-y oraz zapytania o pojazdy:**

```
billing_features        key, kind='metered', unit, overage_price_net, pack_validity_days
billing_plan_features   limit_value i soft_limit per plan
billing_addon_packs     dokupione paczki z wygasaniem
billing_usage           subscriber + feature + period_start + used

check_usage(typ, id, feature_key, ile)   → jsonb {allowed, reason, used, limit,
                                                  remaining, packs_remaining}
billing_consume(typ, id, feature_key, ile, p_pozwol_nadwyzke)
feature_limit(typ, id, feature_key)
billing_active_subscriptions(typ, id)
```

To zmienia rozmiar pracy z „nowy podsystem rozliczeń" na „jedna cecha, dwa
wiersze limitów i wpięcie w jednym miejscu".

⚠️ **Jest też `voice_usage_monthly`** — tabela z minutami, kosztem i tokenami.
**Zero wierszy, zero kodu, który do niej pisze.** Nie używamy jej i proponuję
usunąć: druga tabela na to samo, pusta i nieaktualna, będzie mylić przy każdym
kolejnym pytaniu „ile ten warsztat wydzwonił".

---

## 2. Co dochodzi

### Cecha rozliczana

```sql
INSERT INTO billing_features (key, name, description, kind, unit,
                              overage_price_net, is_active, sort_order)
VALUES ('voice_minutes', 'Minuty rozmów agenta',
        'Minuty rozmów telefonicznych obsłużonych przez agenta głosowego',
        'metered', 'minuta', 1.15, true, 55);

-- limity w planach
agent      → limit_value 200
agent_pro  → limit_value 440
```

`soft_limit` (kolumna już jest) ustawiamy na **80% limitu** — stąd bierze się
próg ostrzegawczy 20% pozostałych, bez dodatkowej logiki po naszej stronie.

### Rejestr naliczeń — jedyna nowa tabela

```sql
CREATE TABLE voice_call_minutes (
  conversation_id text PRIMARY KEY,      -- idempotencja SIEDZI W KLUCZU
  provider_id     uuid NOT NULL REFERENCES service_providers(id),
  call_id         uuid REFERENCES voice_calls(id),
  sekundy         integer NOT NULL,
  minuty          integer NOT NULL,      -- ceil(sekundy/60)
  naliczone_at    timestamptz NOT NULL DEFAULT now()
);
```

**Dlaczego osobna tabela, skoro `billing_usage` już liczy.** `billing_usage`
trzyma sumę, nie zdarzenia — nie da się z niej odpowiedzieć na pytanie „czy tę
rozmowę już policzyliśmy". Idempotencja po `conversation_id` wymaga miejsca,
w którym ten identyfikator jest kluczem. Przy okazji to jest rozliczenie
pozycja po pozycji, gdy warsztat zapyta, skąd się wzięło 187 minut.

---

## 3. Naliczanie — i decyzja o kierunku porażki

W `voice-call-postprocess`, po ustaleniu długości rozmowy:

```
1. INSERT INTO voice_call_minutes (...)      ← 23505 = już naliczone, KONIEC
2. billing_consume(..., 'voice_minutes', minuty, p_pozwol_nadwyzke := true)
```

**Kolejność nie jest obojętna i wybieram ją świadomie.**

Zapis do rejestru PRZED naliczeniem znaczy, że twardy zgon między krokami
powoduje **nienaliczenie** minut, które już zużyliśmy. Odwrotna kolejność
przy ponowieniu naliczyłaby je **dwa razy**.

Wybieram nienaliczenie, bo pomyłka na naszą niekorzyść jest odkrywalna
rekoncyliacją i nie wymaga tłumaczenia się klientowi, a podwójne obciążenie
klient znajduje pierwszy. Do tego dochodzi **codzienne sprawdzenie**
porównujące `voice_calls` z `voice_call_minutes` za ostatnie 48 h — rozmowa
bez wiersza w rejestrze to alert, nie cisza (zasada 37).

`p_pozwol_nadwyzke := true` jest tu konieczne: minuty naliczamy PO rozmowie,
więc odmowa naliczenia nie cofnie rozmowy, tylko zgubi jej ślad.

**Zaokrąglenie:** `ceil(sekundy/60)`, minimum 1 minuta za odebraną rozmowę,
**0 minut za rozmowę bez treści** (`duration_seconds = 0`) — inaczej nieudane
połączenia i próby techniczne obciążałyby warsztat.

---

## 4. Nagłówek i okno rozmów

**Trzeci kafelek** obok zapytań o pojazdy i SMS-ów, tym samym wzorem
(`TopBarCredits`), przez `check_usage('voice_minutes')`. Pokazuje pozostałe
minuty; poniżej zera pokazuje debet ze znakiem minus, a nie zero — warsztat
ma widzieć, że rozmawia na kredyt.

**Okno po kliknięciu** — lista rozmów bieżącego okresu:

```
data i godzina │ numer dzwoniącego │ czas │ minuty │ zlecenie │ transkrypcja
filtry: okres, „tylko zakończone zleceniem", „tylko bez zlecenia"
```

Numer dzwoniącego pokazujemy **warsztatowi** w całości — to jego klient
i jego dane, a nie nasze. W logach i w naszych raportach zostaje maskowany.

---

## 5. 🔴 Progi — WŁĄCZAMY ETAPAMI, nie od razu

Twoje zastrzeżenie zapisane jako reguła: **licznik ma najpierw POKAZYWAĆ.**

| Etap | Co robi | Warunek włączenia |
|---|---|---|
| **A** | nalicza i pokazuje; nie blokuje niczego | od razu |
| **B** | ostrzeżenie przy 20% pozostałych (mail + kafelek na czerwono) | po tygodniu poprawnego naliczania |
| **C** | 0 minut → agent odbiera i mówi o oddzwonieniu | **dopiero gdy warsztat ma opłaconą subskrypcję** |
| **D** | −30 minut → agent nie odbiera | po etapie C, osobną decyzją |

**Bramka etapu C i D brzmi odwrotnie niż bramka aktywacji numeru.** Tam brak
subskrypcji znaczy „nie kupujemy numeru". Tu brak subskrypcji znaczy
**„nie blokuj"** — warsztat bez pakietu nie miał jak wykupić minut, więc
odcięcie go za ich brak byłoby karą za nasz własny nieuruchomiony cennik.

```
JEŚLI brak aktywnej, opłaconej subskrypcji  →  NIGDY nie blokuj, tylko licz
```

Dziś **żaden z dwóch warsztatów nie ma wiersza w `billing_subscriptions`**,
więc bez tej reguły etap C wyłączyłby agenta pierwszemu warsztatowi w dniu
wdrożenia. To ta sama pułapka co przy bramce subskrypcji, w tym samym miejscu.

**Zachowanie przy zerze nie jest wyłączeniem agenta.** Agent odbiera, mówi
zdanie o oddzwonieniu i kończy — czyli trzeci stan obok `wylaczony` i `zajete`,
z własnym zdaniem w czterech językach i **bez narzędzi** (mechanizm już jest,
od 19.08 narzędzia są odcinane przy obu tamtych stanach).

---

## 6. Marża — co wiemy, a czego nadal nie

```
                      cena/min    znany koszt/min    znana marża
Agent      199 / 200    0,995         0,363             63%
Agent Pro  399 / 440    0,907         0,363             60%
poza pakietem           1,150         0,363             68%
```

Znany koszt to głos ElevenLabs (0,318, zmierzone na 76 rozmowach) plus model
językowy (0,045, z liczników tokenów).

**Czego nadal nie ma w tym rachunku:** SMS potwierdzający i Supabase.
Telefonia natomiast **przestała być niewiadomą per minuta** — SuperVoIP rozlicza
nas pakietem miesięcznym (184,50 zł brutto), a nie za minutę. Przy dzisiejszym
ruchu to gigantyczny koszt na minutę, przy stu warsztatach — grosze. Nie da się
go sensownie wliczyć do ceny minuty i nie należy tego robić: to koszt stały,
który spłaca się liczbą warsztatów, a nie liczbą minut.

**Cena poza pakietem (1,15) jest wyższa niż w obu pakietach** — czyli pakiet
opłaca się bardziej niż nadwyżka, tak jak przy SMS-ach. To dobrze.

---

## 7. Kolejność prac

| # | Co | Ile |
|---|---|---|
| 1 | migracja: cecha `voice_minutes` + limity w dwóch planach + `voice_call_minutes` | 1 h |
| 2 | naliczanie w `voice-call-postprocess` + rejestr | 2 h |
| 3 | codzienne sprawdzenie „rozmowa bez naliczenia" + alert | 1 h |
| 4 | kafelek w nagłówku | 1 h |
| 5 | okno z rozmowami, filtry, transkrypcja | pół dnia |
| 6 | etap B — ostrzeżenie przy 20% | 2 h |
| 7 | etapy C i D — osobno, po uruchomieniu płatności | 3 h |

Punkty 1–4 mają sens same: warsztat widzi zużycie, my widzimy, czy naliczanie
jest szczelne, a nikomu nic nie grozi.

---

## 8. Pytania, na które potrzebuję odpowiedzi przed kodowaniem

1. **Rozmowy testowe i nasze własne** — naliczać? Dziś `voice_calls` ma
   `is_test`. Proponuję: nie naliczać, ale pokazywać w oknie z etykietą „test",
   żeby nie wyglądało, że rozmowa zniknęła.
2. **Okres rozliczeniowy** — miesiąc kalendarzowy (jak `billing_usage` dziś,
   `date_trunc('month')`) czy okres subskrypcji (`current_period_end`)?
   Kalendarzowy jest prostszy i zgodny z tym, co już działa; okres subskrypcji
   jest uczciwszy dla kogoś, kto kupił 20. dnia miesiąca.
3. **Minuty niewykorzystane** — przepadają z końcem okresu czy przechodzą?
   Mechanizm paczek (`billing_addon_packs`) umie jedno i drugie
   (`pack_validity_days`), więc to decyzja handlowa, nie techniczna.
