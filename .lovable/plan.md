

# Plan naprawy 5 zgłoszonych problemów

## Przegląd zgłoszeń

1. **Zakładki z podkategoriami** - wzorzec jak w "Rozliczenia" (Moje rozliczenia / Rozlicz kierowców) powinien być zastosowany w "Flota" (Auta / Najem / Rezerwacje z giełdy)
2. **Duplikat menu mobilnego** - hamburger (3 kreski) i dropdown wyświetlają to samo menu
3. **Widok mobilny Flota nie responsywny** - wymaga przewijania w prawo, obcięta nazwa floty
4. **Przycisk mapy "Zaznacz na mapie"** - powinien wyglądać jak "Pokaż na mapie" i być między "Więcej filtrów" a "Pokaż na mapie"
5. **Zdjęcia pionowe** - nie dopasowują się do widoku miniatur i lightbox

---

## Analiza obecnego stanu

### Problem 1: Zakładki z podkategoriami

**Obecny stan:**
- W "Rozliczenia" jest główny pasek zakładek + podkategorie pod spodem (linie ~357-361 UnifiedDashboard.tsx)
- W "Flota" (FleetManagement.tsx) zakładki Auta/Najem/Rezerwacje są wewnątrz komponentu TabsList bez paska podkategorii w tym samym stylu

**Rozwiązanie:**
- Dodać wspólny styl dla podkategorii zakładek - pasek z mniejszymi przyciskami pod główną zakładką
- Użyć istniejącego komponentu UniversalTabBar lub stworzyć podobny styl w FleetManagement

### Problem 2: Duplikat menu mobilnego

**Obecny stan (UnifiedDashboard.tsx linie 454-700):**
- Hamburger Menu (Sheet) - linie 458-615
- Collapsible dropdown z tym samym menu - linie 618-730

Oba elementy zawierają identyczne opcje nawigacyjne.

**Rozwiązanie:**
- Usunąć hamburger menu (Sheet) z widoku mobilnego
- Pozostawić tylko dropdown (Collapsible) który automatycznie się zamyka po wybraniu

### Problem 3: Widok mobilny Flota

**Obecny stan (FleetManagement.tsx):**
- Karta rozwijana pojazdu nie ma `max-w-full` ani `overflow-hidden`
- Brak responsywnych klas dla małych ekranów

**Rozwiązanie:**
- Dodać `overflow-x-hidden` do głównego kontenera
- Użyć `truncate` dla nazwy floty
- Dodać responsywne ukrywanie/zmiany layoutu dla małych ekranów

### Problem 4: Przycisk mapy

**Obecny stan (RealEstateSearch.tsx linie 431-452):**
- "Zaznacz na mapie" (onDrawSearch) jest przed "Pokaż na mapie"
- Ma inny styl (border-primary)

**Rozwiązanie:**
- Zmienić kolejność: "Więcej filtrów" → "Zaznacz na mapie" → "Pokaż na mapie"
- Nadać "Zaznacz na mapie" taki sam styl jak "Pokaż na mapie" (variant="default")

### Problem 5: Zdjęcia pionowe

**Obecny stan:**
- FeaturedListingCard.tsx linia 195: `object-cover` jest ustawione
- PropertyListingCard.tsx linia 390: `object-cover` jest ustawione
- ImageLightbox.tsx linia 83: używa `object-contain`

**Problem:** Zdjęcia pionowe w karcie są obcinane lub źle kadrowane.

**Rozwiązanie:**
- Upewnić się, że kontener ma stały aspect ratio (`aspect-[4/3]`)
- Dodać `object-position: center` żeby wycentrować kadrowanie
- W Lightbox zachować `object-contain` żeby zachować proporcje

---

## Szczegółowy plan implementacji

### 1. Naprawa zakładek "Flota" - styl podkategorii

**Plik:** `src/components/FleetManagement.tsx`

**Zmiany:**
```text
Linia 406-422: Zmienić TabsList na styl podobny do paska "Rozliczenia"
- Dodać pasek w kolorze gradient-hero z białymi przyciskami
- Styl: bg-gradient-hero text-primary-foreground rounded-lg
```

### 2. Usunięcie duplikatu menu mobilnego

**Plik:** `src/components/UnifiedDashboard.tsx`

**Zmiany:**
```text
Linie 458-615: Usunąć całą sekcję Sheet (hamburger menu)
Linie 618-730: Pozostawić dropdown i poprawić zamykanie
- Po wybraniu opcji dropdown powinien się zamknąć
```

### 3. Responsywny widok mobilny Flota

**Plik:** `src/components/FleetManagement.tsx`

**Zmiany:**
```text
Linia 392: Dodać overflow-x-hidden do głównej karty
Linie 425-459: Responsywny układ przycisków i wyszukiwarki
- Na mobile: flex-col zamiast flex-row
- Wyszukiwarka: w-full na mobile
```

### 4. Zmiana kolejności i stylu przycisków mapy

**Plik:** `src/components/realestate/RealEstateSearch.tsx`

**Zmiany:**
```text
Linie 429-453: Zmienić kolejność przycisków:
1. Więcej filtrów (bez zmian)
2. Zaznacz na mapie - zmienić variant="default" (fioletowy)
3. Pokaż na mapie (bez zmian)
```

**Plik:** `src/components/marketplace/VehicleSearchWithMap.tsx`

**Zmiany podobne jak wyżej**

### 5. Naprawa wyświetlania zdjęć pionowych

**Plik:** `src/components/FeaturedListingCard.tsx`

**Zmiany:**
```text
Linia 195: Dodać object-center do klasy obrazka
className="w-full h-full object-cover object-center transition-transform..."
```

**Plik:** `src/components/realestate/PropertyListingCard.tsx`

**Zmiany:**
```text
Linia 174: Dodać object-center
Linia 390: Dodać object-center
```

**Plik:** `src/components/vehicles/VehiclePhotoGallery.tsx`

**Zmiany:**
```text
Sprawdzić i dodać object-center do wszystkich zdjęć
```

---

## Kolejność wdrożenia

1. **Zdjęcia pionowe** (punkt 5) - szybka poprawka CSS
2. **Duplikat menu** (punkt 2) - usunięcie kodu
3. **Przyciski mapy** (punkt 4) - zmiana kolejności i stylu
4. **Responsywny Flota** (punkt 3) - poprawki CSS
5. **Zakładki podkategorii** (punkt 1) - zmiana stylu TabsList

---

## Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/UnifiedDashboard.tsx` | Usunięcie Sheet hamburger menu |
| `src/components/FleetManagement.tsx` | Responsywność + styl zakładek |
| `src/components/realestate/RealEstateSearch.tsx` | Kolejność przycisków mapy |
| `src/components/marketplace/VehicleSearchWithMap.tsx` | Kolejność przycisków mapy |
| `src/components/FeaturedListingCard.tsx` | object-center dla zdjęć |
| `src/components/realestate/PropertyListingCard.tsx` | object-center dla zdjęć |
| `src/components/vehicles/VehiclePhotoGallery.tsx` | object-center dla zdjęć |

