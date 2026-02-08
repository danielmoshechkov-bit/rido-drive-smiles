
# Plan Naprawy Systemu Mapowania Nowych Rekordów z CSV

## Zdiagnozowane Problemy

### Problem 1: Kierowcy bez `driver_app_users` nie są wyświetlani w rozliczeniach

**Przyczyna:** W `FleetSettlementsView.tsx` linia 633 używa `!inner` JOIN:
```typescript
driver_app_users!inner(settlement_plan_id, user_id)
```

Kierowcy utworzeni automatycznie przez import CSV (np. Aneta Sknadaj, Paweł Koziarek) **NIE mają wpisu w `driver_app_users`**, więc są pomijani przy pobieraniu danych.

**Dowód:** Query do bazy pokazuje że Aneta jest w `settlements` z `total_earnings: 934.28`, ale nie ma wpisu w `driver_app_users` (`user_id: null`).

### Problem 2: Tabela `unmapped_settlement_drivers` jest pusta

**Przyczyna:** Kierowcy są dopasowywani przez fuzzy matching i trafiają do `driver_platform_ids`, więc NIE są zapisywani do `unmapped`. Ale potem nie są widoczni w UI bo brakuje `driver_app_users`.

### Problem 3: Brak zakładek per platforma w modalu mapowania

Obecny `UnmappedDriversModal` pokazuje wszystko na jednej liście - brak podziału na Uber/Bolt/FreeNow/Paliwo.

### Problem 4: Paliwo - brak ostrzeżenia o nieprzypisanych kartach

`FleetFuelView` pokazuje "Nieprzypisany" ale:
- Brak czerwonego podświetlenia
- Brak możliwości szybkiego przypisania karty
- Zły styl numerów kart (font-mono zamiast naszego stylu)

---

## Rozwiązanie Techniczne

### Faza 1: Naprawić pobieranie kierowców (KRYTYCZNE)

**Plik:** `src/components/FleetSettlementsView.tsx` (linia 633)

Zmienić `!inner` na `!left`:
```typescript
driver_app_users!left(settlement_plan_id, user_id)
```

Dzięki temu kierowcy BEZ wpisu w `driver_app_users` też będą pobierani i wyświetlani w rozliczeniach.

### Faza 2: Dodać automatyczne wykrywanie nowych rekordów

Po załadowaniu rozliczeń, sprawdzić:
1. Czy są kierowcy w `settlements` dla wybranego okresu którzy NIE mają `driver_app_users`?
2. Czy są rekordy w `unmapped_settlement_drivers` z `status = 'pending'`?

Jeśli tak → pokazać alert "Znaleziono X nowych rekordów" z przyciskiem do mapowania.

**Plik:** `src/components/FleetSettlementsView.tsx`

```typescript
// Po fetchSettlements, sprawdź nowe rekordy
const checkNewRecords = async () => {
  // 1. Kierowcy bez driver_app_users
  const { data: unmappedDrivers } = await supabase
    .from('drivers')
    .select('id, first_name, last_name')
    .eq('fleet_id', fleetId)
    .is('driver_app_users.user_id', null);
  
  // 2. Unmapped z tabeli
  const { data: pendingUnmapped } = await supabase
    .from('unmapped_settlement_drivers')
    .select('*')
    .eq('fleet_id', fleetId)
    .eq('status', 'pending');
  
  const totalNew = (unmappedDrivers?.length || 0) + (pendingUnmapped?.length || 0);
  
  if (totalNew > 0) {
    setNewRecordsCount(totalNew);
    // Pokaż alert
  }
};
```

### Faza 3: Przebudować modal mapowania z zakładkami

**Plik:** `src/components/fleet/UnmappedDriversModal.tsx`

Dodać zakładki: Uber | Bolt | FreeNow | Paliwo

Dla każdej platformy:
- Pobierz kierowców którzy mają ID tej platformy ale nie są przypisani
- Pokaż: Imię Nazwisko | Platform ID | Dropdown z wyszukiwarką kierowców | Przycisk "Nowy"

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// W komponencie:
<Tabs defaultValue="uber">
  <TabsList className="grid w-full grid-cols-4">
    <TabsTrigger value="uber">
      Uber {uberRecords.length > 0 && <Badge>{uberRecords.length}</Badge>}
    </TabsTrigger>
    <TabsTrigger value="bolt">
      Bolt {boltRecords.length > 0 && <Badge>{boltRecords.length}</Badge>}
    </TabsTrigger>
    <TabsTrigger value="freenow">
      FreeNow {freenowRecords.length > 0 && <Badge>{freenowRecords.length}</Badge>}
    </TabsTrigger>
    <TabsTrigger value="fuel">
      Paliwo {fuelRecords.length > 0 && <Badge>{fuelRecords.length}</Badge>}
    </TabsTrigger>
  </TabsList>
  
  <TabsContent value="uber">
    <UnmappedPlatformTable 
      records={uberRecords} 
      platform="uber"
      existingDrivers={existingDrivers}
      onMap={handleMapDriver}
      onAddNew={handleAddNewDriver}
    />
  </TabsContent>
  {/* ... pozostałe zakładki */}
</Tabs>
```

### Faza 4: Dodać wyszukiwarkę kierowców w dropdownie

Użyć `Combobox` pattern z wyszukiwarką:

```tsx
<Command>
  <CommandInput placeholder="Szukaj kierowcy..." />
  <CommandList>
    <CommandEmpty>Nie znaleziono kierowcy</CommandEmpty>
    <CommandGroup>
      {filteredDrivers.map(driver => (
        <CommandItem 
          key={driver.id}
          onSelect={() => handleMapDriver(unmappedId, driver.id)}
        >
          {driver.first_name} {driver.last_name}
          {driver.phone && <span className="text-muted-foreground ml-2">({driver.phone})</span>}
        </CommandItem>
      ))}
    </CommandGroup>
  </CommandList>
</Command>
```

### Faza 5: Poprawić widok paliwa

**Plik:** `src/components/FleetFuelView.tsx`

1. Dodać czerwone podświetlenie dla "Nieprzypisany":
```tsx
<TableCell 
  className={cn(
    card.driver_name === 'Nieprzypisany' && 'text-red-600 font-medium cursor-pointer hover:underline'
  )}
  onClick={() => card.driver_name === 'Nieprzypisany' && setAssignCardModal(card.card_number)}
>
  {card.driver_name === 'Nieprzypisany' ? 'Nie przypisano' : card.driver_name}
</TableCell>
```

2. Zmienić styl numeru karty:
```tsx
<TableCell className="tabular-nums">{formatCardNumber(card.card_number)}</TableCell>
```

3. Dodać modal przypisania karty do kierowcy

### Faza 6: Auto-aktualizacja rozliczeń po mapowaniu

Po zapisaniu mapowania w modalu, automatycznie:
1. Zaktualizować `driver_platform_ids`
2. Zaktualizować `settlements` - przepisać `driver_id` z auto-utworzonego kierowcy na właściwego
3. Usunąć auto-utworzonego kierowcę (opcjonalnie)
4. Odświeżyć listę rozliczeń

```typescript
const handleSaveMapping = async () => {
  for (const [unmappedId, targetDriverId] of Object.entries(mappings)) {
    const unmapped = unmappedDrivers.find(d => d.id === unmappedId);
    
    // 1. Przenieś platform IDs na właściwego kierowcę
    if (unmapped.uber_id) {
      await supabase.from('driver_platform_ids').upsert({
        driver_id: targetDriverId,
        platform: 'uber',
        platform_id: unmapped.uber_id
      }, { onConflict: 'driver_id,platform' });
    }
    
    // 2. Przenieś rozliczenia na właściwego kierowcę
    await supabase
      .from('settlements')
      .update({ driver_id: targetDriverId })
      .eq('driver_id', unmapped.driver_id);
    
    // 3. Oznacz jako resolved
    await supabase
      .from('unmapped_settlement_drivers')
      .update({ status: 'resolved', linked_driver_id: targetDriverId })
      .eq('id', unmappedId);
  }
  
  // 4. Odśwież rozliczenia
  onComplete();
};
```

---

## Pliki do Modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/FleetSettlementsView.tsx` | Zmienić `!inner` na `!left`, dodać wykrywanie nowych rekordów |
| `src/components/fleet/UnmappedDriversModal.tsx` | Dodać zakładki per platforma, wyszukiwarka, paliwo |
| `src/components/FleetFuelView.tsx` | Czerwone "Nie przypisano", kliknij aby przypisać |
| `src/components/fleet/FuelCardAssignModal.tsx` | NOWY - modal do przypisania karty |

---

## Efekt Końcowy

1. **Aneta Sknadaj i Paweł Koziarek POJAWIĄ SIĘ** w rozliczeniach (fix `!inner` → `!left`)
2. **Alert o nowych rekordach** po imporcie CSV
3. **Modal z zakładkami** Uber/Bolt/FreeNow/Paliwo do łatwego mapowania
4. **Wyszukiwarka kierowców** w dropdownie mapowania
5. **Czerwone ostrzeżenie** dla nieprzypisanych kart paliwowych
6. **Kliknij aby przypisać** kartę do kierowcy
7. **Auto-aktualizacja** rozliczeń po mapowaniu

---

## Szczegóły Techniczne: Identyfikacja platform

### Uber
- **Kolumna identyfikująca:** A (Identyfikator UUID kierowcy)
- **Imię:** B (Imię kierowcy)
- **Nazwisko:** C (Nazwisko kierowcy)
- **Łączenie:** `${firstName} ${lastName}`

### Bolt
- **Kolumna identyfikująca:** C (Numer telefonu)
- **ID kierowcy:** A
- **Email:** B (Adres e-mail)
- **Auto-matching:** Jeśli kierowca ma w bazie ten sam telefon lub email → automatycznie połącz

### FreeNow
- **Kolumna identyfikująca:** A (ID kierowcy)
- **Dane:** B (zawiera imię i nazwisko)

### Paliwo
- **Kolumna identyfikująca:** A (Numer karty)
- **Matching:** Po `fuel_card_number` w tabeli `drivers`
- **Ostrzeżenie:** Jeśli karta nie jest przypisana → czerwony tekst "Nie przypisano" → kliknij aby przypisać
