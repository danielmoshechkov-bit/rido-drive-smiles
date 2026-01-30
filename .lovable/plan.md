

# Plan naprawy dwóch problemów: Modal "Dodaj pojazd" i selektor daty

## Zidentyfikowane problemy

### Problem 1: Modal "Dodaj pojazd" nie dopasowuje się do strony
- Na zrzucie ekranu (foto 1) widać, że modal ma zbyt dużo białego miejsca i nie jest wyśrodkowany poprawnie
- Modal używa `max-w-2xl` ale może być zbyt szeroki dla niektórych ekranów
- Brak odpowiedniego stylowania dla responsywności

### Problem 2: Wybór daty nie działa poprawnie
- **Wpisywanie ręczne**: Po wpisaniu np. "01022026" (8 cyfr) wyświetla się błędna data jak "0002-02-01" zamiast "01.02.2026"
- **Kalendarz**: Gdy użytkownik wybiera rok i miesiąc z dropdown → automatycznie zapisuje datę BEZ możliwości wybrania dnia
- Problem leży w logice `DatePickerWithNav` w `ExpiryBadges.tsx`:
  - Linia 62-68: Auto-zapis gdy 8 cyfr → błędne parsowanie
  - Linia 118, 128: Zmiana roku/miesiąca wywołuje `setMonth` ale nie czeka na wybór dnia

---

## Szczegóły techniczne napraw

### Naprawa 1: Modal "Dodaj pojazd" (`AddVehicleModal.tsx`)

**Zmiany w DialogContent (linia 143):**
```typescript
// PRZED:
<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">

// PO:
<DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
```

Dodatkowo upewnić się, że:
- Modal używa `overflow-hidden` na zewnątrz i `overflow-y-auto` na środku
- Padding jest odpowiedni dla mobile (`p-4` zamiast domyślnego `p-6`)

---

### Naprawa 2: DatePickerWithNav (`ExpiryBadges.tsx`)

**A) Zmiana logiki inputu ręcznego (linia 57-68):**

Problem: Data jest parsowana błędnie. "01022026" jest interpretowane jako "0002-02-01".

**Naprawa:**
```typescript
const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const val = e.target.value.replace(/\D/g, "").slice(0, 8);
  setInputValue(val);
  
  // Parse only when 8 digits AND user explicitly confirms (e.g., blur or Enter)
  // Remove auto-parse here - will add explicit button
};

const confirmManualInput = () => {
  if (inputValue.length === 8) {
    // Parse as DD MM YYYY
    const day = parseInt(inputValue.slice(0, 2), 10);
    const monthNum = parseInt(inputValue.slice(2, 4), 10);
    const yearNum = parseInt(inputValue.slice(4, 8), 10);
    
    const parsed = new Date(yearNum, monthNum - 1, day);
    if (isValid(parsed) && parsed.getDate() === day) {
      onSelect(parsed);
      onClose();
    } else {
      toast.error("Nieprawidłowa data");
    }
  }
};
```

**B) Zmiana logiki kalendarza (dropdown miesiąc/rok):**

Problem: Zmiana miesiąca lub roku z dropdowna od razu zapisuje datę.

**Naprawa:**
- Dropdown zmienia tylko widok kalendarza (`setMonth`)
- Zapis następuje TYLKO po kliknięciu konkretnego dnia w kalendarzu
- Obecny kod już to robi poprawnie w `handleDaySelect`, ale trzeba usunąć przypadkowe auto-zamykanie

**C) Dodać przycisk "Zapisz" dla ręcznego wpisywania:**
```tsx
<div className="flex gap-2">
  <Input
    value={formatInputDisplay(inputValue)}
    onChange={handleInputChange}
    onKeyDown={(e) => e.key === "Enter" && confirmManualInput()}
    placeholder="dd.mm.rrrr"
    className="text-center font-mono flex-1"
    maxLength={10}
  />
  <Button size="sm" onClick={confirmManualInput} disabled={inputValue.length !== 8}>
    OK
  </Button>
</div>
```

---

## Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/AddVehicleModal.tsx` | Poprawić responsywność modala |
| `src/components/ExpiryBadges.tsx` | Naprawić logikę DatePickerWithNav |

---

## Kryteria akceptacji

1. Modal "Dodaj pojazd" wyświetla się poprawnie na różnych ekranach
2. Wpisanie "01022026" w polu daty formatuje się jako "01.02.2026" i zapisuje poprawnie
3. Wybór roku i miesiąca z dropdown NIE zapisuje daty - dopiero kliknięcie dnia
4. Kalendarz pozwala nawigować po miesiącach/latach bez przypadkowego zapisu

