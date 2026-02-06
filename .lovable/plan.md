
# Plan Naprawy 3 Problemów UI/UX

## Podsumowanie Problemów

Na podstawie analizy kodu i zrzutów ekranu zidentyfikowano 3 problemy:

1. **Kafelki na stronie głównej (foto 1) nie wyglądają jak kafelki usług (foto 2)** - różne proporcje i wysokości
2. **Brak możliwości wyłączenia konta firmowego** - użytkownik nie może przełączyć konta firmowego na prywatne
3. **Sekcja "Ostatnie faktury" wymaga filtrów** - brakuje wyboru rok/miesiąc i przełącznika dla autofaktur B2B

---

## Problem 1: Ujednolicenie Kafelków - Strona Główna vs Usługi

### Analiza

Porównanie aktualnych stylów:

**EasyHub.tsx (strona główna):**
- Wysokość: `h-36 md:h-44`
- Padding: `p-4 md:p-5`
- Grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`

**ServiceCategoryTile.tsx (usługi):**
- Wysokość: `h-28 md:h-36`
- Padding: `p-3 md:p-4`
- Grid w ServicesMarketplace: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

**Problem:** Kafelki na stronie głównej są wyższe i mają większy padding niż kafelki usług. Użytkownik chce odwrotnie - kafelki główne mają wyglądać jak prostokątne kafelki usług.

### Rozwiązanie

**Plik:** `src/pages/EasyHub.tsx`

1. Zmienić layout grid na 3 kolumny (jak usługi):
```tsx
// PRZED:
grid-cols-2 md:grid-cols-3 lg:grid-cols-4

// PO:
grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
```

2. Zmienić wysokość kafelków w MarketplaceTileCard (dopasować do ServiceCategoryTile):
```tsx
// PRZED (linia 230):
<CardContent className="relative z-10 p-4 md:p-5 h-36 md:h-44 flex flex-col justify-end">

// PO (identyczne jak ServiceCategoryTile):
<CardContent className="relative z-10 p-3 md:p-4 h-28 md:h-36 flex flex-col justify-end">
```

3. Dopasować font-size tekstu:
```tsx
// PRZED:
"font-bold text-sm md:text-base leading-tight"

// PO (identyczne jak ServiceCategoryTile):
"font-bold text-sm md:text-base text-white leading-tight"
```

---

## Problem 2: Przełączanie Konta Firmowego na Prywatne

### Analiza

Obecnie w sekcji "Moja firma" (ClientPortal.tsx linie 1098-1177):
- Można dodać firmę
- Można edytować dane firmy
- NIE MA opcji wyłączenia/dezaktywacji konta firmowego

### Logika Biznesowa

Gdy użytkownik przełącza konto firmowe na prywatne:
1. **Utrata dostępu do wystawiania faktur** - przycisk "Wystaw fakturę" znika
2. **Zachowanie historii faktur** - użytkownik nadal widzi poprzednie faktury (tylko do odczytu)
3. **Dla kierowców B2B** - zmiana `payment_method` z `b2b` na `transfer`, co powoduje:
   - Pobieranie VAT od kierowcy
   - Brak autofakturowania
   - Widok starych autofaktur tylko do pobrania (read-only)

### Rozwiązanie

**Plik:** `src/pages/ClientPortal.tsx`

1. Dodać pole `is_active` do obsługi encji firmy lub użyć istniejącej logiki usuwania
2. Dodać przycisk "Wyłącz konto firmowe" w sekcji "Moja firma":

```tsx
// W sekcji każdej firmy (linie 1112-1139) dodać:
<Button
  variant="ghost"
  size="sm"
  className="text-destructive hover:text-destructive"
  onClick={() => handleDeactivateCompany(entity.id)}
>
  Wyłącz konto firmowe
</Button>
```

3. Dodać funkcję `handleDeactivateCompany`:

```tsx
const handleDeactivateCompany = async (entityId: string) => {
  // Potwierdzenie
  if (!confirm('Czy na pewno chcesz wyłączyć konto firmowe? Stracisz możliwość wystawiania faktur, ale zachowasz dostęp do historii.')) {
    return;
  }
  
  try {
    // Soft delete - ustawić is_active = false zamiast usuwać
    const { error } = await supabase
      .from('entities')
      .update({ is_active: false })
      .eq('id', entityId);
    
    if (error) throw error;
    
    // Jeśli użytkownik jest kierowcą B2B, zmienić payment_method
    if (driverId) {
      await supabase
        .from('drivers')
        .update({ payment_method: 'transfer' })
        .eq('id', driverId);
    }
    
    // Odświeżyć dane
    fetchUserEntities(user.id);
    toast.success('Konto firmowe zostało wyłączone');
  } catch (error) {
    toast.error('Nie udało się wyłączyć konta firmowego');
  }
};
```

4. Zmienić logikę `hasCompanySetup` aby uwzględniać `is_active`:

```tsx
// PRZED:
const hasCompanySetup = userEntities.length > 0;

// PO:
const activeEntities = userEntities.filter(e => e.is_active !== false);
const hasCompanySetup = activeEntities.length > 0;
```

5. Zachować widok historii faktur dla użytkowników bez aktywnej firmy (read-only):

```tsx
// W zakładce księgowość dodać warunek:
{!hasCompanySetup && userEntities.length > 0 && (
  <Card className="border-amber-200 bg-amber-50">
    <CardContent className="pt-4">
      <p className="text-sm text-amber-800">
        Twoje konto firmowe jest wyłączone. Możesz przeglądać historię faktur, ale nie możesz wystawiać nowych.
      </p>
      <Button 
        variant="outline" 
        size="sm" 
        className="mt-2"
        onClick={() => handleReactivateCompany(userEntities[0].id)}
      >
        Włącz ponownie konto firmowe
      </Button>
    </CardContent>
  </Card>
)}
```

### Migracja SQL

Dodać kolumnę `is_active` do tabeli `entities`:

```sql
ALTER TABLE entities 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
```

---

## Problem 3: Filtry w Sekcji "Ostatnie Faktury"

### Analiza

Obecna sekcja "Ostatnie faktury" (ClientPortal.tsx linie 993-1033):
- Pokazuje 5 ostatnich faktur
- Brak filtrów rok/miesiąc
- Brak rozróżnienia między wystawionymi i autofakturami

### Rozwiązanie

**Plik:** `src/pages/ClientPortal.tsx`

1. Dodać stany dla filtrów:

```tsx
// Dodać na początku komponentu:
const [invoiceYear, setInvoiceYear] = useState(new Date().getFullYear());
const [invoiceMonth, setInvoiceMonth] = useState(new Date().getMonth() + 1);
const [invoiceViewMode, setInvoiceViewMode] = useState<'manual' | 'auto'>('manual');
const [autoInvoices, setAutoInvoices] = useState<any[]>([]);
```

2. Dodać UI filtrów nad listą faktur:

```tsx
<CardHeader>
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <CardTitle>Ostatnie faktury</CardTitle>
      <CardDescription>Najnowsze dokumenty sprzedażowe</CardDescription>
    </div>
    
    {/* Filtry rok/miesiąc */}
    <div className="flex items-center gap-2">
      <Select value={invoiceMonth.toString()} onValueChange={(v) => setInvoiceMonth(parseInt(v))}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Miesiąc" />
        </SelectTrigger>
        <SelectContent>
          {[...Array(12)].map((_, i) => (
            <SelectItem key={i+1} value={(i+1).toString()}>
              {format(new Date(2000, i, 1), 'LLLL', { locale: pl })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Select value={invoiceYear.toString()} onValueChange={(v) => setInvoiceYear(parseInt(v))}>
        <SelectTrigger className="w-24">
          <SelectValue placeholder="Rok" />
        </SelectTrigger>
        <SelectContent>
          {[2024, 2025, 2026].map(year => (
            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
  
  {/* Przełącznik dla kierowców B2B */}
  {isDriverAccount && driverPaymentMethod === 'b2b' && (
    <div className="flex gap-2 mt-4">
      <Button 
        variant={invoiceViewMode === 'manual' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setInvoiceViewMode('manual')}
      >
        Wystawione
      </Button>
      <Button 
        variant={invoiceViewMode === 'auto' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setInvoiceViewMode('auto')}
      >
        Autofaktury
      </Button>
    </div>
  )}
</CardHeader>
```

3. Dodać funkcję pobierania autofaktur:

```tsx
const fetchAutoInvoices = async (driverId: string, year: number, month: number) => {
  const { data } = await supabase
    .from('driver_auto_invoices') // lub odpowiednia tabela
    .select('*')
    .eq('driver_id', driverId)
    .eq('invoice_year', year)
    .eq('invoice_month', month)
    .order('created_at', { ascending: false });
  
  setAutoInvoices(data || []);
};
```

4. Filtrowanie faktur po roku/miesiącu:

```tsx
const filteredInvoices = useMemo(() => {
  return invoices.filter(inv => {
    const invDate = new Date(inv.issue_date);
    return invDate.getFullYear() === invoiceYear && 
           (invDate.getMonth() + 1) === invoiceMonth;
  });
}, [invoices, invoiceYear, invoiceMonth]);
```

5. Wyświetlanie autofaktur (read-only):

```tsx
{invoiceViewMode === 'auto' && (
  <div className="space-y-3">
    {autoInvoices.map((invoice) => (
      <div 
        key={invoice.id}
        className="border rounded-lg p-4 flex items-center justify-between"
      >
        <div>
          <p className="font-semibold">{invoice.invoice_number}</p>
          <p className="text-sm text-muted-foreground">
            {format(new Date(invoice.created_at), 'dd.MM.yyyy')} - 
            {formatCurrency(invoice.amount)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadAutoInvoice(invoice.id)}>
          <Download className="h-4 w-4 mr-1" />
          Pobierz
        </Button>
      </div>
    ))}
    {autoInvoices.length === 0 && (
      <p className="text-center text-muted-foreground py-8">
        Brak autofaktur w wybranym okresie
      </p>
    )}
  </div>
)}
```

---

## Podsumowanie Plików do Modyfikacji

| Problem | Plik | Zmiana |
|---------|------|--------|
| 1. Kafelki | `src/pages/EasyHub.tsx` | Zmienić grid na 3 kolumny, wysokość h-28 md:h-36 |
| 2. Wyłączanie firmy | `src/pages/ClientPortal.tsx` | Dodać przycisk i logikę dezaktywacji |
| 2. Wyłączanie firmy | SQL migration | Dodać kolumnę `is_active` do `entities` |
| 3. Filtry faktur | `src/pages/ClientPortal.tsx` | Dodać Select rok/miesiąc + przełącznik autofaktur |

---

## Kolejność Wdrożenia

1. **Faza 1** - Migracja SQL (dodanie `is_active` do entities)
2. **Faza 2** - Ujednolicenie kafelków (EasyHub.tsx)
3. **Faza 3** - Logika wyłączania konta firmowego (ClientPortal.tsx)
4. **Faza 4** - Filtry faktur i przełącznik autofaktur (ClientPortal.tsx)

**Szacowany czas: ~3h**
