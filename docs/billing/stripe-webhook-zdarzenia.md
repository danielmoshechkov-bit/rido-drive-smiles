# Stripe → webhook: jakie zdarzenia muszą być włączone

Funkcja `billing-stripe-webhook` obsługuje **osiem** zdarzeń. Jeśli któregoś nie
ma na liście w panelu Stripe, odpowiadająca mu gałąź kodu **nigdy się nie
wykona** — bez błędu, bez logu, bez żadnego objawu poza tym, że coś „nie działa".

Adres punktu końcowego:

```
https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/billing-stripe-webhook
```

---

## ⚠️ Najpierw jedno ostrzeżenie

**Nie zakładaj nowego punktu końcowego — edytuj istniejący.**

Każdy punkt końcowy ma własny **sekret podpisu** (`whsec_…`). Nasz siedzi
w sekretach Supabase jako `STRIPE_WEBHOOK_SECRET`. Nowy punkt = nowy sekret =
funkcja zacznie odrzucać **wszystkie** powiadomienia jako podrobione, bo podpis
przestanie się zgadzać. Objaw: płatności przechodzą u operatora, a u nas nic
się nie dzieje.

**Tryb testowy i produkcyjny mają OSOBNE listy zdarzeń.** Zmiana w jednym nie
przenosi się do drugiego. Przełącznik trybu jest w prawym górnym rogu panelu.

---

## Krok po kroku

1. Wejdź na **https://dashboard.stripe.com**.

2. W prawym górnym rogu sprawdź **tryb**. Testujemy kartą `4242 4242 4242 4242`,
   więc zaczynasz od **trybu testowego** — a po przejściu na prawdziwe płatności
   powtarzasz całość w produkcyjnym.

3. Menu **Developers** (u dołu po lewej albo w prawym górnym rogu, zależnie od
   wersji panelu) → **Webhooks**.

4. Na liście znajdź punkt kończący się na **`/billing-stripe-webhook`**
   i kliknij w niego. **Nie klikaj „Add endpoint".**

5. Na stronie punktu, w sekcji **Listening for** (albo „Events to send"),
   kliknij **`...` → Update details** albo **Edit events** — nazwa przycisku
   zmienia się między wersjami panelu, chodzi o edycję listy zdarzeń.

6. Wyszukaj i **zaznacz** dwa nowe:

   - `customer.subscription.pending_update_applied`
   - `customer.subscription.pending_update_expired`

7. Przy okazji sprawdź, czy zaznaczone jest **wszystkie osiem** z listy niżej.
   Brakujące dopisz.

8. **Save / Update endpoint.**

---

## Pełna lista — wszystkie osiem

| zdarzenie | co dzięki niemu działa |
|---|---|
| `checkout.session.completed` | zakup kartą zakłada albo aktualizuje subskrypcję |
| `invoice.paid` | przedłużenie okresu **i wystawienie faktury VAT** |
| `invoice.payment_failed` | wejście w karencję po nieudanym pobraniu |
| `customer.subscription.updated` | zmiana planu i okresu, także robiona ręcznie w panelu Stripe |
| `customer.subscription.deleted` | anulowanie subskrypcji |
| `charge.refunded` | zwrot |
| **`customer.subscription.pending_update_applied`** | **klient opłacił zaległy rachunek za wejście w górę — plan wchodzi też u nas** |
| **`customer.subscription.pending_update_expired`** | **zaległy rachunek przepadł po 23 godzinach — zostaje ślad w logu** |

Zdarzenia spoza tej listy funkcja przyjmuje i **świadomie ignoruje**
(`zakoncz("ignored")`), więc zaznaczenie czegoś nadmiarowego niczego nie psuje —
poza zaśmieceniem dziennika.

---

## Jak sprawdzić, że zadziałało

**Bez czekania na klienta.** Na stronie punktu końcowego w Stripe jest zakładka
z ostatnimi dostawami. Po dodaniu zdarzeń:

1. wejdź na kartę punktu → **Send test webhook**,
2. wybierz `customer.subscription.pending_update_applied`,
3. wyślij.

Oczekiwany wynik: **HTTP 200** po stronie Stripe. W logach funkcji
(`Supabase → Edge Functions → billing-stripe-webhook → Logs`) zobaczysz wtedy
jedno z dwóch:

- `zmiana_planu_doszla_pozniej` — trafiliśmy w wiersz subskrypcji,
- `zmiana_planu_bez_wiersza` — dane testowe Stripe’a nie odpowiadają żadnej
  naszej subskrypcji. **To też jest sukces tego sprawdzenia**: znaczy, że
  zdarzenie DOTARŁO i weszło w naszą gałąź. Danych testowych operator nie
  dopasuje do prawdziwej subskrypcji, bo ich u niego nie ma.

Czego NIE chcesz zobaczyć: braku jakiegokolwiek wpisu. To znaczy, że zdarzenie
nie przyszło — czyli nie zapisało się na liście.

---

## Kiedy to jest naprawdę potrzebne

Tylko w jednym przypadku, ale kosztownym: klient zmienia plan **w górę**, karta
odrzuca rachunek za różnicę, klient opłaca go później z maila od Stripe. Bez
tych dwóch zdarzeń miałby wyższy plan u operatora — i płacił za niego — mając
u nas dalej niższy zakres funkcji.

Pieniądze by szły, dostęp nie. I nikt by tego nie zauważył, bo obie strony
z osobna „działają".
