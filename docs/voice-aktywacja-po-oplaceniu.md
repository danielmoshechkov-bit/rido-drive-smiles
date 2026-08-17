# Aktywacja po opłaceniu — projekt (nie zbudowane)

Zapisane 17.08 na polecenie: **zgoda ręczna przy pierwszym zakupie to obejście
na dziś, nie model docelowy.** Ma ją zastąpić opłacony pakiet.

Zmiana dotyczy jednej rzeczy, ale najważniejszej: **momentu, w którym wydajemy
pieniądze.** Dziś kupujemy numer, zanim klient cokolwiek zapłacił. Docelowo —
po. Dopóki tak nie jest, każdy nowy warsztat kosztuje nas 1,23 zł z góry bez
pewności, że kiedykolwiek zapłaci.

---

## Czego NIE trzeba budować — to już jest

Sprawdzone w bazie, nie założone:

```
billing_plans:
  code=agent        199,00 netto / 244,77 brutto   is_active=TRUE   stripe_price_id=JEST
  code=agent_pro    399,00 netto / 490,77 brutto   is_active=false  bez Stripe
  code=agent_sieci  bez ceny                       is_active=false
  bundle_warsztat_agent 289,00 / bundle_max 399,00  oba is_active=false

billing_subscriptions: subscriber_type='service_provider', product_line, status,
  current_period_end, provider='stripe', provider_subscription_id, trial_ends_at
funkcje: billing-checkout, billing-stripe-webhook, billing-stripe-sync,
         billing-admin-plans, billing-admin-features
```

Czyli **pakiet „Agent" jest aktywny i ma cenę w Stripe.** Nie budujemy płatności
od zera — podłączamy bramkę do czegoś, co istnieje. To zmienia szacunek pracy
z tygodni na dni i warto to powiedzieć wprost, bo dotąd mówiliśmy „płatności
są zepsute" na podstawie jednej zepsutej ścieżki doładowania SMS.

⚠️ Ale: `agent_pro` (399 zł) i pakiety łączone są **nieaktywne i bez Stripe**.
Jeśli mają być w panelu, ktoś musi je włączyć i dopisać ceny w Stripe.

---

## Przepływ docelowy

```
1. warsztat wchodzi w „Asystent głosowy"
   NA GÓRZE, przed wszystkim: cena i pakiety (z billing_plans)
   pod nimi wszystko inne — ale WYSZARZONE, z jednym zdaniem dlaczego

2. wybiera pakiet → billing-checkout → Stripe

3. billing-stripe-webhook zapisuje subskrypcję (status active/trialing)

4. panel odblokowuje „Aktywuj agenta"

5. aktywacja kupuje numer AUTOMATYCZNIE — bez naszej zgody,
   bo ryzykujemy pieniędzmi, które już dostaliśmy

6. jeden numer na konto, bezwzględnie
```

### Bramka jest po stronie SERWERA, nie w przycisku

Zablokowany przycisk to podpowiedź, nie kontrola — do funkcji można wysłać
żądanie bez klikania. Sprawdzenie subskrypcji siedzi w `voice-number-activate`,
przed założeniem zadania:

```
SELECT 1 FROM billing_subscriptions
WHERE subscriber_type = 'service_provider' AND subscriber_id = :provider
  AND product_line = 'agent'
  AND status IN ('active', 'trialing')
  AND (current_period_end IS NULL OR current_period_end > now())
```

Brak wiersza → 402 i komunikat „wybierz pakiet". Zgodnie z zasadą 41: brak
danych to odmowa, nie zgoda.

`status IN ('active','trialing')` zostawiam w zapytaniu świadomie, mimo że
agent triala nie ma: gdyby kiedyś wrócił przez pakiet łączony, chcemy, żeby
działał, a nie żeby klient zapłacił i dostał 402.

`voice_pula_ustawienia.pierwszy_zakup_zrobiony` przestaje być bramką i zostaje
jako ślad historyczny. **Bezpiecznik dobowy (3 zakupy) zostaje** — on nie chroni
przed niepłacącym klientem, tylko przed naszym własnym błędem w liczeniu puli,
a ten nie znika wraz z płatnościami.

---

## Trzy decyzje — ROZSTRZYGNIĘTE 17.08

### 1. Trial — NIE MA GO I NIE BĘDZIE

**Decyzja: agent jest płatny od pierwszego dnia. Bez wyjątków.**
Każdy trial to numer za 1,23 zł z naszych pieniędzy plus minuty rozmów;
dziesięć warsztatów testujących za darmo to setki złotych bez przychodu.

⚠️ **Sprostowanie do mojej wcześniejszej informacji.** Napisałem, że plan
`agent` ma `trial_days: 14`. To był błąd — patrzyłem na `bundle_warsztat_agent`
(`product_line='other'`). Odczyt linii agenta:

    agent        trial_days = 0   is_active = true
    agent_pro    trial_days = 0   is_active = false
    agent_sieci  trial_days = 0   is_active = false

**Nie ma czego wyłączać — już jest zero.** Dodatkowo sprawdzone:
`billing-checkout` nie tworzy triala w Stripe (czyta tylko istniejące statusy),
a `workshopTrial.ts` filtruje po `product_line='warsztat'`, więc trial modułu
warsztatowego nie dotyka agenta. Żadna dzisiejsza ścieżka nie daje agenta
za darmo.

**Jedyne ryzyko na przyszłość: pakiety łączone.** `bundle_warsztat_agent`
(289 zł) i `bundle_max` (399 zł) mają `trial_days: 14` i **zawierają agenta**.
Dziś oba są nieaktywne i bez ceny w Stripe. Włączenie któregokolwiek bez
zmiany `trial_days` da agenta za darmo na 14 dni — czyli dokładnie to, czego
nie chcemy, tylnymi drzwiami. Do sprawdzenia PRZED ich uruchomieniem.

### 2. Co się dzieje z numerem, gdy płatność wygaśnie

Tu jest problem, którego wcześniej nie widzieliśmy i który nie jest techniczny:

**Numer zwolniony nie może od razu trafić do innego warsztatu.** Klienci starego
warsztatu dzwonią pod ten numer jeszcze miesiącami — po przypisaniu go komuś
innemu usłyszą nazwę obcej firmy, a agent zaproponuje im terminy i ceny tego
drugiego warsztatu. To wygląda jak wyciek, bo w praktyce nim jest.

**Decyzja: karencja 90 dni.** Numer zostaje nasz, nieprzypisany i nieaktywny;
dzwoniący słyszy, że numer nie jest już obsługiwany. Dopiero po karencji wraca
do puli. Koszt: 3,69 zł za numer — nie jest to rachunek do zrobienia.

Alternatywa (trzymać bezterminowo) wraca dopiero przy skali: sto martwych
numerów to 123 zł miesięcznie.

### 3. Co robi agent po wygaśnięciu płatności, PRZED zwolnieniem numeru

**Decyzja: zdanie o zawieszeniu, ale INNE W TREŚCI niż przy wyłączonym
przełączniku.**

    przełącznik OFF:   „Przepraszam, w tej chwili nie przyjmujemy zgłoszeń
                        telefonicznych."          ← decyzja warsztatu, stan trwały
    płatność wygasła:  „Przepraszam, obsługa telefoniczna jest chwilowo
                        zawieszona."              ← stan PRZEJŚCIOWY

Różnica nie jest kosmetyczna: warsztat może opłacić i wrócić tego samego dnia,
a dzwoniący, który usłyszał „nie przyjmujemy zgłoszeń", już nie zadzwoni.
Zdanie idzie do wzorców w czterech językach, jak komunikaty awarii i zajętości.

`is_active` zostaje decyzją warsztatu i nie jest przez nas przestawiane —
inaczej po opłaceniu warsztat musiałby jeszcze pamiętać, żeby coś włączyć.

---

## Co pokazać w panelu, na górze

```
┌────────────────────────────────────────────────────────┐
│  Asystent głosowy                                      │
│                                                        │
│  Agent           199 zł netto / mc   [Wybierz]         │
│  odbiera telefony, umawia wizyty, 1 rozmowa naraz      │
│                                                        │
│  Agent Pro       399 zł netto / mc   [Wybierz]         │
│  3 rozmowy naraz                                       │
│                                                        │
│  14 dni bezpłatnie. Numer telefoniczny w cenie.        │
└────────────────────────────────────────────────────────┘
```

Liczba rozmów równoczesnych jest już kolumną (`max_rozmow_rownoczesnie`),
więc różnica między pakietami jest wykonalna od razu — wystarczy ustawiać ją
z planu przy zapisie subskrypcji.

**Czego NIE pisać:** „numer w cenie" bez zastrzeżenia, jeśli zdecydujemy, że
przy rezygnacji numer wraca do nas. Warsztat musi wiedzieć, że numer jest
wynajmowany razem z usługą, a nie kupowany na własność — inaczej przy
rezygnacji będzie miał do nas słuszną pretensję.

---

## Kolejność prac

1. Odczyt planów i wyświetlenie cennika na górze zakładki (bez płatności) — 2 h
2. Bramka subskrypcji w `voice-number-activate` + wyszarzenie przycisku — 2 h
3. `billing-checkout` dla `product_line='agent'` i powrót do panelu — pół dnia
4. Zdjęcie zgody ręcznej: `pierwszy_zakup_zrobiony` przestaje bramkować — 15 min
5. `max_rozmow_rownoczesnie` z planu przy zapisie subskrypcji — 1 h
6. Karencja numeru i zadanie `zwolnienie` — pół dnia
7. Zachowanie agenta przy wygasłej płatności — 2 h

Punkty 1–2 mają sens same, bez reszty: warsztat od razu widzi cenę, a my
przestajemy kupować numery komukolwiek, kto kliknie.
