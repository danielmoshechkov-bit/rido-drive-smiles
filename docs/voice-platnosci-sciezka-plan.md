# Ścieżka zakupu agenta — co JEST, czego brakuje, plan

Sprawdzone 19.08 w kodzie i w bazie. Wynik jest lepszy, niż zakładaliśmy:
**obie bramki działają i żadna nie wymaga dotykania `upsertCredits`.**

---

## 1. STRIPE → SUBSKRYPCJE. Działa dla planu `agent`.

```
billing-checkout   mode: "subscription"            ✔
                   line_items[0][price] = plan.stripe_price_id
                   subscription_data[metadata]: plan_id, subscriber_type,
                                                subscriber_id, user_id
billing_plans      agent      199,00  is_active=TRUE   stripe_price_id: price_1U…  ✔
                   agent_pro  399,00  is_active=FALSE  BEZ CENY W STRIPE           ❌
billing-stripe-webhook  checkout.session.completed → INSERT billing_subscriptions  ✔
```

### Webhook NIE MUSI przyznawać minut — i to jest zaleta

Minuty nie są przyznawane zdarzeniem. Są **limitem planu**:

```
billing_plan_features:  agent 200 (ostrzeżenie przy 185)
                        agent_pro 440 (ostrzeżenie przy 425)
```

W chwili, gdy webhook zapisze subskrypcję, `feature_limit()` zaczyna zwracać
200, a saldo pojawia się samo. **Nie ma kodu, który mógłby tego nie zrobić** —
nie ma więc przypadku „zapłacił i nie dostał minut". Odnowienie abonamentu
resetuje pulę bez żadnego zadania, bo `billing_usage` jest kluczowane okresem.

**Jedyne, czego brakuje po stronie Stripe: `agent_pro` nie ma ceny i jest
wyłączony.** Bez tego można sprzedać wyłącznie pakiet podstawowy.

---

## 2. PAYU → DOKUPOWANIE. Działa, bez ani jednej linijki kodu.

```
billing-payu-order    zamówienie z billing_addon_products po `code`      ✔
billing-payu-webhook  → billing_wydaj_paczke(order_id)                   ✔
billing_wydaj_paczke  INSERT billing_addon_packs (feature_id z produktu,
                      expires_at z waznosc_dni → NULL = nie wygasa)      ✔
```

Funkcja jest **ogólna**: działa dla dowolnego produktu, bo bierze `feature_id`
z wiersza produktu. Dwie dodatkowe gałęzie w środku (`sms` → księga SMS,
`vehicle_lookup` → kredyty pojazdów) to **lustra dla starych mechanizmów**,
nie warunek działania.

**Minuty nie potrzebują własnej gałęzi.** Produkt jest już założony:

```
billing_addon_products:  voice_minutes  1,15/szt  krok 50  is_active = FALSE
```

Włączenie sprzedaży to zmiana `is_active` na `true`. Nie wdrożenie.

---

## 3. Jedno saldo, dwa źródła — dokładnie Twój model

Nie ma i nie będzie tabeli `voice_minute_balance`. Ten sam podział jest już
w bazie, tylko **liczony, a nie przechowywany**:

| Twoja nazwa | Skąd | Wygasa |
|---|---|---|
| pakietowe | `feature_limit()` − `billing_usage.used` w bieżącym okresie | tak, przy odnowieniu — samo |
| dokupione | `billing_addon_packs.amount_remaining` z `expires_at IS NULL` | nie |

`billing_consume` zużywa **najpierw pulę z planu, potem paczki FIFO**
(`expires_at ASC NULLS LAST` — bezterminowe na końcu kolejki), potem debet.
To jest Twoja zasada, napisana wcześniej przy SMS-ach.

Kolumna przechowująca saldo byłaby **trzecim** miejscem prawdy obok tych dwóch
i pierwszym, które się rozjedzie.

---

## 4. `upsertCredits` — nie dotykamy, bo nie leży na tej ścieżce

Minuty idą przez `billing_addon_packs` i `billing_usage`. `upsertCredits`
obsługuje `user_credits` (SMS, AI, zdjęcia) i **nie pojawia się w ścieżce
minut ani razu**. Izolacja, o którą prosisz, jest darmowa — nie trzeba jej
budować.

Do odnotowania: `upsertCredits` **nie jest dziś zepsute** — naprawione jest
na `main` i na produkcji (`credits_balance`). Zepsuta jest nasza gałąź.

---

## 5. 🔴 TRYB TESTOWY STRIPE — tu jest jedyny prawdziwy problem

```
sekrety na projekcie:  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
przełącznik trybu:     BRAK — kod czyta jedną nazwę
```

Nie mogę odczytać wartości sekretu i nie będę tego robił, więc **nie wiem, czy
obecny klucz jest testowy czy produkcyjny.** `billing-stripe-sync` rozpoznaje
tryb po prefiksie `sk_live_`, co znaczy, że oba są przewidziane — ale w jednej
zmiennej naraz.

**Konsekwencja: przełączenie na tryb testowy = podmiana `STRIPE_SECRET_KEY`
na `sk_test_…` dla CAŁEGO systemu.** W bazie jest jedna aktywna subskrypcja
(warsztat `0ec5f6f6`, linia `warsztat`, do 13.09). Po podmianie klucza jej
webhooki przestaną się zgadzać.

Trzy drogi:

1. **Sprawdź, jakim kluczem jest dziś `STRIPE_SECRET_KEY`.** Jeśli testowym —
   nie ma problemu, wszystko już jest w trybie testowym i kupujemy kartą 4242.
2. **Osobne sekrety + przełącznik w kodzie** (`STRIPE_SECRET_KEY_TEST`,
   `STRIPE_WEBHOOK_SECRET_TEST`, np. po `billing_settings.tryb_testowy`).
   ⚠️ To zmiana w `billing-checkout` i `billing-stripe-webhook` — **plikach
   drugiej sesji.** Zgodnie z ustaleniem: nie ruszam ich bez uzgodnienia.
3. **Test na PayU zamiast Stripe** — PayU ma osobne środowisko piaskownicy
   i dotyka wyłącznie dokupowania, więc nie ryzykuje subskrypcjami.

---

## 6. Pierwszy warsztat — ZABEZPIECZONY

```sql
INSERT INTO billing_addon_packs (…, amount_total, amount_remaining, expires_at,
                                 source, note)
VALUES (…, 200, 200, NULL, 'admin_grant',
        'warsztat testowy — przed uruchomieniem platnosci');
```

Wykonane. Sprawdzenie po nadaniu:

```json
check_usage('service_provider','664ed87b…','voice_minutes',1)
→ {"allowed": true, "reason": "tylko_paczki", "remaining": 200, "packs_remaining": 200}
```

Paczka **nie wygasa** (`expires_at NULL`) i działa **niezależnie od
subskrypcji** — `billing_consume` odmawia tylko wtedy, gdy nie ma ani planu,
ani paczek. Pierwszy warsztat nie przestanie odbierać, także gdy bramka
kiedyś ruszy.

---

## 7. Co zostaje do zbudowania

| # | Co | Ile | Czyje pliki |
|---|---|---|---|
| 1 | naliczanie minut w `voice-call-postprocess` + zapasowe w `reconcile` | 2 h | nasze |
| 2 | RPC salda: pula + paczki − rozmowy w toku | 1 h | nasze |
| 3 | kafelek w nagłówku (usługodawca i zwykły użytkownik) | 1 h | wspólny `TopBarCredits` |
| 4 | okno pakietów przed aktywacją + blokada przełącznika bez subskrypcji | 3 h | nasze |
| 5 | rozszerzenie „Połączeń": minuty, koszt, filtry | 4 h | nasze |
| 6 | widok admina: warsztat / subskrypcja / saldo / stan agenta | 3 h | nowy plik |
| 7 | cena `agent_pro` w Stripe + włączenie planu | — | Twoja strona |
| 8 | tryb testowy Stripe | zależy od drogi z pkt 5 | ⚠️ pliki drugiej sesji |

Punkty 1–3 nie zależą od płatności i nie blokują nikogo: warsztat widzi
zużycie, my widzimy, czy naliczanie jest szczelne.
