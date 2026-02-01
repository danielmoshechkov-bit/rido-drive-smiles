
# Plan naprawy 10 zgłoszonych problemów

## Analiza obecnego stanu

Po dokładnym sprawdzeniu kodu stwierdzam, że poprzednie zmiany **NIE zostały w pełni wdrożone**. Poniżej przedstawiam szczegółowy status każdego problemu i plan naprawy.

---

## 1. Admin Portal - biały ekran przy edycji kategorii

**Status:** NIE NAPRAWIONE

**Plik:** `src/components/admin/PortalCategoriesManager.tsx`

**Problem:** Funkcje `handleSave`, `handleDelete`, `handleToggleVisibility`, `handleMove` nie mają odpowiedniej obsługi błędów, co powoduje crash aplikacji.

**Rozwiązanie:**
- Dodać try/catch z odpowiednim wyświetlaniem błędów użytkownikowi
- Upewnić się, że wszystkie async operacje są bezpiecznie opakowane

---

## 2. Konto testowe agencji nieruchomości

**Status:** NIE UTWORZONE

**Dane:**
- Email: `nieruchomosci@test.pl`
- Hasło: `Test123!`
- Rola: `realestate`

**Rozwiązanie:** Utworzenie konta przez migrację SQL lub ręcznie w panelu Supabase Auth.

---

## 3. Zdjęcia pionowe - złe dopasowanie

**Status:** NIE SPRAWDZONE

**Pliki do modyfikacji:**
- `src/components/FeaturedListingCard.tsx`
- `src/components/realestate/PropertyListingCard.tsx`

**Rozwiązanie:**
- Upewnić się, że kontenery obrazów mają `aspect-ratio` i `object-cover`
- Dodać `object-position: center` dla lepszego kadrowania

---

## 4. Moduł umów - zbyt dużo pustej przestrzeni

**Status:** NIE NAPRAWIONE

**Plik:** `src/components/fleet/RentalContractSignatureFlow.tsx`

**Rozwiązanie:**
- Zmniejszyć paddingi i marginesy
- Kompaktowy układ kart informacyjnych
- Optymalizacja kroków progress

---

## 5. Formularz kierowcy - brak scrollowania

**Status:** CZĘŚCIOWO NAPRAWIONE

**Plik:** `src/components/fleet/EditDriverDataModal.tsx`

**Problem:** `ScrollArea` jest zaimplementowane, ale może nie działać poprawnie na niektórych urządzeniach.

**Rozwiązanie:**
- Dodać fallback `overflow-y-auto` bezpośrednio na kontenerze
- Sprawdzić konfigurację `DialogContent`

---

## 6. Podgląd umowy - pusta strona (BŁĄD KRYTYCZNY)

**Status:** NIE NAPRAWIONE

**Plik:** `src/components/fleet/RentalContractSignatureFlow.tsx`

**Problem na linii 789:**
```typescript
// AKTUALNIE (BŁĘDNE):
fleets:fleet_id (id, name, nip, address_street, address_city, phone, email)

// POWINNO BYĆ:
fleets:fleet_id (id, name, nip, street, city, postal_code, phone, email)
```

Tabela `fleets` ma kolumny `street`, `city`, `postal_code` - NIE `address_street`, `address_city`.

**Problem na liniach 805-808:**
```typescript
// AKTUALNIE (BŁĘDNE):
const fleetAddress = [
  fleet?.address_street,
  fleet?.address_city
].filter(Boolean).join(', ');

// POWINNO BYĆ:
const fleetAddress = [
  fleet?.street,
  fleet?.postal_code,
  fleet?.city
].filter(Boolean).join(', ');
```

**Uwaga:** W pliku `RentalContractViewer.tsx` te zmiany już zostały wprowadzone (linie 53, 82-86), ale w `RentalContractSignatureFlow.tsx` wciąż jest błąd!

---

## 7. Przycisk usuwania niepodpisanych umów

**Status:** NIE DODANE

**Plik:** `src/components/fleet/FleetActiveRentals.tsx`

**Rozwiązanie:**
- Dodać import `Trash2` z lucide-react
- Dodać przycisk usuwania dla statusów `draft` i `pending_signature`
- Implementacja `handleDeleteRental` z potwierdzeniem
- Odświeżenie listy po usunięciu

---

## 8. Zakładki Aktywne/Do podpisu/Zakończone

**Status:** NIE DODANE

**Plik:** `src/components/fleet/FleetActiveRentals.tsx`

**Rozwiązanie:**
- Dodać komponenty `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- Trzy zakładki:
  - **Aktywne:** status `signed`, `finalized`, `active`
  - **Do podpisu:** status `draft`, `pending_signature`
  - **Zakończone:** status `completed`, `cancelled`
- Dodać wyszukiwarkę (imię, nazwisko, nr rejestracyjny)
- Dodać filtr zakresu dat
- Dodać kolumnę ze zdjęciem pojazdu

---

## 9. Duplikat checkboxów w podglądzie umowy

**Status:** NIE NAPRAWIONE

**Problem:** Checkboxy są wyświetlane DWA RAZY:
1. W `RentalContractViewer.tsx` (linie 239-291)
2. W `RentalClientPortal.tsx` (linie 248-296)

**Rozwiązanie:**
- `RentalContractViewer.tsx` powinien TYLKO wyświetlać treść umowy HTML
- Usunąć checkboxy i przycisk "Akceptuję i przechodzę do podpisu" z `RentalContractViewer.tsx`
- Checkboxy pozostają tylko w `RentalClientPortal.tsx`

---

## 10. Profesjonalny wygląd umowy (format A4)

**Status:** NIE NAPRAWIONE

**Rozwiązanie:**
- Zmienić styl wyświetlania umowy na format przypominający dokument A4
- Dodać cienie i ramki imitujące kartkę papieru
- Poprawić typografię dokumentu

---

## Kolejność wdrożenia

1. **Naprawa krytyczna (punkt 6):** Błąd kolumn w bazie danych - umowa nie może się wczytać
2. **Usunięcie duplikatów (punkt 9):** Checkboxy wyświetlane 2 razy
3. **Dodanie funkcjonalności (punkty 7, 8):** Przycisk usuwania, zakładki
4. **Naprawa UX (punkty 4, 5):** Layout, scrollowanie
5. **Pozostałe (punkty 1, 3, 10):** Admin Portal, zdjęcia, wygląd A4
6. **Konto testowe (punkt 2):** Utworzenie w Supabase

---

## Pliki do modyfikacji

| Plik | Zmiany |
|------|--------|
| `RentalContractSignatureFlow.tsx` | Naprawa query (linia 789), naprawa adresu floty (linie 805-808), kompaktowy layout |
| `FleetActiveRentals.tsx` | Dodanie zakładek, filtrów, przycisku usuwania, kolumny ze zdjęciem |
| `RentalContractViewer.tsx` | Usunięcie checkboxów i przycisku (linie 224-291) - pozostawić tylko HTML umowy |
| `EditDriverDataModal.tsx` | Naprawa scrollowania |
| `PortalCategoriesManager.tsx` | Dodanie try/catch |
| `FeaturedListingCard.tsx` | Naprawa aspect-ratio zdjęć |
| `PropertyListingCard.tsx` | Naprawa aspect-ratio zdjęć |
