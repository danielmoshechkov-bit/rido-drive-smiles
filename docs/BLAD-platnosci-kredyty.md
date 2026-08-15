# 🔴 PILNE — KUPIONE KREDYTY NIE SĄ PRZYZNAWANE

**Status: SPECYFIKACJA GOTOWA, PRACA NIEROZPOCZĘTA. Zakres zatwierdzony 15.08.**

**Dlaczego PILNE:** pierwszy płacący klient w to trafi. Dziś nikt nie ucierpiał
tylko dlatego, że nikt jeszcze nie kupił pakietu przez bramkę — patrz „Czy to
już kogoś kosztowało" niżej.

Znalezione przy projektowaniu licznika minut, poza zakresem agenta głosowego.

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


---

# SPECYFIKACJA NAPRAWY — zatwierdzona 15.08, do wykonania

## Trzy znaleziska

```
1. upsertCredits czyta z user_credits kolumny "balance" i "credit_type",
   których w tej tabeli NIE MA. Zapytanie błądzi, funkcja wychodzi bez
   przyznania. Dotyczy: sms_credits, ai_credits, ai_photo_package.

2. vehicle_lookup NIE MA ŚCIEŻKI ZAKUPU przez bramkę. Ani w
   processPaymentSuccess, ani w productTypeMap na froncie. Tabela
   vehicle_lookup_credits jest zasilana WYŁĄCZNIE przez handleAdminGrant —
   te 72 wiersze to nadania administratora, nie zakupy.

3. CICHY FALLBACK: `productTypeMap[pkg.credit_type] || "sms_credits"`.
   Każdy pakiet o nieznanym typie zostaje kupiony jako SMS. Dziś nieaktywne
   (w credit_packages są tylko sms, ai_photo, listing_featured), ale zadziała
   w dniu dodania pakietu minut albo sprawdzeń.
```

## Decyzje właściciela

```
upsertCredits    WYŁĄCZYĆ, nie zostawiać z komentarzem ostrzegawczym.
                 Zakup kredytów AI ma zwracać BŁĄD, nie milczeć.
fallback         USUNĄĆ BEZWZGLĘDNIE. Nieznany typ = błąd, nie domysł.
salda            SPRAWDZIĆ, czy istniejące nie przepadną przy migracji —
                 3 wiersze user_credits nieznanego pochodzenia,
                 3 warsztaty z sms_balance > 0, 72 wiersze vehicle_lookup.
user_credits     NIE rozbudowywać o kolumnę typu. Osobna tabela per typ,
                 bo to jedyny wzorzec, który u nas działa.
```

## Pliki

```
supabase/functions/payment-core/index.ts
    upsertCredits            wyłączyć — zwracać błąd zamiast cichej porażki
    processPaymentSuccess    case sms_credits -> service_providers.sms_balance
                             case vehicle_lookup -> vehicle_lookup_credits (NOWY)
                             e-mail DOPIERO po udanym przyznaniu
    handleAdminGrant         ujednolicić z zakupem — jedno źródło per typ

src/pages/BuyCredits.tsx
    productTypeMap           usunąć fallback, dodać vehicle_lookup
```

## Tabele

```
CZYTANE     credit_packages, payments
ZAPISYWANE  service_providers.sms_balance
            vehicle_lookup_credits
            vehicle_lookup_credit_transactions
NIETKNIĘTE  user_credits — zostaje, nie kasować (3 wiersze nieznanego pochodzenia)
```

## Migracje SQL

**Żadne nie są potrzebne** — wszystkie tabele i kolumny istnieją.
Gdyby w trakcie okazało się inaczej: pokazać przed wykonaniem.

## Alert przy nieudanym przyznaniu

Dziś jedynym śladem jest `console.error`. Ma powstać wpis w tabeli błędów
albo powiadomienie — **cicha porażka przy pieniądzach jest niedopuszczalna.**

## Test od końca do końca

Wymaga klucza Stripe w trybie testowym. **Do potwierdzenia, czy mamy go
skonfigurowany** — bez niego da się zweryfikować tylko logikę przyznawania
(wywołanie funkcji z symulowanym zdarzeniem), nie pełną ścieżkę płatności.

## Czego ta specyfikacja NIE obejmuje

```
pakiety minut agenta      osobny temat, po zamknięciu rachunku marży
cennik agenta             j.w.
ai_credits, ai_photo      zostają zepsute — świadomie, po wyłączeniu
                          upsertCredits będą zwracać błąd zamiast milczeć
```
