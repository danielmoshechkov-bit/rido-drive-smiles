
# Plan Naprawy Systemu Rozliczeń i Aktywacji Modułów

## Problem 1: Modal pokazuje 1 rekord zamiast 3

### Diagnoza
- Alert poprawnie wykrywa 3 kierowców bez `driver_app_users`: "test tess", "asd sda", "Aneta Sknadaj"
- Modal filtruje kierowców wg platform: `uberDrivers = unmappedDrivers.filter(d => d.uber_id)`
- Tylko Aneta Sknadaj ma przypisany `uber_id` (`68d27e4a-c382-4cbf-ba4d-1c8bf8b0572c`)
- "test tess" i "asd sda" nie mają żadnych platform_ids więc nie pojawiają się w żadnej zakładce

### Rozwiązanie
Dodać nową zakładkę "Bez platformy" w modalu dla kierowców bez żadnego platform_id:

```typescript
// Dodać nowy filtr:
const noPlatformDrivers = unmappedDrivers.filter(d => 
  !d.uber_id && !d.bolt_id && !d.freenow_id
);

// Dodać nową zakładkę w Tabs:
<TabsTrigger value="no_platform">
  Bez platformy {noPlatformDrivers.length > 0 && <Badge>{noPlatformDrivers.length}</Badge>}
</TabsTrigger>

<TabsContent value="no_platform">
  {renderPlatformList(noPlatformDrivers, "no_platform")}
</TabsContent>
```

---

## Problem 2: Karta paliwowa 10206980198 nie wykryta

### Diagnoza
- Transakcje zawierają kartę `0010206980198` (z wiodącymi zerami)
- Przypisane karty w drivers mają format `10206980xxx` (bez zer)
- Logika normalizacji dodaje formaty z 0 i 00 na początku
- Problem: karta `10206980198` NIE jest przypisana do żadnego kierowcy w bazie

### Rozwiązanie
Dodać console.log diagnostyczny + poprawić logikę porównywania:

```typescript
// W fetchUnmappedFuelCards dodać:
console.log('🔍 FUEL DEBUG:', {
  assignedCards: Array.from(assignedCards),
  transactionCardNumbers: transactions?.map(t => t.card_number),
});

// Poprawić normalizację - dodać więcej wariantów:
const normalized = t.card_number?.replace(/^0+/, '') || '';
const transactionNormalized = normalized;

// Sprawdzić czy normalized jest w assignedCards
const normalizedAssigned = Array.from(assignedCards).map(c => c.replace(/^0+/, ''));
const isAssigned = normalizedAssigned.includes(transactionNormalized);
```

---

## Problem 3: Daniel Moshechkov (właściciel floty) widoczny w rozliczeniach

### Diagnoza
- Daniel ma `uber_base: -13450.97` (ujemne - to wypłata dla właściciela)
- Kod obsługuje `has_negative_balance: true` dla kierowców z ujemnym saldem
- Ale właściciel floty który TYLKO otrzymuje wypłaty (bez kursów) powinien być ukryty

### Rozwiązanie
Dodać flagę `is_fleet_owner` i filtrować takie osoby:

```typescript
// W fetchSettlements, przed agregacją:
// Pobierz user_roles żeby zidentyfikować fleet_settlement/fleet_rental
const { data: fleetOwnerRoles } = await supabase
  .from('user_roles')
  .select('user_id')
  .eq('fleet_id', fleetId)
  .in('role', ['fleet_settlement', 'fleet_rental']);

const ownerUserIds = new Set(fleetOwnerRoles?.map(r => r.user_id) || []);

// W agregacji sprawdź:
const driverAppUserId = (driver as any).driver_app_users?.user_id;
const isFleetOwner = driverAppUserId && ownerUserIds.has(driverAppUserId);

// Jeśli to właściciel i ma TYLKO ujemne saldo (brak kursów) - ukryj
if (isFleetOwner && total_base <= 0) {
  return null; // lub pomiń w filtrowaniu
}
```

---

## Problem 4: Checkbox "Pokaż 0 wyniki" nie działa

### Diagnoza
- Filtr sprawdza: `s.total_base === 0 && s.final_payout === 0`
- Kierowcy z ujemnymi saldami mają `total_base < 0` więc nie są filtrowane
- Kierowcy bez danych mają `total_base === 0` ale mogą mieć `final_payout !== 0`

### Rozwiązanie
Poprawić logikę filtrowania:

```typescript
// Zmienić warunek w filteredSettlements:
if (!showZeroRows) {
  // Ukryj jeśli: brak aktywności (total_base = 0) LUB tylko ujemne saldo bez kursów
  const hasNoActivity = s.total_base === 0;
  const hasOnlyNegative = s.total_base < 0 && s.uber_base <= 0 && s.bolt_base <= 0 && s.freenow_base <= 0;
  
  if (hasNoActivity || hasOnlyNegative) {
    return false;
  }
}
```

Lub całkowicie usunąć checkbox jeśli nie jest potrzebny.

---

## Problem 5: Aktywacja modułów dla usługodawców

### Wymagane zmiany w bazie danych

```sql
-- Włącz moduł stron WWW
UPDATE feature_toggles 
SET is_enabled = true 
WHERE feature_key = 'website_builder_enabled';

-- Włącz globalne uczenie AI agentów
UPDATE feature_toggles 
SET is_enabled = true 
WHERE feature_key = 'ai_agents_global_learning';
```

### Konto detaling@test.pl
- User ID: `f058388d-bb0e-4a8d-9124-347c82eba9b3`
- Ma już rolę `service_provider` - może się zalogować
- Hasło: `Test123!` (zgodnie z kontem testowym)
- Po włączeniu toggles, zakładki "Strona WWW" i "AI Agenci" pojawią się w panelu

---

## Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/fleet/UnmappedDriversModal.tsx` | Dodać zakładkę "Bez platformy", poprawić logikę paliwa |
| `src/components/FleetSettlementsView.tsx` | Ukryć właścicieli flot z ujemnym saldem, poprawić filtr "0 wyniki" |
| Baza danych | Aktywować feature toggles |

---

## Szczegóły techniczne

### Zmiana 1: Zakładka "Bez platformy" w UnmappedDriversModal

Linia ~70 dodać:
```typescript
const noPlatformDrivers = unmappedDrivers.filter(d => 
  !d.uber_id && !d.bolt_id && !d.freenow_id
);
```

W TabsList (około linia 510) dodać:
```tsx
<TabsTrigger value="no_platform" className="gap-1.5">
  <Car className="h-3.5 w-3.5" />
  Bez platformy
  {noPlatformDrivers.length > 0 && (
    <Badge variant="secondary" className="ml-1">
      {noPlatformDrivers.length}
    </Badge>
  )}
</TabsTrigger>
```

### Zmiana 2: Ukrycie właścicieli flot

W FleetSettlementsView linia ~690 dodać zapytanie o właścicieli:
```typescript
const { data: ownerDriverAppUsers } = await supabase
  .from('driver_app_users')
  .select('driver_id, user_id')
  .in('driver_id', driverIds);

const { data: fleetOwnerRoles } = await supabase
  .from('user_roles')
  .select('user_id')
  .eq('fleet_id', fleetId)
  .in('role', ['fleet_settlement', 'fleet_rental']);

const ownerUserIds = new Set(fleetOwnerRoles?.map(r => r.user_id) || []);
const ownerDriverIds = new Set(
  ownerDriverAppUsers?.filter(d => ownerUserIds.has(d.user_id)).map(d => d.driver_id) || []
);
```

W agregacji (~linia 1060) dodać filtrowanie:
```typescript
// Przed zwróceniem settlements, odfiltruj właścicieli z ujemnym saldem
const filteredAggregated = aggregated.filter(row => {
  // Właściciel floty z ujemnym saldem (tylko wypłaty) - ukryj
  if (ownerDriverIds.has(row.driver_id) && row.total_base <= 0) {
    return false;
  }
  // Standardowe filtrowanie ghost drivers
  return row.total_base > 0 || row.has_negative_balance || settlementsDriverIds.has(row.driver_id);
});
```

### Zmiana 3: Usunięcie checkboxa "Pokaż 0 wyniki"

Ten checkbox nie ma sensu w obecnej logice - usunąć go lub zamienić na:
```typescript
// Zamiast checkboxa "Pokaż 0 wyniki", ukryć wszystkich z total_base <= 0 domyślnie
```

---

## Efekt końcowy

1. Modal mapowania pokaże WSZYSTKIE 3 rekordy (2 w "Bez platformy", 1 w "Uber")
2. Nowa karta paliwowa `10206980198` pojawi się w zakładce "Paliwo"
3. Daniel Moshechkov (właściciel floty) nie będzie widoczny w rozliczeniach
4. Checkbox "Pokaż 0 wyniki" usunięty lub poprawiony
5. Moduły "Strona WWW" i "AI Agenci" aktywne dla wszystkich usługodawców
