# KSeF — przełączenie z `integration` na `production`

**Spisane 09.09.2026.** Instrukcja, nie wykonanie. Na produkcji numer KSeF jest
nieodwracalny: dokumentu nie da się wycofać, można go tylko skorygować, a korekta
też trafia do ewidencji i zostaje tam na zawsze.

## Stan zastany (zmierzony, nie założony)

| co | wartość |
|---|---|
| NIP tokenu KSeF | `5223377431` |
| NIP sprzedawcy na fakturach platformy | `5223377431` — **zgodne**, KSeF nie odrzuci z tego powodu |
| sprzedawca | GETRIDO SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ |
| środowisko | `integration` |
| token testowy | jest, stan `connected` |
| token produkcyjny | **jeszcze nie wpisany** |
| `ksef_send_invoices_enabled` | `true` |
| `ksef_auto_send_enabled` | `true` |
| faktury z numerem KSeF | zero — wszystkie `not_sent` |

Zgodność NIP-ów jest tu najważniejsza. KSeF uwierzytelnia po NIP-ie właściciela
tokenu i odrzuca dokument, w którym sprzedawca ma inny numer. Te dwa NIP-y żyją
w różnych tabelach (`company_settings` i `user_invoice_companies`), więc mogą się
rozjechać przy pierwszej zmianie danych firmy — **sprawdź je jeszcze raz tuż
przed przełączeniem**.

## 1. Gdzie wpisać token produkcyjny

**Panel klienta → zakładka KSeF** (komponent `KsefUserSettings`, dostępny
z `/klient`). Zalogowany na koncie platformowym — tym samym, które wskazuje
`billing_settings.platform_invoice_user_id`.

W panelu: przełącz środowisko na **Produkcyjne**, wklej token produkcyjny,
zapisz. Panel trzyma tokeny w osobnych szufladkach, więc **wpisanie
produkcyjnego nie kasuje testowego** — można wrócić.

Nie wpisuj tokenu zapytaniem SQL. Panel zapisuje jednocześnie token, środowisko
i stan; ręczny `UPDATE` na jednej kolumnie zostawi pozostałe niespójne.

## 2. Co dokładnie zmienia się w `company_settings`

Zapis z panelu rusza **pięć** kolumn wiersza konta platformowego:

| kolumna | z | na |
|---|---|---|
| `ksef_token_production` | puste | token produkcyjny |
| `ksef_status_production` | `—` | `connected` po udanym teście |
| `ksef_environment` | `integration` | `production` |
| `ksef_token` | token testowy | **token produkcyjny** |
| `ksef_status` | `connected` (dot. testu) | stan produkcji |

Dwie ostatnie to pola „bieżące" — lustro szufladki aktualnie wybranego
środowiska. Czyta je `ksef-integration`, więc to one rozstrzygają, dokąd
naprawdę pójdzie faktura.

`ksef_token_test` i `ksef_status_test` **zostają nietknięte**.

Czego zapis NIE rusza: `ksef_send_invoices_enabled` i `ksef_auto_send_enabled`.
Oba są już `true`, więc po przełączeniu środowiska wysyłka ruszy **od razu, przy
pierwszej opłaconej płatności**. Jeśli chcesz najpierw sprawdzić samo połączenie,
zdejmij `ksef_auto_send_enabled` przed przełączeniem i podnieś po teście.

## 3. Jak sprawdzić, ZANIM wystawisz prawdziwą fakturę

Trzy kroki, w tej kolejności. Żaden nie tworzy dokumentu w KSeF.

**a) Test połączenia — nic nie wysyła.** W panelu KSeF przycisk testu
połączenia. Pod spodem `ksef-integration` z akcją `test_connection`: pobiera
token dostępowy na NIP i tokenie, i nic więcej. Zielony wynik znaczy, że token
produkcyjny jest ważny i przypisany do tego NIP-u.

**b) Wygenerowanie XML bez wysyłki.** Akcja `generate_xml` składa dokument
w formacie FA(3) i oddaje go do obejrzenia. Sprawdź w nim sprzedawcę (NIP,
nazwa, adres), nabywcę i sumy. To jest ostatni moment, w którym błąd w danych
jest darmowy.

**c) Zgodność NIP-ów jeszcze raz.** Zapytanie z sekcji „Stan zastany" —
`nip_tokenu_ksef` musi równać się `nip_sprzedawcy_na_fakturze`.

Dopiero potem prawdziwa płatność.

## 4. Co z fakturami wystawionymi na `integration`

**Trzeba je wysłać jeszcze raz — na produkcji.** Numer nadany na środowisku
integracyjnym nie istnieje w prawdziwym KSeF; z punktu widzenia ewidencji taka
faktura nie została wysłana wcale.

Nie zrobi tego jednak ani ponowne kliknięcie, ani zadanie dokańczające:
`ksef-integration` przy akcji `send` sprawdza `ksef_status` i przy `accepted`
odpowiada „faktura była już wcześniej wysłana", nie próbując niczego. Żeby
wysłać ponownie, trzeba najpierw wyczyścić na tych fakturach `ksef_status`,
`ksef_reference`, `ksef_session_ref`, `ksef_invoice_ref` i `ksef_environment`.

**To jest zmiana danych — przygotuję ją jako migrację i pokażę do wklejenia,
gdy będziesz przełączał.** Zakres wyjdzie z zapytania:

```sql
SELECT invoice_number, ksef_environment, ksef_reference, created_at
FROM user_invoices
WHERE ksef_reference IS NOT NULL AND ksef_environment <> 'production'
ORDER BY created_at;
```

Dziś to zapytanie zwraca **zero wierszy** — nic jeszcze nie poszło. Po Twoim
teście na integration pojawią się tam dokumenty testowe i wtedy lista będzie
miała treść.

**Uwaga na kolejność.** Faktura z nadanym `ksef_reference` jest zamrożona:
wyzwalacz `prevent_ksef_frozen_invoice_update` blokuje zmianę jej treści
**i miękkie skasowanie**. Czyszczenie pól KSeF jest możliwe, ale ma iść przed
jakąkolwiek inną poprawką na tych dokumentach.

## 5. Czego ta zmiana NIE dotyka

- **Modułu faktur klientów** (`SimpleFreeInvoice`, moduł księgowy warsztatów).
  Warsztaty mają własne wiersze `company_settings` i własne tokeny; przełączenie
  konta platformowego nie rusza żadnego z nich.
- **`ksef_settings`** — konfiguracja per encja dla modułu księgowego, dziś pusta.

## 6. Zabezpieczenie, które przestanie działać po przełączeniu

Dziś `billing-invoice-issue` wstrzymuje maila z fakturą, dopóki nie dostanie
numeru KSeF — ale **wyłącznie na `production`**. Na `integration` mail idzie
niezależnie od wyniku, bo atrapa numeru z testu nie może blokować poczty klienta.

Po przełączeniu wstrzymywanie zacznie obowiązywać naprawdę. Znaczy to, że przy
awarii KSeF klient nie dostanie faktury od razu — dostanie ją, gdy numer dojdzie,
z zadania `billing-faktura-mail-ponow` (co 10 minut). To jest zamierzone: klient
nie może dostać faktury bez numeru, a potem drugiej z numerem.

Faktury czekające widać zapytaniem:

```sql
SELECT invoice_number, buyer_email, ksef_status, email_error, created_at
FROM user_invoices
WHERE email_sent_at IS NULL AND deleted_at IS NULL
  AND email_error IS DISTINCT FROM 'stan sprzed wprowadzenia sladu wysylki — nie ponawiamy'
ORDER BY created_at;
```
