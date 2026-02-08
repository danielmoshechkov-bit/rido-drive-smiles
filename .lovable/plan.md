
# Plan Naprawy Krytycznych Błędów Systemu

## Problem 1: Usuwanie kierowcy - błąd FK constraints

**Diagnoza:**
- Funkcja `deleteDriver` w `DriversManagement.tsx` nie usuwa rekordów z WSZYSTKICH powiązanych tabel
- Baza danych ma 34 tabele z kluczami obcymi do tabeli `drivers`
- Brakuje usuwania z: `settlement_import_diagnostics`, `documents`, `fuel_logs`, `messages`, `rides_raw`, `settlements_weekly`, `settlement_plan_changes`, `system_alerts`, `fleet_invitations`, `price_change_notifications`, `marketplace_listings`, `driver_b2b_profiles`, `driver_auto_invoicing_settings`, `driver_locations`, `rental_payment_reminders`, `fleet_delegated_roles`

**Rozwiązanie:**
Dodać usuwanie ze WSZYSTKICH tabel z FK do drivers:

```typescript
// W deleteDriver() - przed usunięciem głównego rekordu:
await db.from('settlement_import_diagnostics').delete().eq('matched_driver_id', driverId);
await db.from('settlement_import_diagnostics').delete().eq('created_driver_id', driverId);
await db.from('documents').delete().eq('driver_id', driverId);
await db.from('fuel_logs').delete().eq('driver_id', driverId);
await db.from('messages').delete().eq('driver_id', driverId);
await db.from('rides_raw').delete().eq('driver_id', driverId);
await db.from('settlements_weekly').delete().eq('driver_id', driverId);
await db.from('settlement_plan_changes').delete().eq('driver_id', driverId);
await db.from('system_alerts').delete().eq('driver_id', driverId);
await db.from('fleet_invitations').delete().eq('driver_id', driverId);
await db.from('price_change_notifications').delete().eq('driver_id', driverId);
await db.from('marketplace_listings').delete().eq('driver_id', driverId);
await db.from('driver_b2b_profiles').delete().eq('driver_id', driverId);
await db.from('driver_auto_invoicing_settings').delete().eq('driver_id', driverId);
await db.from('driver_locations').delete().eq('driver_id', driverId);
await db.from('rental_payment_reminders').delete().eq('driver_id', driverId);
await db.from('fleet_delegated_roles').delete().eq('assigned_to_driver_id', driverId);
```

---

## Problem 2: Paweł Koziarek (UUID: 6c252dc6) nie wykrywany

**Diagnoza:**
- CSV ma 19 wierszy danych (linie 2-20), funkcja loguje "liczba wierszy: 20" (poprawnie)
- Logi pokazują 18 dopasowań przez platform ID
- UUID `6c252dc6-0767-47e0-aec1-283eee321c7d` NIE ISTNIEJE w `driver_platform_ids`
- Brak logu "Created new driver" - wiersz jest całkowicie pomijany
- Problem: fuzzy matching NIE znajduje dopasowania, ale nowy kierowca NIE jest tworzony

**Rozwiązanie:**
W `supabase/functions/settlements/index.ts`, funkcja `parseUberCsv` wymaga naprawy logiki tworzenia nowych kierowców:

```typescript
// Linia 757-810 - dodać bardziej szczegółowe logowanie i poprawić warunek
// 3. Create new driver if no match found
if (!driverId) {
  console.log(`🆕 UBER: No match for "${driverName}" (platformId: ${platformId}), creating new driver...`);
  
  const nameParts = driverName.split(' ');
  const firstName = nameParts[0] || 'Uber';
  const lastName = nameParts.slice(1).join(' ') || 'Driver';
  
  // NOWE: Sprawdź czy driver z tym platformId już istnieje gdziekolwiek
  const { data: existingWithPlatformId } = await supabase
    .from('driver_platform_ids')
    .select('driver_id')
    .eq('platform', 'uber')
    .eq('platform_id', platformId)
    .maybeSingle();
  
  if (existingWithPlatformId) {
    driverId = existingWithPlatformId.driver_id;
    matchedDrivers++;
    console.log(`✅ UBER: Found existing driver via platform_id lookup: ${driverId}`);
  } else {
    // Tworzenie nowego kierowcy...
    const { data: newDriver, error } = await supabase
      .from('drivers')
      .insert({...})
      .select('id')
      .single();
    
    if (error) {
      console.error(`❌ UBER: Error creating driver ${driverName}:`, error);
    } else if (newDriver) {
      // ... reszta logiki
    }
  }
}
```

---

## Problem 3: Karta paliwowa 10206980198 nie wykrywana

**Diagnoza:**
- Karta `0010206980198` istnieje w `fuel_transactions` (2 transakcje)
- Żaden kierowca NIE ma przypisanej karty `10206980198`
- Funkcja `fetchUnmappedFuelCards` powinna ją wykryć
- Problem: porównanie kart nie działa poprawnie

**Rozwiązanie:**
W `UnmappedDriversModal.tsx`, poprawić logikę `fetchUnmappedFuelCards`:

```typescript
const fetchUnmappedFuelCards = async () => {
  try {
    // Pobierz karty z drivers
    const { data: allDrivers } = await supabase
      .from("drivers")
      .select("fuel_card_number")
      .not("fuel_card_number", "is", null);

    // Buduj set znormalizowanych kart
    const assignedCardsSet = new Set<string>();
    allDrivers?.forEach(d => {
      if (d.fuel_card_number?.trim()) {
        // Dodaj zarówno oryginalną jak i znormalizowaną wersję
        const raw = d.fuel_card_number.trim();
        const normalized = raw.replace(/^0+/, '');
        assignedCardsSet.add(raw);
        assignedCardsSet.add(normalized);
        // Dodaj też z wiodącymi zerami
        assignedCardsSet.add('00' + normalized);
      }
    });

    console.log('🔍 Assigned cards:', Array.from(assignedCardsSet));

    // Pobierz transakcje z ostatnich 3 miesięcy
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: transactions } = await supabase
      .from("fuel_transactions")
      .select("card_number, total_amount")
      .gte("transaction_date", threeMonthsAgo.toISOString().split('T')[0]);

    // Grupuj nieprzypisane karty
    const unassignedCards: Record<string, { amount: number; count: number }> = {};
    
    transactions?.forEach(t => {
      if (!t.card_number?.trim()) return;
      
      const cardRaw = t.card_number.trim();
      const cardNormalized = cardRaw.replace(/^0+/, '');
      
      // Sprawdź czy przypisana (w obu formatach)
      const isAssigned = assignedCardsSet.has(cardRaw) || 
                         assignedCardsSet.has(cardNormalized);
      
      console.log(`🔍 Card ${cardRaw} (norm: ${cardNormalized}): assigned=${isAssigned}`);
      
      if (!isAssigned) {
        if (!unassignedCards[cardNormalized]) {
          unassignedCards[cardNormalized] = { amount: 0, count: 0 };
        }
        unassignedCards[cardNormalized].amount += t.total_amount || 0;
        unassignedCards[cardNormalized].count += 1;
      }
    });

    const result = Object.entries(unassignedCards).map(([card, data]) => ({
      card_number: card,
      total_amount: data.amount,
      transaction_count: data.count
    }));

    console.log('🔍 FINAL Unassigned cards:', result);
    setUnmappedFuelCards(result);
  } catch (err) {
    console.error("Error:", err);
  }
};
```

---

## Problem 4: Duplikaty kierowców (Aneta Sknadaj)

**Diagnoza:**
- Istnieją 2 rekordy dla Aneta Sknadaj:
  - `139cc42d-50c1-4284-9aa2-e756074b1a50` - bez platform_id
  - `1464e943-7eba-4297-9404-bdc1f3734d5d` - z uber_id `68d27e4a`

**Rozwiązanie:**
1. Zachować rekord z platform_id (`1464e943`)
2. Przenieść dane z duplikatu do głównego rekordu
3. Usunąć duplikat

---

## Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/DriversManagement.tsx` | Dodać brakujące cascade delete dla 17 tabel |
| `supabase/functions/settlements/index.ts` | Poprawić logikę tworzenia nowych kierowców w parseUberCsv |
| `src/components/fleet/UnmappedDriversModal.tsx` | Poprawić logikę wykrywania nieprzypisanych kart paliwowych |

---

## Szczegóły techniczne zmian

### Zmiana 1: DriversManagement.tsx - pełna kaskada usuwania

Linie 264-304 - funkcja `deleteDriver` wymaga dodania usuwania z 17 brakujących tabel przed usunięciem głównego rekordu.

### Zmiana 2: settlements/index.ts - naprawić tworzenie kierowcy

Linie 756-810 w funkcji `parseUberCsv`:
- Dodać logowanie diagnostyczne przed tworzeniem kierowcy
- Dodać obsługę błędów przy insert
- Upewnić się że brak dopasowania skutkuje utworzeniem nowego rekordu

### Zmiana 3: UnmappedDriversModal.tsx - naprawić wykrywanie kart

Linie 104-181 w funkcji `fetchUnmappedFuelCards`:
- Poprawić normalizację numerów kart (usuwanie wiodących zer)
- Dodać porównanie w obu formatach (z zerami i bez)
- Dodać szczegółowe logowanie każdej karty

---

## Oczekiwane efekty

1. Usuwanie kierowcy będzie działać bez błędów FK
2. Paweł Koziarek (i inni nowi kierowcy) będą wykrywani i tworzeni
3. Karta paliwowa 10206980198 pojawi się w zakładce "Paliwo"
4. System będzie logować każdy krok procesu dla łatwiejszego debugowania
