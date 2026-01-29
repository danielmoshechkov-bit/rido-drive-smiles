
# Plan: Edycja daty wynajmu pojazdu dla użytkowników flotowych

## Problem
Na screenshocie widać że użytkownik widzi datę "od: 29.01.2026", ale nie może jej edytować. Jeśli auto zostało wynajęte wcześniej, a dane były wprowadzane później - system oblicza wynajem niepoprawnie.

## Analiza kodu

Komponent `VehicleRentBlock.tsx` (linia 74) zawiera warunek:
```tsx
{userRole === "admin" && onAssignedAtChange ? (
  // kalendarz do edycji
) : (
  // tylko odczyt
)}
```

Ten warunek blokuje możliwość edycji daty dla użytkowników typu `fleet`. Rozwiązanie polega na zmianie warunku, aby również użytkownicy flotowi mogli edytować datę wynajmu swoich pojazdów.

## Zmiany techniczne

### Plik: `src/components/ui/VehicleRentBlock.tsx`

**Zmiana warunku na linii 74:**
```tsx
// BYŁO:
{userRole === "admin" && onAssignedAtChange ? (

// BĘDZIE:
{onAssignedAtChange ? (
```

To pozwoli edytować datę każdemu, kto ma przekazaną funkcję `onAssignedAtChange`, niezależnie od roli użytkownika.

### Struktura logiki

```text
+--------------------------------+
| Pole "Wynajem: zł/tydz."       |
+--------------------------------+
| [600]  od: [📅 29.01.2026]     |  <-- kliknięcie w datę otwiera kalendarz
+--------------------------------+
         ↓
+--------------------------------+
|        KALENDARZ               |
|   < styczeń 2026 >             |
|   [ wybierz dzień ]            |
+--------------------------------+
         ↓
+--------------------------------+
| Zapisuje do bazy:              |
| driver_vehicle_assignments     |
|   → assigned_at = nowa_data    |
+--------------------------------+
```

## Efekt
- Użytkownicy typu `fleet` będą mogli kliknąć na datę i wybrać prawidłową datę rozpoczęcia wynajmu
- System rozliczeń będzie obliczał opłatę zgodnie z faktyczną datą wynajmu (nie datą wprowadzenia danych)
- Zachowana jest pełna kompatybilność z adminami
