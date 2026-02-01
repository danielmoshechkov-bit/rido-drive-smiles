
# Plan Naprawy - 4 Problemy UI/UX

## ANALIZA PROBLEMÓW

### 1. PODGLĄD UMOWY JEST PUSTY (foto 1)
**Problem:** Po podpisaniu umowy, kliknięcie "Podgląd umowy" pokazuje pustą ramkę zamiast wygenerowanego dokumentu z podpisami.

**Przyczyna:** W komponencie `ContractPreview` (linie 768-863 w RentalContractSignatureFlow.tsx) dane są pobierane poprawnie, ale:
- Generowany HTML może nie zawierać podpisów (brak danych)
- Możliwy problem z łączeniem danych floty (kolumny `address_street` vs `street`, `address_city` vs `city`)

**Rozwiązanie:**
W `ContractPreview` poprawić query - użyć właściwych nazw kolumn z tabeli `fleets`:
```tsx
// Linia 781-782 - zmienić:
fleets:fleet_id (id, name, nip, address_street, address_city, phone, email)
// Na:
fleets:fleet_id (id, name, nip, street, city, postal_code, phone, email)
```
Oraz poprawić budowanie adresu (linia 798-801):
```tsx
const fleetAddress = [
  fleet?.street,
  fleet?.postal_code,
  fleet?.city
].filter(Boolean).join(', ');
```

---

### 2. PRZYCISKI W ZŁYM MIEJSCU (foto 2 vs foto 3)
**Problem:** W zakładce "Najem" przyciski "Aktywne", "Do podpisu", "Zakończone" są w nagłówku karty - chcesz je jak przyciski "Dodaj" i "Wynajem" w zakładce "Auta" (obok szukajki, przed tabelą).

**Lokalizacja:** `src/components/fleet/FleetRentalsTab.tsx` (linie 237-268)

**Obecny układ:**
- `CardHeader` zawiera tytuł + sub-taby obok siebie + szukajka pod spodem

**Docelowy układ (jak w foto 3):**
- `CardHeader` tylko tytuł
- Pod nagłówkiem: rząd z szukajką + przyciski sub-tabów po prawej stronie
- Jak `+ Dodaj | Wynajem` są obok szukajki w zakładce Auta

**Rozwiązanie:**
Przepisać układ FleetRentalsTab.tsx:
```tsx
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="flex items-center gap-2">
      <FileText className="h-5 w-5" />
      Umowy najmu
    </CardTitle>
  </CardHeader>
  <CardContent className="pt-2">
    {/* Row with search + tabs - like foto 3 */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input placeholder="..." value={searchQuery} onChange={...} className="pl-10" />
      </div>
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {subTabs.map(...)}
      </div>
    </div>
    {/* Table */}
    ...
  </CardContent>
</Card>
```

---

### 3. ZDJĘCIA PROTOKOŁU - WYMIARY I OPISY (foto 4)
**Problem:** 
- Zdjęcia nie są dopasowane do ramki (aspect ratio)
- Potrzebne jasne opisy jak robić zdjęcia z każdego rogu (lewy przedni = widać lewy bok + przód, prawy przedni = widać prawy bok + przód, itd.)

**Lokalizacja:** `src/components/fleet/RentalPhotoProtocol.tsx`

**Rozwiązanie:**
1. Zaktualizować opisy kategorii zdjęć (linie 33-105):
```tsx
const PHOTO_CATEGORIES: PhotoCategory[] = [
  { 
    id: "corner_front_left", 
    label: "Przód lewy", 
    description: "Stań pod kątem 45° z lewej - widoczny przód i lewy bok pojazdu",
    icon: <Car className="h-5 w-5" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "corner_front_right", 
    label: "Przód prawy", 
    description: "Stań pod kątem 45° z prawej - widoczny przód i prawy bok pojazdu",
    ...
  },
  { 
    id: "corner_rear_left", 
    label: "Tył lewy", 
    description: "Stań pod kątem 45° z lewej - widoczny tył i lewy bok pojazdu",
    ...
  },
  { 
    id: "corner_rear_right", 
    label: "Tył prawy", 
    description: "Stań pod kątem 45° z prawej - widoczny tył i prawy bok pojazdu",
    ...
  },
  ...
];
```

2. Upewnić się że zdjęcia są kompresowane bez utraty jakości dla zbliżeń (linia 157-158):
W funkcji `compressPhotoImage` zachować wysoką jakość (0.85+) aby było widać detale jak rysy.

3. Dopasowanie zdjęć do ramki (linia 304-310):
```tsx
<div 
  key={idx}
  className="aspect-[4/3] rounded-md overflow-hidden bg-muted"
>
  <img 
    src={url} 
    alt={`${category.label} ${idx + 1}`}
    className="w-full h-full object-cover object-center"
  />
</div>
```
Klasa `object-cover object-center` zapewnia wypełnienie ramki bez deformacji.

---

### 4. RAMKA MOBILNA NIE DOPASOWANA (foto 5)
**Problem:** Na mobile widok "Umowy najmu" w zakładce "Najem" - tabela i przyciski nachodzą na krawędzie ekranu.

**Lokalizacja:** `src/components/fleet/FleetRentalsTab.tsx`

**Rozwiązanie:**
1. Dodać `overflow-x-hidden` do Card
2. Zmniejszyć paddingi na mobile
3. Zapewnić scroll dla tabeli gdy zbyt szeroka

```tsx
<Card className="overflow-x-hidden">
  <CardContent className="p-2 sm:p-4 md:p-6">
    ...
    {/* Table wrapper */}
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <Table>
        ...
      </Table>
    </div>
  </CardContent>
</Card>
```

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiana |
|------|--------|
| `src/components/fleet/RentalContractSignatureFlow.tsx` | Poprawić query dla fleets (street/city zamiast address_street/address_city) |
| `src/components/fleet/FleetRentalsTab.tsx` | 1) Przenieść sub-taby obok szukajki, 2) Responsywność mobile |
| `src/components/fleet/RentalPhotoProtocol.tsx` | Zaktualizować opisy kategorii zdjęć + aspect ratio |

---

## SZCZEGÓŁY TECHNICZNE

### RentalContractSignatureFlow.tsx - poprawka query

**Linia 781-782 - zmienić:**
```tsx
// PRZED:
fleets:fleet_id (id, name, nip, address_street, address_city, phone, email)

// PO:
fleets:fleet_id (id, name, nip, street, city, postal_code, phone, email)
```

**Linie 798-801 - zmienić:**
```tsx
// PRZED:
const fleetAddress = [
  fleet?.address_street,
  fleet?.address_city
].filter(Boolean).join(', ');

// PO:
const fleetAddress = [
  fleet?.street,
  fleet?.postal_code,
  fleet?.city
].filter(Boolean).join(', ');
```

### FleetRentalsTab.tsx - nowy układ

```tsx
return (
  <>
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Umowy najmu
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 md:p-6 pt-2">
        {/* Search + Tabs row - responsive */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Szukaj po kierowcy, rejestracji lub marce..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {/* Sub-tabs - align right on desktop, full width on mobile */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 self-end sm:self-auto">
            {subTabs.map(tab => (
              <Button
                key={tab.value}
                size="sm"
                variant={activeSubTab === tab.value ? "default" : "ghost"}
                onClick={() => setActiveSubTab(tab.value as SubTab)}
                className="text-xs sm:text-sm whitespace-nowrap"
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Table with horizontal scroll on mobile */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">...</div>
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <div className="min-w-[600px] sm:min-w-0 px-3 sm:px-0">
              <Table>
                ...
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    ...
  </>
);
```

### RentalPhotoProtocol.tsx - nowe opisy

```tsx
const PHOTO_CATEGORIES: PhotoCategory[] = [
  { 
    id: "corner_front_left", 
    label: "Przód lewy", 
    description: "Stań pod kątem 45° - widoczny przód i lewy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[-45deg]" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "corner_front_right", 
    label: "Przód prawy", 
    description: "Stań pod kątem 45° - widoczny przód i prawy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[45deg]" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "corner_rear_left", 
    label: "Tył lewy", 
    description: "Stań pod kątem 45° - widoczny tył i lewy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[-135deg]" />,
    required: true,
    minPhotos: 1
  },
  { 
    id: "corner_rear_right", 
    label: "Tył prawy", 
    description: "Stań pod kątem 45° - widoczny tył i prawy bok pojazdu",
    icon: <Car className="h-5 w-5 rotate-[135deg]" />,
    required: true,
    minPhotos: 1
  },
  // pozostałe kategorie bez zmian...
];
```

---

## KOLEJNOŚĆ WDROŻENIA

1. **RentalContractSignatureFlow.tsx** - poprawka query dla fleets (linie 781-801)
2. **FleetRentalsTab.tsx** - zmiana układu (szukajka + sub-taby w jednym rzędzie) + responsywność
3. **RentalPhotoProtocol.tsx** - nowe opisy kategorii zdjęć

---

## PODSUMOWANIE

| Problem | Rozwiązanie |
|---------|-------------|
| Pusty podgląd umowy | Poprawić nazwy kolumn fleets w query (street/city) |
| Przyciski w złym miejscu | Przenieść sub-taby obok szukajki (jak "Dodaj"/"Wynajem") |
| Zdjęcia protokołu | Lepsze opisy 45° kątów + object-cover dla dopasowania |
| Ramka mobilna | Dodać overflow-x-auto dla tabeli + mniejsze paddingi |
