
# Plan naprawy modułu umów najmu i innych zgłoszonych błędów

## Przegląd zgłoszonych problemów

1. **Biały ekran w Panelu Admin (Portale)** - przy edycji/dodawaniu kategorii
2. **Konto testowe agencji nieruchomości** - nieruchomosci@test.pl
3. **Wyświetlanie zdjęć pionowych** - nieodpowiednie dopasowanie w miniaturach
4. **Moduł umów - zbyt dużo pustej przestrzeni** - wymagane nadmierne przewijanie
5. **Formularz danych kierowcy - brak scrollowania** - nie można przewinąć do końca
6. **Podgląd umowy - pusta strona** - błąd w nazwie kolumny bazy danych
7. **Brak przycisku usuwania** - dla niepodpisanych umów
8. **Brak zakładek w Najem** - Aktywne/Zakończone/Do podpisu
9. **Profesjonalny podgląd umowy i podpisy** - duplikaty checkboxów, wymóg przewinięcia

---

## Szczegółowy plan napraw

### 1. Naprawa białego ekranu w Admin Portal Categories

**Plik:** `src/components/admin/PortalCategoriesManager.tsx`

**Problem:** Async handlers nie są opakowane w try/catch, co powoduje crash aplikacji.

**Rozwiązanie:**
- Dodać try/catch do wszystkich async handlerów: `handleSave`, `handleDelete`, `handleToggleVisibility`, `handleMove`
- Dodać globalną obsługę błędów w App.tsx

---

### 2. Utworzenie konta testowego

**Wymagane:** Konto dla agencji nieruchomości

- Email: `nieruchomosci@test.pl`
- Hasło: `Test123!`
- Rola: `realestate` (lub odpowiednia dla agencji)

**Uwaga:** To wymaga ręcznego utworzenia użytkownika w panelu Supabase Auth lub przez skrypt migracyjny.

---

### 3. Naprawa wyświetlania zdjęć pionowych

**Pliki:**
- `src/components/FeaturedListingCard.tsx`
- `src/components/realestate/PropertyListingCard.tsx`
- `src/components/ui/ImageLightbox.tsx`

**Problem:** Zdjęcia pionowe nie wypełniają prawidłowo kontenerów miniatur.

**Rozwiązanie:**
- Upewnić się, że kontenery mają stały aspect ratio (`aspect-[4/3]` lub `aspect-video`)
- Użyć `object-cover` z `object-center` dla lepszego kadrowania
- W lightbox miniatury już mają poprawne style, ale główne zdjęcie może wymagać `object-contain` dla zachowania proporcji

---

### 4. Naprawa układu modułu umów (zbyt dużo pustej przestrzeni)

**Plik:** `src/components/fleet/RentalContractSignatureFlow.tsx`

**Problem:** Za dużo pustej przestrzeni w modalu, wymaga nadmiernego przewijania.

**Rozwiązanie:**
- Zmniejszyć paddingi i marginesy
- Użyć bardziej kompaktowego layoutu dla kroków progress
- Zoptymalizować układ kart informacyjnych
- Zmienić `max-h` DialogContent na odpowiedniejszy rozmiar

---

### 5. Naprawa scrollowania formularza danych kierowcy

**Plik:** `src/components/fleet/EditDriverDataModal.tsx`

**Problem:** Formularz nie ma działającego scrollbara, nie można zobaczyć wszystkich pól.

**Rozwiązanie:**
- Sprawdzić konfigurację `ScrollArea` - ma `flex-1 min-h-0` co powinno działać
- Upewnić się, że `DialogContent` ma `flex flex-col` i odpowiedni `max-h`
- Dodać `overflow-y-auto` jako fallback jeśli ScrollArea nie działa

---

### 6. Naprawa pustej strony podglądu umowy

**Plik:** `src/components/fleet/RentalContractSignatureFlow.tsx` (funkcja `ContractPreview`)

**Problem:** Query używa `address_street`, `address_city` dla tabeli `fleets`, ale prawdziwe kolumny to `street`, `city`, `postal_code`.

**Rozwiązanie linii 789:**
```typescript
// PRZED:
fleets:fleet_id (id, name, nip, address_street, address_city, phone, email)

// PO:
fleets:fleet_id (id, name, nip, street, city, postal_code, phone, email)
```

**Rozwiązanie linii 805-808:**
```typescript
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

---

### 7. Dodanie przycisku usuwania niepodpisanych umów

**Plik:** `src/components/fleet/FleetActiveRentals.tsx`

**Rozwiązanie:**
- Dodać przycisk `Trash2` (ikona kosza) obok przycisku "Podgląd" dla umów ze statusem `draft` lub `pending_signature` (bez `driver_signed_at`)
- Implementacja `handleDeleteRental` z potwierdzeniem
- Po usunięciu odświeżyć listę

---

### 8. Dodanie zakładek Aktywne/Zakończone/Do podpisu

**Plik:** `src/components/fleet/FleetActiveRentals.tsx`

**Rozwiązanie:**
- Dodać komponent `Tabs` z trzema zakładkami:
  - **Aktywne** - status: `signed`, `finalized`, `active`
  - **Do podpisu** - status: `draft`, `pending_signature`
  - **Zakończone** - status: `completed`, `cancelled`
- Dodać filtry:
  - Wyszukiwarka (imię, nazwisko, nr rejestracyjny)
  - Zakres dat
- Dodać kolumnę ze zdjęciem auta
- Rozszerzyć query o pobieranie pierwszego zdjęcia pojazdu

---

### 9. Naprawa profesjonalnego podglądu umowy i podpisów

**Pliki:**
- `src/pages/RentalClientPortal.tsx`
- `src/components/fleet/RentalContractViewer.tsx`

**Problemy:**
a) Duplikat checkboxów (raz w `RentalContractViewer`, raz w `RentalClientPortal`)
b) Checkboxy nie działają (są zdublowane)
c) Podpis z piórem nie działa
d) Wymóg przewinięcia całego dokumentu

**Rozwiązanie:**

**a) Usunięcie duplikatów z RentalContractViewer:**
- Komponent `RentalContractViewer` nie powinien renderować własnych checkboxów
- Powinien tylko wyświetlać HTML umowy
- Usunąć sekcję checkboxów i przycisk "Akceptuję i przechodzę do podpisu"

**b) Naprawa checkboxów w RentalClientPortal:**
- Checkboxy są już zaimplementowane prawidłowo w `RentalClientPortal.tsx`
- Wystarczy usunąć duplikaty z `RentalContractViewer`

**c) Naprawa podpisu:**
- `SignaturePad` wygląda na poprawnie zaimplementowany (canvas z touch events)
- Sprawdzić czy `handleSignatureSubmit` w RentalClientPortal prawidłowo zapisuje

**d) Wymóg przewinięcia:**
- W `RentalClientPortal` już jest zaimplementowane `hasScrolledToEnd`
- Trzeba upewnić się, że `onScroll` handler działa poprawnie
- Dodać logowanie przewinięcia do `contract_signature_logs`

---

## Diagram zmian w module umów

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FleetActiveRentals.tsx                        │
├─────────────────────────────────────────────────────────────────┤
│  [Tabs: Aktywne | Do podpisu | Zakończone]                      │
│  [Wyszukiwarka: kierowca, auto, daty]                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [Foto] | Pojazd | Kierowca | Status | [Podgląd] [Usuń]  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                RentalContractSignatureFlow.tsx                   │
├─────────────────────────────────────────────────────────────────┤
│  [Progress Steps: kompaktowe]                                    │
│  [Podgląd umowy] [Edytuj dane] <- działające przyciski          │
│  [Kompaktowe info o pojeździe i kierowcy]                       │
│  [Wyślij link: Email/SMS]                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               RentalClientPortal.tsx (dla kierowcy)              │
├─────────────────────────────────────────────────────────────────┤
│  [Przewijalny dokument umowy - wygląd A4]                       │
│  ↓ Przewiń do końca                                              │
│  [✓] Akceptuję umowę                                             │
│  [✓] Akceptuję OWU                                               │
│  [✓] Akceptuję RODO                                              │
│  [Przejdź do podpisu] <- aktywny po spełnieniu warunków         │
│                                                                  │
│  [SignaturePad - podpis palcem/rysikiem]                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Kolejność wdrożenia

1. **Naprawy krytyczne (błędy blokujące):**
   - Naprawa pustego podglądu umowy (błąd kolumny `address_street`)
   - Usunięcie duplikatów checkboxów

2. **Naprawy UX:**
   - Scrollowanie formularza kierowcy
   - Zmniejszenie pustej przestrzeni w modalu
   - Naprawa białego ekranu Admin Portal

3. **Nowe funkcje:**
   - Przycisk usuwania umów
   - Zakładki Aktywne/Zakończone/Do podpisu
   - Filtry i wyszukiwarka

4. **Konto testowe:**
   - Utworzenie użytkownika w panelu Supabase

---

## Podsumowanie zmian plików

| Plik | Typ zmiany |
|------|------------|
| `src/components/fleet/RentalContractSignatureFlow.tsx` | Naprawa query, kompaktowy layout |
| `src/components/fleet/FleetActiveRentals.tsx` | Zakładki, filtry, przycisk usuwania |
| `src/components/fleet/RentalContractViewer.tsx` | Usunięcie duplikatów checkboxów |
| `src/components/admin/PortalCategoriesManager.tsx` | try/catch dla async handlers |
| `src/components/fleet/EditDriverDataModal.tsx` | Naprawa scrollowania |
| `src/pages/RentalClientPortal.tsx` | Weryfikacja logiki podpisu |
| `src/components/FeaturedListingCard.tsx` | object-cover dla zdjęć pionowych |
| `src/components/realestate/PropertyListingCard.tsx` | object-cover dla zdjęć pionowych |

