

# Plan Naprawy - 6 Problemów

## ANALIZA PROBLEMÓW

### 1. BŁĄD PODPISU (foto 5) - "vehicle_rentals_status_check"
**Przyczyna:** Kod próbuje ustawić status `client_signed`, ale constraint w bazie danych pozwala tylko na: `pending`, `accepted`, `active`, `completed`, `cancelled`, `rejected`, `draft`, `pending_signature`, `signed`, `finalized`. Status `client_signed` nie istnieje!

**Rozwiązanie:** Dodać migrację SQL, która doda `client_signed`, `fleet_signed` i `sent_to_client` do dozwolonych statusów.

---

### 2. PODPIS FLOTY NIE ZAPISUJE SIĘ PO ODŚWIEŻENIU
**Przyczyna:** Tabela `fleet_signatures` może nie mieć kolumny primary key na `fleet_id` lub brak tabeli. `upsert` wymaga poprawnego konfliktu.

**Rozwiązanie:** 
- Sprawdzić czy tabela istnieje
- Dodać migrację tworzącą tabelę jeśli nie istnieje
- Poprawić logikę upsert w `FleetContractSettings.tsx`

---

### 3. ZAKŁADKA NAJEM - SUB-TABY W SZAREJ RAMCE
**Problem (foto 1):** Przyciski "Aktywne", "Do podpisu", "Zakończone" są osobno, a powinny być wewnątrz szarej ramki tabeli (jak inne zakładki wewnętrzne).

**Rozwiązanie:** W `FleetRentalsTab.tsx` zmienić strukturę:
- Usunąć `UniversalSubTabBar` 
- Zastąpić prostymi przyciskami wewnątrz `CardHeader` lub paskiem tabów wewnątrz karty

---

### 4. DODAWANIE AUTA - NAZWA FLOTY
**Problem (foto 3):** Pole "Właściciel / Flota" pokazuje placeholder zamiast automatycznej nazwy floty.

**Rozwiązanie:** W `FleetManagement.tsx` upewnić się, że `fleetName` jest przekazywane do `AddVehicleModal`. Pobrać nazwę floty z bazy jeśli nie ma.

---

### 5. RAMKA PODGLĄDU UMOWY - PRZEWIJANIE NA BOKI
**Problem (foto 4):** Modal umowy wymaga przewijania horyzontalnego.

**Rozwiązanie:** W `RentalContractSignatureFlow.tsx` i `RentalContractViewer.tsx`:
- Dodać `overflow-x-hidden` do kontenerów
- Zmniejszyć `max-w-[210mm]` na `max-w-full` w widoku mobilnym

---

### 6. UKŁAD UMOWY - LEPSZY FORMAT
**Problem (foto 2):** Umowa powinna mieć lepszy format z wyraźnym podziałem Wynajmujący/Najemca w dwóch kolumnach.

**Rozwiązanie:** Zaktualizować `rentalContractGenerator.ts` - już wygląda dobrze wg kodu, ale upewnić się że style są poprawnie zastosowane.

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiana |
|------|--------|
| `supabase/migrations/NEW.sql` | Dodać `client_signed`, `fleet_signed`, `sent_to_client` do constraint |
| `supabase/migrations/NEW.sql` | Stworzyć tabelę `fleet_signatures` jeśli nie istnieje |
| `src/components/fleet/FleetRentalsTab.tsx` | Zmienić sub-taby na wewnętrzne w ramce karty |
| `src/components/FleetManagement.tsx` | Dodać pobieranie `fleetName` i przekazać do modalu |
| `src/components/fleet/RentalContractViewer.tsx` | Poprawić responsywność - `overflow-x-hidden` |
| `src/components/fleet/RentalContractSignatureFlow.tsx` | Poprawić responsywność modalu |

---

## SZCZEGÓŁY TECHNICZNE

### Migracja SQL - statusy

```sql
ALTER TABLE vehicle_rentals DROP CONSTRAINT IF EXISTS vehicle_rentals_status_check;

ALTER TABLE vehicle_rentals ADD CONSTRAINT vehicle_rentals_status_check 
CHECK (status = ANY (ARRAY[
  'pending'::text, 
  'accepted'::text, 
  'active'::text, 
  'completed'::text, 
  'cancelled'::text, 
  'rejected'::text,
  'draft'::text,
  'pending_signature'::text,
  'signed'::text,
  'finalized'::text,
  'sent_to_client'::text,
  'client_signed'::text,
  'fleet_signed'::text
]));
```

### Migracja SQL - tabela fleet_signatures

```sql
CREATE TABLE IF NOT EXISTS fleet_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE UNIQUE,
  signature_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  auto_sign_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_signatures_fleet_id ON fleet_signatures(fleet_id);
```

### FleetRentalsTab.tsx - sub-taby wewnątrz karty

Zmiana struktury:
- Obecnie: `UniversalSubTabBar` → `Card` z listą
- Nowa: `Card` z `TabsList` wewnątrz `CardHeader`

```tsx
return (
  <Card>
    <CardHeader className="pb-0">
      <div className="flex items-center justify-between">
        <CardTitle>Umowy najmu</CardTitle>
        {/* Wewnętrzne przyciski zamiast UniversalSubTabBar */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <Button
            size="sm"
            variant={activeSubTab === "aktywne" ? "default" : "ghost"}
            onClick={() => setActiveSubTab("aktywne")}
          >
            Aktywne
          </Button>
          <Button
            size="sm"
            variant={activeSubTab === "do-podpisu" ? "default" : "ghost"}
            onClick={() => setActiveSubTab("do-podpisu")}
          >
            Do podpisu
          </Button>
          <Button
            size="sm"
            variant={activeSubTab === "zakonczone" ? "default" : "ghost"}
            onClick={() => setActiveSubTab("zakonczone")}
          >
            Zakończone
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      {/* Wyszukiwarka i tabela */}
    </CardContent>
  </Card>
);
```

### FleetManagement.tsx - nazwa floty

Dodać pobieranie nazwy floty jeśli nie ma:
```tsx
const [fleetInfo, setFleetInfo] = useState<{name: string} | null>(null);

useEffect(() => {
  if (fleetId) {
    supabase.from("fleets").select("name").eq("id", fleetId).single()
      .then(({ data }) => setFleetInfo(data));
  }
}, [fleetId]);

// W renderze:
<AddVehicleModal 
  ...
  fleetName={fleetInfo?.name || ""}
/>
```

### RentalContractViewer.tsx - responsywność

```tsx
<div 
  className="h-[60vh] overflow-y-auto overflow-x-hidden bg-muted p-2 sm:p-4"
  onScroll={handleScroll}
>
  <div className="max-w-full sm:max-w-[210mm] mx-auto bg-white shadow-lg rounded-sm">
    ...
  </div>
</div>
```

---

## KOLEJNOŚĆ WDROŻENIA

1. **Migracja SQL** - dodać statusy i tabelę `fleet_signatures`
2. **FleetRentalsTab.tsx** - zmienić sub-taby na wewnętrzne w karcie
3. **FleetManagement.tsx** - pobieranie nazwy floty
4. **RentalContractViewer.tsx** - responsywność
5. **RentalContractSignatureFlow.tsx** - responsywność modalu

