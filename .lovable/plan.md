
# Plan: Implementacja brakujących funkcji

## Przegląd brakujących elementów

Na podstawie analizy kodu zidentyfikowałem następujące niedokończone funkcjonalności:

### 1. Email & Przypomnienia (InvoiceExpandableRow.tsx)
**Stan:** Placeholdery `toast.info('Funkcja będzie dostępna wkrótce')`
**Dotyczy:** linie 219-227 i 412-420

### 2. Edycja faktury
**Stan:** Przycisk "Edytuj" pokazuje toast zamiast otwierać formularz edycji
**Dotyczy:** linia 229-232

### 3. Panel zarządzania AI PRO dla accounting_admin
**Stan:** Brak komponentu AIProManagement w AccountingDashboard
**Dotyczy:** Nowy komponent do utworzenia

### 4. Integracja Inventory-Sales (typeahead + marża)
**Stan:** SimpleFreeInvoice nie pobiera produktów z magazynu
**Dotyczy:** Brak integracji z inventory_products

---

## Rozwiązanie

### Krok 1: Email i przypomnienia

**Plik:** `src/components/invoices/InvoiceExpandableRow.tsx`

Zmienię funkcje `handleSendEmail` i `handleSetReminder`:

```typescript
// handleSendEmail - otwórz dialog z polem email
const [showEmailDialog, setShowEmailDialog] = useState(false);
const [emailAddress, setEmailAddress] = useState('');
const [sendingEmail, setSendingEmail] = useState(false);

const handleSendEmail = async () => {
  if (!emailAddress) {
    setShowEmailDialog(true);
    return;
  }
  
  setSendingEmail(true);
  // Wywołaj edge function send-invoice-email
  const { error } = await supabase.functions.invoke('send-invoice-email', {
    body: { invoiceId: invoice.id, recipientEmail: emailAddress }
  });
  
  if (error) {
    toast.error('Błąd wysyłania email');
  } else {
    toast.success(`Faktura wysłana na ${emailAddress}`);
    setShowEmailDialog(false);
  }
  setSendingEmail(false);
};

// handleSetReminder - zapisz reminder w bazie
const handleSetReminder = async () => {
  if (!invoice.due_date) {
    toast.error('Faktura nie ma terminu płatności');
    return;
  }
  
  // Zapisz reminder 3 dni przed terminem
  const reminderDate = new Date(invoice.due_date);
  reminderDate.setDate(reminderDate.getDate() - 3);
  
  toast.success(`Przypomnienie ustawione na ${format(reminderDate, 'd MMM yyyy', { locale: pl })}`);
};
```

**Nowy Dialog:** Dodam dialog email w komponencie z Input i przyciskiem Wyślij.

---

### Krok 2: Edycja faktury

**Pliki:**
- `src/components/invoices/InvoiceExpandableRow.tsx` 
- `src/components/invoices/InvoiceEditDialog.tsx` (NOWY)

**Logika:**
1. Przycisk "Edytuj" otwiera Dialog z formularzem
2. Formularz ładuje dane faktury z `user_invoices` + `user_invoice_items`
3. Po zapisaniu aktualizuje rekord i odświeża listę

```typescript
// InvoiceEditDialog.tsx - nowy komponent
interface InvoiceEditDialogProps {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

// Ładuje dane faktury i pozwala edytować:
// - buyer_name, buyer_nip, buyer_address
// - due_date (przedłużenie terminu)
// - notes
// - items (nazwa, ilość, cena, VAT)
```

---

### Krok 3: Panel AI PRO w AccountingDashboard

**Nowy plik:** `src/components/admin/AIProManagementPanel.tsx`

**Funkcjonalność:**
1. Wyszukiwarka firm (entities) z filtrem
2. Status AI PRO per firma (disabled/trial/active)
3. Możliwość ręcznego włączenia/wyłączenia
4. Zarządzanie exemptions (dodaj email, scope, valid_until)
5. Logi ai_jobs z filtrami

```typescript
// Struktura komponentu
function AIProManagementPanel() {
  // Tabs: "Subskrypcje" | "Wykluczenia" | "Logi AI"
  
  // Tab Subskrypcje:
  // - Lista firm z dropdownem status
  // - Przycisk "Aktywuj" / "Dezaktywuj"
  
  // Tab Wykluczenia:
  // - Tabela: email, scope, valid_until, note
  // - Przycisk "Dodaj wykluczenie" -> Dialog z formularzem
  
  // Tab Logi AI:
  // - Filtr: firma, user, job_type, status
  // - Lista ai_jobs z paginacją
}
```

**Integracja:** Dodanie zakładki w `AccountingDashboard.tsx`:

```typescript
// W TabsList
<TabsTrigger value="ai-pro">AI PRO</TabsTrigger>

// W TabsContent
<TabsContent value="ai-pro">
  <AIProManagementPanel />
</TabsContent>
```

---

### Krok 4: Integracja Inventory-Sales

**Plik:** `src/components/invoices/SimpleFreeInvoice.tsx`

**Zmiany:**

1. **Typeahead produktów:**
```typescript
// Hook do pobierania produktów
const { products } = useInventoryProducts(entityId);

// W polu nazwy pozycji - Combobox z wyszukiwarką
<Popover>
  <PopoverTrigger asChild>
    <Input 
      value={item.name}
      onChange={(e) => {
        updateItem(index, 'name', e.target.value);
        setProductSearch(e.target.value);
      }}
      placeholder="Wpisz nazwę produktu..."
    />
  </PopoverTrigger>
  <PopoverContent>
    {filteredProducts.map(product => (
      <div onClick={() => selectProduct(index, product)}>
        {product.name_sales} - {product.default_sale_price_net} zł
      </div>
    ))}
  </PopoverContent>
</Popover>
```

2. **Auto-fill po wyborze:**
```typescript
const selectProduct = (index: number, product: InventoryProduct) => {
  updateItem(index, 'name', product.name_sales);
  updateItem(index, 'unit_net_price', product.default_sale_price_net);
  updateItem(index, 'vat_rate', product.vat_rate);
  updateItem(index, 'unit', product.unit);
  // Zapisz product_id do pozycji (dla marży)
};
```

3. **Ostrzeżenie marży:**
```typescript
// Po każdej zmianie ceny sprawdź:
const checkMargin = async (productId: string, salePrice: number) => {
  const avgCost = await supabase.rpc('get_product_avg_cost', { p_product_id: productId });
  if (salePrice < avgCost) {
    toast.warning(`Uwaga: sprzedajesz poniżej kosztu! Koszt: ${avgCost} zł`);
  }
};
```

4. **Marża w InvoiceExpandableRow:**
```typescript
// Pobierz koszty produktów z inventory_batches
const calculateMargin = async () => {
  const { data: items } = await supabase
    .from('user_invoice_items')
    .select('*, inventory_product_id')
    .eq('invoice_id', invoice.id);
  
  let totalCost = 0;
  for (const item of items) {
    if (item.inventory_product_id) {
      const cost = await supabase.rpc('get_product_avg_cost', { p_product_id: item.inventory_product_id });
      totalCost += cost * item.quantity;
    }
  }
  
  return {
    revenue: invoice.net_total,
    cost: totalCost,
    profit: invoice.net_total - totalCost,
    margin: ((invoice.net_total - totalCost) / invoice.net_total) * 100
  };
};
```

---

### Krok 5: Edge Function dla emaili

**Nowy plik:** `supabase/functions/send-invoice-email/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

serve(async (req) => {
  const { invoiceId, recipientEmail } = await req.json();
  
  // Pobierz dane faktury
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const { data: invoice } = await supabase
    .from('user_invoices')
    .select('*, user_invoice_companies(*)')
    .eq('id', invoiceId)
    .single();
  
  // Wyślij email z PDF załącznikiem
  await resend.emails.send({
    from: 'faktury@getrido.pl',
    to: recipientEmail,
    subject: `Faktura ${invoice.invoice_number}`,
    html: `<p>W załączniku faktura ${invoice.invoice_number}...</p>`
  });
  
  return new Response(JSON.stringify({ success: true }));
});
```

---

### Krok 6: Migracja DB - inventory_product_id w user_invoice_items

```sql
ALTER TABLE public.user_invoice_items 
ADD COLUMN IF NOT EXISTS inventory_product_id UUID REFERENCES inventory_products(id);
```

---

## Pliki do utworzenia/modyfikacji

| Plik | Akcja |
|------|-------|
| `src/components/invoices/InvoiceExpandableRow.tsx` | Modyfikacja - email dialog, reminder, margin |
| `src/components/invoices/InvoiceEditDialog.tsx` | NOWY - formularz edycji faktury |
| `src/components/admin/AIProManagementPanel.tsx` | NOWY - panel zarządzania AI PRO |
| `src/pages/AccountingDashboard.tsx` | Modyfikacja - dodaj tab AI PRO |
| `src/components/invoices/SimpleFreeInvoice.tsx` | Modyfikacja - typeahead produktów |
| `supabase/functions/send-invoice-email/index.ts` | NOWY - wysyłka emaili |
| `supabase/migrations/xxx.sql` | NOWY - inventory_product_id w items |

---

## Kolejność implementacji

1. **Migracja DB** - dodaj kolumnę inventory_product_id
2. **InvoiceEditDialog** - nowy komponent edycji
3. **InvoiceExpandableRow** - email, reminder, edycja, marża
4. **SimpleFreeInvoice** - typeahead produktów z magazynu
5. **AIProManagementPanel** - panel zarządzania
6. **AccountingDashboard** - integracja panelu AI PRO
7. **Edge function** - wysyłka emaili

---

## Testy walidacyjne

Po implementacji każdej fazy:
1. Sprawdzenie czy faktury się ładują poprawnie
2. Test edycji faktury (zapisanie zmian)
3. Test wysyłki email (mock lub real)
4. Test typeahead produktów z magazynu
5. Test wyświetlania marży
6. Test panelu AI PRO (dodanie exemption, zmiana statusu)
