# Plan: Ustawienia flotowe - blokada planu, stale oplaty i logika zerowych rozliczen

## Podsumowanie wymagan

Uzytkownik prosi o:

1. **Przelacznik blokady wyboru planu rozliczeniowego przez kierowcow** - flota moze zablokowac swoim kierowcom mozliwosc zmiany planu rozliczeniowego. Kierowcy tej floty widza tylko przypisany im plan bez mozliwosci edycji.

2. **Stale oplaty cykliczne (np. ZUS, ubezpieczenie)** - flota definiuje dodatkowe oplaty, ktore system automatycznie pobiera od kierowcow w odpowiednich cyklach (tygodniowo/miesiecznie).

3. **Logika zerowych/ujemnych rozliczen** - jesli kierowca nie jezdzi (zerowy przychod), NIE nalicza sie oplata za uzytkowanie pojazdu. Jesli platforma naliczy ujemna kwote (np. -6 zl od Bolt), to tylko ten minus sie przenosi jako dlug, bez dodatkowej oplaty.

---

## Problem 1: Przelacznik blokady wyboru planu

### Analiza obecnego stanu
- `SettlementPlanSelector.tsx` pozwala kierowcom i flotom zmieniac plan rozliczeniowy
- Funkcja `can_change_settlement_plan()` w bazie sprawdza uprawnienia (30-dniowa blokada po zmianie)
- Brak mechanizmu flotowego blokujacego zmiane planu dla kierowcow floty

### Rozwiazanie
Dodac nowe pole `driver_plan_selection_enabled` do tabeli `fleets`:
- `true` (domyslnie) - kierowcy moga zmienic plan sami
- `false` - kierowcy NIE moga zmieniac planu, widza tylko przypisany przez flote

### Zmiany do wprowadzenia

**1. Migracja SQL:**
```sql
ALTER TABLE fleets ADD COLUMN IF NOT EXISTS driver_plan_selection_enabled boolean DEFAULT true;
```

**2. src/components/fleet/FleetSettlementSettings.tsx** - dodac sekcje z przelacznikiem:
```tsx
// Stan
const [driverPlanSelectionEnabled, setDriverPlanSelectionEnabled] = useState(true);

// Ladowanie ustawienia
const fetchFleetSettings = async () => {
  const { data } = await supabase
    .from('fleets')
    .select('driver_plan_selection_enabled')
    .eq('id', fleetId)
    .single();
  if (data) {
    setDriverPlanSelectionEnabled(data.driver_plan_selection_enabled ?? true);
  }
};

// Zmiana ustawienia
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

// UI - dodac Switch przed tabelą opłat:
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

**3. src/components/SettlementPlanSelector.tsx** - sprawdzic ustawienie floty:
```tsx
// Dodac nowy useEffect do sprawdzenia ustawienia floty
useEffect(() => {
  const fetchFleetSettings = async () => {
    // Pobierz fleet_id kierowcy
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
      
      // Jesli flota zablokowala zmiane planu
      if (fleet && fleet.driver_plan_selection_enabled === false) {
        setChangePermission({
          can_change: false,
          reason: 'Zmiana planu zablokowana przez flote'
        });
      }
    }
  };
  
  if (driverData.driver_id && userRole === 'driver') {
    fetchFleetSettings();
  }
}, [driverData.driver_id, userRole]);
```

---

## Problem 2: Stale oplaty cykliczne (ZUS, ubezpieczenie itp.)

### Analiza obecnego stanu
- Tabela `fleet_settlement_fees` juz istnieje z polami: id, fleet_id, name, amount, vat_rate, frequency, type, is_active
- Komponent `FleetSettlementSettings.tsx` pozwala dodawac/usuwac/wlaczac-wylaczac oplaty
- **Brak integracji tych oplat z rozliczeniem kierowcow**

### Rozwiazanie
Oplaty flotowe musza byc pobierane podczas obliczania rozliczenia kierowcy. Trzeba:
1. W `DriverSettlements.tsx` - zaladowac aktywne oplaty z floty kierowcy
2. Odejmowac je od wyplaty kierowcy podobnie jak `additionalFees`

### Zmiany do wprowadzenia

**1. src/components/DriverSettlements.tsx** - dodac ladowanie oplat flotowych:

```tsx
// Dodac stan
const [fleetFees, setFleetFees] = useState<{total: number, items: any[]}>({total: 0, items: []});

// Dodac funkcje ladowania
const loadFleetFees = async () => {
  if (!driverId || !currentWeek) return;
  
  // Pobierz fleet_id kierowcy
  const { data: driver } = await supabase
    .from('drivers')
    .select('fleet_id')
    .eq('id', driverId)
    .single();
  
  if (!driver?.fleet_id) {
    setFleetFees({total: 0, items: []});
    return;
  }
  
  // Pobierz aktywne oplaty flotowe
  const { data: fees } = await supabase
    .from('fleet_settlement_fees')
    .select('*')
    .eq('fleet_id', driver.fleet_id)
    .eq('is_active', true);
  
  if (!fees || fees.length === 0) {
    setFleetFees({total: 0, items: []});
    return;
  }
  
  // Oblicz sumaryczna oplate
  const weekStart = new Date(currentWeek.start);
  const isFirstWeekOfMonth = weekStart.getDate() <= 7;
  
  const applicableFees = fees.filter(fee => {
    if (fee.frequency === 'weekly') return true;
    if (fee.frequency === 'monthly' && isFirstWeekOfMonth) return true;
    return false;
  });
  
  const totalFleetFees = applicableFees
    .filter(fee => fee.type === 'fixed') // Na razie tylko stale kwoty
    .reduce((sum, fee) => sum + (fee.amount || 0), 0);
  
  setFleetFees({total: totalFleetFees, items: applicableFees});
};

// Wywolac w useEffect
useEffect(() => {
  if (!initialLoad) {
    loadSettlements();
    loadAdditionalFees();
    loadFleetFees(); // <-- dodac
  }
}, [driverId, selectedYear, selectedWeek, initialLoad]);
```

**2. Zaktualizowac formule calculatePayout (linia ~790):**
```tsx
// Przed:
const payout = uberNet + boltNet + freenowNet - cashTotal + fuelVatRefund - fuel - planFee - rentalFee - additionalFees;

// Po:
const payout = uberNet + boltNet + freenowNet - cashTotal + fuelVatRefund - fuel - planFee - rentalFee - additionalFees - fleetFees.total;
```

**3. Dodac wyswietlanie oplat flotowych w UI (po linii ~1198):**
```tsx
{/* Oplaty flotowe - WARUNKOWO */}
{fleetFees.total > 0 && (
  <div className="space-y-1 pb-3 border-b border-dashed border-gray-300">
    {fleetFees.items.map(fee => (
      <div key={fee.id} className="flex justify-between text-sm">
        <span className="text-muted-foreground">{fee.name}:</span>
        <span className="text-red-600">
          -{fee.type === 'fixed' ? fee.amount.toFixed(2) : `${fee.amount}%`} zł
        </span>
      </div>
    ))}
    <div className="flex justify-between text-base font-bold pt-1">
      <span>Suma oplat flotowych:</span>
      <span className="text-red-600">-{fleetFees.total.toFixed(2)} zł</span>
    </div>
  </div>
)}
```

---

## Problem 3: Logika zerowych/ujemnych rozliczen - brak oplaty przy braku przychodow

### Analiza obecnego stanu
- Oplata za wynajem (`rentalFee`) jest pobierana z `weekly_rental_fee` pojazdu
- Jest ZAWSZE odejmowana od wyplaty w linii 790:
  ```tsx
  const payout = uberNet + boltNet + freenowNet - cashTotal + fuelVatRefund - fuel - planFee - rentalFee - additionalFees;
  ```
- **Problem:** Jesli kierowca nie jezdzi (0 przychodu), nadal ma `-50 zl` (jak na foto 2)

### Nowa logika biznesowa
1. **Zerowy przychod (brak jazd)** = BRAK oplaty za uzytkowanie, BRAK oplaty za plan
2. **Ujemna kwota z platformy (np. -6 zl Bolt)** = tylko ten minus przenosi sie jako dlug, BEZ oplaty
3. **Dodatni przychod** = normalne naliczanie wszystkich oplat

### Rozwiazanie

**1. W src/components/DriverSettlements.tsx - zmodyfikowac calculatePayout (linia ~761-822):**

```tsx
const calculatePayout = (amounts: any): { payout: number; fee: number; totalTax: number; breakdown: any } => {
  if (!amounts) {
    return { payout: 0, fee: 0, totalTax: 0, breakdown: {} };
  }
  
  // Oblicz przychod brutto (przed podatkami) - bazowe wartosci z platform
  const uberBase = amounts.uber_base || amounts.uber_payout_d || 0;
  const boltBase = amounts.bolt_projected_d || 0;
  const freenowBase = amounts.freenow_base_s || 0;
  const totalGross = Math.max(0, uberBase) + Math.max(0, boltBase) + Math.max(0, freenowBase);
  
  // Get calculated net amounts
  const uberNet = amounts.uber_net || 0;
  const boltNet = amounts.bolt_net || 0;
  const freenowNet = amounts.freenow_net || 0;
  
  // Get taxes
  const uberTax = amounts.uber_tax_8 || 0;
  const boltTax = amounts.bolt_tax_8 || 0;
  const freenowTax = amounts.freenow_tax_8 || 0;
  const totalTax = uberTax + boltTax + freenowTax;
  
  // Get other values
  const fuel = amounts.fuel || 0;
  const fuelVatRefund = amounts.fuel_vat_refund || 0;
  const cashTotal = Math.abs(amounts.uber_cash || 0) + Math.abs(amounts.bolt_cash || 0) + Math.abs(amounts.freenow_cash_f || 0);
  
  // === NOWA LOGIKA: Czy naliczac oplaty? ===
  // Jesli totalGross == 0 -> kierowca nie jechal w ogole
  // Nie naliczamy wtedy zadnych oplat (wynajem, plan, dodatkowe, flotowe)
  const shouldChargeFees = totalGross > 0;
  
  // Uzyj oplaty tylko jesli przychod > 0
  const planFee = driverPlan?.base_fee ?? 50;
  const effectiveRentalFee = shouldChargeFees ? rentalFee : 0;
  const effectivePlanFee = shouldChargeFees ? planFee : 0;
  const effectiveAdditionalFees = shouldChargeFees ? additionalFees : 0;
  const effectiveFleetFees = shouldChargeFees ? fleetFees.total : 0;
  
  // WYPLATA z nowa logika
  // Jesli kierowca nie jechal (totalGross=0) ale ma ujemne saldo (np. -6 zl od Bolt)
  // to przenosi sie tylko ten minus jako dlug
  const payout = uberNet + boltNet + freenowNet - cashTotal + fuelVatRefund - fuel 
                 - effectivePlanFee - effectiveRentalFee - effectiveAdditionalFees - effectiveFleetFees;
  
  console.log(`💰 Payout calculation (NEW LOGIC):
    Gross earnings: ${totalGross.toFixed(2)} (Uber: ${uberBase}, Bolt: ${boltBase}, FreeNow: ${freenowBase})
    Should charge fees: ${shouldChargeFees}
    Effective rental fee: ${effectiveRentalFee.toFixed(2)} (original: ${rentalFee})
    Effective plan fee: ${effectivePlanFee.toFixed(2)} (original: ${planFee})
    Effective fleet fees: ${effectiveFleetFees.toFixed(2)}
    Net total: ${(uberNet + boltNet + freenowNet).toFixed(2)}
    = ${payout.toFixed(2)} PLN
  `);
  
  return {
    payout,
    fee: effectivePlanFee,
    totalTax,
    breakdown: {
      totalEarnings: uberNet + boltNet + freenowNet,
      totalGross,
      chargesApplied: shouldChargeFees,
      rental: effectiveRentalFee,
      planFee: effectivePlanFee,
      additionalFees: effectiveAdditionalFees,
      fleetFees: effectiveFleetFees,
      income: { uber: uberNet, bolt: boltNet, freenow: freenowNet },
      taxes: { uber: uberTax, bolt: boltTax, freenow: freenowTax, total: totalTax },
      deductions: { fuel, fuelVatRefund }
    }
  };
};
```

**2. Zaktualizowac UI - warunkowo pokazywac oplaty (linia ~1198):**

```tsx
{/* Wynajem auta - tylko jesli byl przychod */}
{breakdown.chargesApplied && rentalFee > 0 && (
  <div className="flex justify-between text-base font-bold pb-3 border-b border-dashed border-gray-300">
    <span className="font-bold">{t('weekly.carRental')}:</span>
    <span className="text-red-600">-{rentalFee.toFixed(2)} zł</span>
  </div>
)}

{/* Oplata serwisowa (plan) - tylko jesli byl przychod */}
{breakdown.chargesApplied && breakdown.planFee > 0 && (
  <div className="flex justify-between text-sm pb-2">
    <span>Oplata serwisowa:</span>
    <span className="text-red-600">-{breakdown.planFee.toFixed(2)} zł</span>
  </div>
)}

{/* Jesli nie naliczono oplat - pokazac informacje */}
{!breakdown.chargesApplied && (
  <div className="text-sm text-orange-600 bg-orange-50 p-3 rounded-lg mt-2 flex items-center gap-2">
    <AlertTriangle className="h-4 w-4" />
    <span>Brak przychodow w tym tygodniu - oplaty nie zostaly naliczone</span>
  </div>
)}
```

---

## Podsumowanie zmian w plikach

| Plik | Zmiany |
|------|--------|
| **Nowa migracja SQL** | Dodanie `driver_plan_selection_enabled` do tabeli `fleets` |
| **src/components/fleet/FleetSettlementSettings.tsx** | Dodanie przelacznika blokady wyboru planu + Switch UI |
| **src/components/SettlementPlanSelector.tsx** | Sprawdzanie ustawienia floty przed zezwoleniem na zmiane planu |
| **src/components/DriverSettlements.tsx** | Ladowanie oplat flotowych + nowa logika zerowych rozliczen |
| **src/integrations/supabase/types.ts** | Aktualizacja typow dla tabeli `fleets` (driver_plan_selection_enabled) |

---

## Krytyczne pliki do implementacji

- `src/components/DriverSettlements.tsx` - glowna logika rozliczen z warunkiem braku oplat + ladowanie oplat flotowych
- `src/components/fleet/FleetSettlementSettings.tsx` - przelacznik blokady planu dla kierowcow
- `src/components/SettlementPlanSelector.tsx` - blokada wyboru planu na podstawie ustawienia floty
- `supabase/migrations/[new].sql` - migracja dodajaca nowe pole do tabeli fleets
- `src/integrations/supabase/types.ts` - typy Supabase
