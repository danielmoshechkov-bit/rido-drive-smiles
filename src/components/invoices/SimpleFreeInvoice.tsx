import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  Printer,
  Building2,
  User,
  FileText,
  Calculator
} from 'lucide-react';
import { 
  InvoiceItem, 
  InvoiceSeller, 
  InvoiceBuyer, 
  InvoiceData,
  calculateItemTotals,
  printInvoice,
  formatCurrency
} from '@/utils/invoiceHtmlGenerator';
import { format, addDays } from 'date-fns';

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];
const UNITS = ['szt.', 'usł.', 'godz.', 'km', 'kg', 'm²', 'm³', 'kpl.'];
const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Przelew' },
  { value: 'cash', label: 'Gotówka' },
  { value: 'card', label: 'Karta' }
];

export function SimpleFreeInvoice() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultDueDate = format(addDays(new Date(), 14), 'yyyy-MM-dd');
  
  // Invoice type
  const [invoiceType, setInvoiceType] = useState<'invoice' | 'proforma' | 'receipt'>('invoice');
  
  // Invoice details
  const [invoiceNumber, setInvoiceNumber] = useState(`FV/${format(new Date(), 'yyyy/MM')}/001`);
  const [issueDate, setIssueDate] = useState(today);
  const [saleDate, setSaleDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash' | 'card'>('transfer');
  const [notes, setNotes] = useState('');
  
  // Seller
  const [seller, setSeller] = useState<InvoiceSeller>({
    name: '',
    nip: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
    bank_name: '',
    bank_account: ''
  });
  
  // Buyer
  const [buyer, setBuyer] = useState<InvoiceBuyer>({
    name: '',
    nip: '',
    address_street: '',
    address_city: '',
    address_postal_code: ''
  });
  
  // Items
  const [items, setItems] = useState<InvoiceItem[]>([
    calculateItemTotals({ name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23' })
  ]);

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      updated[index] = calculateItemTotals(item);
      return updated;
    });
  };

  const addItem = () => {
    setItems(prev => [
      ...prev, 
      calculateItemTotals({ name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23' })
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Totals
  const netTotal = items.reduce((sum, item) => sum + item.net_amount, 0);
  const vatTotal = items.reduce((sum, item) => sum + item.vat_amount, 0);
  const grossTotal = items.reduce((sum, item) => sum + item.gross_amount, 0);

  const handleGeneratePdf = () => {
    // Validation
    if (!seller.name) {
      toast.error('Wprowadź nazwę sprzedawcy');
      return;
    }
    if (!buyer.name) {
      toast.error('Wprowadź nazwę nabywcy');
      return;
    }
    if (items.length === 0 || !items[0].name) {
      toast.error('Dodaj przynajmniej jedną pozycję');
      return;
    }

    const invoiceData: InvoiceData = {
      invoice_number: invoiceNumber,
      type: invoiceType,
      issue_date: issueDate,
      sale_date: saleDate,
      due_date: dueDate,
      payment_method: paymentMethod,
      notes,
      items,
      seller,
      buyer
    };

    printInvoice(invoiceData);
    toast.success('Faktura wygenerowana! Użyj "Drukuj jako PDF" w przeglądarce.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
          <Receipt className="h-7 w-7 text-primary" />
          Darmowy Generator Faktur
        </h1>
        <p className="text-muted-foreground mt-1">
          Bez rejestracji, bez logowania. Wygeneruj PDF w przeglądarce.
        </p>
      </div>

      {/* Invoice Type Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Typ dokumentu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button 
              variant={invoiceType === 'invoice' ? 'default' : 'outline'}
              onClick={() => setInvoiceType('invoice')}
              className="flex-1"
            >
              Faktura VAT
            </Button>
            <Button 
              variant={invoiceType === 'proforma' ? 'default' : 'outline'}
              onClick={() => setInvoiceType('proforma')}
              className="flex-1"
            >
              Proforma
            </Button>
            <Button 
              variant={invoiceType === 'receipt' ? 'default' : 'outline'}
              onClick={() => setInvoiceType('receipt')}
              className="flex-1"
            >
              Rachunek
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Seller Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Sprzedawca (Twoja firma)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nazwa firmy *</Label>
              <Input
                value={seller.name}
                onChange={(e) => setSeller(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nazwa firmy lub imię i nazwisko"
              />
            </div>
            <div>
              <Label>NIP</Label>
              <Input
                value={seller.nip}
                onChange={(e) => setSeller(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                placeholder="NIP (10 cyfr)"
                maxLength={10}
              />
            </div>
            <div>
              <Label>Ulica i numer</Label>
              <Input
                value={seller.address_street}
                onChange={(e) => setSeller(prev => ({ ...prev, address_street: e.target.value }))}
                placeholder="ul. Przykładowa 1"
              />
            </div>
            <div>
              <Label>Kod pocztowy</Label>
              <Input
                value={seller.address_postal_code}
                onChange={(e) => setSeller(prev => ({ ...prev, address_postal_code: e.target.value }))}
                placeholder="00-000"
              />
            </div>
            <div>
              <Label>Miasto</Label>
              <Input
                value={seller.address_city}
                onChange={(e) => setSeller(prev => ({ ...prev, address_city: e.target.value }))}
                placeholder="Miasto"
              />
            </div>
            <div>
              <Label>Nazwa banku</Label>
              <Input
                value={seller.bank_name}
                onChange={(e) => setSeller(prev => ({ ...prev, bank_name: e.target.value }))}
                placeholder="PKO BP, mBank, itp."
              />
            </div>
            <div>
              <Label>Numer konta</Label>
              <Input
                value={seller.bank_account}
                onChange={(e) => setSeller(prev => ({ ...prev, bank_account: e.target.value }))}
                placeholder="00 0000 0000 0000 0000 0000 0000"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Buyer Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" />
            Nabywca (Klient)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nazwa firmy / Imię i nazwisko *</Label>
              <Input
                value={buyer.name}
                onChange={(e) => setBuyer(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nazwa firmy lub imię i nazwisko klienta"
              />
            </div>
            <div>
              <Label>NIP</Label>
              <Input
                value={buyer.nip}
                onChange={(e) => setBuyer(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                placeholder="NIP (opcjonalnie)"
                maxLength={10}
              />
            </div>
            <div>
              <Label>Ulica i numer</Label>
              <Input
                value={buyer.address_street}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_street: e.target.value }))}
                placeholder="ul. Przykładowa 1"
              />
            </div>
            <div>
              <Label>Kod pocztowy</Label>
              <Input
                value={buyer.address_postal_code}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_postal_code: e.target.value }))}
                placeholder="00-000"
              />
            </div>
            <div>
              <Label>Miasto</Label>
              <Input
                value={buyer.address_city}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_city: e.target.value }))}
                placeholder="Miasto"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Dane faktury
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <Label>Numer faktury *</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="FV/2026/01/001"
              />
            </div>
            <div>
              <Label>Data wystawienia</Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Data sprzedaży</Label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Termin płatności</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Metoda płatności</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Pozycje faktury
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Pozycja {index + 1}</span>
                {items.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeItem(index)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-5">
                  <Label className="text-xs">Nazwa towaru/usługi *</Label>
                  <Input
                    value={item.name}
                    onChange={(e) => updateItem(index, 'name', e.target.value)}
                    placeholder="Nazwa pozycji"
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <Label className="text-xs">Ilość</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <Label className="text-xs">Jedn.</Label>
                  <Select value={item.unit} onValueChange={(v) => updateItem(index, 'unit', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Label className="text-xs">Cena netto</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_net_price}
                    onChange={(e) => updateItem(index, 'unit_net_price', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <Label className="text-xs">VAT %</Label>
                  <Select value={item.vat_rate} onValueChange={(v) => updateItem(index, 'vat_rate', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VAT_RATES.map(r => <SelectItem key={r} value={r}>{r}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Label className="text-xs">Brutto</Label>
                  <Input
                    value={formatCurrency(item.gross_amount)}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addItem} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Dodaj pozycję
          </Button>

          <Separator />

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Razem netto:</span>
                <span className="font-medium">{formatCurrency(netTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>VAT:</span>
                <span className="font-medium">{formatCurrency(vatTotal)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Do zapłaty:</span>
                <span className="text-primary">{formatCurrency(grossTotal)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Uwagi (opcjonalnie)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Dodatkowe uwagi na fakturze..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Generate Button */}
      <Button 
        onClick={handleGeneratePdf} 
        size="lg" 
        className="w-full gap-2"
      >
        <Printer className="h-5 w-5" />
        Generuj PDF (Drukuj)
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Faktura zostanie otwarta w nowym oknie. Wybierz "Zapisz jako PDF" w opcjach drukowania przeglądarki.
      </p>
    </div>
  );
}
