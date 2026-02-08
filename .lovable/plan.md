
# Plan Naprawy UI Mapowania Kierowców i Kart Paliwowych

## Zdiagnozowane Problemy

### Problem 1: Alert pokazuje 3 rekordy, a modal pokazuje tylko 1

**Przyczyna:** 
- Alert `newRecordsAlert` zlicza osobno rekordy z `unmapped_settlement_drivers` ORAZ kierowców bez `driver_app_users`
- Modal `UnmappedDriversModal` filtruje kierowców po `uber_id`, `bolt_id`, `freenow_id`:
  ```typescript
  const uberDrivers = unmappedDrivers.filter(d => d.uber_id);
  const boltDrivers = unmappedDrivers.filter(d => d.bolt_id);
  const freenowDrivers = unmappedDrivers.filter(d => d.freenow_id);
  ```
- Kierowcy auto-utworzeni mogą nie mieć `uber_id` (np. parser nie zapisuje go poprawnie)

**Dowód z bazy:**
- Aneta Sknadaj i "asd sda" i "test tess" są w bazie jako kierowcy bez `driver_app_users.user_id`
- Ale w modalu pokazuje się tylko 1 rekord - reszta nie ma przypisanego platform_id

**Rozwiązanie:**
- Poprawić wykrywanie nowych rekordów w `handleCheckUnmappedDrivers`
- Dodać kierowców bez platform_id do listy jako "Bez platformy" lub pokazać ich w osobnej sekcji

---

### Problem 2: Zbyt duży wiersz w tabeli mapowania

**Przyczyna:** 
Komponent `renderDriverSelector` zwraca `<div className="space-y-2">` z osobnym inputem wyszukiwania i listą - każdy element zajmuje dużo miejsca.

**Rozwiązanie:**
Zmienić na kompaktowy design typu Combobox/Popover:
- Jeden wiersz z przyciskiem "Wybierz kierowcę ▼"
- Po kliknięciu rozwija się dropdown z wyszukiwarką
- Dodać przycisk "+" do tworzenia nowego kierowcy

---

### Problem 3: Kliknięcie kierowcy w liście nie zamyka dropdownu

**Przyczyna:**
W `renderDriverSelector` linia 329:
```typescript
onClick={() => onSelect(recordId, driver.id)}
```

Funkcja `handleMapping` aktualizuje state `mappings`, ale nie zamyka dropdownu - brak stanu `openDropdowns`.

**Rozwiązanie:**
- Dodać stan kontrolujący który dropdown jest otwarty
- Po wybraniu kierowcy zamknąć dropdown i pokazać potwierdzenie wyboru

---

### Problem 4: Paliwo - brak nowych kart w modalu

**Przyczyna:**
Modal pobiera nieprzypisane karty paliwowe w `fetchUnmappedFuelCards()` ale query:
- Sprawdza tylko karty z transakcjami z ostatniego miesiąca
- Porównuje z `drivers.fuel_card_number`
- System ma tabelę `fuel_cards` ale jest pusta - nie jest używana!

**Dowód z bazy:**
- Karta `0010206980198` jest w `fuel_transactions` ale NIE jest przypisana do żadnego kierowcy

**Rozwiązanie:**
- Wykorzystać tabelę `fuel_cards` jako centralną bazę kart paliwowych
- Przy imporcie transakcji paliwowych automatycznie dodawać nowe karty do `fuel_cards`
- Modal powinien porównywać z `fuel_cards` a nie liczyć na żywo

---

### Problem 5: Przycisk "Aktualizuj kierowców" bez funkcji

**Lokalizacja:** `DriversManagement.tsx` linia 452-461

**Obecny kod:**
```typescript
onClick={() => {
  toast.info('Funkcja aktualizacji kierowców - w przygotowaniu');
}}
```

**Rozwiązanie:**
Ukryć przycisk do czasu implementacji funkcji (zakomentować lub dodać warunek `false &&`)

---

## Pliki do Modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/fleet/UnmappedDriversModal.tsx` | Kompaktowy dropdown, obsługa zamykania po wyborze, przycisk "+" dodaj kierowcę |
| `src/components/DriversManagement.tsx` | Ukryć przycisk "Aktualizuj kierowców" |
| `src/components/FleetSettlementsView.tsx` | Poprawić liczenie nowych rekordów |

---

## Szczegóły Techniczne

### Zmiana 1: Kompaktowy Driver Selector w UnmappedDriversModal

**Przed:**
```
[  Szukaj kierowcy...    ]
┌────────────────────────┐
│ — Nie wybrano —        │
│ ASHRAF ABDELBAKY...    │
│ Dominik Andrzej...     │
└────────────────────────┘
```

**Po:**
```
┌─────────────────────┬───┐
│ Wybierz kierowcę  ▼ │ + │  <-- kliknięcie otwiera dropdown
└─────────────────────┴───┘
```

Po wybraniu:
```
┌─────────────────────┬───┐
│ ✓ Aneta Sknadaj     │ ✕ │  <-- ✕ czyści wybór
└─────────────────────┴───┘
```

**Implementacja:**

```tsx
// Nowy state dla otwartych dropdownów
const [openSelectors, setOpenSelectors] = useState<Record<string, boolean>>({});

const renderCompactDriverSelector = (
  recordId: string,
  selectedValue: string | undefined,
  onSelect: (id: string, value: string) => void,
  searchKey: string
) => {
  const isOpen = openSelectors[searchKey] || false;
  const filteredDrivers = getFilteredDrivers(searchKey);
  const selectedDriver = existingDrivers.find(d => d.id === selectedValue);

  return (
    <div className="flex items-center gap-2">
      <Popover 
        open={isOpen} 
        onOpenChange={(open) => setOpenSelectors(prev => ({ ...prev, [searchKey]: open }))}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-48 justify-between",
              selectedValue && "bg-primary/5"
            )}
          >
            {selectedDriver 
              ? `${selectedDriver.first_name} ${selectedDriver.last_name}` 
              : "Wybierz kierowcę"
            }
            <ChevronDown className="h-4 w-4 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2">
            <Input
              placeholder="Szukaj..."
              className="h-8"
              value={searchQueries[searchKey] || ""}
              onChange={(e) => setSearchQueries(prev => ({ ...prev, [searchKey]: e.target.value }))}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredDrivers.map(driver => (
              <div
                key={driver.id}
                className={cn(
                  "px-3 py-2 text-sm cursor-pointer hover:bg-muted/50",
                  selectedValue === driver.id && "bg-primary/10"
                )}
                onClick={() => {
                  onSelect(recordId, driver.id);
                  setOpenSelectors(prev => ({ ...prev, [searchKey]: false }));
                }}
              >
                {driver.first_name} {driver.last_name}
                {driver.phone && <span className="text-muted-foreground ml-1">({driver.phone})</span>}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      
      {/* Przycisk dodania nowego kierowcy */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => handleAddNewDriver(recordId)}
      >
        <Plus className="h-4 w-4" />
      </Button>
      
      {/* Przycisk wyczyszczenia wyboru */}
      {selectedValue && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onSelect(recordId, "_clear")}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
```

### Zmiana 2: Jeden wiersz na kierowcę w tabeli

```tsx
// Zamiast całej tabeli z osobnym wierszem, kompaktowa lista:
<div className="space-y-3">
  {drivers.map(driver => (
    <div key={driver.id} className="flex items-center gap-4 py-2 border-b">
      <div className="w-40 font-medium truncate">
        {driver.full_name || "Nieznany"}
      </div>
      <Badge variant="outline" className="font-mono text-xs w-36 truncate">
        {platformId || "-"}
      </Badge>
      {renderCompactDriverSelector(...)}
    </div>
  ))}
</div>
```

### Zmiana 3: Ukrycie przycisku "Aktualizuj kierowców"

```tsx
// DriversManagement.tsx linia 452-461
{/* Ukryty do czasu implementacji */}
{false && (
  <Button onClick={...} variant="outline" className="gap-2">
    <RotateCcw className="h-4 w-4" />
    Aktualizuj kierowców
  </Button>
)}
```

### Zmiana 4: Poprawne liczenie nowych rekordów

Zmienić logikę `checkForNewRecordsAfterLoad` aby uwzględniała WSZYSTKICH kierowców bez app_users którzy mają rozliczenia w aktualnym okresie.

---

## Efekt Końcowy

1. **Kompaktowy modal mapowania** - jeden wiersz na rekord, dropdown z wyszukiwarką
2. **Kliknięcie wybiera i zamyka** - dropdown się zamyka po wyborze
3. **Przycisk "+" do nowego kierowcy** - można tworzyć kierowców bezpośrednio z modalu
4. **Poprawne liczenie rekordów** - alert pokazuje prawdziwą liczbę nowych rekordów
5. **Ukryty przycisk bez funkcji** - "Aktualizuj kierowców" niewidoczny

**Szacowany czas: ~2-3h**
