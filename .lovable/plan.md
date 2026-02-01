
# Kompleksowy Plan Naprawy UI/UX

## PODSUMOWANIE PROBLEMÓW Z DZISIEJSZEGO DNIA

Na podstawie analizy kodu i zrzutów ekranu zidentyfikowałem następujące problemy:

### 1. FLOTA - Układ zakładek nie pasuje do wzorca "Rozliczenia"
**Problem:** W zakładce "Rozliczenia" jest pasek `UniversalSubTabBar` z przyciskami (Moje rozliczenia, Rozlicz kierowców, itd.) POD główną zakładką, a następnie Card z tabelą. W "Flota" układ jest inny - zakładki Auta/Najem/Rezerwacje są wewnątrz komponentu Tabs jako `TabsList`, co daje inny wygląd wizualny.

**Rozwiązanie:**
- Zmienić strukturę FleetManagement.tsx tak, aby główna zakładka "Flota" wyświetlała podkategorie (Auta, Najem, Rezerwacje z giełdy) w stylu `UniversalSubTabBar` jak w "Rozliczenia"
- Pod paskiem kategorii wyświetlać odpowiednią zawartość (tabelę pojazdów, najmy, rezerwacje)

### 2. MARKETPLACE - Kliknięcie na zdjęcie/kartę nie działa
**Problem:** Komponent `ListingCard.tsx` używany w giełdzie pojazdów nie ma:
- Funkcji otwierania lightbox po kliknięciu na zdjęcie
- Nawigacji do szczegółów ogłoszenia po kliknięciu na kartę

**Rozwiązanie:**
- Dodać import `ImageLightbox` do `ListingCard.tsx`
- Dodać `handlePhotoClick` z `e.stopPropagation()` który otwiera lightbox
- Dodać `handleCardClick` który nawiguje do `/gielda/ogloszenie/{id}` (pomijając kliknięcia na przyciski i zdjęcia)

### 3. PODPIS - Nie zapisuje się
**Problem:** Błąd "Błąd zapisywania podpisu" - widoczny na zrzucie ekranu.

**Rozwiązanie:**
- W `RentalClientPortal.tsx` sprawdzić zapytanie do bazy - obecnie filtruje po `portal_access_token` nawet gdy jest pusty
- Dodać logowanie błędów aby zdiagnozować dokładną przyczynę
- Poprawić warunek: jeśli brak tokenu, nie dodawać filtra po tokenie

### 4. UMOWA - Nie wygląda profesjonalnie
**Problem:** Podgląd umowy na stronie /umowa/:id wygląda jak zwykły tekst, nie jak dokument A4.

**Rozwiązanie:**
- W `RentalContractViewer.tsx` upewnić się że HTML z umowy jest renderowany wewnątrz białego "arkusza" z cieniem, na szarym tle
- Sprawdzić czy style CSS z `generateRentalContractHtml` są prawidłowo zastosowane
- Dodać właściwy styl druku: biała strona, cień, marginesy

### 5. MODAL - Nie mieści się na mobile (foto 5, 6)
**Problem:** Modal z procesem podpisywania umowy jest za szeroki na urządzeniach mobilnych.

**Rozwiązanie:**
- W `RentalContractSignatureFlow.tsx` dodać responsywne klasy do `DialogContent`
- Zmniejszyć max-width na mobile: `max-w-[95vw] sm:max-w-3xl`
- Upewnić się że zawartość nie wychodzi poza ramkę

### 6. BRAK zakładki USTAWIENIA UMOWY
**Problem:** Użytkownik prosił o zakładkę "Ustawienia" w Flocie gdzie można zapisać podpis floty.

**Rozwiązanie:**
- Dodać zakładkę "Ustawienia umowy" do FleetManagement.tsx
- Stworzyć komponent `FleetContractSettings.tsx` z możliwością:
  - Podglądu zapisanego podpisu
  - Dodania/zmiany podpisu
  - Włączenia/wyłączenia auto-podpisu

---

## SZCZEGÓŁOWY PLAN IMPLEMENTACJI

### Krok 1: Naprawa układu zakładek "Flota"

**Plik:** `src/components/FleetManagement.tsx`

Zmiany:
- Zamiast używać wewnętrznego `<Tabs>` z `<TabsList>`, użyć `UniversalSubTabBar` tak jak w `FleetSettlementsView.tsx`
- Struktura:
  ```
  <Card>
    <CardHeader>...</CardHeader>
    <CardContent>
      <UniversalSubTabBar ... />
      {activeTab === "vehicles" && <VehiclesContent />}
      {activeTab === "najem" && <FleetRentalsTab />}
      {activeTab === "rentals" && <MarketplaceReservationsContent />}
    </CardContent>
  </Card>
  ```

### Krok 2: Naprawa kliknięć w ListingCard (marketplace)

**Plik:** `src/components/marketplace/ListingCard.tsx`

Zmiany:
- Dodać import: `import { ImageLightbox } from "@/components/ui/ImageLightbox";`
- Dodać stan: `const [showLightbox, setShowLightbox] = useState(false);`
- Dodać `handlePhotoClick`:
  ```tsx
  const handlePhotoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowLightbox(true);
  };
  ```
- Dodać `handleCardClick` na `<Card>`:
  ```tsx
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-photo-area]')) return;
    navigate(`/gielda/ogloszenie/${listing.id}`);
  };
  ```
- Owinąć sekcję zdjęć w `div` z `data-photo-area="true"` i `onClick={handlePhotoClick}`
- Dodać `<ImageLightbox ... />` na końcu

### Krok 3: Naprawa zapisywania podpisu

**Plik:** `src/pages/RentalClientPortal.tsx`

Zmiany w `handleSignatureSubmit`:
- Zmienić warunek filtrowania:
  ```tsx
  let updateQuery = supabase
    .from("vehicle_rentals")
    .update({...})
    .eq("id", rentalId);
  
  // Tylko filtruj po tokenie jeśli jest dostępny
  if (accessToken) {
    updateQuery = updateQuery.eq("portal_access_token", accessToken);
  }
  ```
- Dodać lepsze logowanie błędów

### Krok 4: Profesjonalny wygląd umowy

**Plik:** `src/components/fleet/RentalContractViewer.tsx`

Zmiany:
- Upewnić się że kontener z umową ma styl "A4 document":
  ```tsx
  <div className="h-[60vh] overflow-y-auto bg-muted p-4" onScroll={handleScroll}>
    <div className="max-w-[210mm] mx-auto bg-white shadow-xl rounded-sm border">
      <div 
        className="p-8 prose prose-sm max-w-none"
        style={{ fontFamily: 'Times New Roman, serif', lineHeight: '1.6' }}
        dangerouslySetInnerHTML={{ __html: contractHtml }} 
      />
    </div>
  </div>
  ```

### Krok 5: Responsywność modalu

**Plik:** `src/components/fleet/RentalContractSignatureFlow.tsx`

Zmiany w DialogContent:
- Zmienić `max-w-4xl` na `max-w-[95vw] sm:max-w-3xl lg:max-w-4xl`
- Dodać `overflow-x-hidden`

### Krok 6: Zakładka ustawień umowy

**Nowy plik:** `src/components/fleet/FleetContractSettings.tsx`

Funkcje:
- Wyświetlanie zapisanego podpisu floty
- Edycja/dodanie podpisu (SignaturePad)
- Checkbox "Auto-podpisuj umowy"
- Zapis do tabeli `fleet_signatures`

**Plik:** `src/components/FleetManagement.tsx`
- Dodać zakładkę "Ustawienia umowy" do `UniversalSubTabBar`

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiana |
|------|--------|
| `src/components/FleetManagement.tsx` | Zmiana struktury zakładek na styl "Rozliczenia" |
| `src/components/marketplace/ListingCard.tsx` | Dodanie lightbox + nawigacja po kliknięciu |
| `src/pages/RentalClientPortal.tsx` | Naprawa warunku zapisu podpisu |
| `src/components/fleet/RentalContractViewer.tsx` | Styl A4 dla umowy |
| `src/components/fleet/RentalContractSignatureFlow.tsx` | Responsywność modalu |
| `src/components/fleet/FleetContractSettings.tsx` | NOWY - ustawienia podpisu floty |

---

## KOLEJNOŚĆ WDROŻENIA

1. **FleetManagement.tsx** - zmiana układu zakładek
2. **ListingCard.tsx** - lightbox + nawigacja
3. **RentalClientPortal.tsx** - naprawa podpisu
4. **RentalContractViewer.tsx** - styl A4
5. **RentalContractSignatureFlow.tsx** - responsywność
6. **FleetContractSettings.tsx** - nowy komponent
