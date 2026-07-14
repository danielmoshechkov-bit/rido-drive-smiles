# DZIENNIK — moduł Warsztat / Serwis (GetRido)

> Jeden stały dziennik projektu. **Najnowsze na górze.** Nowe sesje dopisują sekcję z datą, nie nadpisują.
> Projekt: GetRido, Supabase ref `wclrrytmrscqvsyxyvnn`, repo `danielmoshechkov-bit/rido-drive-smiles`.

---

## 2026-07-14 — Daty zakończenia i zapłaty w oknie płatności (branch `feat/warsztat-daty-platnosci`)

### Status
- ✅ Kod gotowy (3 commity, `tsc` czysty po każdym), **bez pushu/PR** — czeka na testy Daniela.
- **ZERO migracji** — oba pola już były w bazie: `workshop_orders.completed_at` (ustawiane w `WorkshopStatusPicker`) i `workshop_payments.paid_at` (WYN1, default `now()`).

### Model dwóch osi czasu (decyzja Daniela — nie zmieniać)
- **`completed_at`** (data zakończenia) → miesiąc PRZYCHODU/KOSZTU/ZYSKU zlecenia w raportach (koszt = części+robocizna jedzie ze zleceniem, nigdy z zapłatą).
- **`paid_at`** (data zapłaty) → miesiąc WPŁYWU w kasie/przepływie (realna gotówka).
- **Dług = realny stan**: liczony ze WSZYSTKICH wpłat zlecenia niezależnie od daty — po spłacie znika także w starym miesiącu.

### Co zrobione
1. `WorkshopPaymentDialog`: dwa edytowalne pola (`WorkshopDatePicker`, default dziś) — „Data zakończenia zlecenia" (u góry; UPDATE `completed_at` via `useUpdateWorkshopOrder`) i „Data zapłaty" (obok „Dodaj formę"; `paid_at` w insercie — `useCreateWorkshopPayments` dostał param `paidAt`). Timestamp: dziś → `now()` (kolejność w feedzie), wstecz → `T12:00:00Z` (bez off-by-one przy `slice(0,10)`). Kolejność zapisu: najpierw `completed_at` (idempotentne), potem wpłaty — retry po błędzie nie dubluje płatności.
2. `WorkshopReports`: płatności pobierane BEZ zakresu dat (`useWorkshopPaymentsRange(providerId)`) — „Zapłacono/Dług" per zlecenie z wszystkich wpłat; przychód/koszt/zysk dalej po `completed_at`.
3. `WorkshopCashPanel` — „Rozliczenie miesięcy": nowe kolumny **Zapłacono/Dług** (zlecenia zakończone w miesiącu; dług = Σ max(0, przychód−wpłaty) per zlecenie, czerwony gdy >0). Wpływy/wynik miesiąca bez zmian (po `paid_at`).

### Uwagi
- Cutoff kasy (`created_at > cash_started_at`) nietknięty — backdatowana wpłata ma świeży `created_at`, nie wypada po resecie.
- Edycja operacji kasowej (`WorkshopOpDialogs`) nadal NIE edytuje daty zapłaty — ewentualny follow-up.
- Archiwum zamknięć (`workshop_cash_closures`) bez kolumn paid/debt (wymagałoby migracji) — Zapłacono/Dług tylko w widoku na żywo.

---

## 2026-06-28 — Poprawki Raportów warsztatu (branch `fix/warsztat-raporty` → main PR #5, merge `ec7d396e`)

### Status
- ✅ **Zmergowane do `main`** przez PR #5 (merge `ec7d396e`). Bez konfliktów (origin/main nie ruszył od bazy `7f8476c0`). **Deploy prod: do wykonania ręcznie** (patrz „Następne kroki").
- Bez migracji, `types.ts` nietknięty, `tsc` czysty na każdym kroku.

### Co zrobione (moduł Warsztat → Raporty)
- **Rozliczenie zleceń — uproszczenie:** kolumny **Przychód → Koszt → Zysk → Zapłacono** (usunięto mylącą „Części"); ujednolicone nazwy + tooltipy (i). Etykieta „Koszt" = koszt zlecenia (zakup części + robocizna, jak „Wydasz łącznie" na karcie). Usunięto przełącznik **„Licz po"** — raport liczy po **dacie utworzenia** (`created_at`) na stałe.
- **Zapłacono/Dług wg `cash_enabled`** (`useWorkshopFinanceSettings`): Kasa **OFF** → zlecenie „Zakończone" = zapłacone 100% (`Zapłacono=Przychód`), kolumna/kafelek **Dług** i „Jak płacili" ukryte. Kasa **ON** → `Zapłacono` = realne `workshop_payments` (!voided), **Dług** = Przychód − Zapłacono. (Naprawa „maj = 0" przy wyłączonej Kasie.)
- **Filtr statusu — anty-rozjazd:** badge'y budowane z realnych `status_name` zleceń scalonych z `workshop_order_statuses` (denormalizowany `status_name` bywał ≠ nazwy statusu, np. „Zaakceptowano" vs „Akceptacja klienta"; `status_id` często null). Filtruje `reportOrders` po `status_name`; kafelki/Suma z przefiltrowanych.
- **Druk / PDF:** przycisk „Drukuj / PDF" pojawia się po „Pokaż raport"; czysty widok **A4 w nowym oknie** (`printHtmlDocument`, jak faktury) — nagłówek (warsztat/okres/data) + podsumowanie + opcjonalnie lista zleceń (dropdown **Podsumowanie / + lista**). Utile: `workshopReportPrintHtml.ts`, `workshopCompanyReportHtml.ts`.
- **Nowy raport „Działalność firmy"** (`WorkshopCompanyReport`): realny wynik **kasowy** (wpływy − koszty) vs **memoriałowy** (przychód zleceń wg wybranych statusów − koszty), pokazane oba. Koszty wyszczególnione: pracownicze (= `workshop_employee_payouts`: wypłaty+zaliczki+premie), czynsz, opłaty stałe, zakupy, wypłaty z kasy/właściciela (`workshop_expenses` wg kategorii), prowizje portalu = placeholder 0. **Anty-dublowanie:** robocizna liczona TYLKO z payouts, NIGDY `labor_cost` (labor_cost zostaje w Raporcie zleceń / marży). Czynsz rozpoznawany po nazwie (czynsz/najem/wynajem) z łagodną degradacją (brak dopasowania → kwota w „Opłaty stałe", suma zawsze poprawna).
- **Nowa zakładka „Statystyki"** (`WorkshopStatsReport`, recharts — już w repo): liczba zleceń, nowi vs powracający klienci, śr. wartość zlecenia, śr. marża (ważona = zysk/przychód), wykres słupkowy (przychód+liczba zleceń/mies.) + kołowy (nowi vs powracający). Struktura gotowa do rozbudowy.

### Decyzje / uwagi
- **Service worker** (`VitePWA`, `registerType:'autoUpdate'`, scope `/`) **cache'uje bundle per origin (host:port)** → przy testach lokalnych potrafi serwować stary kod mimo świeżego serwera i Cmd+Shift+R. Objaw „nie widzę zmian" = stary SW z innego worktree na tym samym porcie. Testować na **świeżym porcie / incognito**, albo Unregister SW w DevTools. Na prodzie autoUpdate sam podmieni po wejściu.
- Pliki: `src/components/workshop/WorkshopReports.tsx` (rdzeń), `WorkshopCompanyReport.tsx`, `WorkshopStatsReport.tsx`; utile druku w `src/utils/workshop*Html.ts`.

### Następne kroki
1. **Deploy prod** — ręcznie: GitHub Action „Deploy to LH.pl" (`workflow_dispatch`, input `confirm_deploy=tak`). FTP bywa flaky (timeout) — ponawiać.

---

## 2026-06-28 — Moduł finansowy Kasy (branch `feature/warsztat-finanse` → main PR #3)

### Status na koniec sesji
- ✅ **Zmergowane do `main`** przez PR #3 (merge commit `ceba1438`). Brak konfliktów (main zmieniał tylko `types.ts`, feature 35 innych plików — rozłączne).
- ✅ **Deploy prod WYKONANY** (ręcznie, 2026‑06‑28) — na serwerze LH.pl jest. (Uwaga: automatyczne `gh workflow run` padało wcześniej 2× na „Upload to LH.pl" → `Error: Timeout (control socket)` — flaky FTP; ostatecznie deploy przeszedł ręcznie. Jeśli `gh` znów timeoutuje, ponowić lub wgrać ręcznie.)
- ✅ **Migracje WYN1‑10 + WYN‑CLEANUP zaaplikowane ręcznie** na prod bazie (Daniel, SQL Editor). `types.ts` zregenerowany przez Lovable.
- Dev lokalny: worktree `/Users/moshechkov/rido-warsztat-finanse` (branch `feature/warsztat-finanse`), Vite na `localhost:8082`.

### Co zbudowane
- **Panel Kasa** (zakładka „Sprzedaż" → „Kasa"; kafelek modułu „Kasa"). Układ od góry: Pulpit dnia → stan kasy (gotówka/konto/dziś/do pobrania) → kolorowe przyciski akcji → przepływ okresu → należności/operacje → **rozliczenie miesięcy** (dół).
- **Akcje w oknach (modale), nie nawigacja:** Dodaj wpłatę (🟢, → `workshop_payments`), Dodaj wypłatę (🔴) / Zakup / Opłata (→ `workshop_expenses`, pełny formularz: kategoria/podkat./kwota/forma/data/pracownik/opis/dokument/zarejestrował).
- **Storno + edycja operacji:** „Anuluj" = miękkie storno (wymaga KTO + POWÓD), operacja przekreślona „Anulowano", **wykluczona z sald/przepływu/raportów/płac/rozliczenia miesięcy**. Edycja kwoty/formy/opisu ze śladem.
- **Audyt:** pole „Zarejestrował" (`created_by_name`) na operacjach; `user_id` (nullable) pod przyszłe logowanie pracowników.
- **Magazyn FIFO (Kasa↔Magazyn):** dodanie części z magazynu → zejście FIFO; usunięcie/usunięcie zlecenia → zwrot do partii pierwotnej; po „Zakończone" zejście ostateczne. **Opcjonalny** (patrz decyzje).
- **Zamknięcie miesiąca (opcja A):** picker miesiąca kalendarzowego (1.–ostatni dzień), podsumowanie (zlecenia/przychód/koszt/zysk/marża/wydatki/wynik/gotówka), zapis do archiwum, **reset kasy** (zerowanie natychmiastowe), anty‑duplikat w UI, usuwanie wpisu archiwum.
- **Opłaty stałe + Rentowność:** zakładka „Opłaty stałe" (cykliczne weekly/monthly, przypomnienia kolorami **zielony ≤7 / żółty ≤3 / czerwony ≤0/po terminie**, „Zatwierdź" → wydatek). Karta Rentowność: koszty stałe ÷ miesiąc (tyg. ×4,33) vs wpływy → plus/minus.
- **Rozliczenie miesięcy na żywo:** lista miesięcy liczonych na bieżąco (niezależnie od zamknięcia); status „zatwierdzony" (w archiwum, + kosz) / „otwarty — poglądowo".
- **Płace:** grafik warsztatu (dni robocze + godziny), stawki `pay_rate`/`pay_unit`, rozliczenie okresu (należność − wypłacono = pozostało), zaliczki/wypłaty/**premie**.
- **Raporty:** Rozliczenie zleceń (okres=wspólny kalendarz, status multi, stanowiska multi, części/przychód/koszt/zysk/zapłacono + „jak płacili"), oraz Klienci / Pracownicy / Sprzedaż.
- **Drill‑down wpływów:** klikalne kafelki „Wpływy"/„Wydatki" (przepływ) i „Wpływy w tym miesiącu"/„Koszty stałe/miesiąc" (rentowność) → okno z listą pozycji + „Razem".
- **Wspólny kalendarz** (`WorkshopRangeCalendar` + `WorkshopDatePicker`): zakres klik=start → hover podgląd → klik=koniec; szybkie Tydzień/Miesiąc. Używany w Kasie, Raportach, opłatach.
- **Scroll‑fix:** scroll myszką nad polem liczbowym NIE zmienia wartości (cały moduł) — `useDisableNumberInputScroll` w `WorkshopDashboard`.
- Wcześniej (poprzedni merge `fix/warsztat-wycena-duplikaty`): duplikaty wyceny, wydajność karty, kolumna Pojazd/tooltip, menu podpisu, edycja klienta osoba/firma + NIP, skrót nazwy firmy.

### Migracje (pliki w `supabase/migrations/`, aplikowane RĘCZNIE w Supabase SQL Editor)
- **WYN1** `workshop_payments` — płatności klienta (method gotowka/karta/blik/przelew, amount, order_id/invoice_id, paid_at); płatność podzielona = kilka wierszy.
- **WYN2** `workshop_expenses` — wydatki (category zakup/oplata/wyplata, subcategory, method, document_url, expense_date, recurring_cost_id, employee_id).
- **WYN3** `workshop_recurring_costs` — opłaty cykliczne (frequency weekly/monthly, next_due_date, default_method, active) + FK `workshop_expenses.recurring_cost_id`.
- **WYN4** `workshop_employees` + `pay_rate`, `pay_unit` (hour/day/week/month); migracja z `hourly_rate`.
- **WYN5** `workshop_finance_settings` — grafik (work_days int[], work_start, work_end), per provider.
- **WYN6** `workshop_employee_payouts` — wypłaty (type zaliczka/wyplata/premia, amount, paid_at, period_start/end).
- **WYN7** `workshop_finance_settings` + `cash_enabled`, `cash_started_at` — Kasa ON/OFF + moment startu.
- **WYN8** `workshop_cash_closures` — zamknięcia miesiąca (period_from/to, liczby zbiorcze, cash_end, closed_at).
- **WYN9** kolumny storno+audyt na payments/expenses/payouts: `voided`, `voided_by`, `void_reason`, `voided_at`, `created_by_name`, `edited_by_name`, `edited_at`, `user_id`.
- **WYN10** `workshop_order_items` + `inventory_product_id` (FK `inventory_products`) — link Kasa↔Magazyn.
- **WYN‑CLEANUP** (jednorazowe) — `DELETE FROM workshop_cash_closures WHERE period_from = period_to` (testowe duplikaty jednodniowe).
- Wszystkie idempotentne (`IF NOT EXISTS` / `DROP POLICY…CREATE`), RLS per `provider_id` (`provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())`).

### Kluczowe pliki i hooki
- `src/hooks/useWorkshopFinance.ts` — RDZEŃ: payments/expenses/recurring/payouts/finance-settings/closures/cash-data, storno (`useVoidCashOperation`/`useUpdateCashOperation`), `computeBaseDue` (normalizacja stawki wg grafiku, miesiąc ÷4,33), `recurringReminderLevel`, `advanceDueDate`, `PAYMENT_METHODS`/`EXPENSE_CATEGORIES`.
- `src/utils/workshopOrderTotals.ts` — `getLineTotal`, `computeOrderTotals`, `safeNumber`, `VAT_RATE` (jedno źródło prawdy sum).
- `src/utils/workshopStock.ts` — `consumeStock`/`returnStock`/`adjustStock` (FIFO magazynu, app‑side; BRAK triggera movement→partia, stan = Σ `inventory_batches.qty_remaining`).
- `src/utils/companyName.ts` — `shortenCompanyName` (formy prawne → skróty).
- `src/hooks/useDisableNumberInputScroll.ts` — globalny blok scrolla na `input[type=number]`.
- Komponenty (src/components/workshop/): `WorkshopCashPanel`, `WorkshopCashEntryDialog`, `WorkshopExpenseDialog`, `WorkshopMonthCloseDialog`, `WorkshopRecurringCosts`, `WorkshopPayroll`, `WorkshopCashSettings`, `WorkshopOpDialogs` (storno/edycja), `WorkshopBreakdownDialog` (drill‑down), `WorkshopRangeCalendar` (+`WorkshopDatePicker`), `WorkshopExtraReports` (klienci/pracownicy/sprzedaż), `WorkshopReports`, `InventoryProductAutocomplete`. Moduł montuje się w `WorkshopDashboard` (renderowany z `ServiceProviderDashboard`, route `/uslugi/panel`). Hooki danych zleceń/itemów: `src/hooks/useWorkshop.ts` (tu wpięte zejścia/zwroty magazynu w create/update/delete itemu).

### Decyzje projektowe (WAŻNE — nie zmieniać bez powodu)
- **Cutoff kasy po `created_at` (TIMESTAMP), nie po dacie.** „Od startu/po resecie" = `created_at > cash_started_at`. Dzięki temu reset miesiąca **zeruje natychmiast** (operacje z tego samego dnia wypadają). Wcześniej porównanie dat nie zerowało tego samego dnia — to był bug, naprawiony.
- **Magazyn OPCJONALNY.** Część z ręki (`inventory_product_id` null) nie rusza stanu — stary sposób działa jak zawsze. Wybór z magazynu = link + zejście. Brak stanu = **ostrzeżenie, NIE blokada** (opcja b). Zwrot **do partii pierwotnej** (po `batch_id` z ruchu out). Po „Zakończone" zejście ostateczne (bez zwrotu). FIFO liczone w aplikacji (brak triggera).
- **Zamknięcie miesiąca = opcja A:** pełny miesiąc kalendarzowy (picker), nie „od startu do teraz" ani „jeden dzień". Reset = przesunięcie `cash_started_at` (BEZ kasowania danych). Anty‑duplikat w UI (nie w DB). Ostatni dzień miesiąca liczony LOKALNIE (nie `toISOString` — UTC cofał o dzień).
- **Przychód ≠ Wpływy:** „Przychód" (rozliczenie miesięcy) = wartość zakończonych zleceń; „Wpływy"/„Gotówka w kasie" = realna kasa (`workshop_payments`). Drill‑down to respektuje.
- **Raport A (marża)** liczy koszt z `unit_cost` zlecenia; **Raport B/Kasa (przepływ)** z realnych płatności/wydatków — żeby nie dublować części.

### Zasady robocze (utrzymać)
- **Migracje DB = TWARDY STOP.** Pokaż SQL w jednym bloku, **nazwa migracji w 1. linii komentarza** (`-- WYNx: …`), Daniel odpala ręcznie w Supabase. Nie pushować do bazy z CLI (psql/`supabase db push` odpada — historia migracji repo rozjechana z prod).
- **`src/integrations/supabase/types.ts` — NIE ruszać ręcznie.** Auto‑generowany, Lovable regeneruje z żywej bazy po migracjach. Kod używa `(supabase as any).from('workshop_…')`, więc nie zależy od typów.
- **Jeden serwer / jedna baza:** prod Supabase (`wclrrytmrscqvsyxyvnn`, URL+anon hardcoded w `client.ts`, brak `import.meta.env` dla Supabase). Brak lokalnego Dockera/Supabase (Docker u Daniela zepsuty). Testy na `localhost:8082` biją w prod bazę.
- **CC i Lovable (LV) NIGDY na tym samym branchu/working tree jednocześnie.** Praca CC w osobnym **worktree** (`feature/warsztat-finanse`); `main` w innym oknie. Merge przez **gh PR (server‑side)**, żeby nie ruszać cudzego working tree. Konfliktów git CC **nie rozwiązuje sam** — STOP i pokaż.
- **tsc po każdym kroku** (`npx tsc --noEmit`). Brak testów w repo (CLAUDE.md) — nie twierdzić „testy przeszły". Weryfikacja przez UI.
- **Deploy = ręczny** GitHub Action „Deploy to LH.pl" (`workflow_dispatch`, input `confirm_deploy=tak`). Merge nie deployuje. FTP bywa flaky (timeout) — ponawiać.

### Następne kroki (dla kolejnej sesji)
1. ~~Ponowić deploy prod~~ — ✅ zrobione ręcznie 2026‑06‑28, na serwerze.
2. Drugie okno (`main`) zsynchronizować: `git pull --ff-only origin main`.
3. Ewentualnie: integracja GUS REGON/CEIDG dla pełnej nazwy JDG po NIP (biała lista VAT nie zwraca nazwy handlowej — wymaga klucza API); kolumna `short_name` jeśli trzeba trzymać pełną+skróconą; magazyn dla klient‑facing `/warsztat/klient/:code`.
