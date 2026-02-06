
# Plan Naprawy Systemu Mapowania Kierowców

## Zdiagnozowane Problemy

### Problem 1: Parser Uber CSV nie łączy imienia z nazwiskiem

W pliku `supabase/functions/settlements/index.ts` (linia 669):
```javascript
const driverNameIdx = headers.findIndex(h => 
  h.includes('name') || h.includes('imię') || h.includes('imie') || h.includes('nazwisko')
);
```

Uber CSV ma **dwie osobne kolumny**:
- `imię kierowcy` (index 1)
- `nazwisko kierowcy` (index 2)

Parser znajduje tylko pierwszą (imię) i używa jej jako pełnego imienia - dlatego "Aneta" nie pasuje do "Aneta Sknadaj".

### Problem 2: Fuzzy matching nie ma danych o istniejących kierowcach

W `existingDriversMap` (linie 309-316) kierowcy są indeksowani tylko po:
- `phone:numer`
- `getrido:id`
- `uber:platform_id`
- `bolt:platform_id`
- `freenow:platform_id`

**Brak indeksowania po imieniu i nazwisku!** Dlatego fuzzy matching nie może znaleźć kierowcy "Aneta Sknadaj" - nie wie że taki istnieje.

### Problem 3: Flotowy nie może edytować Platform ID

W `DriverExpandedPanel.tsx` (linie 256-261), tryb `fleet` pokazuje tylko statyczny tekst:
```tsx
} else (
  platforms.map(platform => (
    <div key={platform} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
      <span className="text-sm font-medium uppercase w-20">{platform}:</span>
      <span className="text-sm">{getPlatformId(platform) || '—'}</span>
    </div>
  ))
)}
```

---

## Rozwiązanie

### Faza 1: Poprawka parsera Uber CSV

**Plik:** `supabase/functions/settlements/index.ts`

Zmienić detekcję kolumn imienia i nazwiska na osobne:

```typescript
// Znajdź osobne kolumny dla imienia i nazwiska
const firstNameIdx = headers.findIndex(h => 
  h.includes('imię') || h.includes('imie') || h.includes('first') || h === 'first_name'
);
const lastNameIdx = headers.findIndex(h => 
  h.includes('nazwisko') || h.includes('last') || h === 'last_name'
);

// Alternatywnie: pełne imię w jednej kolumnie
const fullNameIdx = headers.findIndex(h => 
  (h.includes('name') && !h.includes('first') && !h.includes('last')) ||
  h.includes('kierowca') ||
  h.includes('driver')
);

// W pętli parsowania:
let driverName = '';
if (firstNameIdx !== -1 && lastNameIdx !== -1) {
  // Uber format: osobne kolumny
  const firstName = row[firstNameIdx]?.trim() || '';
  const lastName = row[lastNameIdx]?.trim() || '';
  driverName = `${firstName} ${lastName}`.trim();
} else if (fullNameIdx !== -1) {
  // Bolt/FreeNow format: jedno pole
  driverName = row[fullNameIdx]?.trim() || '';
}
```

### Faza 2: Dodać kierowców do mapy po nazwisku (dla fuzzy matchingu)

**Plik:** `supabase/functions/settlements/index.ts`

Po linii 316, dodać indeksowanie po pełnym imieniu:

```typescript
existingDrivers?.forEach((driver: any) => {
  // Istniejące klucze...
  if (driver.phone) existingDriversMap.set(`phone:${driver.phone.trim()}`, driver);
  if (driver.getrido_id) existingDriversMap.set(`getrido:${driver.getrido_id.trim()}`, driver);
  if (Array.isArray(driver.driver_platform_ids)) {
    driver.driver_platform_ids.forEach((pid: any) => {
      existingDriversMap.set(`${pid.platform}:${pid.platform_id.trim()}`, driver);
    });
  }
  
  // NOWE: Dodaj też kierowcę pod kluczem nazwy (dla fuzzy matchingu)
  const fullName = `${driver.first_name || ''} ${driver.last_name || ''}`.trim().toLowerCase();
  if (fullName) {
    existingDriversMap.set(`name:${fullName}`, driver);
  }
});
```

### Faza 3: Umożliwić flotowemu edycję Platform ID

**Plik:** `src/components/DriverExpandedPanel.tsx`

Zmienić warunek na liniach 245-262:

```tsx
{/* ID Platform - edytowalne dla admina I flotowego */}
<div className="space-y-3">
  <h4 className="font-medium text-sm">ID Platform</h4>
  <div className="space-y-3">
    {platforms.map(platform => (
      <PlatformIdEditor
        key={platform}
        driverId={driver.id}
        platform={platform}
        currentId={getPlatformId(platform)}
        onUpdate={onUpdate}
      />
    ))}
  </div>
</div>
```

Usunąć warunek `mode === 'admin'` dla tej sekcji - flotowy też powinien móc uzupełnić ID.

### Faza 4: Poprawić zapis do unmapped_settlement_drivers

Problem: kierowcy którzy zostali dopasowani (matched) nie trafiają do `unmapped_settlement_drivers`, ale też ci którzy NIE zostali dopasowani, a dopasowanie zrobiło fuzzy match niskiej jakości.

Dodać logikę zapisu do `unmapped_settlement_drivers` dla każdego kierowcy który:
- Został utworzony jako nowy (newDrivers)
- LUB został dopasowany przez fuzzy z wynikiem < 70 (niskie zaufanie)

```typescript
// Po fuzzy match:
if (fuzzyResult.driver && fuzzyResult.score >= 50) {
  driverId = fuzzyResult.driver.id;
  matchedDrivers++;
  
  // Jeśli score < 70, zapisz też do unmapped dla weryfikacji
  if (fuzzyResult.score < 70) {
    unmappedDrivers.push({
      id: driverId,
      full_name: driverName,
      uber_id: platformId || null,
      match_type: fuzzyResult.matchType,
      match_score: fuzzyResult.score,
      matched_to: `${fuzzyResult.driver.first_name} ${fuzzyResult.driver.last_name}`
    });
  }
}
```

---

## Pliki do Modyfikacji

| Plik | Zmiana |
|------|--------|
| `supabase/functions/settlements/index.ts` | Poprawić parser Uber (osobne kolumny imię/nazwisko), dodać indeksowanie kierowców po nazwie |
| `src/components/DriverExpandedPanel.tsx` | Umożliwić flotowemu edycję Platform ID |

---

## Efekt

Po zmianach:
1. **Uber CSV** będzie poprawnie łączyć "Aneta" + "Sknadaj" → "Aneta Sknadaj"
2. **Fuzzy matching** znajdzie "Aneta Sknadaj" w bazie kierowców
3. **Flotowy** będzie mógł ręcznie uzupełnić Uber ID, Bolt ID, FreeNow ID dla swoich kierowców
4. **Przycisk "Sprawdź nowych"** pokaże kierowców z niskim wynikiem dopasowania do weryfikacji

**Szacowany czas: ~2-3h**
