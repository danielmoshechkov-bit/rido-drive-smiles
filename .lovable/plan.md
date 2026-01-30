
# Plan naprawy 5 zgłoszonych problemów

## Analiza problemow

### Problem 1: Czarne litery na ciemnym tle w podsumowaniu faktury (Foto 1)
**Lokalizacja:** `src/utils/invoiceHtmlGenerator.ts` linie 376-401
**Przyczyna:** Wiersze podsumowania VAT maja `color: #333` (ciemnoszary) ktory zlewa sie z ciemnymi tematami.
**Rozwiazanie:** Zmiana kolorow tekstu w tabeli podsumowania na biale (`#ffffff`) z kontrastowym tlem.

### Problem 2: Przycisk Edytuj nie dziala, panel boczny niewygodny (Foto 2, 3)
**Lokalizacja:** `src/components/invoices/InvoiceDetailSheet.tsx` linie 359-362
**Przyczyna:** Przycisk Edytuj jest `disabled` (linia 359).

Rowniez `InvoiceExpandableRow.tsx` juz ma dzialajacy przycisk Edytuj (linia 496-498) - problem polega na tym ze ten rozwijalny widok nie jest uzywany na wszystkich ekranach.

**Rozwiazanie:**
- Usunac atrybut `disabled` z przycisku Edytuj w `InvoiceDetailSheet.tsx`
- Dodac import i integracje `InvoiceEditDialog` do `InvoiceDetailSheet.tsx`

### Problem 3: OCR bez AI
**Odpowiedz:** NIE - podstawowe parsowanie faktur bez AI wymagaloby:
- Dedykowanego parsera PDF z biblioteka typu pdf.js
- Algorytmow rozpoznawania struktury (regex dla NIP, IBAN, dat)
- Mapowania pol specyficznych dla polskich faktur
- To jest osobny development (kilka dni pracy)

Gemini AI jest jedynym obecnym mechanizmem ekstrakcji. Mozna jednak ulepszyc UX poprzez:
- Lepszy komunikat o bledzie ("Brak klucza API Gemini - wypelnij dane recznie")
- Wskazowki jak skonfigurowac Gemini

### Problem 4: OC/Przeglad daty nie reaguja na klikniecie (Foto 4)
**Lokalizacja:** `src/components/ExpiryBadges.tsx`
**Przyczyna:** Popover jest osadzony wewnatrz `CollapsibleTrigger` w FleetManagement.tsx co powoduje ze klikniecie propaguje sie do rodzica i rozwija wiersz zamiast otwierac kalendarz.

**Rozwiazanie:** 
Zmiana implementacji aby popover byl renderowany w portalu z wyzszym z-index i dodatkowo zabezpieczenie przed propagacja eventu poprzez:
- Dodanie `onPointerDownOutside` z `e.preventDefault()`
- Uzycie `modal={true}` na Popover  
- Zmiana struktury Badge z PopoverTrigger na osobny Button

### Problem 5: Szablon umowy najmu z pliku DOC
**Odpowiedz:** Potrzebuje od Ciebie:
1. Przeslac plik .doc/.docx z umowa najmu
2. Uzyjemy narzedzia `document--parse_document` do ekstrakcji tresci
3. Stworzymy szablon HTML z placeholderami (np. `{{imie}}`, `{{nazwisko}}`, `{{numer_rejestracyjny}}`)
4. Dodamy generator umow analogiczny do generatora faktur

---

## Zmiany techniczne

### Plik 1: `src/utils/invoiceHtmlGenerator.ts`
Zmiana kolorow w tabeli podsumowania faktury na kontrastowe:
- Linie 376-401: zmiana `color: #333` na dynamiczne kolory z kontrastem
- Dodanie ciemniejszego tla dla naglowkow tabeli

### Plik 2: `src/components/invoices/InvoiceDetailSheet.tsx`
- Import `InvoiceEditDialog` (linia 1-25)
- Dodanie stanu `showEditDialog` (linia 57)
- Usuniecie `disabled` z przycisku Edytuj (linia 359)
- Dodanie handlera `handleEdit` oraz komponentu `InvoiceEditDialog` (po liniach 365)

### Plik 3: `src/components/ExpiryBadges.tsx`
Calkowita przebudowa interakcji z Popover:
- Zmiana z `asChild` na bezposredni Button jako trigger
- Dodanie `modal={true}` do Popover
- Poprawki `onOpenChange` z explicit kontrola stanu
- Uzycie `onPointerDownCapture` do wstrzymania propagacji

---

## Podsumowanie odpowiedzi na pytania

| # | Problem | Mozna naprawic? | Uwagi |
|---|---------|-----------------|-------|
| 1 | Czarne litery na tle | TAK | Zmiana kolorow w HTML generator |
| 2 | Edytuj nie dziala | TAK | Odblokowanie przycisku + integracja dialogu |
| 3 | OCR bez AI | NIE (wymaga osobnego developmentu) | Ulepszenie komunikatu bledu |
| 4 | Daty OC/Przeglad | TAK | Przebudowa propagacji eventow w ExpiryBadges |
| 5 | Szablon umowy | WYMAGA PLIKU | Przeslij plik .doc z umowa |

---

## Weryfikacja dzialania dat (punkt 4) - 4 kroki

Po implementacji wykonam:
1. Test klikniecia w badge OC - sprawdzenie czy otwiera sie kalendarz
2. Test wyboru dnia w kalendarzu - czy zapisuje date
3. Test zmiany miesiaca/roku przez selecty
4. Test wpisania daty recznej (8 cyfr np. 22122026)
