
# Plan naprawy: 3 problemy w systemie GetRido

## Podsumowanie problemów

Zidentyfikowałem 3 główne problemy, które wymagają naprawy:

1. **Błąd tworzenia umów najmu** - brak wymaganych kolumn w tabeli `vehicle_rentals`
2. **Uproszczony system inwentarza** - brak cen zakupu, kategorii z sugestiami i integracji z fakturami
3. **Pojazdy floty nie pojawiają się** - problem z przypisaniem floty do nowo dodanych pojazdów

---

## Problem 1: Błąd "Could not find 'is_indefinite' column"

### Przyczyna
Tabela `vehicle_rentals` w bazie danych nie zawiera wielu kolumn, które są używane w kodzie:
- `is_indefinite` - czy wynajem bezterminowy
- `rental_type` - typ wynajmu (taxi, prywatny, długoterminowy)
- `weekly_rental_fee` - stawka tygodniowa
- `contract_number` - numer umowy
- `portal_access_token` - token dostępu do portalu klienta
- `driver_signed_at`, `fleet_signed_at` - daty podpisów
- `driver_signature_url`, `fleet_signature_url` - URL podpisów
- `protocol_completed_at`, `invitation_sent_at` - daty protokołu i zaproszenia

### Rozwiązanie
Migracja SQL dodająca brakujące kolumny do tabeli `vehicle_rentals`:

```sql
ALTER TABLE vehicle_rentals 
ADD COLUMN IF NOT EXISTS is_indefinite BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS rental_type TEXT DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS weekly_rental_fee NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS contract_number TEXT,
ADD COLUMN IF NOT EXISTS portal_access_token TEXT,
ADD COLUMN IF NOT EXISTS driver_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS fleet_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS driver_signature_url TEXT,
ADD COLUMN IF NOT EXISTS fleet_signature_url TEXT,
ADD COLUMN IF NOT EXISTS protocol_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;

-- Uczynienie listing_id opcjonalnym (nie zawsze potrzebny przy tworzeniu umowy)
ALTER TABLE vehicle_rentals ALTER COLUMN listing_id DROP NOT NULL;

-- Zmiana weekly_price na opcjonalne (zastąpione przez weekly_rental_fee)
ALTER TABLE vehicle_rentals ALTER COLUMN weekly_price DROP NOT NULL;
```

---

## Problem 2: Rozbudowany system inwentarza

### Brakujące funkcjonalności:
1. **Cena zakupu** - brak kolumn `default_purchase_price_net/gross`
2. **Kategorie z sugestiami** - obecnie tylko pole tekstowe, bez wyboru z istniejących
3. **Integracja z fakturami** - brak typeahead przy wpisywaniu nazwy produktu
4. **Ostrzeżenia o marży** - brak kalkulacji zysku/straty
5. **Stan magazynowy** - brak ostrzeżeń o braku produktu

### Rozwiązanie - Faza A: Migracja bazy danych

```sql
-- Dodanie cen zakupu do inventory_products
ALTER TABLE inventory_products
ADD COLUMN IF NOT EXISTS default_purchase_price_net NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS default_purchase_price_gross NUMERIC(12,2);

-- Tabela kategorii produktów (słownik)
CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES inventory_categories(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, entity_id, name)
);

-- RLS dla kategorii
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their categories" ON inventory_categories
  FOR ALL USING (auth.uid() = user_id);
```

### Rozwiązanie - Faza B: Modyfikacja UI

**InventoryProductList.tsx** - dodanie:
- Pola cena zakupu netto/brutto
- Dropdown kategorii z wyszukiwaniem i możliwością dodania nowej
- Kalkulacja marży (cena sprzedaży - cena zakupu)

**SimpleFreeInvoice.tsx** - dodanie:
- Typeahead przy wpisywaniu nazwy pozycji faktury
- Sugestie z `inventory_products` (nazwa, cena, jednostka, VAT)
- Ostrzeżenie gdy cena sprzedaży < ceny zakupu
- Pytanie o aktualizację ceny stałej po zmianie
- Ostrzeżenie gdy sprzedajemy więcej niż na stanie

### Przykładowy flow:

```text
1. Dodaję produkt "Rura gruba":
   - Wybieram kategorię z listy lub dodaję nową "Materiały budowlane"
   - Cena zakupu netto: 10 zł, brutto: 12.30 zł (VAT 23%)
   - Cena sprzedaży netto: 15 zł, brutto: 18.45 zł
   - Stan: 10 szt.

2. Wystawiam fakturę:
   - Wpisuję "rura" → sugestia "Rura gruba" (15 zł netto)
   - Wybieram → automatycznie wypełnia cenę, VAT, jednostkę
   - Zmieniam cenę na 8 zł → ostrzeżenie: "Sprzedajesz poniżej ceny zakupu (10 zł)"
   - Wpisuję ilość 15 szt. → ostrzeżenie: "Na stanie tylko 10 szt."
   
3. Po wystawieniu faktury:
   - Widzę zysk/stratę na pozycji
   - Widzę obliczony VAT do zapłaty
   - Widzę szacowany podatek dochodowy
```

---

## Problem 3: Pojazdy floty nie pojawiają się na liście

### Przyczyna
W `AddVehicleModal.tsx`:
- Linia 94: `fleet_id: isFleetUser ? fleetId : null` - prawidłowe
- ALE: Modal jest wywoływany bez przekazania `fleetId` lub `userType='fleet'`

W `VehicleRentalWizard.tsx`:
- Linia 839-844: `AddVehicleModal` otrzymuje tylko `fleetId={fleetId}` ale bez `userType='fleet'`
- To powoduje, że `isFleetUser` jest `false` i `fleet_id` NIE jest przypisywane

### Rozwiązanie

**VehicleRentalWizard.tsx** - zmiana linii 838-844:
```tsx
<AddVehicleModal
  isOpen={showAddVehicle}
  onClose={() => setShowAddVehicle(false)}
  fleetId={fleetId}
  userType="fleet"  // DODAĆ TĘ LINIĘ
  variant="rental"
  onSuccess={...}
/>
```

Dodatkowo, pole "Właściciel/Flota" w modalu powinno:
- Automatycznie wypełniać się nazwą floty dla użytkowników flotowych
- Być disabled (nieedytowalne) dla użytkowników flotowych

---

## Sekcja techniczna: Lista zmian

### Migracje SQL:
1. **vehicle_rentals_add_columns.sql** - dodanie brakujących kolumn
2. **inventory_purchase_prices.sql** - dodanie cen zakupu i tabeli kategorii

### Pliki do modyfikacji:

| Plik | Zmiany |
|------|--------|
| `VehicleRentalWizard.tsx` | Dodanie `userType="fleet"` do AddVehicleModal |
| `InventoryProductList.tsx` | Dodanie pól ceny zakupu, dropdown kategorii z sugestiami |
| `SimpleFreeInvoice.tsx` | Dodanie typeahead produktów, ostrzeżeń o marży |
| `useInventoryProducts.ts` | Dodanie pól ceny zakupu do interfejsu |

### Nowe pliki:

| Plik | Opis |
|------|------|
| `src/components/inventory/CategorySelector.tsx` | Dropdown kategorii z wyszukiwaniem i dodawaniem |
| `src/components/invoices/ProductTypeahead.tsx` | Sugestie produktów przy wpisywaniu na fakturze |
| `src/hooks/useInventoryCategories.ts` | Hook do zarządzania kategoriami |

---

## Kolejność implementacji

1. **Migracja SQL dla vehicle_rentals** (naprawia błąd umów natychmiast)
2. **Fix VehicleRentalWizard** (naprawia przypisanie floty)
3. **Migracja SQL dla inventory** (dodaje strukturę)
4. **UI inwentarza** (kategorie, ceny zakupu)
5. **Integracja faktur** (typeahead, ostrzeżenia)

---

## Kalkulacja podatków (dla podsumowania faktury)

Przykład obliczenia zysku na fakturze:

```text
Sprzedaż:
- 10x Rura gruba @ 12.30 zł brutto = 123.00 zł brutto (100 zł netto + 23 zł VAT)

Zakup:
- 10x Rura gruba @ 10.30 zł brutto = 103.00 zł brutto (około 83.74 zł netto + 19.26 zł VAT)

Zysk brutto: 123 - 103 = 20 zł
VAT do zapłaty: 23 - 19.26 = 3.74 zł (VAT należny - VAT naliczony)
Zysk netto przed podatkiem: 100 - 83.74 = 16.26 zł

Podatek dochodowy (zależy od formy):
- Ryczałt 8.5%: 100 × 8.5% = 8.50 zł
- Liniowy 19%: 16.26 × 19% = 3.09 zł
- Skala (12%/32%): 16.26 × 12% = 1.95 zł

Rzeczywisty zysk "na rękę":
- Ryczałt: 16.26 - 8.50 = 7.76 zł
- Liniowy: 16.26 - 3.09 = 13.17 zł
```

System będzie obliczał te wartości automatycznie na podstawie ustawień formy opodatkowania klienta.
