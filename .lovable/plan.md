
# Plan poprawy wizualnej faktury PDF

## Problem

Faktura PDF generowana przez system ma nieprawidlowe kolory:
- Naglowek tabeli z pozycjami jest szary zamiast fioletowego
- Ramka "DO ZAPLATY" nie ma kolorowego tla
- Podsumowanie faktury jest czarno-biale i nieczytelne

## Wzor do osiagniecia (foto 2 - Screenshot_2026-01-25)

Na referencyjnym zdjeciu widac prawidlowy wyglad:
- Naglowek tabeli pozycji: fioletowe tlo (#7c3aed) z bialym tekstem
- Ramka "DO ZAPLATY": fioletowe tlo z biala pogrubiona kwota
- Czytelne podsumowanie VAT

## Przyczyna problemu

Style inline w HTML sa poprawnie zdefiniowane w kodzie, ale przy eksporcie do PDF (druk przegladarki) niektore style moga byc ignorowane. Problem moze wynikac z:
1. Brak wymuszenia kolorow w media print (`-webkit-print-color-adjust: exact`)
2. Style CSS nadpisuja inline styles
3. Brak `!important` dla krytycznych kolorow

## Zmiany techniczne

### Plik: `src/utils/invoiceHtmlGenerator.ts`

**1. Dodanie wymuszenia druku kolorow (linia 265-270):**
```css
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
```

**2. Wzmocnienie stylow naglowka tabeli (linia 295):**
```css
th { 
  background: #7c3aed !important; 
  color: white !important; 
  -webkit-print-color-adjust: exact;
}
```

**3. Wzmocnienie ramki "DO ZAPLATY" (linia 302):**
```css
.totals-row.grand { 
  background: #7c3aed !important; 
  color: white !important;
  font-weight: bold;
}
```

**4. Dodanie inline styles z !important dla kluczowych elementow:**
- Naglowki tabeli `<th>`: explicit `style="background-color: #7c3aed !important; color: #ffffff !important;"`
- Wiersz DO ZAPLATY: explicit kolorowe tlo
- Kwoty: pogrubione z wiekszym fontem

**5. Ulepszenie podsumowania VAT (linie 374-401):**
- Dodanie lekkiego fioletowego tla dla naglowka tabeli podsumowania
- Lepszy kontrast dla wierszy

## Podsumowanie zmian

| Element | Obecny wyglad | Docelowy wyglad |
|---------|---------------|-----------------|
| Naglowek tabeli pozycji | Szary/bialy | Fioletowy (#7c3aed) z bialym tekstem |
| Ramka "DO ZAPLATY" | Czarny tekst bez tla | Fioletowe tlo z biala pogrubiona kwota |
| Kwota do zaplaty | Zwykla czcionka | Pogrubiona, wieksza |
| Podsumowanie VAT | Czarno-biale | Z kolorowym akcentem |

Wszystkie zmiany beda w pliku `src/utils/invoiceHtmlGenerator.ts` - modyfikacja stylów CSS i inline styles dla zapewnienia poprawnego renderowania przy drukowaniu PDF.
