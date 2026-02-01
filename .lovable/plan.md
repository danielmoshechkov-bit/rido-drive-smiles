
# Plan Naprawy UI - 2 Problemy

## ANALIZA PROBLEMÓW

### 1. Kolor paska głównego - fioletowy zamiast niebieskiego na mobile

**Obecny stan:**
- Desktop (foto 1): Pasek główny "Rozliczenia, Lista kierowców, Flota..." jest **niebieski** (#3B82F6)
- Mobile (foto 2): Ten sam pasek zmienia kolor na **fioletowy** - błąd!

**Przyczyna:**
W `MobileTabMenu.tsx` (linia 63) używany jest stały kolor z klasy `bg-primary` zamiast dynamicznej zmiennej CSS `--nav-bar-color`:
```tsx
<div className="flex items-center justify-between bg-primary text-primary-foreground px-4 py-2.5 rounded-xl">
```

Na desktopie `TabsPill` używa `style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}`, która jest ustawiana przez hook `useUISettings` (może być niebieska gdy ustawiono blue preset).

Na mobile `MobileTabMenu` używa `bg-primary` która jest ZAWSZE fioletowa (Tailwind: `--primary: 259 65% 58%`).

**Rozwiązanie:**
Zmienić `MobileTabMenu.tsx`:
- Zamienić `bg-primary text-primary-foreground` na inline style: `style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}`
- Tekst: biały `text-white`

---

### 2. Widok mobilny karty pojazdu - wszystko nachodzi na siebie

**Obecny stan (foto 3):**
- Na mobile wszystkie dane (nr rej, pojazd, flota, wynajem, kierowca, dokumenty) są wyświetlane w 2 rzędach po 4 kolumny
- Dane są obcięte i nieczytelne
- Brak wizualnego wskaźnika rozwijania na mobile

**Wzór docelowy (foto 4):**
- Na desktopie po kliknięciu rozwija się pełny widok z zakładkami: Info, Dokumenty, Historia Kierowców, Serwis, Zdjęcia
- Na mobile też powinno działać, ale podsumowanie musi być czytelne

**Rozwiązanie:**
Przebudować widok karty pojazdu na mobile:

**A) Widok zwinięty (mobile) - KOMPAKTOWY:**
- Rząd 1: Nr rejestracyjny + Pojazd (marka model)
- Rząd 2: Wynajem zł/tydz. + Dokumenty (OC, Przegląd badges)
- Strzałka rozwijania widoczna na końcu

**B) Widok rozwinięty (mobile) - PEŁNY:**
Po kliknięciu pokazuje się pełny widok z:
- Kierowca (select)
- Flota
- Giełda switch
- Zakładki: Info, Dokumenty, Historia, Serwis, Zdjęcia

**Kluczowe zmiany w `FleetManagement.tsx`:**

1. Dodać strzałkę rozwijania widoczną na mobile (zmienić `hidden md:block` → `block`)

2. Na mobile pokazywać tylko najważniejsze dane:
```tsx
{/* Mobile compact view */}
<div className="md:hidden space-y-2">
  <div className="flex items-center justify-between">
    <div className="flex gap-4">
      <div>
        <span className="text-xs text-muted-foreground">Nr rej.:</span>
        <div className="font-bold text-sm">{vehicle.plate}</div>
      </div>
      <div>
        <span className="text-xs text-muted-foreground">Pojazd:</span>
        <div className="font-semibold text-sm">{vehicle.brand} {vehicle.model}</div>
      </div>
    </div>
    <ChevronDown className={cn("h-5 w-5 transition-transform", expanded && "rotate-180")} />
  </div>
  <div className="flex items-center justify-between">
    <VehicleRentBlock ... />
    <ExpiryBadges vehicleId={vehicle.id} compact />
  </div>
</div>

{/* Desktop full view */}
<div className="hidden md:block">
  {/* Current full layout */}
</div>
```

3. W rozwiniętym widoku na mobile - pełna zawartość (kierowca, zakładki itd.)

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiana |
|------|--------|
| `src/components/MobileTabMenu.tsx` | Zmienić `bg-primary` na `style={{ backgroundColor: 'var(--nav-bar-color)' }}` |
| `src/components/FleetManagement.tsx` | Osobny widok mobilny karty pojazdu z kompaktowym podsumowaniem |

---

## SZCZEGÓŁY IMPLEMENTACJI

### MobileTabMenu.tsx - kolor paska

**Zmiana linii 63:**
```tsx
// PRZED:
<div className="flex items-center justify-between bg-primary text-primary-foreground px-4 py-2.5 rounded-xl">

// PO:
<div 
  className="flex items-center justify-between text-white px-4 py-2.5 rounded-xl shadow-[0_4px_15px_rgba(108,60,240,0.15)]"
  style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}
>
```

### FleetManagement.tsx - responsywna karta pojazdu

Struktura nowej karty:

```tsx
<CollapsibleTrigger asChild>
  <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
    <div className="flex items-center justify-between pr-8">
      
      {/* MOBILE VIEW - compact */}
      <div className="md:hidden flex-1 space-y-2">
        {/* Row 1: Plate + Vehicle */}
        <div className="flex gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Nr rej.:</span>
            <div className="font-bold">{vehicle.plate}</div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Pojazd:</span>
            <div className="font-semibold">{vehicle.brand} {vehicle.model}</div>
          </div>
        </div>
        {/* Row 2: Rent + Documents */}
        <div className="flex items-center justify-between">
          <div onClick={(e) => e.stopPropagation()}>
            <VehicleRentBlock
              value={vehicle.weekly_rental_fee}
              onChange={...}
              userRole={userType}
              compact
            />
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <ExpiryBadges vehicleId={vehicle.id} compact />
          </div>
        </div>
      </div>
      
      {/* DESKTOP VIEW - full */}
      <div className="hidden md:flex flex-1 items-center gap-6">
        {/* Current full row layout */}
        ...
      </div>
      
      {/* Expand arrow - visible on BOTH mobile and desktop */}
      <div className="ml-4">
        {expandedVehicles.has(vehicle.id) ? 
          <ChevronUp className="h-5 w-5" /> : 
          <ChevronDown className="h-5 w-5" />
        }
      </div>
      
    </div>
  </div>
</CollapsibleTrigger>

<CollapsibleContent>
  <div className="border-t p-4">
    {/* Mobile: Show additional fields first */}
    <div className="md:hidden space-y-4 mb-4">
      <div className="grid grid-cols-2 gap-4">
        <div onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-muted-foreground">Kierowca:</span>
          <UniversalSelector ... />
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Flota:</span>
          <div className="font-semibold text-sm">{vehicle.fleet?.name || 'Brak'}</div>
        </div>
      </div>
      {isMarketplaceEnabled && (
        <div className="flex items-center gap-2">
          <Switch ... />
          <span className="text-xs">Giełda</span>
        </div>
      )}
    </div>
    
    {/* Tabs - for both mobile and desktop */}
    <Tabs defaultValue="info" className="w-full">
      <TabsList className="grid w-full grid-cols-5 rounded-lg text-xs md:text-sm">
        <TabsTrigger value="info">Info</TabsTrigger>
        <TabsTrigger value="documents">Dokumenty</TabsTrigger>
        <TabsTrigger value="history">Historia</TabsTrigger>
        <TabsTrigger value="service">Serwis</TabsTrigger>
        <TabsTrigger value="photos">Zdjęcia</TabsTrigger>
      </TabsList>
      ...
    </Tabs>
  </div>
</CollapsibleContent>
```

---

## KOLEJNOŚĆ WDROŻENIA

1. **MobileTabMenu.tsx** - zmiana koloru paska na dynamiczny
2. **FleetManagement.tsx** - nowy responsywny układ karty pojazdu:
   - Osobny widok kompaktowy dla mobile
   - Pełny widok dla desktop
   - Strzałka rozwijania widoczna na obu
   - Pełne dane w rozwiniętym widoku

---

## PODSUMOWANIE

| Problem | Rozwiązanie |
|---------|-------------|
| Kolor paska mobile ≠ desktop | Użyć `var(--nav-bar-color)` zamiast `bg-primary` |
| Dane nachodzą na mobile | Osobny kompaktowy widok mobile + rozwijanie do pełnego |
