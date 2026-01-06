# Plan naprawy i ulepszen panelu flotowego

## Podsumowanie zmian

Uzytkownik zglasza kilka problemow i prosb o ulepszenia:

1. **Dodac przelacznik do ukrycia opcji "Przelacz konto"** - gdy giełda jest wylaczona, przycisk przelaczania kont tez powinien zniknac
2. **Kalendarz z automatycznym zaznaczaniem tygodnia (poniedzialek-niedziela)** - jeden klik zaznacza caly tydzien
3. **Edycja oplat** - mozliwosc klikniecia na istniejaca oplate i jej edycji
4. **Wlasna stawka VAT** - zamiana selecta na input, aby wpisac dowolna stawke VAT
5. **Blad wyswietlania nazwy uzytkownika** - Anastasii pokazuje sie "Piotr Krolak" (problem cache/sesji)
6. **Dodanie selektora miasta** obok okresu rozliczeniowego - partner moze miec kierowcow z roznych miast

---

## Problem 1: Przelacznik do ukrycia opcji "Przelacz konto"

### Przyczyna
Obecnie opcja "Przelacz konto" jest widoczna nawet gdy marketplace jest wylaczony w feature toggles.

### Rozwiazanie
Dodac nowy feature toggle `account_switching_enabled` w kategorii `general`, ktory kontroluje widocznosc przycisku "Przelacz konto" we wszystkich dashboardach.

### Zmiany do wprowadzenia

**1. Migracja SQL** - dodanie nowego feature toggle:
```sql
INSERT INTO feature_toggles (feature_key, feature_name, description, is_enabled, category)
VALUES ('account_switching_enabled', 'Przelaczanie kont', 'Pokazuje przycisk przelaczania miedzy kontami (kierowca/flota/gielda)', false, 'general');
```

**2. src/hooks/useFeatureToggles.ts** - dodanie nowej flagi:
```typescript
interface FeatureToggles {
  // ... existing
  account_switching_enabled: boolean;
}
```

**3. src/pages/MarketplaceDashboard.tsx** - ukrycie dropdown "Przelacz konto":
```typescript
{features.account_switching_enabled && (
  <DropdownMenu>
    // ... Switch Account Dropdown
  </DropdownMenu>
)}
```

**4. src/pages/DriverDashboard.tsx** - ukrycie sekcji "Przelacz konto" w mobile sheet:
```typescript
{features.account_switching_enabled && (features.marketplace_enabled || isFleetAccount) && (
  <div className="border-t pt-2 mt-2">
    // ... opcje przelaczania kont
  </div>
)}
```

---

## Problem 2: Kalendarz z automatycznym zaznaczaniem tygodnia

### Przyczyna
Obecny kalendarz wymaga reczengo klikania "od" i "do" - uzytkownik chce jednym kliknieciem wybrac caly tydzien (poniedzialek-niedziela).

### Rozwiazanie
Zamiast mode="range" uzyjemy wlasnej logiki:
- Przy najechaniu/kliknieciu na dowolny dzien, automatycznie zaznaczamy poniedzialek-niedziela tego tygodnia
- Uzyjemy funkcji date-fns: `startOfWeek` i `endOfWeek` z `{ weekStartsOn: 1 }` (poniedzialek)

### Zmiany do wprowadzenia

**1. src/components/fleet/FleetSettlementImport.tsx**:

```typescript
import { startOfWeek, endOfWeek, isSameWeek } from 'date-fns';

// Zamiast mode="range" - wlasna logika wyboru tygodnia
const handleDayClick = (day: Date) => {
  const weekStart = startOfWeek(day, { weekStartsOn: 1 }); // Poniedzialek
  const weekEnd = endOfWeek(day, { weekStartsOn: 1 }); // Niedziela
  setDateRange({ from: weekStart, to: weekEnd });
};

// W Calendar component:
<CalendarComponent
  mode="single"
  selected={dateRange?.from}
  onSelect={(day) => day && handleDayClick(day)}
  modifiers={{
    selectedWeek: (day) => dateRange?.from ? isSameWeek(day, dateRange.from, { weekStartsOn: 1 }) : false
  }}
  modifiersStyles={{
    selectedWeek: { backgroundColor: 'hsl(var(--primary))', color: 'white' }
  }}
  numberOfMonths={2}
  locale={pl}
  disabled={(date) => date > new Date()}
/>
```

---

## Problem 3: Edycja oplat

### Przyczyna
Obecna implementacja pozwala tylko dodawac i usuwac oplaty, ale nie edytowac.

### Rozwiazanie
Dodac funkcje edycji - klikniecie na wiersz oplaty otwiera modal z formularzem wypelnionym aktualnymi wartosciami.

### Zmiany do wprowadzenia

**1. src/components/fleet/FleetSettlementSettings.tsx**:

```typescript
// Dodac stan dla edycji
const [editingFee, setEditingFee] = useState<FleetFee | null>(null);

// Otworz modal z danymi do edycji
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

// Funkcja zapisu - update lub insert
const handleSaveFee = async () => {
  if (editingFee) {
    // UPDATE
    await supabase.from('fleet_settlement_fees').update({...}).eq('id', editingFee.id);
  } else {
    // INSERT (istniejaca logika)
  }
};

// W TableRow dodac onClick:
<TableRow 
  key={fee.id} 
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => handleEditFee(fee)}
>
```

---

## Problem 4: Wlasna stawka VAT (input zamiast select)

### Przyczyna
Select z predefiniowanymi wartosciami (0%, 5%, 8%, 23%) nie pozwala wpisac dowolnej stawki.

### Rozwiazanie
Zamienic Select na Input type="number" z walidacja (0-100%).

### Zmiany do wprowadzenia

**1. src/components/fleet/FleetSettlementSettings.tsx**:

```typescript
// Zamiast Select dla VAT:
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

## Problem 5: Blad wyswietlania nazwy uzytkownika

### Analiza
Dane w bazie sa poprawne - Anastasii ma prawidlowe imie i nazwisko zarowno w tabeli `drivers` jak i `auth.users.raw_user_meta_data`. Problem moze byc spowodowany:
- Cache przegladarki
- Stara sesja
- Problem z kolejnoscia pobierania danych

### Rozwiazanie
Dodac jawne czyszczenie cache i upewnic sie ze dane sa pobierane po zaladowaniu sesji.

### Zmiany do wprowadzenia

**1. src/pages/FleetDashboard.tsx** - dodac refetch po zmianie uzytkownika:

```typescript
useEffect(() => {
  // Resetuj stan przy zmianie sesji
  setUserName('');
  setFleetName('');
  
  if (fleetId || delegatedRole?.fleet_id) {
    fetchFleetName();
    fetchUserName();
  }
}, [fleetId, delegatedRole]);
```

---

## Problem 6: Selektor miasta obok okresu rozliczeniowego

### Przyczyna
Partner flotowy moze miec kierowcow z roznych miast. Potrzebuje mozliwosci filtrowania/wyboru miasta przy tworzeniu rozliczen.

### Rozwiazanie
Dodac dropdown z listą miast obok selektora okresu. Lista miast powinna byc pobierana z tabeli `cities`.

### Zmiany do wprowadzenia

**1. src/components/fleet/FleetSettlementImport.tsx**:

```typescript
// Dodac stan dla miasta
const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
const [cities, setCities] = useState<{id: string, name: string}[]>([]);

// Pobierz dostepne miasta
useEffect(() => {
  const fetchCities = async () => {
    const { data } = await supabase.from('cities').select('id, name').order('name');
    if (data) setCities(data);
  };
  fetchCities();
}, []);

// Dodac UI obok kalendarza:
<div className="grid grid-cols-2 gap-4">
  <div className="space-y-2">
    <label className="text-sm font-medium">Okres rozliczeniowy</label>
    {/* Kalendarz */}
  </div>
  <div className="space-y-2">
    <label className="text-sm font-medium">Miasto</label>
    <Select value={selectedCityId || ''} onValueChange={setSelectedCityId}>
      <SelectTrigger>
        <SelectValue placeholder="Wszystkie miasta" />
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

// W createNewSettlement - przekaz city_id do edge function:
body: {
  // ...existing
  city_id: selectedCityId || undefined,
}
```

**2. supabase/functions/settlements/index.ts** - juz obsluguje `city_id` z poprzednich zmian, wiec nie wymaga modyfikacji.

---

## Podsumowanie zmian w plikach

| Plik | Zmiany |
|------|--------|
| Nowa migracja SQL | Dodanie `account_switching_enabled` toggle |
| src/hooks/useFeatureToggles.ts | Dodanie `account_switching_enabled` do interfejsu |
| src/pages/MarketplaceDashboard.tsx | Warunkowe wyswietlanie "Przelacz konto" |
| src/pages/DriverDashboard.tsx | Warunkowe wyswietlanie "Przelacz konto" |
| src/components/fleet/FleetSettlementImport.tsx | Kalendarz tygodniowy + selektor miasta |
| src/components/fleet/FleetSettlementSettings.tsx | Edycja oplat + input VAT |
| src/pages/FleetDashboard.tsx | Reset stanu przy zmianie uzytkownika |

---

## Krytyczne pliki do implementacji

- src/components/fleet/FleetSettlementImport.tsx - kalendarz tygodniowy i selektor miasta
- src/components/fleet/FleetSettlementSettings.tsx - edycja oplat i input VAT
- src/pages/MarketplaceDashboard.tsx - warunkowe ukrycie "Przelacz konto"
- src/pages/DriverDashboard.tsx - warunkowe ukrycie "Przelacz konto"
- src/hooks/useFeatureToggles.ts - nowa flaga account_switching_enabled
