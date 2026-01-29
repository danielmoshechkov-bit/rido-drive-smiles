
# Plan naprawy usług i ujednolicenia kafelków

## Problemy zidentyfikowane

1. **Błąd 404 przy klikaniu w usługę** - Link w `FeaturedListings.tsx` generuje `/uslugi/wykonawca/${id}`, ale route w `App.tsx` to `/uslugi/uslugodawca/:providerId`

2. **Różne rozmiary kafelków kategorii usług** - Kafelki na stronie `/uslugi` mają aspect ratio `16/10`, podczas gdy kafelki na stronie głównej (EasyHub) mają większy rozmiar (`h-32` lub podobny)

3. **Brak przełącznika widoków w usługach** - Na stronie usługodawców (`/uslugi?kategoria=xyz`) nie ma przełącznika grid/compact/list jak w giełdzie aut i nieruchomościach

---

## Rozwiązanie

### Zadanie 1: Naprawa linku usług (404)
**Plik**: `src/components/FeaturedListings.tsx`

Zmiana w funkcji `handleListingClick`:
- Z: `navigate('/uslugi/wykonawca/${listing.id}')`
- Na: `navigate('/uslugi/uslugodawca/${listing.id}')`

### Zadanie 2: Ujednolicenie rozmiaru kafelków kategorii usług
**Plik**: `src/components/services/ServiceCategoryTile.tsx`

Zmiana aspect ratio z `aspect-[16/10]` na `aspect-[4/3]` (lub podobny większy format) aby dopasować do stylu strony głównej

### Zadanie 3: Dodanie przełącznika widoków do usług
**Plik**: `src/pages/ServicesMarketplace.tsx`

Dodanie:
1. Stan `viewMode` typu `'grid' | 'compact' | 'list'`
2. Przyciski przełączników (Grid3X3, LayoutList, List) w sekcji nagłówka wyników
3. Logika siatki CSS zależna od `viewMode`
4. Przekazanie `viewMode` do `ServiceListingCard`

**Plik**: `src/components/services/ServiceListingCard.tsx`

Dodanie propsa `viewMode` i wariantów wyświetlania:
- `grid` - obecny układ karty
- `compact` - 2 kolumny, mniejsze zdjęcia
- `list` - 1 kolumna, zdjęcie po lewej, opis po prawej

---

## Szczegóły techniczne

### FeaturedListings.tsx - linia ~271
```typescript
// PRZED
navigate(`/uslugi/wykonawca/${listing.id}`);

// PO
navigate(`/uslugi/uslugodawca/${listing.id}`);
```

### ServiceCategoryTile.tsx - linia ~52-54
```typescript
// PRZED
className={cn(
  "relative overflow-hidden rounded-2xl aspect-[16/10] group",
  ...
)}

// PO - większy aspect ratio jak na stronie głównej
className={cn(
  "relative overflow-hidden rounded-2xl aspect-[4/3] group",
  ...
)}
```

### ServicesMarketplace.tsx - dodanie widoków
```typescript
// Nowy stan
const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>('grid');

// Przyciski widoku (przy "Znaleziono X usługodawców")
<div className="flex items-center gap-1 bg-muted rounded-lg p-1">
  <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" onClick={() => setViewMode('grid')}>
    <Grid3X3 className="h-4 w-4" />
  </Button>
  <Button variant={viewMode === 'compact' ? 'default' : 'ghost'} size="icon" onClick={() => setViewMode('compact')}>
    <LayoutList className="h-4 w-4" />
  </Button>
  <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
    <List className="h-4 w-4" />
  </Button>
</div>

// Siatka wyników z dynamicznym layoutem
<div className={cn(
  "grid gap-4",
  viewMode === 'grid' && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  viewMode === 'compact' && "grid-cols-1 md:grid-cols-2",
  viewMode === 'list' && "grid-cols-1"
)}>
```

### ServiceListingCard.tsx - wariant list
Dodanie propsa `viewMode` i layoutu horyzontalnego dla widoku listy (flex-row zamiast flex-col, zdjęcie po lewej ~1/3 szerokości)

---

## Podsumowanie zmian

| Plik | Zmiana |
|------|--------|
| `FeaturedListings.tsx` | Poprawka URL `/uslugi/wykonawca/` -> `/uslugi/uslugodawca/` |
| `ServiceCategoryTile.tsx` | Zmiana aspect ratio na większy format |
| `ServicesMarketplace.tsx` | Dodanie stanu `viewMode` + przyciski przełączania widoku |
| `ServiceListingCard.tsx` | Dodanie propsa `viewMode` z wariantami grid/compact/list |
