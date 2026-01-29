
# Plan: Responsywny modal dodawania pojazdu

## Problem
Modal "Dodaj pojazd" jest za wysoki dla mniejszych ekranów - przycisk "Zapisz pojazd" jest ucięty i niewidoczny (widać to na zrzucie ekranu gdzie okno kończy się na checkboxie AC).

## Rozwiązanie
Dodać ograniczenie wysokości i scrollowanie do modala, a footer z przyciskami zostawić na stałe widoczny na dole.

## Zmiany techniczne

### Plik: `src/components/AddVehicleModal.tsx`

1. **Dodać max-height i overflow do DialogContent**:
   - Ograniczyć wysokość modala do `max-h-[90vh]` (90% wysokości ekranu)
   - Struktura flex z `flex-col`

2. **Scrollowalna treść formularza**:
   - Opakować grid z polami w div z `overflow-y-auto flex-1`
   - Dodać padding na dole (`pb-4`) żeby był odstęp od footera

3. **Sticky footer z przyciskami**:
   - `DialogFooter` zostaje poza obszarem scrollowania
   - Dodać `border-t pt-4` dla wizualnego oddzielenia
   - Usunąć `mt-4` z footera (border-t daje wystarczający odstęp)

### Struktura po zmianach:
```text
+---------------------------+
| DialogHeader              |
+---------------------------+
| Scrollowalna część        |
| - Nr rej, VIN             |
| - Marka, Model            |  <-- overflow-y-auto
| - Rok, Kolor              |
| - ...ubezpieczenia        |
+---------------------------+
| DialogFooter (sticky)     |
| [Anuluj] [Zapisz pojazd]  |
+---------------------------+
```

## Efekt
- Modal zawsze mieści się w widocznym obszarze ekranu
- Użytkownik zawsze widzi przycisk "Zapisz pojazd"
- Formularz jest scrollowalny jeśli nie mieści się w całości
- Działa poprawnie na wszystkich rozdzielczościach (desktop, laptop, tablet)
