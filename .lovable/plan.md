# Plan: Kompleksowa naprawa i implementacja brakujacych funkcji

## Status: Przeglad poprzednich promptow - co NIE zostalo zrealizowane

Na podstawie analizy kodu i poprzednich konwersacji, ponizej lista wszystkich brakujacych funkcji do implementacji:

---

## LISTA BRAKUJACYCH ZMIAN

### 1. Blad wyswietlania nazwy uzytkownika (Anastasia -> Piotr Krolak)
**Status:** Czesc kodu zmodyfikowana, ale problem nadal istnieje
**Plik:** `src/pages/FleetDashboard.tsx`
**Problem:** Pomimo ze dane w bazie sa poprawne (Anastasiia Shapovalova), wyswietla sie "Piotr Krolak"

**Rozwiazanie:**
```typescript
// W FleetDashboard.tsx - zresetowac userName przy zmianach userow
useEffect(() => {
  // RESET stanu przy kazdej zmianie sesji/delegacji
  setUserName('');
  setFleetName('');
  
  if (fleetId || delegatedRole?.fleet_id) {
    fetchFleetName();
    fetchUserName();
  }
}, [fleetId, delegatedRole]);
```

---

### 2. Kalendarz tygodniowy (automatyczne zaznaczanie pn-nd)
**Status:** NIE ZAIMPLEMENTOWANO
**Plik:** `src/components/fleet/FleetSettlementImport.tsx`
**Problem:** Kalendarz nadal pokazuje dwa miesiace i pozwala wybrac dowolny zakres reczne

**Rozwiazanie:**
```typescript
import { startOfWeek, endOfWeek, isSameWeek } from 'date-fns';

// Jeden kalendarz, automatyczne zaznaczanie tygodnia
const handleDayClick = (day: Date) => {
  const weekStart = startOfWeek(day, { weekStartsOn: 1 }); // Poniedzialek
  const weekEnd = endOfWeek(day, { weekStartsOn: 1 }); // Niedziela
  setDateRange({ from: weekStart, to: weekEnd });
};

// W Calendar:
<CalendarComponent
  mode="single"
  selected={dateRange?.from}
  onSelect={(day) => day && handleDayClick(day)}
  numberOfMonths={1} // JEDEN kalendarz
  modifiers={{
    selectedWeek: (day) => dateRange?.from 
      ? isSameWeek(day, dateRange.from, { weekStartsOn: 1 }) 
      : false
  }}
  modifiersStyles={{
    selectedWeek: { 
      backgroundColor: 'hsl(var(--primary))', 
      color: 'white',
      borderRadius: '0'
    }
  }}
/>
```

---

### 3. Stawka VAT - input zamiast select
**Status:** NIE ZAIMPLEMENTOWANO  
**Plik:** `src/components/fleet/FleetSettlementSettings.tsx`
**Problem:** VAT to select z 0%/5%/8%/23% zamiast wolnego pola

**Rozwiazanie:**
```typescript
// Zamienic Select na Input:
<div className="space-y-2">
  <Label htmlFor="fee-vat">Stawka VAT (%)</Label>
  <Input
    id="fee-vat"
    type="number"
    min="0"
    max="100"
    step="0.01"
    placeholder="np. 8"
    value={newFee.vat_rate}
    onChange={(e) => setNewFee({ ...newFee, vat_rate: e.target.value })}
  />
</div>
```

---

### 4. Edycja istniejacych oplat
**Status:** NIE ZAIMPLEMENTOWANO
**Plik:** `src/components/fleet/FleetSettlementSettings.tsx`
**Problem:** Mozna tylko dodawac i usuwac oplaty, nie edytowac

**Rozwiazanie:**
```typescript
// Dodac stan edycji
const [editingFee, setEditingFee] = useState<FleetFee | null>(null);

// Funkcja otwierajaca modal z danymi do edycji
const handleEditFee = (fee: FleetFee) => {
  setEditingFee(fee);
  setNewFee({
    name: fee.name,
    amount: fee.amount.toString(),
    vat_rate: fee.vat_rate.toString(),
    frequency: fee.frequency as 'weekly' | 'monthly',
    type: fee.type as 'fixed' | 'percent',
  });
  setDialogOpen(true);
};

// W handleSaveFee - rozroznic insert od update
const handleSaveFee = async () => {
  if (editingFee) {
    // UPDATE istniejacego
    const { error } = await supabase
      .from('fleet_settlement_fees')
      .update({
        name: newFee.name,
        amount: parseFloat(newFee.amount),
        vat_rate: parseFloat(newFee.vat_rate),
        frequency: newFee.frequency,
        type: newFee.type,
      })
      .eq('id', editingFee.id);
    
    if (!error) {
      toast.success('Oplata zaktualizowana');
      setEditingFee(null);
    }
  } else {
    // INSERT nowego (istniejaca logika)
  }
};

// W TableRow - klikniecie otwiera edycje
<TableRow 
  key={fee.id} 
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => handleEditFee(fee)}
>
```

---

### 5. Przelacznik blokady wyboru planu dla kierowcow
**Status:** NIE ZAIMPLEMENTOWANO
**Pliki:** 
- Nowa migracja SQL
- `src/components/fleet/FleetSettlementSettings.tsx`
- `src/components/SettlementPlanSelector.tsx`

**Rozwiazanie:**

**Migracja:**
```sql
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS driver_plan_selection_enabled boolean DEFAULT true;
```

**FleetSettlementSettings.tsx** - dodac Switch przed tabela oplat:
```typescript
import { Switch } from '@/components/ui/switch';

// Stan
const [driverPlanSelectionEnabled, setDriverPlanSelectionEnabled] = useState(true);

// Ladowanie ustawienia
useEffect(() => {
  const fetchSettings = async () => {
    const { data } = await supabase
      .from('fleets')
      .select('driver_plan_selection_enabled')
      .eq('id', fleetId)
      .single();
    if (data) {
      setDriverPlanSelectionEnabled(data.driver_plan_selection_enabled ?? true);
    }
  };
  fetchSettings();
}, [fleetId]);

// Toggle
const handleTogglePlanSelection = async (enabled: boolean) => {
  const { error } = await supabase
    .from('fleets')
    .update({ driver_plan_selection_enabled: enabled })
    .eq('id', fleetId);
  
  if (!error) {
    setDriverPlanSelectionEnabled(enabled);
    toast.success(enabled 
      ? 'Kierowcy moga teraz zmieniac plan' 
      : 'Zmiana planu zablokowana dla kierowcow');
  }
};

// UI - Card przed tabela oplat:
<Card className="mb-6">
  <CardHeader>
    <CardTitle>Ustawienia planow</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">Wybor planu przez kierowcow</p>
        <p className="text-sm text-muted-foreground">
          Kierowcy moga samodzielnie zmieniac swoj plan rozliczeniowy
        </p>
      </div>
      <Switch 
        checked={driverPlanSelectionEnabled}
        onCheckedChange={handleTogglePlanSelection}
      />
    </div>
  </CardContent>
</Card>
```

**SettlementPlanSelector.tsx** - sprawdzic ustawienie floty:
```typescript
// Dodac sprawdzenie floty
useEffect(() => {
  const checkFleetSetting = async () => {
    if (!driverData.driver_id || userRole !== 'driver') return;
    
    const { data: driver } = await supabase
      .from('drivers')
      .select('fleet_id')
      .eq('id', driverData.driver_id)
      .single();
    
    if (driver?.fleet_id) {
      const { data: fleet } = await supabase
        .from('fleets')
        .select('driver_plan_selection_enabled')
        .eq('id', driver.fleet_id)
        .single();
      
      if (fleet && fleet.driver_plan_selection_enabled === false) {
        setChangePermission({
          can_change: false,
          reason: 'Zmiana planu zablokowana przez flote'
        });
      }
    }
  };
  checkFleetSetting();
}, [driverData.driver_id, userRole]);
```

---

### 6. Przelacznik ukrycia opcji "Przelacz konto"
**Status:** NIE ZAIMPLEMENTOWANO
**Pliki:**
- Nowa migracja SQL (feature toggle)
- `src/hooks/useFeatureToggles.ts`
- `src/pages/DriverDashboard.tsx`
- `src/pages/MarketplaceDashboard.tsx`

**Rozwiazanie:**

**Migracja:**
```sql
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES ('account_switching_enabled', 'Przelaczanie kont', 'Pokazuje przycisk przelaczania miedzy kontami', false, 'general')
ON CONFLICT (feature_key) DO NOTHING;
```

**useFeatureToggles.ts** - dodac flage:
```typescript
account_switching_enabled: boolean;
```

**DriverDashboard.tsx / MarketplaceDashboard.tsx** - warunkowo ukryc:
```typescript
{features.account_switching_enabled && (isFleetAccount || isMarketplaceAccount) && (
  // Przycisk/dropdown przelaczania kont
)}
```

---

### 7. Selektor miasta przy imporcie rozliczen
**Status:** NIE ZAIMPLEMENTOWANO
**Plik:** `src/components/fleet/FleetSettlementImport.tsx`

**Rozwiazanie:**
```typescript
// Dodac stan i ladowanie miast
const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
const [cities, setCities] = useState<{id: string, name: string}[]>([]);

useEffect(() => {
  const fetchCities = async () => {
    const { data } = await supabase.from('cities').select('id, name').order('name');
    if (data) setCities(data);
  };
  fetchCities();
}, []);

// UI - obok kalendarza:
<div className="grid grid-cols-2 gap-4">
  <div>
    <label className="text-sm font-medium">Okres rozliczeniowy</label>
    {/* Kalendarz */}
  </div>
  <div>
    <label className="text-sm font-medium">Miasto</label>
    <Select value={selectedCityId || ''} onValueChange={setSelectedCityId}>
      <SelectTrigger>
        <SelectValue placeholder="Wszystkie" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">Wszystkie miasta</SelectItem>
        {cities.map(city => (
          <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
</div>

// W createNewSettlement - przekazac city_id:
body: {
  // ...existing
  city_id: selectedCityId || undefined,
}
```

---

### 8. Integracja stalych oplat flotowych z rozliczeniami kierowcow
**Status:** NIE ZAIMPLEMENTOWANO
**Plik:** `src/components/DriverSettlements.tsx`

**Rozwiazanie:**
```typescript
// Dodac stan
const [fleetFees, setFleetFees] = useState<{total: number, items: any[]}>({total: 0, items: []});

// Funkcja ladowania
const loadFleetFees = async () => {
  if (!driverId || !currentWeek) return;
  
  const { data: driver } = await supabase
    .from('drivers')
    .select('fleet_id')
    .eq('id', driverId)
    .single();
  
  if (!driver?.fleet_id) {
    setFleetFees({total: 0, items: []});
    return;
  }
  
  const { data: fees } = await supabase
    .from('fleet_settlement_fees')
    .select('*')
    .eq('fleet_id', driver.fleet_id)
    .eq('is_active', true);
  
  if (!fees?.length) {
    setFleetFees({total: 0, items: []});
    return;
  }
  
  // Sprawdz cyklicznosc (weekly vs monthly)
  const weekStart = new Date(currentWeek.start);
  const isFirstWeekOfMonth = weekStart.getDate() <= 7;
  
  const applicableFees = fees.filter(fee => {
    if (fee.frequency === 'weekly') return true;
    if (fee.frequency === 'monthly' && isFirstWeekOfMonth) return true;
    return false;
  });
  
  const total = applicableFees
    .filter(fee => fee.type === 'fixed')
    .reduce((sum, fee) => sum + (fee.amount || 0), 0);
  
  setFleetFees({total, items: applicableFees});
};

// Uzyc w useEffect
useEffect(() => {
  loadFleetFees();
}, [driverId, currentWeek]);

// W formule payout:
const payout = uberNet + boltNet + freenowNet - cashTotal + fuelVatRefund 
               - fuel - planFee - rentalFee - additionalFees - fleetFees.total;
```

---

### 9. Logika zerowych rozliczen (brak oplat gdy zerowy przychod)
**Status:** NIE ZAIMPLEMENTOWANO
**Plik:** `src/components/DriverSettlements.tsx`

**Rozwiazanie:**
```typescript
const calculatePayout = (amounts: any) => {
  // ... existing code ...
  
  // Oblicz przychod brutto
  const uberBase = amounts.uber_base || amounts.uber_payout_d || 0;
  const boltBase = amounts.bolt_projected_d || 0;
  const freenowBase = amounts.freenow_base_s || 0;
  const totalGross = Math.max(0, uberBase) + Math.max(0, boltBase) + Math.max(0, freenowBase);
  
  // === NOWA LOGIKA ===
  // Jesli totalGross == 0 -> kierowca nie jechal -> BRAK oplat
  const shouldChargeFees = totalGross > 0;
  
  const effectiveRentalFee = shouldChargeFees ? rentalFee : 0;
  const effectivePlanFee = shouldChargeFees ? planFee : 0;
  const effectiveAdditionalFees = shouldChargeFees ? additionalFees : 0;
  const effectiveFleetFees = shouldChargeFees ? fleetFees.total : 0;
  
  // Oblicz wyplate z efektywnymi oplatami
  const payout = uberNet + boltNet + freenowNet - cashTotal + fuelVatRefund 
                 - fuel - effectivePlanFee - effectiveRentalFee 
                 - effectiveAdditionalFees - effectiveFleetFees;
  
  return {
    payout,
    fee: effectivePlanFee,
    totalTax,
    breakdown: {
      totalGross,
      chargesApplied: shouldChargeFees,
      // ... reszta
    }
  };
};

// W UI - pokazac komunikat gdy brak oplat:
{!breakdown.chargesApplied && (
  <div className="text-sm text-orange-600 bg-orange-50 p-3 rounded-lg">
    Brak przychodow - oplaty nie zostaly naliczone
  </div>
)}
```

---

## PODSUMOWANIE ZMIAN W PLIKACH

| Nr | Funkcja | Plik(i) |
|----|---------|---------|
| 1 | Naprawa nazwy uzytkownika | `FleetDashboard.tsx` |
| 2 | Kalendarz tygodniowy | `FleetSettlementImport.tsx` |
| 3 | VAT input | `FleetSettlementSettings.tsx` |
| 4 | Edycja oplat | `FleetSettlementSettings.tsx` |
| 5 | Blokada planu | Migracja + `FleetSettlementSettings.tsx` + `SettlementPlanSelector.tsx` |
| 6 | Ukrycie przelaczania kont | Migracja + `useFeatureToggles.ts` + Dashboardy |
| 7 | Selektor miasta | `FleetSettlementImport.tsx` |
| 8 | Oplaty flotowe w rozliczeniach | `DriverSettlements.tsx` |
| 9 | Logika zerowych rozliczen | `DriverSettlements.tsx` |

---

## Krytyczne pliki do implementacji

- `src/components/fleet/FleetSettlementImport.tsx` - kalendarz tygodniowy + selektor miasta
- `src/components/fleet/FleetSettlementSettings.tsx` - VAT input + edycja oplat + przelacznik planu
- `src/pages/FleetDashboard.tsx` - naprawa nazwy uzytkownika
- `src/components/DriverSettlements.tsx` - oplaty flotowe + logika zerowych rozliczen
- `src/components/SettlementPlanSelector.tsx` - blokada planu przez flote
- Migracja SQL - `driver_plan_selection_enabled` + `account_switching_enabled`
