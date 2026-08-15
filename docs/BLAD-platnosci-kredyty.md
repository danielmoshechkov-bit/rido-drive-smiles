# 🔴 KUPIONE KREDYTY NIE SĄ PRZYZNAWANE — `payment-core`

**Znalezione 15.08 przy projektowaniu licznika minut. NIE NAPRAWIONE.**
Poza zakresem agenta głosowego, ale dotyczy pieniędzy, więc zgłaszam osobno.

## Na czym polega

`payment-core` po opłaceniu zamówienia woła `upsertCredits`, a ta funkcja
czyta z tabeli `user_credits` kolumny, **których w niej nie ma**:

```ts
// payment-core:630
const { data: existing, error: readErr } = await supabase
  .from("user_credits")
  .select("id, balance")              // <- kolumna "balance" NIE ISTNIEJE
  .eq("user_id", userId)
  .eq("credit_type", creditType)      // <- kolumna "credit_type" NIE ISTNIEJE
  .maybeSingle();

if (readErr) {
  fail("odczyt salda", readErr);
  return;                              // <- WYCHODZI BEZ PRZYZNANIA CZEGOKOLWIEK
}
```

Rzeczywiste kolumny `user_credits`:

```
id | user_id | credits_balance | created_at | updated_at
```

**Ani `balance`, ani `credit_type`.** Zapytanie zwraca błąd, funkcja loguje
i wychodzi. Klient płaci i nie dostaje nic.

## Co przez to przechodzi

```
sms_credits          pakiety SMS 19 / 59 / 129 PLN
ai_credits           pakiety kredytów AI
ai_photo_package     pakiety zdjęć AI 5 / 15 PLN
```

Wszystkie trzy idą przez `upsertCredits`. **Wszystkie trzy nie przyznają nic.**

`vehicle_lookup` jest **wyjątkiem i działa poprawnie** — ma własną tabelę
`vehicle_lookup_credits`, zapisuje do niej i front z niej czyta (72 wiersze
w bazie). To jest wzorzec, który zadziałał.

## Dodatkowo: e-mail potwierdzający wychodzi mimo błędu

Zaraz po `upsertCredits` leci `rido-mail` z potwierdzeniem płatności —
**bez sprawdzenia, czy kredyty faktycznie zostały przyznane.** Klient dostaje
maila „Potwierdzenie płatności" i puste saldo.

## Drugi, osobny rozjazd — ten opisany w komentarzu przy linii 619

Nawet gdyby `upsertCredits` działała, saldo SMS **i tak trafiłoby nie tam,
gdzie aplikacja je czyta**:

```
zakup (case "sms_credits")   -> upsertCredits -> user_credits
przyznanie przez admina       -> service_providers.sms_balance
aplikacja czyta               -> service_providers.sms_balance   (TopBarCredits.tsx:34)
```

Ścieżka administratora działa, ścieżka płatna nie. To wyjaśnia, dlaczego błąd
mógł nie wyjść wcześniej — **salda nadawane ręcznie działały.**

## Czy to już kogoś kosztowało

```
payments — jedyny typ z opłaconym zamówieniem: marketplace_purchase (1 sztuka)
service_providers z saldem SMS > 0: 3      (prawdopodobnie nadane ręcznie)
user_credits: 3 wiersze                    (bez kolumny typu — nie wiadomo czego dotyczą)
```

**Nie znalazłem ani jednego opłaconego zamówienia na kredyty.** Czyli błąd
istnieje, ale **prawdopodobnie jeszcze nikogo nie kosztował** — bo nikt
jeszcze nie kupił pakietu przez bramkę.

⚠️ To jest jednocześnie dobra i zła wiadomość: dobra, bo nie ma reklamacji
do obsłużenia. Zła, bo **ta ścieżka nigdy nie została przetestowana z prawdziwą
płatnością** i wyszłaby dopiero przy pierwszym płacącym kliencie.

## Co naprawić

1. **`upsertCredits` — dopasować do rzeczywistego schematu.** Albo dodać
   `credit_type` i `balance` do `user_credits`, albo przepisać funkcję na
   istniejące kolumny. Wymaga decyzji, bo `user_credits` bez typu nie uniesie
   trzech rodzajów kredytów.
2. **Jedno źródło salda per typ**, wzorem `vehicle_lookup_credits`.
3. **E-mail potwierdzający dopiero po udanym przyznaniu**, nie równolegle.
4. **Test płatności od końca do końca** przed uruchomieniem sprzedaży pakietów.

## Dlaczego to blokuje licznik minut

Minuty miały iść tą samą ścieżką. **Gdybym zbudował je na `upsertCredits`,
odziedziczyłyby ten sam błąd** — z tą różnicą, że minuty mają być głównym
modelem rozliczeniowym produktu, a nie dodatkiem.
