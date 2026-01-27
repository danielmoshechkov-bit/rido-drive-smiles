
# Plan: Naprawa usuwania rozliczeń i ujednolicenie kolorów nawigacji

## Zidentyfikowane problemy

### Problem 1: Rozliczenia nie są usuwane (KRYTYCZNY BUG)
**Przyczyna:** Tabela `settlements` ma polityki RLS, które pozwalają na DELETE tylko użytkownikom z rolą `admin`. Użytkownicy flotowi (`fleet_settlement`) mają tylko uprawnienia SELECT.

Aktualne polityki:
- `Admin can manage settlements` - cmd: ALL (dla roli admin)
- `Fleet settlement can view settlements...` - cmd: SELECT (tylko odczyt)

**Skutek:** Supabase nie zwraca błędu gdy RLS blokuje operację, więc kod pokazuje "Usunięto X rozliczeń", ale dane pozostają w bazie.

### Problem 2: Różne kolory pasków nawigacji
**Przyczyna:** Istnieją dwie różne implementacje `TabsPill`:
1. `src/ridoUiPack.tsx` - używa koloru `#6C3CF0` (fioletowy)
2. `src/components/ui/TabsPill.tsx` - używa `bg-primary` (z CSS variables)

DriverDashboard importuje z `ridoUiPack`, a inne dashboardy z `ui/TabsPill`.

### Problem 3: Różna liczba kont w przełączniku
Widoczność kont zależy od przekazanych props do `AccountSwitcherPanel`. Każdy dashboard przekazuje inne wartości.

---

## Rozwiązanie

### Krok 1: Dodanie polityki RLS dla DELETE (fleet_settlement)

Utworzę nową migrację SQL dodającą politykę pozwalającą użytkownikom flotowym usuwać rozliczenia swoich kierowców:

```sql
CREATE POLICY "Fleet settlement can delete settlements for their drivers"
ON public.settlements
FOR DELETE
USING (
  has_role(auth.uid(), 'fleet_settlement'::app_role) 
  AND EXISTS (
    SELECT 1 FROM drivers d
    WHERE d.id = settlements.driver_id 
    AND d.fleet_id = get_user_fleet_id(auth.uid())
  )
);
```

### Krok 2: Ujednolicenie komponentu TabsPill

Usunę duplikat i ujednolicę wszystkie importy do jednego źródła. Następnie dodam wsparcie dla dynamicznego koloru z ustawień admina.

**Zmiany w `src/components/ui/TabsPill.tsx`:**
- Dodanie obsługi customowego koloru z kontekstu/ustawień
- Użycie CSS variable `--nav-bar-color` zamiast stałego koloru
- Fallback do `hsl(var(--primary))`

### Krok 3: Dodanie tabeli ustawień kolorów UI

Utworzę nową tabelę `ui_settings` do przechowywania globalnych ustawień UI:

```sql
CREATE TABLE public.ui_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Krok 4: Panel ustawień w adminie

**Nowy komponent:** `src/components/admin/UISettingsPanel.tsx`

Pozwoli na:
- Wybór predefiniowanego koloru (fioletowy/niebieski)
- Własny kolor (color picker)
- Podgląd na żywo

### Krok 5: Hook do pobierania ustawień UI

**Nowy hook:** `src/hooks/useUISettings.ts`

```typescript
export function useUISettings() {
  const [navBarColor, setNavBarColor] = useState('#6C3CF0'); // default purple
  
  useEffect(() => {
    // Fetch from ui_settings table
    // Apply to CSS variable
    document.documentElement.style.setProperty('--nav-bar-color', navBarColor);
  }, [navBarColor]);
  
  return { navBarColor };
}
```

### Krok 6: Ujednolicenie importów TabsPill

Wszystkie pliki używające `TabsPill` z `ridoUiPack`:
- `src/pages/DriverDashboard.tsx` - zmienić import na `@/components/ui/TabsPill`

### Krok 7: Naprawa AccountSwitcherPanel

Zapewnić, że wszystkie dashboardy przekazują te same props:
- `isDriverAccount`
- `isFleetAccount`
- `isMarketplaceAccount`
- `isAdminAccount`
- `isClientPortal`

---

## Pliki do modyfikacji/utworzenia

1. **Migracja SQL** - nowa polityka RLS dla DELETE na settlements
2. **Migracja SQL** - tabela `ui_settings`
3. **`src/components/ui/TabsPill.tsx`** - wsparcie dla dynamicznego koloru
4. **`src/components/admin/UISettingsPanel.tsx`** - nowy komponent (panel ustawień)
5. **`src/hooks/useUISettings.ts`** - nowy hook
6. **`src/pages/AdminDashboard.tsx`** - dodanie zakładki "Ustawienia UI"
7. **`src/pages/DriverDashboard.tsx`** - zmiana importu TabsPill
8. **`src/ridoUiPack.tsx`** - usunięcie duplikatu TabsPill lub oznaczenie jako deprecated
9. **`src/index.css`** - dodanie zmiennej `--nav-bar-color`

---

## Szczegóły techniczne

### Schemat ustawień UI
```json
{
  "nav_bar_color": {
    "type": "preset",  // lub "custom"
    "preset": "purple", // "purple" | "blue"
    "custom": "#6C3CF0" // hex color
  }
}
```

### Predefiniowane kolory
- **Fioletowy (domyślny):** `#6C3CF0` / `hsl(259, 65%, 58%)`
- **Niebieski:** `#3B82F6` / `hsl(217, 91%, 60%)`
- **Własny:** dowolny kolor hex

### Logika aplikowania koloru
```typescript
// W useUISettings lub głównym App.tsx
useEffect(() => {
  const applyColor = async () => {
    const settings = await fetchUISettings();
    const color = settings.nav_bar_color.type === 'preset' 
      ? presetColors[settings.nav_bar_color.preset]
      : settings.nav_bar_color.custom;
    
    document.documentElement.style.setProperty('--nav-bar-color', color);
  };
  applyColor();
}, []);
```

---

## Rezultat

1. **Usuwanie rozliczeń będzie działać** - użytkownicy flotowi będą mogli usuwać rozliczenia swoich kierowców
2. **Jednolity kolor pasków** - wszystkie dashboardy będą używać tego samego koloru
3. **Konfigurowalny kolor** - admin główny może zmieniać kolor pasków w ustawieniach
4. **Spójny przełącznik kont** - te same konta widoczne wszędzie

