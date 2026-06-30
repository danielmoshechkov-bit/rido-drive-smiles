# Moduł Księgowość / Faktury — stan pracy

> Punkt wznowienia. Ostatnia aktualizacja: **28.06.2026**, `main` @ `14175b34`.

## Co zrobione i wdrożone 28.06.2026 (produkcja getrido.pl, main 14175b34)

- **Import KSeF zakupów** — async **eksport paczki** (`POST /invoices/exports` → polling → pobranie parts[] → weryfikacja hash → deszyfr AES-256-CBC → unzip → parser). Omija limit **64/h** na `GET /invoices/ksef`. Parser **namespace-tolerant** (`<tns:P_13>` itd.).
- **Pobierz vs Aktualizuj KSeF** — „Pobierz" = pełny miesiąc (upsert). „Aktualizuj" = **append-mode**: pre-check istniejących `ksef_number` + `ON CONFLICT DO NOTHING` → dociąga TYLKO nowe, **nie kasuje pracy księgowej** (status / kategoria AI / soft-delete nietknięte).
- **Wspólny `InvoicesModule`** — pod-zakładki Sprzedaż/Zakup, prop `source: 'invoices' | 'user_invoices'` (każdy kontener czyta swoją tabelę), wspólny okres (rok+miesiąc / zakres), wpięty w `/faktury` i portal usługodawcy.
- **Podgląd faktury (modal)** — zakup z `xml_content`; parser pozycji `FaWiersz` w 3 wariantach netto: `P_11` → `P_11A − P_11Vat` → `brutto/(1+stawka)` → `ilość × P_9A` → „—". Pobranie XML.
- **Paginacja** (5/10/20/50 + strony, po grupach), **korekty zagnieżdżone** pod oryginałem ze strzałką ↳.
- **`vat_breakdown` {23/8/5/0}** — zapis przy imporcie z `P_13_*`/`P_14_*` (autorytatywne) + **backfill 157 faktur** (akcja edge `backfill_vat_breakdown`).
- **Przegląd `MonthlyTaxOverview`** — kafle Sprzedaż/Zakupy z rozbiciem VAT per stawka, **VAT należny − naliczony** (per stawka + zbiorczo → do zapłaty/nadpłata), **dochód** (przychód netto − koszty netto), disclaimer „dane poglądowe". Loading guard (spinner zamiast migania „Skonfiguruj firmę").
- **Bug bezpieczeństwa** — faktura w KSeF (sprzedaż: `ksef_reference` / `ksef_status` ∈ accepted/processing/sent) **nieusuwalna** (checkbox wyszarzony, bulk i select-all ją pomijają). Zakupy: soft-delete z ostrzeżeniem „usuwasz swój import, dokument KSeF zostaje".
- **Kafelki Księgowości jak Warsztat** — `TileGridNav` (boczna kolumna `w-[200px]`, małe kafle 2-w-rzędzie, na razie gradient-placeholdery), treść obok po prawej, Przegląd domyślnie. Mobile = poziomy `UniversalSubTabBar` + lista zakupów jako karty.

## Pliki (16)

**Nowe (10):**
- `src/components/invoices/InvoicesModule.tsx` — wspólny moduł Sprzedaż/Zakup
- `src/components/TileGridNav.tsx` — boczne kafle nawigacji (wzór Warsztat)
- `src/components/ListPagination.tsx` — paginacja 5/10/20/50 + strony
- `src/components/accounting/MonthlyTaxOverview.tsx` — pulpit podatkowy Przeglądu
- `src/components/accounting/PurchaseInvoicePreviewModal.tsx` — podgląd faktury zakupu
- `src/utils/invoiceCorrections.ts` — `groupByCorrections` (oryginał + korekty)
- `supabase/migrations/20260628_invoices_soft_delete.sql`
- `supabase/migrations/20260628_purchase_invoices_soft_delete.sql`
- `supabase/migrations/20260628_user_invoices_soft_delete.sql`
- `supabase/migrations/20260628_ksef_purchase_invoice_type_correction.sql` (document_type + corrected_ksef_number/corrected_invoice_number)

**Zmienione (6):**
- `src/components/accounting/PurchaseInvoicesKSeF.tsx` — lista zakupów (filtr stawki VAT, korekty, mobile karty, klik→podgląd, propsy okresu/entity, forwardRef runFetch)
- `src/components/invoices/PendingInvoicesReview.tsx` — tryb `compact` (mały kafel)
- `src/components/service-provider/ServiceProviderAccountingView.tsx` — kafle TileGridNav + treść obok, loading guard, „Dodaj fakturę"
- `src/pages/InvoiceProgram.tsx` — zakładka Faktury = `InvoicesModule` (source=invoices)
- `src/components/workshop/WorkshopDashboard.tsx` — usunięty zbędny przycisk „🏠 Pulpit"
- `supabase/functions/ksef-integration/index.ts` — `export_start` (eksport paczki + append-mode), `computeVatBreakdown`, akcja `backfill_vat_breakdown`

## Tabele i ich rola

| Tabela | Rola | Klucze / kolumny istotne |
|---|---|---|
| `purchase_invoices` | **Zakupy z KSeF** (import eksportem paczki) | per `entity_id`; `ksef_number` (unikalny, onConflict); `document_type`, `corrected_ksef_number`, `corrected_invoice_number`, `vat_breakdown` (Json), `deleted_at`/`deleted_by`, `xml_content` |
| `user_invoices` | **Sprzedaż w portalu** usługodawcy/klienta | per `user_id`; pozycje w `user_invoice_items` (`vat_rate`, `net_amount`, `vat_amount`); `ksef_reference`/`ksef_status`; `deleted_at`/`deleted_by` |
| `invoices` | **Sprzedaż w `/faktury`** (InvoiceProgram) | per `entity_id`; `gross_amount`/`net_amount`/`buyer_snapshot`/`type`/`status`; `deleted_at`/`deleted_by` |

⚠️ Sprzedaż jest w DWÓCH tabelach (`invoices` vs `user_invoices`) zależnie od kontenera — `InvoicesModule` czyta wg `source`. Scalenie = dług (TODO).

## Komendy

```bash
# Deploy edge function (Supabase, ręcznie z CLI)
supabase functions deploy ksef-integration --project-ref wclrrytmrscqvsyxyvnn --no-verify-jwt

# Deploy frontu (GitHub Action → LH.pl FTP) — ręczny workflow_dispatch
gh workflow run deploy.yml --ref main
gh run watch <RUN_ID> --exit-status   # czekaj na success; FTP bywa flaky (timeout) → ponów

# Backfill vat_breakdown (akcja edge, idempotentna; only_missing:false bo default kolumny {} nie null)
curl -s -X POST https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/ksef-integration \
  -H "Content-Type: application/json" -H "apikey: <ANON_KEY>" \
  -d '{"action":"backfill_vat_breakdown","limit":1000,"only_missing":false}'
```

Migracje wykonywane ręcznie w dashboard Supabase (SQL editor); pliki w `supabase/migrations/` jako historia. Idempotentne (`ADD COLUMN IF NOT EXISTS`).

## TODO / zostało

- **ETAP 8** — zamknięcie miesiąca + wysyłka do księgowej (snapshot + blokada edycji + „Wyślij do księgowej" + strona biura). Najcięższy — **zacząć od planu z zależnościami**, nie od kodu.
- Sprawdzić **które faktury sprzedaży idą do KSeF** i czy wysyłka działa.
- W bazie **157 faktur zakupowych** (testowe pulle, nie ~80) — przy zamknięciu miesiąca sprawdzić, czy wszystkie należą do właściwego okresu (`purchase_date`), nie zliczyć obcych.
- **PDF + QR** faktur (wariant **c** — inline SVG, bez deps; QR = standard ISO/IEC 18004; do scan-testu).
- Podmienić **gradient-placeholdery kafli** na zdjęcia (`src/assets/accounting/tile-*.jpg`, mapowanie przez `img` w `TileGridNav`).
- **Scalić `invoices` + `user_invoices`** (kanoniczna tabela sprzedaży) — dług techniczny.
- `deploy.yml` — posprzątać nieprawidłowy input `passive` w akcji FTP (warning, nie blokuje).
- Ujednolicić **soft-delete sprzedaży** (`InvoiceListWithActions`/`InvoiceExpandableRow` mają miejscami twarde DELETE).

## Decyzje architektoniczne (dlaczego tak)

- **VAT z `P_14_*`** (kwoty autorytatywne z faktury), nie liczony z pozycji → zero rozjazdów groszowych.
- **„0" bucket zbiorczy** (0% / zw / np / oo) — dla pulpitu poglądowego wystarcza; nie rozbijamy dalej.
- **PIT wariant (a)** — pokazujemy tylko **dochód** (przychód netto − koszty netto), bez mnożenia przez stawkę; forma opodatkowania per spółka = późniejsze ustawienie.
- **Soft-delete wszędzie** (`deleted_at`/`deleted_by`) — audytowalność; faktura znika z listy, zostaje w bazie ze śladem, da się cofnąć.
- **Korekty**: zakup wiąże po `corrected_invoice_number` (`NrFaKorygowanej`) → `document_number` oryginału, bo `<NrKSeF>` w `<DaneFaKorygowanej>` to FLAGA „1/2", nie numer.

## Kierunek docelowy

Własne **biuro rachunkowe jako osobna spółka**; GetRido = narzędzie księgowej. Człowiek zatwierdza, **AI robi czarną robotę**. Cel: zastąpić Raks / Symfonię.

## Poprawki — log

### 2026-06-30 — faktury: PDF mail = pobranie, scroll, sortowanie (branch `fix/faktury-poprawki`)
- **PDF wysyłany mailem ≠ pobrany — naprawione.** Oba używają `generateInvoiceHtml`, ale różnie renderowały do PDF: pobranie = `window.print()` (wektor), mail = `html2canvas→jsPDF` (raster). Mail miał 2 wady: (a) **wycinał kod KSeF QR** (`replace api.qrserver.com → ''`) — teraz QR wczytywany jako **data URL** (jak logo) i renderowany (fallback do wycięcia tylko gdy nie da się wczytać → uniknięcie taint canvas); (b) **pusta 2. strona** — dodano **przycięcie dolnego białego pasa** (skan pikseli canvas). Plik: `src/components/invoices/InvoiceExpandableRow.tsx` (`generatePdfBase64`). **Uwaga:** pełna parita wektor↔wektor wymagałaby serwerowego renderera (np. `invoice-pdf` zwraca dziś tylko HTML, nie PDF) — to osobny temat.
- **Scroll nad polem kwoty zmieniał wartość** — podpięto globalny hook `useDisableNumberInputScroll()` w `InvoicesModule` i `InvoiceProgram` (łapie też pola w dialogach edytora). Ten sam fix co w module warsztatu/zleceń.
- **Lista faktur bez porządku** — dodano drugi klucz sortowania `invoice_number` malejąco (przy tej samej `issue_date` był losowy porządek). Pliki: `InvoicesModule`, `InvoiceProgram`.
- **Do rozważenia (dług):** ujednolicić generowanie PDF do JEDNEGO źródła (serwerowy renderer HTML→PDF) dla pobierania, maila i podglądu — dziś są 2 szablony (`src/utils/invoiceHtmlGenerator.ts` vs własny w edge `invoice-pdf`) i 3 ścieżki renderu.
