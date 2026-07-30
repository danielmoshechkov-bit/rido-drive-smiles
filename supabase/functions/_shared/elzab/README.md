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
(ENV: `ELZAB_HOST`, `ELZAB_PORT`, domyślnie `192.168.0.168:9100`).

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
| `Esc 66H` nr ostatniego paragonu | `ACK` + 2 B little-endian | `00 00` → 0, `01 00` → 1 |
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

Ustalenie strony kodowej jest **empiryczne**:

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

## Uwaga wdrożeniowa

Edge function działa w chmurze Supabase, więc `host:port` drukarki **musi być osiągalny z internetu**
(publiczny IP z przekierowaniem portu, VPN albo tunel typu Cloudflare/Tailscale).
Adres LAN `192.168.x.x` zadziała wyłącznie z lokalnej sieci — stąd pole `connection_mode`
w `fiscal_printers`.
