
# Plan Naprawy Systemu Rozliczeń i Przypisań Kierowców

## Zdiagnozowane Problemy

### Problem 1: Kierowca nie jest przypisany do pojazdu po podpisaniu umowy najmu

**Analiza:**
- W sekcji "Najem" widać aktywną umowę: Toyota Corolla (WW999S) wynajęta przez Andrei Gustoi
- W sekcji "Auta" ten sam pojazd pokazuje "Kierowca: Brak"
- Przyczyna: Funkcja `finalizeContract()` w `RentalContractSignatureFlow.tsx` (linia 330-366) aktualizuje tylko status pojazdu na "wynajęty", ale NIE tworzy wpisu w tabeli `driver_vehicle_assignments`

**Rozwiązanie:**
W funkcji `finalizeContract()` dodać tworzenie przypisania kierowcy do pojazdu:

```typescript
// Po zaktualizowaniu statusu pojazdu (linia 347), dodać:
await supabase
  .from('driver_vehicle_assignments')
  .upsert({
    driver_id: rental.driver.id,
    vehicle_id: rental.vehicle.id,
    fleet_id: fleetId,
    status: 'active',
    assigned_at: new Date().toISOString()
  }, { onConflict: 'driver_id,vehicle_id' });
```

---

### Problem 2: Błąd przy wgrywaniu CSV - "Edge Function returned a non-2xx status code"

**Analiza z logów Edge Function:**
```
ERROR: TypeError: supabase.from(...).upsert(...).catch is not a function
    at parseUberCsv (settlements/index.ts:588:19)
```

Błąd występuje w liniach 797 i 936 gdzie używana jest składnia:
```javascript
await supabase.from('unmapped_settlement_drivers').upsert({...}).catch((e) => {...});
```

W Supabase Edge Functions, klient Supabase zwraca `{ data, error }` a nie Promise z `.catch()`.

**Rozwiązanie:**
Zmienić wszystkie wystąpienia `.catch()` na prawidłową obsługę błędów:

```typescript
// PRZED (błędne):
await supabase.from('unmapped_settlement_drivers').upsert({...}).catch((e) => {
  console.log('Error:', e.message);
});

// PO (poprawne):
const { error: upsertError } = await supabase.from('unmapped_settlement_drivers').upsert({...});
if (upsertError) {
  console.log('⚠️ unmapped_settlement_drivers upsert error:', upsertError.message);
}
```

Miejsca do poprawienia:
- Linia ~797 (parseUberCsv)
- Linia ~936 (parseBoltCsv)  
- Linia ~945 (parseBoltCsv - driver_platform_ids)
- Podobne miejsca w parseFreenowCsv

---

### Problem 3: Odwrócenie logiki "Ukryj 0" + Alert o nowych rekordach

**Obecny stan:**
- Checkbox "Ukryj 0" domyślnie wyłączony (`hideZeroRows = false`)
- Użytkownik musi włączyć, żeby schować zerowe wyniki
- Brak alertu o nowych rekordach z CSV

**Rozwiązanie:**

1. **Odwrócić logikę:**
   - Zmienić domyślną wartość: `useState<boolean>(true)` (ukryj zera domyślnie)
   - Zmienić label na: "Pokaż wyniki zerowe" 
   - Zmienić logikę: pokazuj zera gdy checkbox zaznaczony

2. **Dodać alert o nowych rekordach:**
   Po wgraniu CSV, jeśli są nowe rekordy → automatycznie pokazać alert z przyciskiem otwierającym modal mapowania

**Zmiana w `FleetSettlementsView.tsx`:**

```tsx
// Linia 103 - zmienić domyślną wartość
const [showZeroRows, setShowZeroRows] = useState<boolean>(false); // domyślnie ukryte

// Linia 1385-1391 - zmienić checkbox
<Checkbox
  id="showZero"
  checked={showZeroRows}
  onCheckedChange={(checked) => setShowZeroRows(checked === true)}
/>
<Label htmlFor="showZero" className="text-sm cursor-pointer">
  Pokaż "0" wyniki
</Label>

// Linia 1543 - zmienić logikę filtrowania
if (!showZeroRows && s.total_base === 0 && s.final_payout === 0) {
  return false;
}
```

3. **Alert o nowych rekordach:**
   - Dodać nowy state: `const [newRecordsCount, setNewRecordsCount] = useState(0);`
   - Po imporcie CSV sprawdzić ile nowych rekordów w `unmapped_settlement_drivers`
   - Wyświetlić alert: "⚠️ Znaleziono X nowych rekordów" z przyciskiem "Sprawdź"

---

### Problem 4: Lepszy modal mapowania nowych kierowców

**Obecny stan:**
- Modal `UnmappedDriversModal` pokazuje listę bez podziału na platformy
- Brak informacji o paliwie

**Rozwiązanie:**
Rozbudować modal o zakładki: Uber | Bolt | FreeNow | Paliwo

Każda zakładka pokazuje:
- Imię i nazwisko z CSV
- Platform ID (jeśli jest)
- Dropdown z wyszukiwarką do wyboru istniejącego kierowcy
- Opcja "Dodaj jako nowego"

---

## Pliki do Modyfikacji

| Plik | Zmiana |
|------|--------|
| `supabase/functions/settlements/index.ts` | Naprawić błąd `.catch()` na poprawną obsługę `{ error }` |
| `src/components/fleet/RentalContractSignatureFlow.tsx` | Dodać tworzenie `driver_vehicle_assignments` po finalizacji umowy |
| `src/components/FleetSettlementsView.tsx` | Odwrócić logikę "Ukryj 0" → "Pokaż 0", dodać alert o nowych rekordach |
| `src/components/fleet/UnmappedDriversModal.tsx` | Dodać podział na platformy (Uber/Bolt/FreeNow/Paliwo) |

---

## Szczegóły Techniczne

### 1. Naprawa Edge Function (settlements/index.ts)

Zmienić wszystkie wystąpienia:
```typescript
// Linia ~797 (parseUberCsv):
- await supabase.from('unmapped_settlement_drivers').upsert({...}).catch((e: any) => {...});
+ const { error: unmappedErr } = await supabase.from('unmapped_settlement_drivers').upsert({...});
+ if (unmappedErr) console.log('⚠️ unmapped upsert error:', unmappedErr.message);

// Linia ~936 (parseBoltCsv):
- await supabase.from('unmapped_settlement_drivers').upsert({...}).catch((e: any) => {...});
+ const { error: unmappedErr2 } = await supabase.from('unmapped_settlement_drivers').upsert({...});
+ if (unmappedErr2) console.log('⚠️ unmapped upsert error:', unmappedErr2.message);

// Linia ~945 (parseBoltCsv - platform_ids):
- await supabase.from('driver_platform_ids').insert({...}).catch(() => {});
+ const { error: pidErr } = await supabase.from('driver_platform_ids').insert({...});
+ if (pidErr) console.log('⚠️ platform_ids insert error:', pidErr.message);
```

### 2. Przypisanie kierowcy do pojazdu (RentalContractSignatureFlow.tsx)

W funkcji `finalizeContract()`, po linii 348 dodać:

```typescript
// Create driver-vehicle assignment for rental history
if (rental?.driver && rental?.vehicle) {
  // First deactivate any existing active assignments for this vehicle
  await supabase
    .from('driver_vehicle_assignments')
    .update({ 
      status: 'inactive', 
      unassigned_at: new Date().toISOString() 
    })
    .eq('vehicle_id', rental.vehicle.id)
    .eq('status', 'active');
  
  // Create new active assignment
  const { error: assignError } = await supabase
    .from('driver_vehicle_assignments')
    .insert({
      driver_id: rental.driver.id,
      vehicle_id: rental.vehicle.id,
      fleet_id: fleetId,
      status: 'active',
      assigned_at: new Date().toISOString()
    });
  
  if (assignError) {
    console.error('Error creating vehicle assignment:', assignError);
  }
}
```

### 3. Odwrócenie logiki "Ukryj 0" (FleetSettlementsView.tsx)

```tsx
// Linia 103 - zmiana nazwy i domyślnej wartości
const [showZeroResults, setShowZeroResults] = useState<boolean>(false);

// Linia 1385-1391 - nowy checkbox
<Checkbox
  id="showZero"
  checked={showZeroResults}
  onCheckedChange={(checked) => setShowZeroResults(checked === true)}
/>
<Label htmlFor="showZero" className="text-sm cursor-pointer">
  Pokaż "0" wyniki
</Label>

// Linia 1543 - odwrócona logika
if (!showZeroResults && s.total_base === 0 && s.final_payout === 0) {
  return false;
}
```

### 4. Alert o nowych rekordach

Po udanym imporcie CSV, automatycznie sprawdzić unmapped i pokazać alert:

```tsx
// Dodać w handleSettlementComplete lub po imporcie:
const checkForNewRecords = async () => {
  const { count } = await supabase
    .from('unmapped_settlement_drivers')
    .select('*', { count: 'exact', head: true })
    .eq('fleet_id', fleetId)
    .eq('status', 'pending');
  
  if (count && count > 0) {
    setNewRecordsCount(count);
    // Automatycznie pokaż alert lub modal
  }
};
```

---

## Efekt Końcowy

1. **Kierowca automatycznie przypisany do pojazdu** po podpisaniu umowy - widoczny w sekcji "Auta"
2. **CSV się wgrywa poprawnie** - błąd `.catch()` naprawiony
3. **Domyślnie ukryte zerowe wyniki** - checkbox "Pokaż 0 wyniki" do ich wyświetlenia
4. **Alert o nowych rekordach** - informacja ile nowych kierowców wykryto w CSV
5. **Lepsze mapowanie** - modal z podziałem na platformy

**Szacowany czas implementacji: ~3-4h**
