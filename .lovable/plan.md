

# Plan Naprawy - 4 Problemy UI/UX

## ANALIZA PROBLEMÓW

### 1. Zamiana kolejności: Najpierw taby, potem wyszukiwarka (foto 1)
**Problem:** Wyszukiwarka jest przed przyciskami "Aktywne", "Do podpisu", "Zakończone". Użytkownik chce odwrotnie: taby najpierw, wyszukiwarka za nimi. Dodatkowo wyszukiwarka jest zbyt szeroka.

**Plik:** `src/components/fleet/FleetRentalsTab.tsx` (linie 245-270)

**Rozwiązanie:**
- Zamienić kolejność elementów w `flex`
- Zmniejszyć szerokość wyszukiwarki: dodać `max-w-xs` lub `max-w-[200px]`

```tsx
<div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
  {/* Sub-tabs FIRST */}
  <div className="flex gap-1 bg-muted rounded-lg p-1">
    {subTabs.map(tab => (...))}
  </div>
  
  {/* Search SECOND - smaller */}
  <div className="relative max-w-[200px] sm:max-w-xs">
    <Search className="..." />
    <Input placeholder="Szukaj..." className="pl-10" />
  </div>
</div>
```

---

### 2. Ramka umowy nie dopasowana (foto 2 + foto 4)
**Problem:** Dialog z umową ("Rental Edit Flow Dialog") jest za mały i nie mieści zawartości. Modal nie jest dobrze dopasowany do ekranu.

**Plik:** `src/components/fleet/FleetRentalsTab.tsx` (linie 400-422) i `RentalContractSignatureFlow.tsx`

**Obecne:**
```tsx
<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-4 md:p-6">
```

**Rozwiązanie:**
- Zmienić `max-w-3xl` na `max-w-4xl` lub `max-w-5xl`
- Zwiększyć `max-h-[85vh]` na `max-h-[90vh]`
- Dodać responsywną szerokość: `w-[95vw] sm:w-auto`

---

### 3. Układ podpisów i sekcji umowy (foto 3 + PDF wzór)
**Problem:**
- Podpisy są jeden pod drugim zamiast obok siebie
- §12 i inne sekcje są wyrównane do lewej zamiast wyśrodkowane
- Wzór PDF pokazuje: NAJPIERW Wynajmujący na górze, Najemca na dole
- Brak opcji pieczątki floty

**Plik:** `src/utils/rentalContractGenerator.ts`

**Obecny układ podpisów (linie 359-388):**
```tsx
<div class="signatures">
  <div class="signature">Najemca</div>
  <div class="signature">Wynajmujący</div>
</div>
```

**Docelowy układ (wg PDF):**
```
Wynajmujący (na górze)
[pieczątka] [podpis]

Najemca (poniżej)
[podpis]
```

**Zmiany w CSS:**
- Sekcje `section-title` wyrównać do środka: `text-align: center`
- Zmienić układ podpisów z `flex` obok siebie na PIONOWY układ jak w PDF
- Dodać miejsce na pieczątkę floty (opcjonalne)

**Dodać pieczątki w `FleetContractSettings.tsx`:**
- Nowa sekcja "Pieczątka floty" pod "Podpis floty"
- Upload obrazka pieczątki do tabeli `fleet_signatures` (nowa kolumna `stamp_url`)
- Wyświetlać pieczątki na umowie obok podpisu

---

### 4. Akcje w tabeli - więcej opcji (foto 5)
**Problem:** Obecnie tylko ikona oka (Eye). Potrzebne są:
- Podgląd
- Wydrukuj
- Zakończ
- Pobierz PDF
- Wyślij do klienta

**Plik:** `src/components/fleet/FleetRentalsTab.tsx` (linie 359-386)

**Rozwiązanie:**
Zastąpić pojedynczy przycisk dropdown menu z akcjami:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button size="sm" variant="ghost">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => openContractPreview(rental)}>
      <Eye className="h-4 w-4 mr-2" /> Podgląd
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => printContract(rental)}>
      <Printer className="h-4 w-4 mr-2" /> Wydrukuj
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => downloadContract(rental)}>
      <Download className="h-4 w-4 mr-2" /> Pobierz PDF
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => sendToClient(rental)}>
      <Send className="h-4 w-4 mr-2" /> Wyślij do klienta
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem 
      onClick={() => endContract(rental)}
      className="text-destructive"
    >
      <XCircle className="h-4 w-4 mr-2" /> Zakończ umowę
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## PLIKI DO MODYFIKACJI

| Plik | Zmiana |
|------|--------|
| `src/components/fleet/FleetRentalsTab.tsx` | 1) Zamiana kolejności: taby przed szukajką, 2) Mniejsza szukajka, 3) Większy dialog, 4) Dropdown z akcjami |
| `src/utils/rentalContractGenerator.ts` | 1) Sekcje wyśrodkowane, 2) Podpisy pionowo (Wynajmujący góra, Najemca dół), 3) Miejsce na pieczątkę |
| `src/components/fleet/FleetContractSettings.tsx` | Dodać upload pieczątki floty |
| `supabase/migrations/NEW.sql` | Dodać kolumnę `stamp_url` do `fleet_signatures` |

---

## SZCZEGÓŁY TECHNICZNE

### FleetRentalsTab.tsx - zmiana kolejności i rozmiar szukajki

**Linie 245-270:**
```tsx
<div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
  {/* Sub-tabs FIRST */}
  <div className="flex gap-1 bg-muted rounded-lg p-1 shrink-0">
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
  
  {/* Search SECOND - smaller width */}
  <div className="relative w-full sm:max-w-[200px]">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
    <Input
      placeholder="Szukaj..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      className="pl-10"
    />
  </div>
</div>
```

### FleetRentalsTab.tsx - większy dialog

**Linia 405:**
```tsx
// PRZED:
<DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-4 md:p-6">

// PO:
<DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
```

### FleetRentalsTab.tsx - dropdown z akcjami

Dodać importy:
```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Printer, XCircle } from "lucide-react";
```

Zmienić linie 359-386 (akcje w TableCell) na dropdown.

### rentalContractGenerator.ts - sekcje wyśrodkowane + nowy układ podpisów

**CSS (linie 110-115):**
```css
.section-title { 
  font-size: 12pt; 
  font-weight: bold; 
  margin-bottom: 10px;
  text-decoration: underline;
  text-align: center;  /* DODANE - wyśrodkowanie */
}
```

**Podpisy (linie 359-388) - nowy układ pionowy:**
```html
<!-- LESSOR/LANDLORD FIRST (Wynajmujący) -->
<div class="signature-block" style="margin-bottom: 40px; text-align: center;">
  <div style="display: flex; justify-content: center; gap: 40px; align-items: flex-end;">
    ${data.fleetStampUrl ? `
      <div style="text-align: center;">
        <img src="${data.fleetStampUrl}" style="max-width: 80px; max-height: 80px;" alt="Pieczątka" />
        <div style="font-size: 9pt; margin-top: 5px;">Pieczątka</div>
      </div>
    ` : ''}
    <div style="text-align: center;">
      ${data.fleetSignatureUrl 
        ? `<img src="${data.fleetSignatureUrl}" class="signature-img" alt="Podpis Wynajmującego" />`
        : '<div style="height: 60px;"></div>'
      }
      <div class="signature-line">
        Podpis Wynajmującego<br>
        ${data.fleetName}
      </div>
      ${data.fleetSignedAt 
        ? `<div class="signature-date">Podpisano: ${format(new Date(data.fleetSignedAt), "d.MM.yyyy HH:mm")}</div>`
        : ''
      }
    </div>
  </div>
</div>

<!-- TENANT SECOND (Najemca) -->
<div class="signature-block" style="text-align: center;">
  ${data.driverSignatureUrl 
    ? `<img src="${data.driverSignatureUrl}" class="signature-img" alt="Podpis Najemcy" />`
    : '<div style="height: 60px;"></div>'
  }
  <div class="signature-line">
    Podpis Najemcy<br>
    ${data.driverFirstName} ${data.driverLastName}
  </div>
  ${data.driverSignedAt 
    ? `<div class="signature-date">Podpisano: ${format(new Date(data.driverSignedAt), "d.MM.yyyy HH:mm")}</div>`
    : ''
  }
</div>
```

### ContractData interface - dodać pole dla pieczątki

```tsx
export interface ContractData {
  // ... existing fields ...
  fleetStampUrl?: string;  // NOWE POLE
}
```

### FleetContractSettings.tsx - dodać upload pieczątki

Dodać drugą kartę pod kartą podpisu:
```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Stamp className="h-5 w-5" />
      Pieczątka floty
    </CardTitle>
    <CardDescription>
      Opcjonalna pieczątka wyświetlana na umowach obok podpisu
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Upload / Preview podobny do podpisu */}
  </CardContent>
</Card>
```

### Migracja SQL

```sql
-- Add stamp_url column to fleet_signatures
ALTER TABLE fleet_signatures ADD COLUMN IF NOT EXISTS stamp_url TEXT;
```

---

## KOLEJNOŚĆ WDROŻENIA

1. **SQL Migration** - dodać kolumnę `stamp_url`
2. **FleetRentalsTab.tsx** - zamiana kolejności taby/szukajka + rozmiar + dialog + dropdown akcje
3. **rentalContractGenerator.ts** - wyśrodkowanie sekcji + nowy układ podpisów z miejscem na pieczątkę
4. **FleetContractSettings.tsx** - dodać upload pieczątki
5. **RentalContractSignatureFlow.tsx** - przekazać `fleetStampUrl` do generatora

---

## PODSUMOWANIE

| Problem | Rozwiązanie |
|---------|-------------|
| Kolejność: szukajka przed tabami | Zamienić miejscami w JSX |
| Szukajka za duża | Dodać `max-w-[200px]` |
| Dialog nie dopasowany | Zwiększyć do `max-w-5xl`, `w-[95vw]` |
| Podpisy nie obok siebie | Zmienić na układ pionowy: Wynajmujący góra, Najemca dół |
| Sekcje nie wyśrodkowane | Dodać `text-align: center` do `.section-title` |
| Brak pieczątki | Dodać upload w ustawieniach + pole w generatorze |
| Tylko jedna akcja w tabeli | Dropdown z: Podgląd, Wydrukuj, Pobierz, Wyślij, Zakończ |

