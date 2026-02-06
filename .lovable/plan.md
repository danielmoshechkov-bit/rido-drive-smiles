
# Plan Naprawy 4 Problemów UI/UX i Kont Testowych

## Podsumowanie

Na podstawie analizy kodu i bazy danych zidentyfikowano 4 główne problemy:

1. **Konta testowe nie działają** - warsztat@test.pl i detaling@test.pl istnieją w bazie, ale nie mają przypisanych ról (bo `service_provider` nie istnieje w enum)
2. **Brak admina sprzedaży w menu** - AdminPortalSwitcher nie zawiera opcji dla `sales_admin`
3. **Marketplace Admin - zły styl zakładek** - używa zwykłych `TabsList` zamiast `TabsPill`
4. **Brak przycisku do sprawdzania nowych kierowców** - przy "Generuj przelew" nie ma opcji ręcznego wywołania mapowania kierowców

---

## Problem 1: Konta Testowe (warsztat@test.pl, detaling@test.pl)

### Analiza
- Konta istnieją w `auth.users` (ID: fcba3af4-d18d-44ff-b2c8-5b528d9fa614, f058388d-bb0e-4a8d-9124-347c82eba9b3)
- NIE mają wpisów w `user_roles` - bo funkcja próbowała dodać `service_provider`, który nie istnieje w enum `app_role`
- Dostępne role: admin, fleet_settlement, fleet_rental, driver, marketplace_user, real_estate_admin, real_estate_agent, accounting_admin, accountant, sales_admin, sales_rep

### Rozwiązanie

#### Krok 1: Dodać nową rolę do enum
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'service_provider';
```

#### Krok 2: Dodać role dla istniejących kont testowych
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('fcba3af4-d18d-44ff-b2c8-5b528d9fa614', 'service_provider'),
  ('f058388d-bb0e-4a8d-9124-347c82eba9b3', 'service_provider');
```

#### Krok 3: Dodać obsługę service_provider w Auth.tsx
Plik: `src/pages/Auth.tsx` (linie 69-88)
```tsx
// Dodać przed marketplace_user:
} else if (roles.includes('service_provider')) {
  navigate('/uslugi/panel');
  return;
}
```

#### Krok 4: Utworzyć panel usługodawcy
Plik: `src/pages/ServiceProviderDashboard.tsx` (nowy)
- Panel dla usługodawców (warsztat, detaling)
- Zakładki: Dashboard, Moje usługi, Kalendarz, Rezerwacje, Ustawienia
- Dostęp do AI Call Agent

#### Krok 5: Dodać routing
Plik: `src/App.tsx`
```tsx
<Route path="/uslugi/panel" element={<ServiceProviderDashboard />} />
```

#### Krok 6: Aktualizować create-test-accounts
Plik: `supabase/functions/create-test-accounts/index.ts`
- Zmienić `role: 'service_provider'` (po dodaniu do enum)
- Dodać fallback na `marketplace_user` jeśli service_provider nie istnieje

### Pliki do modyfikacji
- Nowa migracja SQL (dodanie enum value + role dla testowych kont)
- `src/pages/Auth.tsx`
- `src/pages/ServiceProviderDashboard.tsx` (nowy)
- `src/App.tsx`
- `supabase/functions/create-test-accounts/index.ts`

---

## Problem 2: Brak admina sprzedaży w menu

### Analiza
W `AdminPortalSwitcher.tsx` nie ma opcji dla `sales_admin`. Menu pokazuje: Portal GetRido, Flota i Kierowcy, Nieruchomości, Marketplace Pojazdów, Mapy, Usługi, Księgowość.

### Rozwiązanie
Plik: `src/components/admin/AdminPortalSwitcher.tsx`

Dodać nową opcję:
```tsx
{
  id: 'sales',
  name: 'Sprzedaż / CRM',
  icon: Briefcase,  // import z lucide-react
  path: '/sprzedaz',
  description: 'Panel handlowca i CRM',
},
```

### Pliki do modyfikacji
- `src/components/admin/AdminPortalSwitcher.tsx`

---

## Problem 3: Marketplace Admin - zły styl zakładek

### Analiza
`AdminMarketplace.tsx` używa zwykłych `<TabsList>` z Radix UI, podczas gdy inne panele admina (np. AdminRealEstate) używają `<TabsPill>` z fioletowym paskiem.

### Rozwiązanie
Plik: `src/pages/AdminMarketplace.tsx`

Zmienić:
```tsx
// PRZED:
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
...
<Tabs defaultValue="listings" className="space-y-6">
  <TabsList>
    <TabsTrigger value="listings">...</TabsTrigger>
    ...
  </TabsList>
  <TabsContent value="listings">...</TabsContent>
</Tabs>

// PO:
import { TabsPill } from "@/components/ui/TabsPill";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
...
<TabsPill defaultValue="listings" className="space-y-6">
  <TabsTrigger value="listings">...</TabsTrigger>
  ...
  <TabsContent value="listings">...</TabsContent>
</TabsPill>
```

### Pliki do modyfikacji
- `src/pages/AdminMarketplace.tsx`

---

## Problem 4: Przycisk do sprawdzania nowych kierowców

### Analiza
Użytkownik chce mieć możliwość ręcznego wywołania sprawdzenia nowych kierowców z już wgranych rozliczeń. Obecnie modal `UnmappedDriversModal` pojawia się tylko po imporcie.

### Rozwiązanie
Plik: `src/components/FleetSettlementsView.tsx`

Dodać nowy przycisk obok "Generuj przelew":
```tsx
<Button 
  variant="outline" 
  size="sm"
  onClick={handleCheckUnmappedDrivers}
  className="gap-1.5"
>
  <Users className="h-4 w-4" />
  Sprawdź nowych kierowców
</Button>
```

Dodać funkcję:
```tsx
const handleCheckUnmappedDrivers = async () => {
  // Pobierz kierowców z unmapped_settlement_drivers dla tej floty/okresu
  const { data: unmapped } = await supabase
    .from('unmapped_settlement_drivers')
    .select('*')
    .eq('fleet_id', fleetId)
    .eq('status', 'pending');
    
  if (unmapped && unmapped.length > 0) {
    setUnmappedDrivers(unmapped);
    setShowUnmappedModal(true);
  } else {
    toast.info('Brak nowych kierowców do zmapowania');
  }
};
```

Dodać stan i modal:
```tsx
const [unmappedDrivers, setUnmappedDrivers] = useState<any[]>([]);
const [showUnmappedModal, setShowUnmappedModal] = useState(false);

// W JSX:
<UnmappedDriversModal
  open={showUnmappedModal}
  onOpenChange={setShowUnmappedModal}
  unmappedDrivers={unmappedDrivers}
  fleetId={fleetId}
  onComplete={() => {
    setUnmappedDrivers([]);
    fetchSettlements(); // odśwież dane
  }}
/>
```

### Pliki do modyfikacji
- `src/components/FleetSettlementsView.tsx`

---

## Podsumowanie plików do modyfikacji

| Problem | Pliki | Typ |
|---------|-------|-----|
| 1. Konta testowe | Migracja SQL, Auth.tsx, App.tsx, ServiceProviderDashboard.tsx (nowy), create-test-accounts | Edycja + nowe |
| 2. Admin sprzedaży | AdminPortalSwitcher.tsx | Edycja |
| 3. Marketplace styl | AdminMarketplace.tsx | Edycja |
| 4. Przycisk kierowców | FleetSettlementsView.tsx | Edycja |

---

## Kolejność wdrożenia

1. **Faza 1** - Migracja SQL (dodanie enum + role testowe)
2. **Faza 2** - Utworzenie ServiceProviderDashboard.tsx
3. **Faza 3** - Aktualizacja Auth.tsx i App.tsx
4. **Faza 4** - Poprawki UI (AdminPortalSwitcher, AdminMarketplace)
5. **Faza 5** - Przycisk sprawdzania kierowców

## Szacowany czas: ~4h
