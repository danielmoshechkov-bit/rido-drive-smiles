
# Plan wdrożenia pozostałych funkcji i naprawy problemów

## Faza 1: Dodanie wielu zdjęć do usług (minimum 3 na kategorię)

**Problem:** Obecnie każda kategoria usług ma tylko 1 zdjęcie (cover). Na karcie usługi w galerii wyświetla się tylko 1 obraz, a powinno być 3 różne.

**Rozwiązanie:**

### Zadanie 1.1: Rozbudowa mapowania zdjęć w `serviceCategoryImages.ts`
Dodanie minimum 3 zdjęć na kategorię:

```typescript
export const serviceCategoryGallery: Record<string, string[]> = {
  'warsztaty': [warsztatCover, warsztatPhoto2, warsztatPhoto3],
  'detailing': [detailingCover, detailingPhoto2, detailingPhoto3],
  'sprzatanie': [sprzatanieCover, sprzataniePhoto2, sprzataniePhoto3],
  // ... dla wszystkich 12 kategorii
};
```

### Zadanie 1.2: Aktualizacja `FeaturedListings.tsx`
Zmiana logiki pobierania zdjęć dla usług:
- Z: `photos: [servicePhoto]` (1 zdjęcie)
- Na: `photos: categoryGallery[categorySlug] || [servicePhoto]` (3 zdjęcia)

### Zadanie 1.3: Aktualizacja `ServiceListingCard.tsx`
Zapewnienie, że galeria wyświetla wszystkie zdjęcia z fallbackiem na kategorie.

---

## Faza 2: Naprawa Featured Listings - mix transakcji

**Problem:** Na stronie głównej nieruchomości i pojazdy pokazują tylko jeden typ transakcji (wynajem), a powinien być mix sprzedaży i wynajmu.

**Rozwiązanie:** 

### Zadanie 2.1: Modyfikacja zapytań w `FeaturedListings.tsx`
Zapytania o pojazdy i nieruchomości nie filtrują po `transaction_type`, więc dane powinny być zmixowane. Trzeba upewnić się, że sortowanie losowe (`sort(() => Math.random() - 0.5)`) działa poprawnie dla obu typów.

Dodać walidację:
```typescript
// Pobrać po równo sprzedaż i wynajem
const { data: vehiclesSale } = await supabase
  .from('vehicle_listings')
  .eq('transaction_type', 'sale')
  .limit(6);
  
const { data: vehiclesRent } = await supabase
  .from('vehicle_listings')
  .eq('transaction_type', 'rent')
  .limit(6);
  
const vehiclesData = [...(vehiclesSale || []), ...(vehiclesRent || [])]
  .sort(() => Math.random() - 0.5);
```

---

## Faza 3: Poprawa filtrów na mapie (VehicleResultsMapModal)

**Problem:** Brak drugiego pola (metry/rocznik) - ucięta etykieta

**Status:** ✅ Już naprawione - widzę w kodzie że są pełne etykiety "Cena do:" i "Rocznik od:" z `hidden sm:inline`

---

## Faza 4: Typ transakcji w mobilnym widoku (TransactionTypeChips)

**Status:** ✅ Już naprawione - zwijana lista z przyciskiem "Więcej" ze strzałką jest zaimplementowana

---

## Faza 5: Kategorie nieruchomości w filtrach aut

**Status:** ✅ Już naprawione - `REAL_ESTATE_TYPE_SLUGS` filtruje kategorie nieruchomości

---

## Faza 6: Przycisk "Szukaj" na mobile

**Problem:** Przycisk "Szukaj" na stronie głównej wymaga przewijania na telefonie

**Rozwiązanie:** Przeniesienie przycisku nad kafelki kategorii lub sticky na dole ekranu

---

## Faza 7: Połączenie funkcji mapy (narysuj obszar + pokaż wyniki)

**Problem:** Osobne przyciski "Narysuj na mapie" i "Pokaż na mapie" - powinny być połączone

**Rozwiązanie:** Zunifikowany modal mapy z oboma funkcjami

---

## Podsumowanie zmian do wdrożenia

| Plik | Zmiana | Priorytet |
|------|--------|-----------|
| `src/components/services/serviceCategoryImages.ts` | Dodanie 3 zdjęć na kategorię | WYSOKI |
| `src/components/FeaturedListings.tsx` | Galeria wielu zdjęć dla usług + mix sprzedaż/wynajem | WYSOKI |
| `src/components/services/ServiceListingCard.tsx` | Obsługa galerii wielu zdjęć | WYSOKI |
| Strona główna EasyHub | Przycisk Szukaj wyżej na mobile | ŚREDNI |
| Komponenty mapowe | Połączenie rysowania i wyników | NISKI (wymaga dużej refaktoryzacji) |

---

## Szczegóły techniczne

### Nowe zdjęcia dla kategorii usług (3 na każdą)
Każda kategoria potrzebuje 3 różnych zdjęć:

1. **Warsztaty**: mechanik przy aucie, podnośnik, narzędzia
2. **Detailing**: polerowanie, ceramika, wnętrze auta
3. **Sprzątanie**: sprzątanie biura, odkurzanie, mycie okien
4. **Złota rączka**: montaż mebli, naprawa drzwi, wiercenie
5. **Hydraulik**: naprawa rury, montaż baterii, kanalizacja
6. **Elektryk**: gniazdko, rozdzielnia, okablowanie
7. **Ogrodnik**: koszenie trawy, przycinanie żywopłotu, sadzenie
8. **Przeprowadzki**: pakowanie, transport, wnoszenie
9. **PPF**: naklejanie folii, auto w folii, efekt końcowy
10. **Projektanci**: wizualizacja 3D, szkice, gotowe wnętrze
11. **Remonty**: malowanie, kafelkowanie, gładzie
12. **Budowlanka**: koparka, murowanie, strop

### Struktura galerii kategorii
```typescript
// serviceCategoryImages.ts
export const serviceCategoryGallery: Record<string, string[]> = {
  'warsztaty': [
    warsztatCover,    // Mechanik naprawiający silnik
    warsztatPhoto2,   // Auto na podnośniku
    warsztatPhoto3    // Narzędzia w warsztacie
  ],
  'detailing': [
    detailingCover,   // Polerowanie lakieru
    detailingPhoto2,  // Czyszczenie wnętrza
    detailingPhoto3   // Auto po detailingu
  ],
  // ... pozostałe kategorie
};

export function getServiceGallery(categorySlug?: string): string[] {
  if (!categorySlug) return [warsztatCover];
  return serviceCategoryGallery[categorySlug] || [warsztatCover];
}
```
