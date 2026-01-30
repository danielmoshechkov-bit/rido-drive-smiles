

# Plan naprawy modułu "Wynajmij pojazd"

## Zidentyfikowane problemy

### Problem 1: Nie można wybrać wolnego pojazdu
Na screenshocie widać, że pojazdy są wyświetlane na liście, ale nie można ich wybrać/kliknąć. To może być związane z brakiem odpowiedniej logiki lub problemem z kliknięciem. Trzeba również dodać informację gdy pojazd jest już wynajęty (zajęty).

### Problem 2: Modal "Dodaj pojazd" - ramka rozjeżdża się przy wpisywaniu (foto 2)
Problem dotyczy `CarBrandModelSelector` - dropdown z listą marek pojawia się wewnątrz modalu ale jest obcinany przez `overflow-hidden`. Trzeba dodać odpowiedni `z-index` i pozycjonowanie dropdownów.

### Problem 3: Wymagane pola przy dodawaniu pojazdu w module wynajmu
Obecne wymagane pola: nr rejestracyjny, marka, model, rodzaj nadwozia, rodzaj paliwa.
Powinny być wymagane: **marka, model, rodzaj paliwa, rok, kolor, kwota za wynajem**.
Na końcu formularza brak miejsca na datę OC i przegląd - jest tylko "Ubezpieczenie OC" bez żadnych pól widocznych (prawdopodobnie jest, ale ucięte przez scroll).

### Problem 4: Po dodaniu pojazdu nie można go wybrać i kontynuować
Callback `onSuccess` w `VehicleRentalWizard` tylko przeładowuje listę pojazdów ale nie wybiera automatycznie nowego pojazdu. Użytkownik widzi "Pojazd zapisany" ale lista się resetuje i nie może iść dalej.

---

## Szczegóły techniczne napraw

### Naprawa 1: VehicleRentalWizard - wybór pojazdu i wyświetlanie zajętych

**Plik:** `src/components/fleet/VehicleRentalWizard.tsx`

**Zmiany:**
1. Dodać do zapytania o pojazdy sprawdzenie czy pojazd jest aktualnie wynajęty (sprawdzenie w `vehicle_rentals` lub `driver_vehicle_assignments`)
2. Oznaczyć zajęte pojazdy badge "Wynajęty" i wyświetlić informację po kliknięciu
3. Zmienić obsługę kliknięcia:
```typescript
onClick={() => {
  if (vehicle.is_rented) {
    toast.warning("Ten pojazd jest już wynajęty. Wybór spowoduje odłączenie obecnego kierowcy.");
    // Pokaż dialog potwierdzający lub pozwól kontynuować
  }
  setSelectedVehicle(vehicle);
  if (vehicle.weekly_rental_fee) {
    setWeeklyFee(vehicle.weekly_rental_fee.toString());
  }
}}
```

### Naprawa 2: CarBrandModelSelector - poprawka overflow i z-index

**Plik:** `src/components/CarBrandModelSelector.tsx`

**Zmiany:**
- Zmiana klasy dropdowna z `z-50` na `z-[100]` 
- Dodanie `position: fixed` zamiast `absolute` dla dropdownów gdy są wewnątrz modalu (lub użycie Radix Portal)
- Alternatywa: przekształcenie na użycie komponentu `Command` z cmdk (jak w innych selektorach)

### Naprawa 3: AddVehicleModal - zmiana wymaganych pól dla modułu wynajmu

**Plik:** `src/components/AddVehicleModal.tsx`

**Zmiany:**
1. Dodać props `variant?: 'standard' | 'rental'` 
2. Gdy `variant="rental"` wymagane pola to:
   - Marka *
   - Model *
   - Rodzaj paliwa *
   - Rok *
   - Kolor *
   - Kwota za wynajem *
3. Uprościć formularz dla wynajmu - usunąć VIN i nadwozie (opcjonalne)
4. Upewnić się że pola OC i przegląd są widoczne i opcjonalne

**Zmiana walidacji:**
```typescript
const handleSave = async () => {
  if (variant === 'rental') {
    if (!plate || !brand || !model || !fuelType || !year || !color || !weeklyRentalFee) {
      toast.error("Uzupełnij wymagane pola: nr rejestracyjny, markę, model, rodzaj paliwa, rok, kolor i kwotę wynajmu.");
      return;
    }
  } else {
    if (!plate || !brand || !model || !bodyType || !fuelType) {
      toast.error("Uzupełnij wymagane pola: nr rejestracyjny, markę, model, rodzaj nadwozia i paliwa.");
      return;
    }
  }
  // ...reszta logiki
}
```

### Naprawa 4: Automatyczne wybranie pojazdu po dodaniu

**Plik:** `src/components/fleet/VehicleRentalWizard.tsx`

**Zmiany w callback AddVehicleModal:**
```typescript
<AddVehicleModal
  isOpen={showAddVehicle}
  onClose={() => setShowAddVehicle(false)}
  fleetId={fleetId}
  variant="rental"
  onSuccess={async (vehicleId) => {
    // Przeładuj listę i automatycznie wybierz nowy pojazd
    await loadVehicles();
    
    // Znajdź nowo dodany pojazd
    const { data: newVehicle } = await supabase
      .from("vehicles")
      .select("id, plate, brand, model, year, status, weekly_rental_fee")
      .eq("id", vehicleId)
      .single();
    
    if (newVehicle) {
      setSelectedVehicle(newVehicle);
      if (newVehicle.weekly_rental_fee) {
        setWeeklyFee(newVehicle.weekly_rental_fee.toString());
      }
      toast.success("Pojazd dodany i wybrany do wynajmu");
    }
    
    setShowAddVehicle(false);
  }}
/>
```

---

## Pliki do modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/fleet/VehicleRentalWizard.tsx` | Automatyczne wybranie pojazdu po dodaniu, obsługa zajętych pojazdów |
| `src/components/AddVehicleModal.tsx` | Nowy variant "rental" z innymi wymaganymi polami |
| `src/components/CarBrandModelSelector.tsx` | Poprawka z-index i overflow dropdownów |

---

## Kryteria akceptacji

1. Wolne pojazdy można normalnie wybrać kliknięciem
2. Zajęte pojazdy mają oznaczenie "Wynajęty" i wyświetlają ostrzeżenie
3. Dropdown marek/modeli nie jest obcinany przez modal
4. Przy dodawaniu pojazdu w module wynajmu wymagane są: marka, model, paliwo, rok, kolor, kwota
5. Po dodaniu pojazdu jest on automatycznie wybrany i można kontynuować (przycisk "Dalej" aktywny)
6. Pola OC i przeglądu są widoczne i opcjonalne

