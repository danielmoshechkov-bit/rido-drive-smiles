
# Plan Naprawy Tytułów Kart Ogłoszeń - 2 Linijki

## Problem

Na wszystkich kartach ogłoszeń (pojazdy, nieruchomości) tytuły wyświetlają się tylko na **1 linijce** z klasą `line-clamp-1`, co powoduje:
- Ucinanie tytułów (np. "BMW 320d M Sport - Idealny..." zamiast pełnego tekstu)
- Dużo pustej, niewykorzystanej przestrzeni między tytułem a ceną
- Tytuł zlewa się z resztą treści - nie wyróżnia się

Użytkownik poprosił o:
- Tytuł na **2 linijkach** (`line-clamp-2`)
- **Większą czcionkę** tytułu, żeby się wyróżniał
- **Lepsze wykorzystanie** pustej przestrzeni

## Pliki do Modyfikacji

### 1. VehicleListingCard.tsx (Pojazdy - strona /gielda)

**Linie 278-281** - zmienić tytuł z 1 linijki na 2:

```tsx
// PRZED:
<h3 className={cn(
  "font-semibold line-clamp-1 h-7 flex items-center",
  compact ? "text-sm h-5" : "text-lg"
)}>{listing.title}</h3>

// PO:
<h3 className={cn(
  "font-bold leading-tight",
  compact ? "text-sm line-clamp-1" : "text-lg line-clamp-2 min-h-[3.5rem]"
)}>{listing.title}</h3>
```

Zmiany:
- `font-semibold` na `font-bold` - pogrubienie
- `line-clamp-1` na `line-clamp-2` - dwie linijki
- Dodanie `min-h-[3.5rem]` - stała wysokość dla 2 linii
- Usunięcie `h-7 flex items-center` - niepotrzebne przy 2 linijkach

### 2. ListingCard.tsx (Uniwersalna karta - strona główna, wyszukiwarka)

**Linia 311** - zmienić tytuł:

```tsx
// PRZED:
<h3 className={cn("font-semibold line-clamp-1", isCompact ? "text-sm" : "text-lg mb-2")}>{listing.title}</h3>

// PO:
<h3 className={cn(
  "font-bold leading-tight",
  isCompact ? "text-sm line-clamp-1" : "text-lg line-clamp-2 min-h-[3.5rem]"
)}>{listing.title}</h3>
```

**Linia 220** (list variant) - również zmienić na 2 linijki:

```tsx
// PRZED:
<h3 className="font-semibold text-lg line-clamp-1">{listing.title}</h3>

// PO:
<h3 className="font-bold text-lg line-clamp-2 min-h-[3rem]">{listing.title}</h3>
```

### 3. PropertyListingCard.tsx (Nieruchomości)

Ten plik już ma poprawny kod dla trybu grid (`line-clamp-2 min-h-[3rem]`), ale w liście (line 244) brakuje `font-bold`:

```tsx
// PRZED (linia 244):
<h3 className="font-bold text-lg line-clamp-2 min-h-[3rem]">{listing.title}</h3>

// Już poprawne - nic nie zmieniać
```

Sprawdzić czy compact mode ma również większą czcionkę:

```tsx
// Linia 487-490 - już poprawne:
<h3 className={cn(
  "font-bold leading-tight",
  compact ? "text-sm line-clamp-1" : "text-lg line-clamp-2 min-h-[3rem]"
)}>{listing.title}</h3>
```

## Podsumowanie Zmian

| Plik | Lokalizacja | Zmiana |
|------|-------------|--------|
| VehicleListingCard.tsx | Linie 278-281 | `line-clamp-1` na `line-clamp-2`, dodać `min-h-[3.5rem]`, `font-bold` |
| ListingCard.tsx | Linia 311 | `line-clamp-1` na `line-clamp-2`, dodać `min-h-[3.5rem]`, `font-bold` |
| ListingCard.tsx | Linia 220 | `line-clamp-1` na `line-clamp-2`, dodać `font-bold` |

## Efekt Wizualny

Po zmianach:
- Tytuły będą wyświetlane na **2 linijkach** (lub 1 jeśli są krótkie)
- **Większa grubość** czcionki (`font-bold`) sprawi, że tytuł będzie się wyróżniał
- **Stała wysokość** `min-h-[3.5rem]` zapewni wyrównanie kart w gridzie
- Pusta przestrzeń między tytułem a ceną zostanie **lepiej wykorzystana**

Przykład przed/po:
- PRZED: "Hyundai Tucson - SUV..." (1 linia, ucięte)
- PO: "Hyundai Tucson - SUV Premium z niskim przebiegiem" (2 linie, pełny tytuł)

**Szacowany czas: ~15 min**
