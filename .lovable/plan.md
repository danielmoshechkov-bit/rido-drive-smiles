

# Plan Naprawy Systemu Mapowania Kierowców z CSV

## Zidentyfikowane Problemy

### Problem 1: Kierowcy-"śmieci" widoczni w rozliczeniach
Na screenshocie widać kierowców jak "ds sdds", "das dsa", "Anastasiia Shapovalova" którzy są przypisani do floty, ale nie mają żadnych rozliczeń w wybranym okresie. System pobiera WSZYSTKICH kierowców z floty i wyświetla ich w tabeli, nawet jeśli mają same zera.

### Problem 2: Brak inteligentnego matchingu imion
Obecny algorytm matchingu kierowców z CSV jest zbyt prosty:
- Szuka dokładnego dopasowania po `platform_id` 
- Albo prostego `includes()` na imieniu i nazwisku
- Nie obsługuje: różnej kolejności (Kowalski Jan vs Jan Kowalski), literówek, polskich znaków

### Problem 3: Brak rekordów w `unmapped_settlement_drivers`
Tabela jest pusta, więc przycisk "Sprawdź nowych kierowców" zawsze pokazuje "Brak nowych kierowców". Problem: kierowcy są tworzeni, ale nie są zapisywani do tabeli unmapped jeśli fleet_id nie jest ustawiony lub jest błąd.

### Problem 4: Aneta Sknadaj i Paweł Koziarek nie zostali dopasowani
Nowi kierowcy z CSV (Uber) nie zostali połączeni z istniejącymi kierowcami w bazie, bo:
- Aneta nie ma wpisu w `driver_platform_ids`
- System stworzył nowego kierowcę zamiast próbować fuzzy match

---

## Rozwiązanie

### Faza 1: Filtrowanie kierowców bez danych rozliczeniowych

**Plik:** `src/components/FleetSettlementsView.tsx`

Zmienić logikę wyświetlania tak, aby NIE pokazywać kierowców, którzy:
- Mają `total_base === 0`
- Mają `platform_net >= 0` (nie mają ujemnego salda)
- NIE mają żadnych `settlements` w wybranym okresie

Dodać na końcu agregacji filtrowanie:

```text
const filteredAggregated = aggregated.filter(row => 
  row.total_base > 0 || 
  row.has_negative_balance || 
  settlements.some(s => s.driver_id === row.driver_id)
);
```

### Faza 2: Ulepszony Matching Kierowców (Fuzzy)

**Plik:** `supabase/functions/settlements/index.ts`

Dodać funkcję `fuzzyMatchDriver()` z obsługą:

1. **Normalizacja nazw**:
   - Usuń polskie znaki (ą→a, ę→e, ł→l, etc.)
   - Lowercase
   - Usuń wielokrotne spacje
   - Trim

2. **Algorytm dopasowania** (bez AI - szybki i darmowy):
   - Exact match (po normalizacji)
   - Reversed order match ("Jan Kowalski" = "Kowalski Jan")
   - First name + Last name initial ("Jan K" vs "Jan Kowalski")
   - Levenshtein distance < 2 dla drobnych literówek

3. **Scoring system**:
   - Platform ID match = 100 punktów (pewne)
   - Exact name match = 80 punktów
   - Reversed name = 70 punktów
   - Phone match = 90 punktów
   - Fuzzy match (Levenshtein) = 50-60 punktów

```typescript
function normalizePolishName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyMatchDriver(
  csvName: string, 
  existingDrivers: Map<string, any>
): { driver: any | null, score: number } {
  const normalized = normalizePolishName(csvName);
  const nameParts = normalized.split(' ');
  const reversed = nameParts.reverse().join(' ');
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [key, driver] of existingDrivers.entries()) {
    const driverName = normalizePolishName(
      `${driver.first_name || ''} ${driver.last_name || ''}`
    );
    
    // Exact match
    if (driverName === normalized) {
      return { driver, score: 80 };
    }
    
    // Reversed order
    if (driverName === reversed) {
      if (bestScore < 70) {
        bestMatch = driver;
        bestScore = 70;
      }
    }
    
    // Levenshtein distance
    const distance = levenshtein(normalized, driverName);
    if (distance <= 2 && bestScore < 60) {
      bestMatch = driver;
      bestScore = 60 - distance * 5;
    }
  }
  
  return { driver: bestMatch, score: bestScore };
}
```

### Faza 3: Poprawka Zapisu do `unmapped_settlement_drivers`

**Problem**: Rekord nie jest zapisywany, bo `fleet_id` jest undefined w niektórych przypadkach.

**Rozwiązanie**: Zawsze zapisuj do `unmapped_settlement_drivers` jeśli kierowca jest nowy, nawet bez `fleet_id`:

```typescript
// W parseUberCsv, parseBoltCsv, parseFreenowCsv:
if (!driverId) {
  // ... tworzenie nowego kierowcy ...
  
  // ZAWSZE zapisz do unmapped
  await supabase.from('unmapped_settlement_drivers').upsert({
    fleet_id: fleet_id || null,
    full_name: fullName,
    uber_id: platform === 'uber' ? platformId : null,
    bolt_id: platform === 'bolt' ? platformId : null,
    freenow_id: platform === 'freenow' ? platformId : null,
    status: 'pending',
    driver_id: driverId // <-- dodaj powiązanie z utworzonym kierowcą
  }, { onConflict: 'driver_id' });
}
```

### Faza 4: Dodać kolumnę `driver_id` do `unmapped_settlement_drivers`

**Migracja SQL:**

```sql
ALTER TABLE unmapped_settlement_drivers 
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

CREATE INDEX IF NOT EXISTS idx_unmapped_drivers_fleet_status 
ON unmapped_settlement_drivers(fleet_id, status);
```

### Faza 5: Opcjonalna Integracja AI (na przyszłość)

Jeśli fuzzy matching nie wystarczy, możemy dodać endpoint AI do weryfikacji:

```text
POST /functions/v1/ai-match-drivers
{
  "csv_names": ["Aneta Sknadaj", "Paweł Koziarek"],
  "existing_drivers": [
    {"id": "...", "name": "Aneta Skandaj"},
    {"id": "...", "name": "Paweł Koziołek"}
  ]
}

Response:
{
  "matches": [
    {"csv_name": "Aneta Sknadaj", "matched_id": "...", "confidence": 0.95},
    {"csv_name": "Paweł Koziarek", "matched_id": null, "confidence": 0.3}
  ]
}
```

To zostanie dodane później jako opcja "Użyj AI do dopasowania" w UI.

---

## Pliki do Modyfikacji

| Plik | Zmiana |
|------|--------|
| `src/components/FleetSettlementsView.tsx` | Filtrować kierowców bez danych z tabeli |
| `supabase/functions/settlements/index.ts` | Dodać fuzzy matching, poprawić zapis unmapped |
| SQL Migration | Dodać `driver_id` do `unmapped_settlement_drivers` |

---

## Efekt

1. **Brak "śmieciowych" wierszy** - kierowcy bez rozliczeń w okresie nie będą widoczni
2. **Lepsze dopasowywanie** - "Aneta Sknadaj" zostanie dopasowana do "Aneta Skandaj" (literówka)
3. **Działający przycisk "Sprawdź nowych"** - nowi kierowcy będą poprawnie zapisywani
4. **Gotowość na AI** - struktura przygotowana do integracji GPT/Gemini w przyszłości

**Szacowany czas: ~3-4h**

