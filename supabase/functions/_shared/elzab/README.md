# ElzabESC — biblioteka protokołu drukarek fiskalnych ELZAB

Surowa implementacja protokołu **ElzabESC po TCP**. Bez middleware, bez `.dll/.so`.
Ten sam kod działa w **Deno** (edge functions) i w **Node** (skrypty testowe w `scripts/elzab/`) —
różni się tylko transport (`transport-deno.ts` vs `scripts/elzab/transport-node.ts`).

## Pliki

| plik | rola |
|---|---|
| `codepages.ts` | kodery stron kodowych: CP1250, CP852 (Latin-2), Mazovia (CP790) |
| `codec.ts` | kwoty → grosze → 4 bajty LE, ilość + miejsca po przecinku, pola tekstowe stałej długości |
| `commands.ts` | buildery sekwencji (czyste funkcje → `Uint8Array`) |
| `receipt.ts` | walidacja i normalizacja paragonu **zanim** cokolwiek poleci do drukarki |
| `client.ts` | ACK/NAK, timeouty, kontrola stanu, pełny cykl paragonu |
| `errors.ts` | typowane błędy + komunikaty po polsku dla użytkownika |
| `transport-deno.ts` | TCP dla Deno (pętla odczytu w tle → kolejka, timeout nie gubi bajtów) |
| `index.ts` | publiczne API + `connectPrinter()` |

## Użycie (edge function)

```ts
import { connectPrinter } from '../_shared/elzab/index.ts';

const printer = await connectPrinter({ host, port });
try {
  const result = await printer.printReceipt({
    vatMap: { '23': 'A', '8': 'B', '5': 'C', '0': 'D', zw: 'E' },
    items: [{ name: 'Wymiana oleju silnikowego', quantity: 1, unit: 'usl', unitPrice: 150, vatRate: '23' }],
    payments: [{ name: 'GOTOWKA', amount: 150 }],
  });
  // result.receiptNumber, result.totalGrosze, result.trace
} finally {
  await printer.close();
}
```

## Co potwierdzono na sprzęcie (ELZAB Zeta Online, tryb szkoleniowy, 30.07.2026)

Testy: `npm run elzab:health`, `npm run elzab:receipt`, `npm run elzab:edge`
(ENV: `ELZAB_HOST`, `ELZAB_PORT`, domyślnie `192.168.0.114:9100`).

| sekwencja | odpowiedź drukarki | uwagi |
|---|---|---|
| `Esc 35H` odczyt zegara | `ACK` + 10 B | pary (dziesiątki, jedności): rok, mies., dzień, godz., min. **To jest healthcheck** |
| `Esc F6H` identyfikacja | **NAK** | firmware Zeta odrzuca — nie używać do sprawdzania łączności |
| `Esc 21H` otwarcie paragonu | `ACK` | |
| `Esc 06H 20H` pozycja sprzedaży | **cisza (brak ACK!)** | 51 B: nazwa 28 + A1 + ilość 4 + M + jedn. 4 + cena 4 + `Esc ST` + wartość 4 |
| `Esc 07H` koniec pozycji | **cisza** | |
| `Esc 81H` forma płatności | **cisza** | |
| `Esc 50H` kontrola stanu | `ACK` + bajt statusu | `0x00` = OK — **jedyne potwierdzenie „cichych" sekwencji** |
| `Esc 24H` zamknięcie + wydruk | `ACK` (lub `NAK` przy błędzie) | |
| `Esc 66H` nr ostatniego paragonu | `ACK` + 2 B little-endian | numer w BIEŻĄCEJ DOBIE — zeruje się po raporcie dobowym (zaobserwowane 29 → 1) |
| `Esc 54H` / `Esc 55H` status 1/2 | `ACK` + 1 B | status 2 = `0x10` po odrzuconej operacji |
| `Esc 23H` anulowanie | `ACK` (gdy paragon otwarty) / `NAK` | |

**Najważniejsze odkrycie:** pozycja sprzedaży, koniec pozycji i płatność **nie odsyłają ACK**.
Naiwna implementacja „wyślij i czekaj na ACK" wisi do timeoutu. Potwierdzeniem jest `Esc 50H`.
Robi to `client.sendSilent()`.

**Drugie:** niezgodność sumy pozycji z sumą w `Esc 07H` **nie** jest zgłaszana od razu —
`Esc 07H` i `Esc 81H` przechodzą bez protestu, a dopiero `Esc 24H` zwraca **NAK**
i drukarka sama unieważnia paragon (wydruk `#ANULOWANY#`, status 2 = `0x10`).
Dlatego walidujemy sumy lokalnie w `receipt.ts`, zanim wyślemy cokolwiek.

Czasy: połączenie ~500 ms, pełny paragon (2 pozycje) ~4 s.

## Zasady

- kwoty **w groszach**, 4 bajty little-endian; nigdy `float` — `toGrosze()` liczy na stringach
- nazwa towaru: min. **5 znaków znaczących** (błąd `B`), pole stałej długości 28 lub 40 znaków
- polskie znaki: strona kodowa **per tenant** (`fiscal_printers.codepage`) — patrz niżej
- pozycja o wartości 0 unieważnia paragon (błąd `R`) — odrzucamy ją lokalnie
- stawki VAT: litera z mapy **per tenant** (`vat_map` w `fiscal_printers`), nigdy na sztywno
- timeout paragonu w drukarce: 20 minut
- raport dobowy: brak przez 48 h → drukarka blokuje sprzedaż

## Strony kodowe — polskie znaki

Koder nigdy nie gubi znaku: każdy znak daje co najmniej jeden bajt, a spoza tablicy idzie
transliteracja ASCII, w ostateczności `?` (0x3F). Jeśli polskie litery **znikają na wydruku**,
to znaczy, że drukarka ma inną stronę kodową i po cichu odrzuca nieznane bajty.

### Wynik dla ELZAB Zeta Online: **CP852** (potwierdzone 30.07.2026)

Mapa bajtów (`npm run elzab:bytemap`, paragon nr 6) pokazała, że urządzenie ma wgrane
glify polskie **wyłącznie na pozycjach CP852**:

| wiersz mapy | wydrukowane glify | bajty CP852 |
|---|---|---|
| `80=` | ć, ł, Ź, Ć | 86, 88, 8D, 8F |
| `90=` | Ś, ś, Ł | 97, 98, 9D |
| `A0=` | ó, Ą, ą, Ę, ę, ź | A2, A4, A5, A8, A9, AB |
| `B0=` | Ż, ż | BD, BE |
| `E0=` | Ó, Ń, ń | E0, E3, E4 |
| `C0=`, `D0=`, `F0=` | prawie puste | drukarka nie ma tych glifów |

Wiersze kontrolne `852m=ąćęłńóśźż` i `852W=ĄĆĘŁŃÓŚŹŻ` wyszły w komplecie; `1250m`, `L2m`,
`MAZm` — puste albo pojedyncze litery. Dlatego `DEFAULT_CODEPAGE = 'cp852'`
i taki sam default ma kolumna `fiscal_printers.codepage`.

**Wniosek na przyszłość:** drukarka nie sygnalizuje błędu przy nieznanym bajcie — po prostu
go nie drukuje. Znikające znaki na papierze zawsze znaczą „zła strona kodowa", nigdy „zły koder";
koder ma test, który pilnuje, że liczba bajtów = liczba znaków.

### Jak ustalić stronę kodową na nowym urządzeniu

```bash
npm run elzab:codepage        # drukuje jeden paragon: ten sam alfabet w 3 stronach kodowych
DRY_RUN=1 npm run elzab:codepage   # sam podgląd bajtów
```

Na papierze widać, która grupa pozycji ma poprawne `ą ć ę ł ń ó ś ź ż` — ta wartość
trafia do `fiscal_printers.codepage`.

| znak | CP1250 | CP852 (Latin-2) | Mazovia (CP790) |
|---|---|---|---|
| ą / Ą | `B9` / `A5` | `A5` / `A4` | `86` / `8F` |
| ć / Ć | `E6` / `C6` | `86` / `8F` | `8D` / `95` |
| ę / Ę | `EA` / `CA` | `A9` / `A8` | `91` / `90` |
| ł / Ł | `B3` / `A3` | `88` / `9D` | `92` / `9C` |
| ń / Ń | `F1` / `D1` | `E4` / `E3` | `A4` / `A5` |
| ó / Ó | `F3` / `D3` | `A2` / `E0` | `A2` / `A3` |
| ś / Ś | `9C` / `8C` | `98` / `97` | `9E` / `98` |
| ź / Ź | `9F` / `8F` | `AB` / `8D` | `A6` / `A0` |
| ż / Ż | `BF` / `AF` | `BE` / `BD` | `A7` / `A1` |

## Układ pozycji na wydruku — granica firmware'u

Linię pozycji składa firmware drukarki, nie host. Reguła jest deterministyczna i została
zweryfikowana na paragonie nr 28:

> pozycja łamie się na dwie linie wtedy i tylko wtedy, gdy `długość nazwy + długość linii
> liczb > 42 kolumny`

| nazwa | znaków | + liczby | razem | wynik |
|---|---|---|---|---|
| Czołowa szyba | 13 | 27 | 40 | jedna linia |
| Płyn chłodniczy | 15 | 27 | 42 | jedna linia |
| Łożysko prawe wymiana | 21 | 27 | 48 | dwie linie |
| Błotnik przedni prawy malow. i wymiana | 38 | 27 | 65 | dwie linie |

**Czego NIE da się zrobić z poziomu protokołu** (sprawdzone eksperymentalnie, nie założone):

- **Wymusić dwóch linii dla krótkiej nazwy.** Paragon nr 29: ta sama nazwa dopełniona do
  40 znaków bajtami `0x20`, `0xA0`, `0x81`, `0x90` i `0xAD` — wszystkie cztery pozycje
  wyszły identycznie, w jednej linii. Firmware obcina wszystko po ostatnim widocznym znaku.
- **Wyrównać kolumny liczb.** Cena, wartość i ilość to pola BINARNE (4 bajty little-endian
  w groszach: `300,00 zł` = `30 75 00 00`). Nie ma ciągu znaków, który można dopełnić —
  formatowaniem i pozycjonowaniem zajmuje się firmware.
- **Wydrukować nazwę dłuższą niż 40 znaków.** `Esc 05H` to największe udokumentowane pole
  nazwy. Dłuższe nazwy trzeba skrócić (patrz `src/lib/fiscalName.ts`).
- **Wstawić własną linię tekstu.** `Esc 04H` nie jest linią opisu — drukarka po niej czeka
  na dalsze bajty (to kolejny wariant pozycji sprzedaży). Sekwencja zawiesza urządzenie,
  odblokowanie wymaga dosłania wypełniacza.

Jedyny znany przełącznik dający jednolite łamanie to **tryb 21-kolumnowy w menu drukarki**
(mechanizm MLT288 pracuje w 42 albo 21 kolumnach) — przy 21 kolumnach żadna pozycja nie
zmieści nazwy razem z liczbami. Ustawia się go na urządzeniu, nie przez protokół.

## Kontrakt modułu (branżowo neutralny)

Moduł fiskalny nie wie, skąd wzięły się pozycje. Na wejściu dostaje wyłącznie:

```ts
{
  items:    [{ name, quantity, unit, unitPrice, vatRate }],
  payments: [{ name, amount }],
  vatMap:   { '23': 'A', ... },     // z konfiguracji drukarki tenanta
  codepage: 'cp1250',               // j.w.
  documentType?: 'workshop_order',  // luźny identyfikator źródła, bez znaczenia dla modułu
  documentId?: '...uuid...'
}
```

Żadnych zapytań do tabel branżowych, żadnych FK do `workshop_*`. Podłączenie nowej branży =
wywołanie edge function z powyższym wejściem.

## Nieprzetestowane (oznaczone `TODO(hardware)`)

- `Esc 4BH` NIP nabywcy — długość pola przyjęta jako 42 znaki z dopełnieniem spacjami
- `Esc 82H` reszta — format kwoty przyjęty analogicznie do płatności

## Podłączenie drukarki u nowego klienta

**KROK 1 — zawsze zacznij od mapy bajtów.** Fabrycznie drukarki ELZAB bywają ustawione na
CP852, inne na CP1250; menu urządzenia potrafi pokazywać co innego, niż faktycznie rysuje.

```bash
ELZAB_HOST=<ip klienta> npm run elzab:bytemap    # albo npm run elzab:polish
```

Z wydruku odczytujesz, która strona kodowa ma komplet `ą ć ę ł ń ó ś ź ż`, i wpisujesz ją
w `fiscal_printers.codepage` dla tego tenanta (Ustawienia → Fiskalizacja). Bez tego kroku
polskie znaki zniknią z paragonów, a drukarka nie zgłosi żadnego błędu.

Dalej: KROK 2 — adres `host:port` w ustawieniach i „Testuj połączenie" (musi wyjść *online*),
KROK 3 — mapa stawek VAT zgodna z literami zaprogramowanymi w urządzeniu, KROK 4 — wydruk
próbny na zleceniu w trybie szkoleniowym, KROK 5 — dopiero po fiskalizacji urządzenia
przez serwis przełącz tryb na *fiskalny*.

## Mostek lokalny (drukowanie z przeglądarki)

Edge function w chmurze nie ma jak wejść do sieci lokalnej klienta, a przeglądarka nie
otworzy surowego gniazda TCP. Mostek zamyka tę lukę: mały serwer na komputerze warsztatu,
który przyjmuje HTTP z przeglądarki i gada z drukarką tą samą biblioteką co edge function.

```bash
npm run fiscal:bridge                       # nasłuchuje na http://127.0.0.1:9110
FISCAL_BRIDGE_TOKEN=tajne npm run fiscal:bridge   # z tokenem
```

W aplikacji: **Ustawienia → Fiskalizacja → Mostek lokalny (ten komputer)** — przełącznik plus
adres. Ustawienie siedzi w `localStorage` tej przeglądarki, bo mostek jest cechą KOMPUTERA,
nie tenanta (dwa stanowiska w warsztacie = dwa niezależne mostki).

Bezpieczeństwo: nasłuch tylko na 127.0.0.1, CORS ograniczony do adresów GetRido
(dowolna strona w internecie nie wydrukuje — preflight ją odetnie), opcjonalny token.
Chrome traktuje `http://127.0.0.1` jako bezpieczne pochodzenie, więc produkcyjne
`https://getrido.pl` może wołać mostek bez ostrzeżeń o mieszanej treści.

Przepływ: przeglądarka → mostek → drukarka; wynik (numer paragonu, trace) wraca do
przeglądarki, która zapisuje wiersz w `fiscal_receipts` (RLS dopuszcza INSERT dla członków
tenanta, UPDATE/DELETE pozostaje zablokowane). Gdy mostek jest wyłączony, ten sam przycisk
idzie ścieżką chmurową przez `fiscalize-receipt` — kod obsługuje oba tryby bez przełączników
w bazie.

## TODO

- **Auto-raport dobowy.** Klient nie ma stałego komputera przy drukarce, a urządzenie blokuje
  sprzedaż po 48 h bez raportu. Plan: przełącznik w ustawieniach drukarki + sprawdzenie przy
  pierwszym logowaniu / pierwszym paragonie dnia (jeśli brak raportu za wczoraj i jest
  połączenie → `fiscal-day-report` przed pierwszym paragonem) + alert w UI przy zbliżaniu się
  do 48 h. Funkcja `fiscal-day-report` przyjmuje już `skipIfDoneToday` i wywołania wewnętrzne
  kluczem service_role, więc cron/hook nie wymaga zmian w niej samej.
- **E-paragon (Faza 2).** ElzabESC nie ma komend e-paragonu — idzie przez STX + HUB
  (MojaKasa.Online albo integrator typu Paragony.pl). Gotowe: interfejs `EReceiptProvider`
  (`_shared/fiscal-providers.ts`), tabela `fiscal_ereceipts`, pola odbiorcy i zgody.
  Do zrobienia: implementacja dostawcy + wywołanie po udanym wydruku.
- **Płatność kartą (Faza 3).** Interfejs `PaymentTerminal` + tabela `fiscal_payment_intents`
  czekają na wybór dostawcy (PolCard / PeP / eService / SoftPOS). Fiskalizacja ma startować
  dopiero po statusie `paid`, z `paymentRef` = id intencji.
- **Tunel jako druga droga.** Mostek działa u klientów bez publicznego adresu. Dla klientów
  ze stałym IP alternatywą jest tunel/przekierowanie portu — wtedy wystarczy wpis `host:port`
  w `fiscal_printers` i ścieżka chmurowa (`fiscalize-receipt`) zadziała bez żadnych zmian
  w kodzie; mostek zostaje wyłączony. Przy wystawianiu drukarki na świat: włączyć szyfrowanie
  ELZAB i ograniczyć źródła połączeń.
- **Uogólnienie tenanta.** `is_fiscal_provider_member` sięga do `workshop_employees` — to
  jedyne miejsce w module, które zna warsztat. Przy pierwszej nie-warsztatowej branży
  (dźwigi, gastronomia) trzeba tę funkcję uogólnić; reszta modułu zostaje bez zmian.

## Uwaga wdrożeniowa

Edge function działa w chmurze Supabase, więc `host:port` drukarki **musi być osiągalny z internetu**
(publiczny IP z przekierowaniem portu, VPN albo tunel typu Cloudflare/Tailscale).
Adres LAN `192.168.x.x` zadziała wyłącznie z lokalnej sieci — stąd pole `connection_mode`
w `fiscal_printers`.
