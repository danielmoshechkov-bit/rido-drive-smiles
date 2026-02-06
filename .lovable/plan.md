# Plan Naprawy Systemu Mapowania Kierowców z CSV

## ✅ ZREALIZOWANO (2026-02-06)

### Problem 1: Kierowcy-"śmieci" widoczni w rozliczeniach ✅
**Rozwiązanie:** Dodano filtrowanie w `FleetSettlementsView.tsx` - kierowcy bez rozliczeń w wybranym okresie są teraz ukrywani:
```typescript
const filteredAggregated = aggregated.filter(row => 
  row.total_base > 0 || 
  row.has_negative_balance || 
  settlementsDriverIds.has(row.driver_id)
);
```

### Problem 2: Brak inteligentnego matchingu imion ✅
**Rozwiązanie:** Dodano `supabase/functions/settlements/fuzzyMatch.ts` z:
- `normalizePolishName()` - usuwa polskie znaki diakrytyczne
- `levenshtein()` - oblicza odległość edycyjną
- `fuzzyMatchDriver()` - scoring system:
  - 80 pkt: Dokładne dopasowanie po normalizacji
  - 70 pkt: Odwrócona kolejność ("Jan Kowalski" = "Kowalski Jan")
  - 60 pkt: Inicjały ("Jan K" ≈ "Jan Kowalski")
  - 50-55 pkt: Levenshtein distance ≤ 2

### Problem 3: Brak rekordów w `unmapped_settlement_drivers` ✅
**Rozwiązanie:** 
- Dodano kolumnę `driver_id` do tabeli `unmapped_settlement_drivers`
- ZAWSZE zapisujemy nowych kierowców do tabeli (nawet bez `fleet_id`)
- Upsert z `onConflict: 'driver_id'`

### Problem 4: Kierowcy nie byli dopasowywani po imieniu ✅
**Rozwiązanie:** Zaktualizowano `parseUberCsv`, `parseBoltCsv`, `parseFreenowCsv` i `findOrCreateDriver` w edge function `settlements` aby używały fuzzy matching.

---

## Zmiany w plikach

| Plik | Zmiana |
|------|--------|
| `src/components/FleetSettlementsView.tsx` | Filtrowanie kierowców bez danych |
| `supabase/functions/settlements/index.ts` | Import fuzzyMatch, użycie w parserach |
| `supabase/functions/settlements/fuzzyMatch.ts` | **NOWY** - funkcje fuzzy matching |
| SQL Migrations | `driver_id` w `unmapped_settlement_drivers` + unique constraint |

---

## Przyszłe ulepszenia (opcjonalne)

### Integracja AI do matchingu
Jeśli fuzzy matching nie wystarczy, można dodać endpoint AI:

```typescript
POST /functions/v1/ai-match-drivers
{
  "csv_names": ["Aneta Sknadaj", "Paweł Koziarek"],
  "existing_drivers": [...]
}
// Response: matches z confidence score
```

Przycisk "Użyj AI do dopasowania" w UI wywoływałby ten endpoint dla trudnych przypadków.
