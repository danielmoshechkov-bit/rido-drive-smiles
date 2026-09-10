# AUTO-SERWIS HAWRYLUK — wystawienie faktury do opłaconej płatności

**Do wykonania po migracji `20260910095342`.** Wcześniej nie zadziała: odnośnik
płatności jest zajęty przez skasowany wiersz.

## Stan

| co | wartość |
|---|---|
| zamówienie | `MF4W6851B6260909GUEST000P01` |
| kiedy | 09.09.2026, 09:51 |
| kwota | 84,87 zł brutto (69,00 netto + 23% VAT) |
| pozycja | Pakiet Rido AI — 200 pytań |
| status zamówienia | `oplacone` |
| faktura | GR/2026/007 — **skasowana 09.09 o 12:18**, nowej brak |

Numer **007 nie wróci** — należy do CART78GARAGE (decyzja z 10.09). Nowa faktura
dostanie kolejny wolny numer; nadaje go funkcja, nie człowiek.

## Dlaczego wywołaniem funkcji, a nie zapisem w bazie

Faktura to nie jeden wiersz. To numer z serii, pozycje, sumy liczone „w stu"
od kwoty brutto, PDF i mail. Wstawienie wiersza `INSERT`-em dałoby dokument,
który wygląda jak faktura i nie przeszedł przez żadną z tych rzeczy — a różnicę
widać dopiero przy kontroli.

## Polecenie

Klucz `service_role` weź z panelu Supabase → Settings → API. Nie zapisuj go
w pliku ani w historii powłoki — wklej do zmiennej w tej jednej sesji:

```bash
read -rs KLUCZ   # wklej klucz service_role i naciśnij Enter

curl -sS -X POST \
  'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/billing-invoice-issue' \
  -H "Authorization: Bearer $KLUCZ" \
  -H 'Content-Type: application/json' \
  -d '{
    "external_payment_ref": "payu:MF4W6851B6260909GUEST000P01",
    "buyer_name": "AUTO-SERWIS HAWRYLUK",
    "buyer_nip": "5272946550",
    "buyer_address": "Kuźnicy Kołłątajowskiej 46, 02-495 Warszawa",
    "buyer_email": "serwishawryluk@gmail.com",
    "payment_method": "payu",
    "items": [{
      "name": "Pakiet Rido AI — 200 pytań",
      "quantity": 1,
      "unit": "szt",
      "unit_gross_price": 84.87,
      "vat_rate": 23
    }]
  }'

unset KLUCZ
```

Dane nabywcy przepisane z `service_providers` — te same, których użyłby webhook.
`unit_gross_price`, nie netto: operator pobrał konkretną kwotę i to ona
rozstrzyga, a funkcja liczy „w stu", żeby suma zgadzała się co do grosza.

## Czego się spodziewać

Odpowiedź `{"ok":true,"invoice_number":"GR/2026/0NN", ...}` — numer będzie
kolejnym wolnym, **nie 007**.

Mail wyjdzie od razu (KSeF stoi na `integration`, więc nie wstrzymuje poczty).

## Sprawdzenie po wykonaniu

```sql
SELECT invoice_number, buyer_name, buyer_email,
       email_sent_at, email_error, ksef_status, created_at
FROM user_invoices
WHERE external_payment_ref = 'payu:MF4W6851B6260909GUEST000P01'
  AND deleted_at IS NULL;
```

Ma być **dokładnie jeden wiersz**, z numerem innym niż `GR/2026/007`
i wypełnionym `email_sent_at`. Pusty `email_sent_at` z wpisem w `email_error`
znaczy, że mail nie wyszedł — zadanie `billing-faktura-mail-ponow` spróbuje
ponownie w ciągu dziesięciu minut.

## Jeśli odpowiedź brzmi `duplicate: true`

Znaczy to, że aktywna faktura do tej płatności już istnieje — sprawdź
zapytaniem wyżej, zanim cokolwiek zrobisz dalej. Przed poprawką z 10.09 ta
odpowiedź przychodziła także dla faktury SKASOWANEJ i była fałszywa; po
poprawce znaczy to, co mówi.
