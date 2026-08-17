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

`voice_pula_ustawienia.pierwszy_zakup_zrobiony` przestaje być bramką i zostaje
jako ślad historyczny. **Bezpiecznik dobowy (3 zakupy) zostaje** — on nie chroni
przed niepłacącym klientem, tylko przed naszym własnym błędem w liczeniu puli,
a ten nie znika wraz z płatnościami.

---

## Trzy decyzje, których nie podejmuję sam

### 1. Czy 14 dni triala odblokowuje numer

Plan `agent` ma `trial_days: 14`. Jeśli trial odblokowuje aktywację, ryzykujemy
1,23 zł na warsztat, który może nie zapłacić — czyli **tyle samo co dziś**,
tylko bez naszej ręcznej zgody. Jeśli nie odblokowuje, trial jest bezwartościowy
dla produktu, którego całą wartością jest odbieranie telefonów.

Rekomendacja: **trial odblokowuje**, bo 1,23 zł to koszt pomijalny przy planie
199 zł, a produkt bez telefonu nie da się wypróbować. Ryzyko ograniczają:
jeden numer na konto, bezpiecznik dobowy i zwolnienie numeru po nieopłaconym
trialu.

### 2. Co się dzieje z numerem, gdy płatność wygaśnie

Tu jest problem, którego wcześniej nie widzieliśmy i który nie jest techniczny:

**Numer zwolniony nie może od razu trafić do innego warsztatu.** Klienci starego
warsztatu dzwonią pod ten numer jeszcze miesiącami — po przypisaniu go komuś
innemu usłyszą nazwę obcej firmy, a agent zaproponuje im terminy i ceny tego
drugiego warsztatu. To wygląda jak wyciek, bo w praktyce nim jest.

Projekt: status `karencja` na **90 dni**, w którym numer jest nasz, ale
nieprzypisany i nieaktywny; dzwoniący słyszy jedno zdanie („ten numer nie jest
już obsługiwany"). Dopiero po karencji wraca do puli. Koszt: 1,23 zł miesięcznie
za numer, którego nikt nie używa — trzy złote za spokój.

Alternatywa: nie zwalniać wcale i płacić 1,23 zł bezterminowo. Przy stu
warsztatach to 123 zł miesięcznie za numery martwe — do decyzji przy skali,
nie teraz.

### 3. Co robi agent po wygaśnięciu płatności, PRZED zwolnieniem numeru

Rekomendacja: `is_active` zostaje po stronie warsztatu, ale init zwraca zdanie
o zawieszeniu obsługi — tak jak dziś przy wyłączonym przełączniku. Warsztat,
który zapomniał zapłacić, nie powinien tracić klienta w ciszy, ale i nie
powinien dostawać usługi za darmo.

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
