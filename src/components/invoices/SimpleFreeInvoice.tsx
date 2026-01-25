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
  Settings2,
  ChevronDown,
  ChevronUp,
  MapPin
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
import { CurrencySelector, Currency, getCurrencySymbol, formatCurrencyAmount } from './CurrencySelector';
import { DiscountSection, DiscountConfig, calculateDiscount } from './DiscountSection';
import { supabase } from '@/integrations/supabase/client';

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];
const UNITS = ['szt.', 'usł.', 'godz.', 'km', 'kg', 'm²', 'm³', 'kpl.'];
const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Przelew' },
  { value: 'cash', label: 'Gotówka' },
  { value: 'card', label: 'Karta' }
];

// Extended document types available in Polish accounting
const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Faktura VAT', prefix: 'FV' },
  { value: 'proforma', label: 'Faktura Proforma', prefix: 'PRO' },
  { value: 'receipt', label: 'Rachunek', prefix: 'R' },
  { value: 'vat_margin', label: 'Faktura VAT marża', prefix: 'FVM' },
  { value: 'vat_rr', label: 'Faktura VAT RR (rolnik)', prefix: 'RR' },
  { value: 'correction', label: 'Faktura korygująca', prefix: 'FK' },
  { value: 'advance', label: 'Faktura zaliczkowa', prefix: 'FZ' },
  { value: 'final', label: 'Faktura końcowa', prefix: 'FK' },
  { value: 'kp', label: 'KP - Kasa Przyjmie', prefix: 'KP' },
  { value: 'kw', label: 'KW - Kasa Wyda', prefix: 'KW' },
  { value: 'wz', label: 'WZ - Wydanie Zewnętrzne', prefix: 'WZ' },
  { value: 'pz', label: 'PZ - Przyjęcie Zewnętrzne', prefix: 'PZ' },
  { value: 'nota', label: 'Nota księgowa', prefix: 'NK' }
];

type DocumentType = typeof DOCUMENT_TYPES[number]['value'];

const SIGNATURE_OPTIONS = [
  { value: 'none', label: 'Faktura bez podpisu odbiorcy' },
  { value: 'receiver', label: 'Osoba upoważniona do otrzymania faktury VAT' },
  { value: 'issuer', label: 'Osoba upoważniona do wystawienia faktury VAT' },
  { value: 'both_none', label: 'Brak podpisu odbiorcy i wystawcy' }
];

// Polish postal code to city mapping
const POSTAL_CODE_MAP: Record<string, string> = {
  '00': 'Warszawa', '01': 'Warszawa', '02': 'Warszawa', '03': 'Warszawa', '04': 'Warszawa',
  '30': 'Kraków', '31': 'Kraków',
  '50': 'Wrocław', '51': 'Wrocław',
  '60': 'Poznań', '61': 'Poznań',
  '80': 'Gdańsk', '81': 'Gdynia',
  '90': 'Łódź', '91': 'Łódź', '92': 'Łódź',
  '40': 'Katowice', '41': 'Chorzów',
  '70': 'Szczecin', '71': 'Szczecin',
  '20': 'Lublin', '35': 'Rzeszów', '15': 'Białystok', '25': 'Kielce',
  '45': 'Opole', '10': 'Olsztyn', '85': 'Bydgoszcz', '87': 'Toruń',
};

// Extended item type with gross price for bidirectional calculation
interface ExtendedInvoiceItem extends InvoiceItem {
  unit_gross_price: number;
  lastEditedField?: 'net' | 'gross';
  discount_percent?: number;
  discount_amount?: number;
  discount_type?: 'percent' | 'amount';
}

// Extended seller with separate address fields
interface ExtendedSeller extends Omit<InvoiceSeller, 'address_street'> {
  address_street: string;
  address_building_number: string;
  address_apartment_number?: string;
}

// Extended buyer with separate address fields
interface ExtendedBuyer extends Omit<InvoiceBuyer, 'address_street'> {
  address_street: string;
  address_building_number: string;
  address_apartment_number?: string;
}

export function SimpleFreeInvoice() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultDueDate = format(addDays(new Date(), 7), 'yyyy-MM-dd');
  
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Invoice type
  const [invoiceType, setInvoiceType] = useState<string>('invoice');
  const [showAllTypes, setShowAllTypes] = useState(false);
  
  // Currency
  const [currency, setCurrency] = useState<Currency>('PLN');
  
  // Invoice details
  const [invoiceNumber, setInvoiceNumber] = useState(`FV/${format(new Date(), 'yyyy/MM')}/001`);
  const [issueDate, setIssueDate] = useState(today);
  const [saleDate, setSaleDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [issuePlace, setIssuePlace] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash' | 'card'>('transfer');
  const [notes, setNotes] = useState('');
  
  // Payment tab fields
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [isFullyPaid, setIsFullyPaid] = useState(false);
  
  // Additional tab fields
  const [signatureType, setSignatureType] = useState('none');
  const [issuedBy, setIssuedBy] = useState('');
  
  // Discount
  const [discountConfig, setDiscountConfig] = useState<DiscountConfig>({
    type: 'none',
    mode: 'percent',
    globalValue: 0,
  });
  
  // Seller
  const [seller, setSeller] = useState<ExtendedSeller>({
    name: '',
    nip: '',
    address_street: '',
    address_building_number: '',
    address_apartment_number: '',
    address_city: '',
    address_postal_code: '',
    bank_name: '',
    bank_account: ''
  });
  
  // Buyer
  const [buyer, setBuyer] = useState<ExtendedBuyer>({
    name: '',
    nip: '',
    address_street: '',
    address_building_number: '',
    address_apartment_number: '',
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

  // Auto-fill city based on postal code
  const handlePostalCodeChange = (
    type: 'seller' | 'buyer',
    value: string
  ) => {
    const formatted = value.replace(/\D/g, '');
    const postalCode = formatted.length > 2 
      ? `${formatted.substring(0, 2)}-${formatted.substring(2, 5)}`
      : formatted;

    const prefix = formatted.substring(0, 2);
    const suggestedCity = POSTAL_CODE_MAP[prefix];

    if (type === 'seller') {
      setSeller(prev => ({
        ...prev,
        address_postal_code: postalCode,
        address_city: suggestedCity && !prev.address_city ? suggestedCity : prev.address_city
      }));
    } else {
      setBuyer(prev => ({
        ...prev,
        address_postal_code: postalCode,
        address_city: suggestedCity && !prev.address_city ? suggestedCity : prev.address_city
      }));
    }
  };

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
      updated[index] = { ...calculated, unit_gross_price: item.unit_gross_price, lastEditedField: item.lastEditedField, discount_percent: item.discount_percent };
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
  
  // Apply discount
  const { discountAmount, finalAmount } = calculateDiscount(grossTotal, discountConfig);
  const remainingAmount = isFullyPaid ? 0 : Math.max(0, finalAmount - paidAmount);

  const getPaymentStatus = () => {
    if (isFullyPaid || remainingAmount === 0) return { label: 'Opłacona', color: 'text-green-600 bg-green-50' };
    if (paidAmount > 0) return { label: 'Częściowo opłacona', color: 'text-amber-600 bg-amber-50' };
    return { label: 'Nieopłacona', color: 'text-red-600 bg-red-50' };
  };

  const handlePreview = () => {
    // Validation
    if (!seller.name) {
      toast.error('Wprowadź pełną nazwę sprzedawcy');
      return;
    }
    if (!seller.nip) {
      toast.error('Wprowadź NIP sprzedawcy');
      return;
    }
    if (!seller.address_street || !seller.address_building_number) {
      toast.error('Wprowadź ulicę i numer budynku sprzedawcy');
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

  const getInvoiceData = (): InvoiceData => {
    // Combine address fields for seller
    const sellerAddress = seller.address_street + 
      (seller.address_building_number ? ` ${seller.address_building_number}` : '') +
      (seller.address_apartment_number ? `/${seller.address_apartment_number}` : '');
    
    // Combine address fields for buyer  
    const buyerAddress = buyer.address_street +
      (buyer.address_building_number ? ` ${buyer.address_building_number}` : '') +
      (buyer.address_apartment_number ? `/${buyer.address_apartment_number}` : '');

    return {
      invoice_number: invoiceNumber,
      type: invoiceType as 'invoice' | 'proforma' | 'receipt',
      issue_date: issueDate,
      sale_date: saleDate,
      due_date: dueDate,
      issue_place: issuePlace,
      payment_method: paymentMethod,
      notes,
      currency,
      items: items.map(({ unit_gross_price, lastEditedField, ...item }) => item),
      seller: {
        ...seller,
        address_street: sellerAddress,
      },
      buyer: {
        ...buyer,
        address_street: buyerAddress,
      }
    };
  };

  const handleSave = async () => {
    toast.success('Faktura została zapisana na Twoim koncie!');
    setShowPreview(false);
  };

  const handleSend = async (email: string) => {
    toast.success(`Faktura została wysłana na adres ${email}`);
    setShowPreview(false);
  };

  const paymentStatus = getPaymentStatus();
  const currencySymbol = getCurrencySymbol(currency);

  const formatAmount = (amount: number) => formatCurrencyAmount(amount, currency);

  return (
    <div className="space-y-6">
      {/* Header with Currency Selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold flex items-center justify-center sm:justify-start gap-2">
            <Receipt className="h-7 w-7 text-primary" />
            Darmowy Generator Faktur
          </h1>
          <p className="text-muted-foreground mt-1">
            Bez rejestracji, bez logowania. Wygeneruj PDF w przeglądarce.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Waluta:</Label>
          <CurrencySelector value={currency} onChange={setCurrency} />
        </div>
      </div>

      {/* Invoice Type Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Typ dokumentu <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Main document types - always visible */}
          <div className="flex gap-2">
            <Button 
              variant={invoiceType === 'invoice' ? 'default' : 'outline'}
              onClick={() => setInvoiceType('invoice')}
              className="flex-1"
            >
              Faktura VAT
            </Button>
            <Button 
              variant="outline"
              onClick={() => setShowAllTypes(!showAllTypes)}
              className="px-3"
            >
              {showAllTypes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
          
          {/* Expanded document types - fixed for mobile */}
          {showAllTypes && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {DOCUMENT_TYPES.map((type) => (
                <Button
                  key={type.value}
                  variant={invoiceType === type.value ? 'default' : 'outline'}
                  onClick={() => {
                    setInvoiceType(type.value);
                    // Update invoice number prefix based on type
                    const currentNum = invoiceNumber.split('/').pop() || '001';
                    setInvoiceNumber(`${type.prefix}/${format(new Date(), 'yyyy/MM')}/${currentNum}`);
                  }}
                  className="text-xs h-auto py-2 px-3 whitespace-nowrap"
                  size="sm"
                >
                  {type.label}
                </Button>
              ))}
            </div>
          )}
          
          {/* Show selected type if not default */}
          {invoiceType !== 'invoice' && !showAllTypes && (
            <p className="text-sm text-muted-foreground">
              Wybrany: <span className="font-medium text-foreground">{DOCUMENT_TYPES.find(t => t.value === invoiceType)?.label}</span>
            </p>
          )}
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
              <Label>Pełna nazwa firmy <span className="text-destructive">*</span></Label>
              <Input
                value={seller.name}
                onChange={(e) => setSeller(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nazwa firmy lub imię i nazwisko"
              />
            </div>
            <div>
              <Label>NIP <span className="text-destructive">*</span></Label>
              <Input
                value={seller.nip}
                onChange={(e) => setSeller(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                placeholder="NIP (10 cyfr)"
                maxLength={10}
              />
            </div>
            <div>
              <Label>Ulica <span className="text-destructive">*</span></Label>
              <Input
                value={seller.address_street}
                onChange={(e) => setSeller(prev => ({ ...prev, address_street: e.target.value }))}
                placeholder="ul. Przykładowa"
              />
            </div>
            <div>
              <Label>Nr budynku <span className="text-destructive">*</span></Label>
              <Input
                value={seller.address_building_number}
                onChange={(e) => setSeller(prev => ({ ...prev, address_building_number: e.target.value }))}
                placeholder="1A"
              />
            </div>
            <div>
              <Label>Nr lokalu</Label>
              <Input
                value={seller.address_apartment_number}
                onChange={(e) => setSeller(prev => ({ ...prev, address_apartment_number: e.target.value }))}
                placeholder="(opcjonalnie)"
              />
            </div>
            <div>
              <Label>Kod pocztowy</Label>
              <Input
                value={seller.address_postal_code}
                onChange={(e) => handlePostalCodeChange('seller', e.target.value)}
                placeholder="00-000"
                maxLength={6}
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
              <Label>Nazwa firmy / Imię i nazwisko <span className="text-destructive">*</span></Label>
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
              <Label>Ulica</Label>
              <Input
                value={buyer.address_street}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_street: e.target.value }))}
                placeholder="ul. Przykładowa"
              />
            </div>
            <div>
              <Label>Nr budynku</Label>
              <Input
                value={buyer.address_building_number}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_building_number: e.target.value }))}
                placeholder="1A"
              />
            </div>
            <div>
              <Label>Nr lokalu</Label>
              <Input
                value={buyer.address_apartment_number}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_apartment_number: e.target.value }))}
                placeholder="(opcjonalnie)"
              />
            </div>
            <div>
              <Label>Kod pocztowy</Label>
              <Input
                value={buyer.address_postal_code}
                onChange={(e) => handlePostalCodeChange('buyer', e.target.value)}
                placeholder="00-000"
                maxLength={6}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Numer faktury <span className="text-destructive">*</span></Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="FV/2026/01/001"
              />
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Miejsce wystawienia
              </Label>
              <Input
                value={issuePlace}
                onChange={(e) => setIssuePlace(e.target.value)}
                placeholder="Miasto"
              />
            </div>
            <div>
              <Label>Data wystawienia</Label>
              <Input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <Label>Data sprzedaży</Label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="md:col-span-2">
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
                  <Label className="text-xs">Nazwa towaru/usługi <span className="text-destructive">*</span></Label>
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
                {discountConfig.type === 'per_item' && (
                  <>
                    <div className="col-span-6 md:col-span-1">
                      <Label className="text-xs">Typ rabatu</Label>
                      <Select 
                        value={item.discount_type || 'percent'} 
                        onValueChange={(v) => updateItem(index, 'discount_type', v)}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="amount">{currencySymbol}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 md:col-span-1">
                      <Label className="text-xs">
                        Rabat {(item.discount_type || 'percent') === 'percent' ? '%' : currencySymbol}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max={(item.discount_type || 'percent') === 'percent' ? '100' : undefined}
                        step={(item.discount_type || 'percent') === 'percent' ? '1' : '0.01'}
                        value={(item.discount_type || 'percent') === 'percent' 
                          ? (item.discount_percent || '') 
                          : (item.discount_amount || '')}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          if ((item.discount_type || 'percent') === 'percent') {
                            updateItem(index, 'discount_percent', value);
                          } else {
                            updateItem(index, 'discount_amount', value);
                          }
                        }}
                        placeholder="0"
                      />
                    </div>
                  </>
                )}
                <div className="col-span-8 md:col-span-1">
                  <Label className="text-xs">Suma brutto</Label>
                  <Input
                    value={formatAmount(item.gross_amount)}
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

          {/* Discount Section */}
          <DiscountSection 
            config={discountConfig}
            onChange={setDiscountConfig}
            currencySymbol={currencySymbol}
          />

          <Separator />

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Razem netto:</span>
                <span className="font-medium">{formatAmount(netTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>VAT:</span>
                <span className="font-medium">{formatAmount(vatTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Razem brutto:</span>
                <span className="font-medium">{formatAmount(grossTotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm" style={{ color: 'hsl(142, 76%, 36%)' }}>
                  <span>Rabat:</span>
                  <span className="font-medium">-{formatAmount(discountAmount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>Do zapłaty:</span>
                <span className="text-primary">{formatAmount(finalAmount)}</span>
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
              <TabsTrigger value="notes" className="flex items-center gap-1 text-xs sm:text-sm">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Uwagi</span>
              </TabsTrigger>
              <TabsTrigger value="payment" className="flex items-center gap-1 text-xs sm:text-sm">
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Płatności</span>
              </TabsTrigger>
              <TabsTrigger value="additional" className="flex items-center gap-1 text-xs sm:text-sm">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Dodatkowe</span>
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
                  <>
                    <div>
                      <Label>Nazwa banku</Label>
                      <Input
                        value={seller.bank_name || ''}
                        onChange={(e) => setSeller(prev => ({ ...prev, bank_name: e.target.value }))}
                        placeholder="Nazwa banku"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Numer konta bankowego</Label>
                      <Input
                        value={seller.bank_account || ''}
                        onChange={(e) => setSeller(prev => ({ ...prev, bank_account: e.target.value }))}
                        placeholder="00 0000 0000 0000 0000 0000 0000"
                      />
                    </div>
                  </>
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
                      if (checked) setPaidAmount(finalAmount);
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
                        value={formatAmount(remainingAmount)}
                        disabled
                        className="bg-muted font-medium"
                      />
                    </div>
                  </div>
                )}
                
                <div className={`p-3 rounded-lg border ${paymentStatus.color}`}>
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
