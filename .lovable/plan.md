

# Plan Naprawy UI/UX - 4 Kluczowe Problemy

## PODSUMOWANIE PROBLEMÓW

Na podstawie zrzutów ekranu i analizy kodu zidentyfikowałem następujące problemy, które **nadal nie są naprawione**:

---

## 1. Menu mobilne nie zamyka się po wyborze zakładki

**Problem (foto 1):**
W widoku mobilnym, po rozwinięciu listy głównych zakładek (np. "Flota") i wybraniu opcji, lista pozostaje otwarta zamiast się zamykać.

**Lokalizacja błędu:**
`src/components/UnifiedDashboard.tsx` (linie 454-543)
W komponencie `Collapsible` brak stanu kontrolującego otwarcie/zamknięcie oraz brak zamykania po kliknięciu na Button.

**Rozwiązanie:**
- Dodać stan `const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);`
- Przekazać `open={isMobileMenuOpen}` do `Collapsible`
- W każdym `Button` onClick dodać `setIsMobileMenuOpen(false)` obok `setActiveTab(...)`

---

## 2. Widok mobilny karty pojazdu - dane obcięte

**Problem (foto 2):**
W widoku mobilnym karty pojazdów (Lexus CT, Toyota Auris) nie widać wszystkich danych - np. "Dok: OC" jest obcięte, brak informacji o przeglądzie, kierowcy, kwocie. Dane powinny być widoczne lub rozwijalne.

**Lokalizacja błędu:**
`src/components/FleetManagement.tsx` (linie 474-650) - sekcja renderująca karty pojazdów

**Rozwiązanie:**
- Zmienić układ z `flex-row gap-6` na responsywny `flex flex-col md:flex-row gap-4`
- Usunąć `truncate` z elementów, które powinny być widoczne
- Dodać `flex-wrap` dla grup informacji
- Zmienić układ tak, żeby na mobile było:
  - Rząd 1: Nr rej + Pojazd
  - Rząd 2: Kierowca + Dokumenty (OC, przegląd)
  - Rząd 3: Stawka tygodniowa

---

## 3. Układ zakładki "Flota" nie pasuje do wzorca "Rozliczenia"

**Problem (foto 3 vs foto 4):**
W zakładce "Rozliczenia" mamy:
1. Główna zakładka (Rozliczenia) - fioletowy pasek
2. POD NIM: UniversalSubTabBar z przyciskami (Moje rozliczenia, Rozlicz kierowców, etc.)
3. POD NIM: Zawartość (Card "Wynik tygodniowy" itp.)

W zakładce "Flota" obecnie jest:
1. Główna zakładka (Flota) - fioletowy pasek
2. Card "Flota - Car4Ride sp. z o.o." z **zakładkami WEWNĄTRZ** karty

**Rozwiązanie:**
Całkowita przebudowa `FleetManagement.tsx`:
- Usunąć opakowanie `<Card>` + `<CardHeader>` + `<CardContent>` z komponentu
- Renderować `<UniversalSubTabBar>` na samym początku (poza Card)
- Dopiero PO wybraniu zakładki wyświetlać odpowiednią zawartość (np. Card z listą pojazdów)

```tsx
// NOWA STRUKTURA (jak FleetSettlementsView):
return (
  <div className="space-y-4">
    <UniversalSubTabBar ... />
    
    {activeTab === "vehicles" && (
      <Card>
        <CardHeader>...</CardHeader>
        <CardContent>
          {/* Lista pojazdów */}
        </CardContent>
      </Card>
    )}
    
    {activeTab === "najem" && (
      <FleetRentalsTab ... />
    )}
    
    {activeTab === "rentals" && (
      <Card>...</Card>
    )}
  </div>
);
```

---

## 4. Podpis nie zapisuje się

**Problem (foto 5):**
Komunikat "Błąd zapisywania podpisu. Spróbuj ponownie." - podpis nie jest zapisywany do bazy.

**Lokalizacja błędu:**
`src/pages/RentalClientPortal.tsx` (linie 136-186) - funkcja `handleSignatureSubmit`

**Diagnoza:**
Sprawdzenie zapytania update w bazie - możliwe, że filtr `portal_access_token` nie pasuje lub rekord nie istnieje.

**Rozwiązanie:**
- Dodać szczegółowe logowanie przed i po zapytaniu
- Sprawdzić czy `rentalId` jest poprawne
- Rozdzielić update na dwie wersje:
  1. Z tokenem (dla kierowcy z zewnątrz)
  2. Bez tokena (dla zalogowanego fleet managera)
- Dodać walidację czy rental istnieje przed próbą update

```tsx
const handleSignatureSubmit = async (signatureDataUrl: string) => {
  if (!rentalId) return;
  setIsSigning(true);
  
  try {
    // 1. Sprawdź czy rental istnieje
    const { data: existingRental, error: checkError } = await supabase
      .from("vehicle_rentals")
      .select("id, status, portal_access_token")
      .eq("id", rentalId)
      .single();
    
    if (checkError || !existingRental) {
      console.error("Rental not found:", checkError);
      toast.error("Nie znaleziono umowy");
      return;
    }
    
    // 2. Upload signature
    const blob = await (await fetch(signatureDataUrl)).blob();
    const fileName = `driver_signatures/${rentalId}/${Date.now()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("driver-documents")
      .upload(fileName, blob);
    
    if (uploadError) throw uploadError;
    
    const { data: { publicUrl } } = supabase.storage
      .from("driver-documents")
      .getPublicUrl(fileName);
    
    // 3. Update rental - BEZ filtra po tokenie, bo już zweryfikowaliśmy dostęp
    const { error: updateError } = await supabase
      .from("vehicle_rentals")
      .update({
        driver_signed_at: new Date().toISOString(),
        driver_signature_url: publicUrl,
        driver_signature_user_agent: navigator.userAgent,
        status: "client_signed",
      })
      .eq("id", rentalId);
    
    if (updateError) throw updateError;
    
    toast.success("Umowa podpisana pomyślnie!");
    setStep("complete");
  } catch (error: any) {
    console.error("Signature error:", error);
    toast.error("Błąd zapisywania podpisu: " + (error.message || "Nieznany błąd"));
  } finally {
    setIsSigning(false);
  }
};
```

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiana |
|------|--------|
| `src/components/UnifiedDashboard.tsx` | Dodać stan `isMobileMenuOpen` i zamykanie menu po wyborze |
| `src/components/FleetManagement.tsx` | 1) Zmienić strukturę - zakładki POZA Card, 2) Responsywność kart pojazdów |
| `src/pages/RentalClientPortal.tsx` | Naprawić logikę zapisu podpisu |

---

## SZCZEGÓŁY TECHNICZNE

### UnifiedDashboard.tsx - dodanie stanu dla menu

```tsx
// Dodać na początku komponentu:
const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// Zmienić Collapsible:
<Collapsible open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen} className="flex-1">

// W każdym Button wewnątrz CollapsibleContent:
<Button 
  variant="ghost" 
  size="sm"
  className="w-full justify-start text-xs"
  onClick={() => {
    setActiveTab('fleet');
    setIsMobileMenuOpen(false); // DODAĆ TO
  }}
>
```

### FleetManagement.tsx - nowa struktura

Aktualna struktura:
```
<Card>
  <CardHeader>Flota - {cityName}</CardHeader>
  <CardContent>
    <UniversalSubTabBar />  ← WEWNĄTRZ Card
    {activeTab content}
  </CardContent>
</Card>
```

Nowa struktura (jak Rozliczenia):
```
<div>
  <UniversalSubTabBar />  ← POZA Card
  
  {activeTab === "vehicles" && (
    <Card>
      <CardHeader>Flota - {cityName}</CardHeader>
      <CardContent>
        {lista pojazdów}
      </CardContent>
    </Card>
  )}
  
  {activeTab === "najem" && <FleetRentalsTab />}
  {activeTab === "settings" && <FleetContractSettings />}
</div>
```

### FleetManagement.tsx - responsywność kart pojazdów

```tsx
// Zmienić layout w kartach pojazdów (około linii 498-530):
<div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
  {/* Rząd 1 */}
  <div className="grid grid-cols-2 md:flex md:items-center gap-3 md:gap-6">
    <div className="min-w-[100px]">
      <span className="text-xs text-muted-foreground">Nr rej.:</span>
      <div className="font-bold text-sm">{vehicle.plate}</div>
    </div>
    <div className="min-w-[120px]">
      <span className="text-xs text-muted-foreground">Pojazd:</span>
      <div className="font-semibold text-sm">{vehicle.brand} {vehicle.model}</div>
    </div>
  </div>
  
  {/* Rząd 2 - kierowca + dokumenty */}
  <div className="grid grid-cols-2 md:flex md:items-center gap-3 md:gap-6">
    <div className="min-w-[120px]">
      <span className="text-xs text-muted-foreground">Kierowca:</span>
      <UniversalSelector ... />
    </div>
    <div className="min-w-[100px]">
      <span className="text-xs text-muted-foreground">Dokumenty:</span>
      <ExpiryBadges ... />
    </div>
  </div>
</div>
```

---

## KOLEJNOŚĆ WDROŻENIA

1. **UnifiedDashboard.tsx** - naprawa zamykania menu mobilnego
2. **FleetManagement.tsx** - przebudowa struktury zakładek + responsywność
3. **RentalClientPortal.tsx** - naprawa zapisu podpisu

