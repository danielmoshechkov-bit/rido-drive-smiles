
# Plan Kontynuacji Wdrożenia - 5 Problemów

## PODSUMOWANIE STANU

### ✅ Ukończone:
1. **Ikony spacing** - TabsTrigger w `UniversalSearchResults.tsx` - naprawione
2. **AdminPortal** - AccountSwitcherPanel dodany, role pobierane
3. **Tabele bazy danych** - wszystkie istnieją:
   - `ai_call_business_profiles` ✅
   - `ai_call_scripts` ✅
   - `ai_call_legal_consents` ✅
   - `driver_platform_ids` ✅
   - `unmapped_settlement_drivers` ✅
4. **Feature flags** - `ai_call_enabled_global` = TRUE ✅
5. **Komponenty UI** - Utworzone:
   - `AIAgentBusinessProfile.tsx` ✅
   - `AIAgentScriptsList.tsx` ✅
   - `AIAgentLegalConsentsModal.tsx` ✅
   - `UnmappedDriversModal.tsx` ✅
6. **Edge functions** - Utworzone:
   - `ai-generate-call-scripts` ✅
   - `create-test-accounts` ✅
7. **AIAgentDashboard.tsx** - Zakładki "Profil" i "Skrypty" dodane ✅

### ❌ Do dokończenia:

## 1. Utworzenie kont testowych (warsztat@test.pl, detaling@test.pl)

**Problem:** Konta nie istnieją w `auth.users`
**Rozwiązanie:** Zdeprojować i wywołać edge function `create-test-accounts`

```typescript
// Wywołanie:
await supabase.functions.invoke('create-test-accounts', {});
```

## 2. Integracja UnmappedDriversModal z FleetSettlementImport.tsx

**Problem:** Modal istnieje ale nie jest używany w `FleetSettlementImport.tsx`

**Zmiany w `src/components/fleet/FleetSettlementImport.tsx`:**

```tsx
// Dodać importy:
import { UnmappedDriversModal } from "./UnmappedDriversModal";

// Dodać stan:
const [unmappedDrivers, setUnmappedDrivers] = useState<any[]>([]);
const [showUnmappedModal, setShowUnmappedModal] = useState(false);

// Po udanym imporcie (linia ~192), dodać sprawdzenie:
if (data.stats?.unmapped_drivers?.length > 0) {
  setUnmappedDrivers(data.stats.unmapped_drivers);
  setShowUnmappedModal(true);
}

// Dodać modal w JSX:
<UnmappedDriversModal
  open={showUnmappedModal}
  onOpenChange={setShowUnmappedModal}
  unmappedDrivers={unmappedDrivers}
  fleetId={fleetId}
  onComplete={() => {
    setUnmappedDrivers([]);
    onComplete?.();
  }}
/>
```

## 3. Rozszerzenie odpowiedzi settlements o listę nowych kierowców

**Problem:** Edge function `settlements` zwraca tylko `new_drivers: liczba`, nie listę

**Zmiany w `supabase/functions/settlements/index.ts`:**

1. Dodać tablicę do śledzenia nowych kierowców:
```typescript
const newDriversList: any[] = [];
```

2. W funkcji `findOrCreateDriver` dodać zapisywanie nowego kierowcy do tablicy:
```typescript
// Po utworzeniu nowego kierowcy:
newDriversList.push({
  id: newDriver.id,
  full_name: `${newDriver.first_name} ${newDriver.last_name}`,
  uber_id: rowData.uberId,
  bolt_id: rowData.boltId,
  freenow_id: rowData.freenowId,
});

// Zapisać też do unmapped_settlement_drivers:
await supabase.from('unmapped_settlement_drivers').insert({
  fleet_id: meta.fleet_id,
  full_name: `${newDriver.first_name} ${newDriver.last_name}`,
  uber_id: rowData.uberId || null,
  bolt_id: rowData.boltId || null,
  freenow_id: rowData.freenowId || null,
  status: 'pending'
});
```

3. Rozszerzyć response o listę nowych kierowców:
```typescript
return new Response(
  JSON.stringify({
    success: true,
    settlement_period_id: settlementPeriod.id,
    stats: {
      processed: settlementsToInsert.length,
      new_drivers: newDriversCount,
      matched_drivers: matchedDriversCount,
      unmapped_drivers: newDriversList  // NOWE
    },
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

## 4. Deploy edge functions

Zdeprojować następujące edge functions:
- `create-test-accounts`
- `ai-generate-call-scripts`

## 5. Wywołanie create-test-accounts

Po zdeployowaniu, wywołać funkcję aby utworzyć konta testowe.

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiana |
|------|--------|
| `src/components/fleet/FleetSettlementImport.tsx` | Integracja UnmappedDriversModal |
| `supabase/functions/settlements/index.ts` | Dodanie listy nowych kierowców do response |

## KOLEJNOŚĆ WDROŻENIA

1. Zmodyfikować `FleetSettlementImport.tsx` - dodać modal i stan
2. Zmodyfikować `settlements/index.ts` - zwracać listę nowych kierowców
3. Deploy edge functions (`create-test-accounts`, `ai-generate-call-scripts`)
4. Wywołać `create-test-accounts` aby utworzyć konta testowe
5. Przetestować flow importu rozliczeń z mapowaniem kierowców

---

## SZACOWANY CZAS

| Zadanie | Czas |
|---------|------|
| Integracja UnmappedDriversModal | ~30 min |
| Rozszerzenie settlements response | ~45 min |
| Deploy i test edge functions | ~15 min |
| **Suma** | ~1.5h |
