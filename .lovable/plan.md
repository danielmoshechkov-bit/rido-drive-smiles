
# Plan Naprawy 4 Problemów UI/UX

## Podsumowanie Problemów

Na podstawie analizy zrzutów ekranu i kodu zidentyfikowano 4 główne problemy:

1. **Niezgodność widoków między Giełda Aut a Usługami** - Przyciski zmiany widoku (grid/compact/list) na stronie Usług dają zupełnie inny efekt wizualny niż na Giełdzie Aut i Nieruchomościach
2. **Brak systemu ocen klientów** - Usługodawcy nie mogą oceniać klientów po zakończeniu usługi
3. **Zakładka Ogłoszenia wymaga restrukturyzacji** - Potrzebne są pod-zakładki: Wystawione, Zakończone, Ulubione + usunięcie Ulubione z głównego paska
4. **Karty nieruchomości - lepszy układ treści** - Tytuł na 2 linijki, większa czcionka, więcej informacji (rok budowy, udogodnienia) aby wypełnić przestrzeń

---

## Problem 1: Ujednolicenie Widoków Usług z Giełdą Aut

### Analiza

Porównanie widoków:

**VehicleMarketplace (foto 1-3):**
- Grid: 4 kolumny, karty pełnowymiarowe z ceną i przyciskiem "Szczegóły" na dole
- Compact: 5 kolumn, mniejsze karty z przyciskiem "Zobacz"  
- List: 1 kolumna, layout poziomy - zdjęcie po lewej, dane po prawej

**ServicesMarketplace (foto 4):**
- Grid: 3 kolumny - ale karta ma inną strukturę (usługi jako badge'y, rating stars)
- Compact: 2 kolumny, h-36 - bardzo różni się od auta
- List: 1 kolumna - działa podobnie

**Problem:** `ServiceListingCard` ma zupełnie inną strukturę niż `ListingCard` i `PropertyListingCard`. Widoki grid/compact/list wyglądają inaczej.

### Rozwiązanie

Zmodyfikować `ServiceListingCard.tsx` aby jego widoki grid/compact/list były spójne z `ListingCard.tsx`:

**Plik:** `src/components/services/ServiceListingCard.tsx`

1. **Grid mode** - struktura jak teraz ale grid powinien mieć 4 kolumny (jak auta):
   - Zdjęcie aspect-4/3
   - Nazwa firmy (tytuł)
   - Lokalizacja
   - Cena + przycisk Szczegóły

2. **Compact mode** - mniejsze karty jak na Giełdzie (foto 2):
   - Zdjęcie aspect-3/2
   - Kompaktowe info
   - Przycisk "Zobacz"
   - Grid 5 kolumn

3. **List mode** - układ poziomy jak na Giełdzie (foto 3):
   - Zdjęcie po lewej (w-64)
   - Treść po prawej
   - Szczegóły na dole

**Plik:** `src/pages/ServicesMarketplace.tsx`

Zmienić grid layout:
```tsx
// PRZED (linie 428-433):
viewMode === 'grid' && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
viewMode === 'compact' && "grid-cols-1 md:grid-cols-2"
viewMode === 'list' && "grid-cols-1"

// PO (identycznie jak VehicleMarketplace):
viewMode === 'grid' && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
viewMode === 'compact' && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
viewMode === 'list' && "grid-cols-1"
```

---

## Problem 2: System Ocen Klientów przez Usługodawców

### Analiza

Obecnie istnieje schemat ocen usługodawców (rating_avg, rating_count w service_providers). Potrzebny jest dwustronny system:
- Usługodawca ocenia klienta po zakończonej usłudze
- Klient widzi swoją średnią ocenę w Portalu Klienta
- Usługodawca widzi opinie o sobie w swoim panelu
- Oceny są ANONIMOWE (widać tylko ocenę i komentarz, nie kto wystawił)

### Rozwiązanie

#### Krok 1: Migracja SQL - tabela ocen klientów

```sql
-- Tabela ocen klientów (przez usługodawców)
CREATE TABLE client_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_user_id UUID NOT NULL REFERENCES auth.users(id),
  reviewer_provider_id UUID NOT NULL REFERENCES service_providers(id),
  booking_id UUID REFERENCES service_bookings(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_anonymous BOOLEAN DEFAULT true
);

-- Tabela ocen usługodawców (przez klientów) - jeśli nie istnieje
CREATE TABLE IF NOT EXISTS provider_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES service_providers(id),
  reviewer_user_id UUID NOT NULL REFERENCES auth.users(id),
  booking_id UUID REFERENCES service_bookings(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_anonymous BOOLEAN DEFAULT true
);

-- Widok średniej oceny klienta
CREATE VIEW client_rating_summary AS
SELECT 
  client_user_id,
  AVG(rating)::NUMERIC(2,1) as rating_avg,
  COUNT(*) as rating_count
FROM client_reviews
GROUP BY client_user_id;
```

#### Krok 2: Dodać w ClientPortal - przycisk "Sprawdź swoje opinie"

**Plik:** `src/pages/ClientPortal.tsx`

W sekcji Start (po "Wystaw fakturę") dodać nowy kafelek:

```tsx
<Card 
  className="cursor-pointer hover:shadow-lg transition-shadow"
  onClick={() => setActiveTab('opinie')}
>
  <CardContent className="p-6 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className="p-3 rounded-lg bg-yellow-100">
        <Star className="h-8 w-8 text-yellow-600" />
      </div>
      <div>
        <h3 className="font-bold text-lg">Sprawdź swoje opinie</h3>
        <p className="text-sm text-muted-foreground">Zobacz oceny wystawione przez usługodawców</p>
      </div>
    </div>
    <ChevronRight className="h-5 w-5 text-muted-foreground" />
  </CardContent>
</Card>
```

#### Krok 3: Nowa zakładka/widok opinii

Dodać zakładkę `opinie` z dwoma pod-zakładkami:
- **Otrzymane** - opinie wystawione przez usługodawców/sprzedawców (o kliencie)
- **Wystawione** - opinie wystawione przez klienta (o usługodawcach)

Każda opinia wyświetla tylko:
- Gwiazdki (1-5)
- Komentarz tekstowy
- Data wystawienia
- NIE pokazujemy kto wystawił (anonimowość)

#### Krok 4: Formularz wystawiania opinii dla usługodawcy

W ServiceProviderDashboard dodać możliwość wystawiania opinii o klientach po zakończonej usłudze.

---

## Problem 3: Restrukturyzacja Zakładki "Ogłoszenia"

### Analiza

Obecna struktura (foto 5, 6):
- Główny pasek: Start, Ogłoszenia, Księgowość, Wiadomości, Ulubione, Ustawienia, Przełącz konto
- Zakładka Ogłoszenia pokazuje listę ogłoszeń bez pod-kategorii

Wymagana struktura:
- Główny pasek: Start, Ogłoszenia, Księgowość, Wiadomości, Ustawienia, Przełącz konto (BEZ Ulubione)
- Zakładka Ogłoszenia zawiera pod-zakładki:
  - **Wystawione** - aktywne ogłoszenia użytkownika
  - **Zakończone** - wygasłe ogłoszenia z licznikiem dni do usunięcia (60 dni od zakończenia)
  - **Ulubione** - przeniesione tutaj z głównego paska, z filtrami kategorii (Motoryzacja/Nieruchomości/Usługi)

### Rozwiązanie

**Plik:** `src/pages/ClientPortal.tsx`

#### Krok 1: Usunąć "Ulubione" z głównego paska

```tsx
// PRZED (linie 466-475):
const mainTabs = [
  { id: 'start', label: 'Start', icon: Home },
  { id: 'ogloszenia', label: 'Ogłoszenia', icon: Package },
  ...(hasCompanySetup ? [{ id: 'ksiegowosc', label: 'Księgowość', icon: Calculator }] : []),
  { id: 'wiadomosci', label: 'Wiadomości', icon: MessageSquare },
  { id: 'ulubione', label: 'Ulubione', icon: Heart },  // USUNĄĆ
  { id: 'ustawienia', label: 'Ustawienia', icon: Settings },
  { id: 'konta', label: 'Przełącz konto', icon: RefreshCw },
];

// PO:
const mainTabs = [
  { id: 'start', label: 'Start', icon: Home },
  { id: 'ogloszenia', label: 'Ogłoszenia', icon: Package },
  ...(hasCompanySetup ? [{ id: 'ksiegowosc', label: 'Księgowość', icon: Calculator }] : []),
  { id: 'wiadomosci', label: 'Wiadomości', icon: MessageSquare },
  { id: 'ustawienia', label: 'Ustawienia', icon: Settings },
  { id: 'konta', label: 'Przełącz konto', icon: RefreshCw },
];
```

#### Krok 2: Dodać stan dla pod-zakładek w Ogłoszenia

```tsx
const [oglaszeniaSubTab, setOglaszeniaSubTab] = useState<'wystawione' | 'zakonczone' | 'ulubione'>('wystawione');
const [ulubioneFavoriteCategory, setUlubioneFavoriteCategory] = useState<'wszystkie' | 'motoryzacja' | 'nieruchomosci' | 'uslugi'>('wszystkie');
```

#### Krok 3: Nowy UI dla zakładki Ogłoszenia

```tsx
{activeTab === 'ogloszenia' && (
  <div className="space-y-6">
    {/* Pod-zakładki */}
    <div className="flex gap-2 border-b pb-2">
      <Button 
        variant={oglaszeniaSubTab === 'wystawione' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setOglaszeniaSubTab('wystawione')}
      >
        Wystawione
      </Button>
      <Button 
        variant={oglaszeniaSubTab === 'zakonczone' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setOglaszeniaSubTab('zakonczone')}
      >
        Zakończone
      </Button>
      <Button 
        variant={oglaszeniaSubTab === 'ulubione' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setOglaszeniaSubTab('ulubione')}
      >
        <Heart className="h-4 w-4 mr-1" />
        Ulubione
      </Button>
    </div>

    {/* Wystawione */}
    {oglaszeniaSubTab === 'wystawione' && (
      <div>
        {totalListings === 0 ? (
          <Card className="text-center py-12">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="font-semibold mb-2">Brak ogłoszeń</p>
            <AddListingModal user={user} trigger={<Button><Plus className="mr-2" />Dodaj</Button>} />
          </Card>
        ) : (
          <>
            <div className="flex justify-end mb-4">
              <AddListingModal user={user} trigger={<Button size="sm"><Plus className="mr-2" />Dodaj</Button>} />
            </div>
            {/* Lista ogłoszeń - edycja, zarządzanie */}
          </>
        )}
      </div>
    )}

    {/* Zakończone */}
    {oglaszeniaSubTab === 'zakonczone' && (
      <div>
        {/* Lista zakończonych ogłoszeń z licznikiem dni do usunięcia */}
        {/* Przyciski: Edytuj | Wystaw ponownie */}
      </div>
    )}

    {/* Ulubione */}
    {oglaszeniaSubTab === 'ulubione' && (
      <div>
        {/* Filtry kategorii */}
        <div className="flex gap-2 mb-4">
          <Badge 
            variant={ulubioneFavoriteCategory === 'wszystkie' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setUlubioneFavoriteCategory('wszystkie')}
          >
            Wszystkie
          </Badge>
          <Badge 
            variant={ulubioneFavoriteCategory === 'motoryzacja' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setUlubioneFavoriteCategory('motoryzacja')}
          >
            <Car className="h-3 w-3 mr-1" />
            Motoryzacja
          </Badge>
          <Badge 
            variant={ulubioneFavoriteCategory === 'nieruchomosci' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setUlubioneFavoriteCategory('nieruchomosci')}
          >
            <Home className="h-3 w-3 mr-1" />
            Nieruchomości
          </Badge>
          <Badge 
            variant={ulubioneFavoriteCategory === 'uslugi' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setUlubioneFavoriteCategory('uslugi')}
          >
            Usługi
          </Badge>
        </div>
        {/* Lista ulubionych */}
      </div>
    )}
  </div>
)}
```

---

## Problem 4: Poprawa Układu Kart Nieruchomości

### Analiza

Porównanie foto 7 vs foto 8:

**Obecny układ (foto 7):**
- Tytuł: "Przestronne mieszkanie 3-..." - ucięty na 1 linijce
- Dane: 72 m², 3 pokoje, Kraków - podstawowe
- Dużo pustej przestrzeni przed ceną
- Tytuł zlewa się z innymi danymi

**Oczekiwany układ (foto 8):**
- Tytuł na 2 linijkach: "Przestronne mieszkanie 3-pokojowe na Kazimierzu" - większa czcionka
- Linia 1: Mieszkanie, 72 m², 3 pokoje
- Linia 2: Piętro 3/5, 2019 (rok budowy)
- Linia 3: Kazimierz, Kraków
- Linia 4: Balkon, Winda (udogodnienia - tylko te które się mieszczą)
- Cena + przycisk Szczegóły na dole

### Rozwiązanie

**Plik:** `src/components/realestate/PropertyListingCard.tsx`

Zmodyfikować sekcję Content (linie 485-600):

```tsx
{/* Content */}
<div className={cn("p-4 flex flex-col flex-1", compact && "p-2")}>
  {/* Title - 2 linijki, większa czcionka */}
  <h3 className={cn(
    "font-bold leading-tight",  // font-bold zamiast font-semibold
    compact ? "text-sm line-clamp-1" : "text-lg line-clamp-2 min-h-[3rem]"  // text-lg zamiast text-base, większe min-h
  )}>{listing.title}</h3>

  {/* Property Type & Area & Rooms - Linia 1 */}
  <div className={cn(
    "flex flex-wrap items-center gap-x-2 text-muted-foreground mt-2",
    compact ? "text-xs" : "text-sm"
  )}>
    {listing.propertyType && (
      <span className="flex items-center gap-1">
        <Home className="h-3.5 w-3.5" />
        {PROPERTY_TYPE_LABELS[listing.propertyType] || listing.propertyType}
      </span>
    )}
    {listing.areaM2 && (
      <span className="flex items-center gap-1">
        <Maximize className="h-3.5 w-3.5" />
        {listing.areaM2} m²
      </span>
    )}
    {listing.rooms && (
      <span>{listing.rooms} {listing.rooms === 1 ? 'pokój' : listing.rooms < 5 ? 'pokoje' : 'pokoi'}</span>
    )}
  </div>

  {/* Floor & Year - Linia 2 */}
  {!compact && (
    <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground mt-1">
      {listing.floor !== undefined && listing.floorsTotal && (
        <span className="flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" />
          Piętro {listing.floor}/{listing.floorsTotal}
        </span>
      )}
      {listing.buildYear && (
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {listing.buildYear}
        </span>
      )}
    </div>
  )}

  {/* Location - Linia 3 */}
  {listing.location && (
    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">
        {listing.district ? `${listing.district}, ${listing.location}` : listing.location}
      </span>
    </div>
  )}

  {/* Amenities - Linia 4 - pokazuj tylko tyle ile się mieści */}
  {!compact && (
    <div className="flex flex-wrap gap-1.5 mt-2 overflow-hidden max-h-7">
      {listing.hasBalcony && (
        <Badge variant="secondary" className="text-xs px-2 py-0.5">Balkon</Badge>
      )}
      {listing.hasElevator && (
        <Badge variant="secondary" className="text-xs px-2 py-0.5">Winda</Badge>
      )}
      {listing.hasParking && (
        <Badge variant="secondary" className="text-xs px-2 py-0.5">Parking</Badge>
      )}
      {listing.hasGarden && (
        <Badge variant="secondary" className="text-xs px-2 py-0.5">Ogród</Badge>
      )}
    </div>
  )}

  {/* Spacer */}
  <div className="flex-grow min-h-2" />

  {/* Price & Action - na dole */}
  <div className="flex items-center justify-between mt-auto pt-2">
    <div>
      <span className="font-bold text-2xl text-primary">
        {listing.price.toLocaleString('pl-PL')} zł
      </span>
      {pricePerM2 && (
        <div className="text-xs text-muted-foreground">
          {pricePerM2.toLocaleString('pl-PL')} zł/m²
        </div>
      )}
    </div>
    <Button size="sm" onClick={onView}>Szczegóły</Button>
  </div>
</div>
```

---

## Podsumowanie Plików do Modyfikacji

| Problem | Plik | Zmiana |
|---------|------|--------|
| 1. Widoki usług | `src/components/services/ServiceListingCard.tsx` | Dostosować strukturę dla grid/compact/list |
| 1. Widoki usług | `src/pages/ServicesMarketplace.tsx` | Zmienić grid layout na 4/5/1 kolumny |
| 2. Oceny klientów | SQL migration | Tabela client_reviews, provider_reviews |
| 2. Oceny klientów | `src/pages/ClientPortal.tsx` | Dodać kafelek "Sprawdź opinie" + zakładka opinie |
| 2. Oceny klientów | `src/pages/ServiceProviderDashboard.tsx` | Formularz oceny klienta |
| 3. Zakładka Ogłoszenia | `src/pages/ClientPortal.tsx` | Pod-zakładki: Wystawione, Zakończone, Ulubione |
| 4. Karty nieruchomości | `src/components/realestate/PropertyListingCard.tsx` | Tytuł 2 linijki, większa czcionka, więcej danych |

---

## Kolejność Wdrożenia

1. **Faza 1** - Szybkie zmiany UI:
   - Problem 4 (PropertyListingCard - tytuł i układ) - ~20 min
   - Problem 1 (ServiceListingCard widoki) - ~30 min

2. **Faza 2** - Restrukturyzacja nawigacji:
   - Problem 3 (Pod-zakładki Ogłoszenia + przeniesienie Ulubione) - ~45 min

3. **Faza 3** - Nowe funkcjonalności:
   - Problem 2 (System ocen klientów) - ~1h
   - Migracja SQL
   - UI dla opinii w ClientPortal
   - Formularz oceny w ServiceProviderDashboard

**Szacowany czas: ~3h**
