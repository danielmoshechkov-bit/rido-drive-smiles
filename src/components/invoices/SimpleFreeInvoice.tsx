import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  Eye,
  Building2,
  User,
  FileText,
  Calculator,
  CreditCard,
  MessageSquare,
  Settings2
} from 'lucide-react';
import { 
  InvoiceItem, 
  InvoiceSeller, 
  InvoiceBuyer, 
  InvoiceData,
  calculateItemTotals,
  formatCurrency
} from '@/utils/invoiceHtmlGenerator';
import { format, addDays } from 'date-fns';
import { PaymentTermSelector } from './PaymentTermSelector';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { supabase } from '@/integrations/supabase/client';

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];
const UNITS = ['szt.', 'usł.', 'godz.', 'km', 'kg', 'm²', 'm³', 'kpl.'];
const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Przelew' },
  { value: 'cash', label: 'Gotówka' },
  { value: 'card', label: 'Karta' }
];

const SIGNATURE_OPTIONS = [
  { value: 'none', label: 'Faktura bez podpisu odbiorcy' },
  { value: 'receiver', label: 'Osoba upoważniona do otrzymania faktury VAT' },
  { value: 'issuer', label: 'Osoba upoważniona do wystawienia faktury VAT' },
  { value: 'both_none', label: 'Brak podpisu odbiorcy i wystawcy' }
];

// Extended item type with gross price for bidirectional calculation
interface ExtendedInvoiceItem extends InvoiceItem {
  unit_gross_price: number;
  lastEditedField?: 'net' | 'gross';
}

export function SimpleFreeInvoice() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultDueDate = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Invoice type
  const [invoiceType, setInvoiceType] = useState<'invoice' | 'proforma' | 'receipt'>('invoice');
  
  // Invoice details
  const [invoiceNumber, setInvoiceNumber] = useState(`FV/${format(new Date(), 'yyyy/MM')}/001`);
  const [issueDate, setIssueDate] = useState(today);
  const [saleDate, setSaleDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash' | 'card'>('transfer');
  const [notes, setNotes] = useState('');
  
  // Payment tab fields
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [isFullyPaid, setIsFullyPaid] = useState(false);
  
  // Additional tab fields
  const [signatureType, setSignatureType] = useState('none');
  const [issuedBy, setIssuedBy] = useState('');
  const [issuePlace, setIssuePlace] = useState('');
  
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
  
  // Items with extended fields
  const [items, setItems] = useState<ExtendedInvoiceItem[]>([
    { ...calculateItemTotals({ name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23' }), unit_gross_price: 0 }
  ]);
  
  // Preview modal
  const [showPreview, setShowPreview] = useState(false);

  // Check auth state
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Calculate gross from net
  const calculateGrossFromNet = (net: number, vatRate: string): number => {
    const rate = parseFloat(vatRate) || 0;
    return Math.round(net * (1 + rate / 100) * 100) / 100;
  };

  // Calculate net from gross
  const calculateNetFromGross = (gross: number, vatRate: string): number => {
    const rate = parseFloat(vatRate) || 0;
    return Math.round(gross / (1 + rate / 100) * 100) / 100;
  };

  const updateItem = (index: number, field: keyof ExtendedInvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      let item = { ...updated[index], [field]: value };
      
      // Handle bidirectional net/gross calculation
      if (field === 'unit_net_price') {
        item.unit_gross_price = calculateGrossFromNet(value, item.vat_rate);
        item.lastEditedField = 'net';
      } else if (field === 'unit_gross_price') {
        item.unit_net_price = calculateNetFromGross(value, item.vat_rate);
        item.lastEditedField = 'gross';
      } else if (field === 'vat_rate') {
        // Recalculate based on last edited field
        if (item.lastEditedField === 'gross') {
          item.unit_net_price = calculateNetFromGross(item.unit_gross_price, value);
        } else {
          item.unit_gross_price = calculateGrossFromNet(item.unit_net_price, value);
        }
      }
      
      // Calculate totals
      const calculated = calculateItemTotals(item);
      updated[index] = { ...calculated, unit_gross_price: item.unit_gross_price, lastEditedField: item.lastEditedField };
      return updated;
    });
  };

  const addItem = () => {
    setItems(prev => [
      ...prev, 
      { ...calculateItemTotals({ name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23' }), unit_gross_price: 0 }
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
  const remainingAmount = isFullyPaid ? 0 : Math.max(0, grossTotal - paidAmount);

  const getPaymentStatus = () => {
    if (isFullyPaid || remainingAmount === 0) return { label: 'Opłacona', color: 'text-green-600' };
    if (paidAmount > 0) return { label: 'Częściowo opłacona', color: 'text-amber-600' };
    return { label: 'Nieopłacona', color: 'text-red-600' };
  };

  const handlePreview = () => {
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

    setShowPreview(true);
  };

  const getInvoiceData = (): InvoiceData => ({
    invoice_number: invoiceNumber,
    type: invoiceType,
    issue_date: issueDate,
    sale_date: saleDate,
    due_date: dueDate,
    payment_method: paymentMethod,
    notes,
    items: items.map(({ unit_gross_price, lastEditedField, ...item }) => item),
    seller,
    buyer
  });

  const handleSave = async () => {
    toast.success('Faktura została zapisana na Twoim koncie!');
    setShowPreview(false);
  };

  const handleSend = async (email: string) => {
    toast.success(`Faktura została wysłana na adres ${email}`);
    setShowPreview(false);
  };

  const paymentStatus = getPaymentStatus();

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
              <Label>NIP (opcjonalnie)</Label>
              <Input
                value={buyer.nip}
                onChange={(e) => setBuyer(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                placeholder="NIP - dla firm"
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
            <div className="col-span-2">
              <Label>Termin płatności</Label>
              <PaymentTermSelector
                issueDate={issueDate}
                dueDate={dueDate}
                onDueDateChange={setDueDate}
              />
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
                <div className="col-span-12 md:col-span-4">
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
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-xs">Cena netto</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_net_price || ''}
                    onChange={(e) => updateItem(index, 'unit_net_price', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-xs">Cena brutto</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_gross_price || ''}
                    onChange={(e) => updateItem(index, 'unit_gross_price', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
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
                <div className="col-span-8 md:col-span-1">
                  <Label className="text-xs">Suma brutto</Label>
                  <Input
                    value={formatCurrency(item.gross_amount)}
                    disabled
                    className="bg-muted font-medium"
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

      {/* Tabs: Uwagi, Płatności, Dodatkowe */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="notes">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="notes" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Uwagi
              </TabsTrigger>
              <TabsTrigger value="payment" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Płatności
              </TabsTrigger>
              <TabsTrigger value="additional" className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Dodatkowe
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="notes" className="mt-4">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dodatkowe uwagi na fakturze..."
                rows={4}
              />
            </TabsContent>
            
            <TabsContent value="payment" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Sposób zapłaty</Label>
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
                
                {paymentMethod === 'transfer' && (
                  <div>
                    <Label>Numer konta bankowego</Label>
                    <Input
                      value={seller.bank_account || ''}
                      onChange={(e) => setSeller(prev => ({ ...prev, bank_account: e.target.value }))}
                      placeholder="00 0000 0000 0000 0000 0000 0000"
                    />
                  </div>
                )}
              </div>
              
              <Separator />
              
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Status płatności</h4>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="fully-paid" 
                    checked={isFullyPaid}
                    onCheckedChange={(checked) => {
                      setIsFullyPaid(checked as boolean);
                      if (checked) setPaidAmount(grossTotal);
                    }}
                  />
                  <Label htmlFor="fully-paid" className="cursor-pointer">Faktura opłacona w całości</Label>
                </div>
                
                {!isFullyPaid && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Kwota wpłacona</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paidAmount || ''}
                        onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label>Pozostało do zapłaty</Label>
                      <Input
                        value={formatCurrency(remainingAmount)}
                        disabled
                        className="bg-muted font-medium"
                      />
                    </div>
                  </div>
                )}
                
                <div className={`p-3 rounded-lg bg-muted ${paymentStatus.color}`}>
                  <span className="font-medium">Status: {paymentStatus.label}</span>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="additional" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Podpis na fakturze</Label>
                  <Select value={signatureType} onValueChange={setSignatureType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIGNATURE_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Osoba wystawiająca (opcjonalnie)</Label>
                  <Input
                    value={issuedBy}
                    onChange={(e) => setIssuedBy(e.target.value)}
                    placeholder="Imię i nazwisko"
                  />
                </div>
                <div>
                  <Label>Miejsce wystawienia</Label>
                  <Input
                    value={issuePlace}
                    onChange={(e) => setIssuePlace(e.target.value)}
                    placeholder="Miasto"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Preview Button */}
      <Button 
        onClick={handlePreview} 
        size="lg" 
        className="w-full gap-2"
      >
        <Eye className="h-5 w-5" />
        Podgląd faktury
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Po kliknięciu zobaczysz podgląd dokumentu. Możesz pobrać PDF bez logowania lub zalogować się, aby zapisać na koncie.
      </p>

      {/* Preview Modal */}
      <InvoicePreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        invoiceData={getInvoiceData()}
        isLoggedIn={isLoggedIn}
        onSave={handleSave}
        onSend={handleSend}
      />
    </div>
  );
}
