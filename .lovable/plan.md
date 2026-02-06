
# Plan Naprawy 5 Problemów UI/UX

## Podsumowanie Problemów

Na podstawie analizy kodu i zrzutów ekranu zidentyfikowano 5 problemów do naprawy:

1. **Ikony za blisko tekstu** - W TabsPill na stronie wyników wyszukiwania ikony nachodzą na tekst (Pojazdy, Nieruchomości, Usługi)
2. **Kolejność kategorii w Motoryzacja** - Nieprawidłowa kolejność i nazwa kategorii w sekcji Motoryzacja
3. **Widoki usług nie działają** - W ServicesMarketplace przyciski zmiany widoku (grid/compact/list) nie działają dla pierwszych dwóch
4. **Kafelki na stronie głównej** - Kafelki głównych kategorii (Motoryzacja, Nieruchomości, Usługi, Księgowość) powinny wyglądać tak jak kafelki kategorii usług (foto 3 vs foto 4)
5. **Zakładka Faktury** - Zakładka Księgowość powinna być widoczna tylko dla użytkowników z ustawionymi danymi firmy

---

## Problem 1: Ikony Za Blisko Tekstu w Zakładkach

### Lokalizacja
`src/pages/UniversalSearchResults.tsx` linie 192-233

### Analiza
Kod już ma `gap-2` w className, ale klasa TabsPill nadpisuje style. Problem polega na tym, że TabsPill ustawia własne className dla TabsTrigger (linia 52-55 w TabsPill.tsx):
```tsx
className: "px-5 h-10 flex items-center rounded-full..."
```
Ta klasa NIE zawiera `gap-2`, więc odstęp między ikoną a tekstem jest minimalny.

### Rozwiązanie

Zmodyfikować `TabsPill.tsx` aby dodać `gap-2` do domyślnych stylów TabsTrigger:

**Plik:** `src/components/ui/TabsPill.tsx`
```tsx
// Linia 52-55 - dodać gap-2:
className:
  "px-5 h-10 flex items-center gap-2 rounded-full text-sm whitespace-nowrap transition text-white " +
  "data-[state=active]:bg-white data-[state=active]:text-[var(--nav-bar-color,#6C3CF0)] data-[state=active]:font-semibold " +
  "hover:bg-white/20 focus-visible:outline-none",
```

---

## Problem 2: Kolejność Kategorii w Motoryzacja

### Analiza
Obecna kolejność w `portal_categories` dla motoryzacja (z bazy danych):
1. Ogłoszenia (sort_order: 1)
2. Warsztaty (sort_order: 2)
3. Auto detailing (sort_order: 3)
4. Studio PPF (sort_order: 4)
5. Portal flotowy (sort_order: 5)
6. Portal kierowcy (sort_order: 6)

Oczekiwana kolejność według użytkownika:
1. Portal ogłoszeń
2. Warsztaty 
3. Detailing i Folia PPF (razem jako kategoria)
4. Portal zarządzania Flotą (zmiana nazwy z "Portal flotowy"/"Portal Rozliczeń")
5. Portal kierowcy

### Rozwiązanie

#### Opcja A: Zmiana w bazie danych (zalecane)
Wykonać SQL aby zaktualizować `portal_categories`:

```sql
-- Zmiana nazwy "Portal flotowy" na "Portal zarządzania Flotą"
UPDATE portal_categories 
SET name = 'Portal zarządzania Flotą', 
    description = 'Zarządzaj flotą pojazdów i kierowcami'
WHERE slug = 'portal-flotowy' AND portal_context = 'motoryzacja';

-- Zmiana nazwy "Auto detailing" na "Detailing i Folia PPF" i połączenie
UPDATE portal_categories 
SET name = 'Detailing i PPF',
    description = 'Polerowanie, ceramika, folie ochronne PPF',
    link_url = '/uslugi?kategoria=detailing'
WHERE slug = 'detailing' AND portal_context = 'motoryzacja';

-- Ukrycie Studio PPF (połączone z Detailing)
UPDATE portal_categories 
SET is_visible = false 
WHERE slug = 'ppf' AND portal_context = 'motoryzacja';

-- Aktualizacja kolejności: Ogłoszenia(1), Warsztaty(2), Detailing+PPF(3), Portal Flotowy(4), Portal Kierowcy(5)
UPDATE portal_categories SET sort_order = 4 WHERE slug = 'portal-flotowy' AND portal_context = 'motoryzacja';
UPDATE portal_categories SET sort_order = 5 WHERE slug = 'portal-kierowcy' AND portal_context = 'motoryzacja';
```

#### Opcja B: Zmiana w kodzie EasyHub.tsx (jeśli nie korzysta z portal_categories)
Jeśli EasyHub używa statycznej listy `motoryzacjaSubTiles`, należy ją zaktualizować:

**Plik:** `src/pages/EasyHub.tsx` linie 115-170

```tsx
const motoryzacjaSubTiles: MarketplaceTile[] = [
  {
    id: 'portal-ogloszen-auto',
    title: 'Portal Ogłoszeń',
    description: 'Kupuj, sprzedawaj, wymieniaj',
    icon: ShoppingCart,
    image: tileCars,
    link: '/gielda',
    available: true
  },
  {
    id: 'warsztat',
    title: 'Warsztaty',
    description: 'Naprawy i serwis samochodowy',
    icon: Wrench,
    image: tileWorkshop,
    link: '/uslugi?kategoria=warsztat',
    available: true
  },
  {
    id: 'detailing-ppf',
    title: 'Detailing i Folia PPF',
    description: 'Pielęgnacja, ceramika i folie ochronne',
    icon: Droplets,
    image: tileDetailing,
    link: '/uslugi?kategoria=detailing',
    available: true
  },
  {
    id: 'portal-flotowy',
    title: 'Portal zarządzania Flotą',
    description: 'Zarządzaj flotą i kierowcami',
    icon: Calculator,
    image: tileFleet,
    link: '/fleet',
    available: true
  },
  {
    id: 'portal-kierowcy',
    title: 'Portal Kierowcy',
    description: 'Rozliczenia i dokumenty',
    icon: User,
    image: tileDriver,
    link: '/driver',
    available: true
  }
];
```

---

## Problem 3: Widoki Usług Nie Działają

### Analiza
W `ServicesMarketplace.tsx` (linie 400-424) są 3 przyciski:
- Grid (siatka 3 kolumny) - `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Compact (mniejsza siatka 2 kolumny) - `grid-cols-1 md:grid-cols-2`
- List (lista pionowa) - `grid-cols-1`

Patrząc na kod (linie 428-442), wszystkie tryby działają poprawnie z CSS. Problem może być w tym, że `ServiceListingCard` nie renderuje się poprawnie dla pierwszych dwóch trybów.

### Rozwiązanie
Sprawdzić czy `ServiceListingCard` poprawnie obsługuje prop `viewMode`. Z kodu (linia 440-441):
```tsx
<ServiceListingCard
  ...
  viewMode={viewMode}
/>
```

W `ServiceListingCard.tsx` linia 128-129 widzimy:
```tsx
viewMode === 'list' && "flex flex-row"
```

Brakuje obsługi dla `grid` i `compact`. Należy dodać różne style dla każdego trybu.

**Plik:** `src/components/services/ServiceListingCard.tsx`

```tsx
// Linia 126-130 - rozszerzyć obsługę viewMode:
<Card 
  className={cn(
    "overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 shadow-md cursor-pointer",
    viewMode === 'list' && "flex flex-row",
    viewMode === 'compact' && "flex flex-row h-32",  // Dodać styl dla compact
    viewMode === 'grid' && ""  // Grid - domyślny styl pionowy
  )}
  onClick={handleCardClick}
>
```

Oraz dostosować sekcję zdjęcia i treści dla każdego trybu.

---

## Problem 4: Kafelki Strony Głównej vs Kategorie Usług

### Analiza
Użytkownik chce, aby kafelki na stronie głównej EasyHub (Motoryzacja, Nieruchomości, Usługi, Księgowość) wyglądały identycznie jak kafelki kategorii usług z `/uslugi`.

Porównanie:
- **EasyHub.tsx MarketplaceTileCard** (linie 212-276): `h-28 md:h-36`
- **ServiceCategoryTile.tsx** (linie 42-91): `h-28 md:h-36`

Oba komponenty już mają identyczną strukturę. Jedyna różnica to grid layout:
- EasyHub: `grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4` (mniejsze kafelki w 4 kolumnach)
- ServicesMarketplace: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

Wygląd na foto 3 (Usługi) ma większe, bardziej prostokątne kafelki z dwukolumnowym layoutem. Foto 4 (strona główna) ma mniejsze kafelki w 4 kolumnach.

### Rozwiązanie
Zmienić layout grida w EasyHub na 2 kolumny (jak w Usługi) i zwiększyć wysokość kafelków:

**Plik:** `src/pages/EasyHub.tsx`

1. Zmienić grid layout (około linii 550-580):
```tsx
// PRZED:
<div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">

// PO:
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

2. Zwiększyć wysokość kafelków w MarketplaceTileCard (linia 238):
```tsx
// PRZED:
<CardContent className="relative z-10 p-3 md:p-4 h-28 md:h-36 flex flex-col justify-end">

// PO (większe kafelki jak w Usługach - pełna prostokątność):
<CardContent className="relative z-10 p-4 md:p-6 h-40 md:h-52 flex flex-col justify-end">
```

---

## Problem 5: Zakładka Księgowość Tylko dla Firm

### Analiza
Obecnie w `ClientPortal.tsx` (linie 410-421) zakładka Księgowość jest ZAWSZE widoczna:

```tsx
const mainTabs = [
  { id: 'start', label: 'Start', icon: Home },
  { id: 'ogloszenia', label: 'Ogłoszenia', icon: Package },
  // Księgowość - ZAWSZE widoczna (użytkownik może założyć firmę)
  { id: 'ksiegowosc', label: 'Księgowość', icon: Calculator },
  ...
];
```

Komentarz sugeruje intencję pokazywania zawsze, ale użytkownik chce:
- Zakładka widoczna TYLKO gdy `hasCompanySetup === true`
- Zwykli użytkownicy (bez firmy) nie widzą tej zakładki
- Po ustawieniu danych firmy zakładka automatycznie się pojawia

### Rozwiązanie

**Plik:** `src/pages/ClientPortal.tsx`

Zmienić logikę `mainTabs` aby warunkowo dodawać zakładkę Księgowość:

```tsx
// Linie 413-422 - zmienić na dynamiczną listę:
const mainTabs = [
  { id: 'start', label: 'Start', icon: Home },
  { id: 'ogloszenia', label: 'Ogłoszenia', icon: Package },
  // Księgowość - tylko dla użytkowników z firmą
  ...(hasCompanySetup ? [{ id: 'ksiegowosc', label: 'Księgowość', icon: Calculator }] : []),
  { id: 'wiadomosci', label: 'Wiadomości', icon: MessageSquare },
  { id: 'ulubione', label: 'Ulubione', icon: Heart },
  { id: 'ustawienia', label: 'Ustawienia', icon: Settings },
  { id: 'konta', label: 'Przełącz konto', icon: RefreshCw },
];
```

Dodatkowo, jeśli użytkownik jest na zakładce `ksiegowosc` i nie ma firmy, przekierować go na `start`:

```tsx
// Dodać useEffect po zmianie userEntities:
useEffect(() => {
  if (activeTab === 'ksiegowosc' && userEntities.length === 0) {
    setActiveTab('start');
  }
}, [userEntities, activeTab]);
```

---

## Podsumowanie Plików do Modyfikacji

| Problem | Plik | Zmiana |
|---------|------|--------|
| 1. Ikony spacing | `src/components/ui/TabsPill.tsx` | Dodać `gap-2` do className (linia 53) |
| 2. Kolejność motoryzacja | `src/pages/EasyHub.tsx` | Zaktualizować `motoryzacjaSubTiles` |
| 2. Kolejność motoryzacja | SQL migration | Zaktualizować `portal_categories` |
| 3. Widoki usług | `src/components/services/ServiceListingCard.tsx` | Dodać style dla viewMode grid/compact |
| 4. Kafelki strony głównej | `src/pages/EasyHub.tsx` | Zmienić grid na 2 kolumny, zwiększyć wysokość |
| 5. Zakładka księgowość | `src/pages/ClientPortal.tsx` | Warunkowe wyświetlanie na podstawie hasCompanySetup |

---

## Kolejność Wdrożenia

1. **Faza 1** - Szybkie poprawki UI:
   - Problem 1 (TabsPill gap) - ~5 min
   - Problem 5 (Księgowość warunkowo) - ~10 min

2. **Faza 2** - Zmiany strukturalne:
   - Problem 2 (Kolejność motoryzacja) - ~15 min
   - Problem 4 (Kafelki strony głównej) - ~15 min

3. **Faza 3** - Rozszerzenie funkcjonalności:
   - Problem 3 (Widoki usług) - ~20 min

**Szacowany czas: ~1h**
