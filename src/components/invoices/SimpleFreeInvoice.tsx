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
import { FloatingInput } from '@/components/ui/floating-input';
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
  MapPin,
  ImagePlus,
  X,
  Loader2,
  Search
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  InvoiceItem, 
  InvoiceSeller, 
  InvoiceBuyer, 
  InvoiceData,
  calculateItemTotals,
  formatCurrency,
  generateInvoiceHtml
} from '@/utils/invoiceHtmlGenerator';
import { format, addDays } from 'date-fns';
import { PaymentTermSelector } from './PaymentTermSelector';
import { DatePickerButton } from './DatePickerButton';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { CurrencySelector, Currency, getCurrencySymbol, formatCurrencyAmount } from './CurrencySelector';
import { UnitSelector } from './UnitSelector';
import { DiscountSection, DiscountConfig, calculateDiscount } from './DiscountSection';
import { AuthModal } from '@/components/auth/AuthModal';
import { supabase } from '@/integrations/supabase/client';
import { useNipLookup, CompanyData } from '@/hooks/useNipLookup';
import { CorrectionInvoiceSection, CorrectionData } from './CorrectionInvoiceSection';

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
  { value: 'valid_without_signature', label: 'Faktura ważna bez podpisu' },
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

interface SimpleFreeInvoiceProps {
  onClose?: () => void;
  onSaved?: () => void;
  editInvoiceId?: string; // If provided, load this invoice for editing
}

export function SimpleFreeInvoice({ onClose, onSaved, editInvoiceId }: SimpleFreeInvoiceProps = {}) {
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
  const [signatureType, setSignatureType] = useState('valid_without_signature');
  const [issuedBy, setIssuedBy] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [compactPdf, setCompactPdf] = useState(false);
  const [autoSendKsef, setAutoSendKsef] = useState(false);
  const [hasKsefToken, setHasKsefToken] = useState(false);
  
  // Collapsible sections
  const [sellerExpanded, setSellerExpanded] = useState(true);
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
  const [buyer, setBuyer] = useState<ExtendedBuyer & { country?: string }>({
    name: '',
    nip: '',
    address_street: '',
    address_building_number: '',
    address_apartment_number: '',
    address_city: '',
    address_postal_code: '',
    country: 'Polska'
  });
  
  // Country list for buyer
  const [countrySearch, setCountrySearch] = useState('');
  const COUNTRIES = [
    'Polska', 'Niemcy', 'Austria', 'Belgia', 'Bułgaria', 'Chorwacja', 'Cypr', 'Czechy', 
    'Dania', 'Estonia', 'Finlandia', 'Francja', 'Grecja', 'Hiszpania', 'Holandia', 
    'Irlandia', 'Litwa', 'Luksemburg', 'Łotwa', 'Malta', 'Portugalia', 'Rumunia', 
    'Słowacja', 'Słowenia', 'Szwecja', 'Węgry', 'Wielka Brytania', 'Włochy',
    'USA', 'Kanada', 'Australia', 'Chiny', 'Japonia', 'Korea Południowa', 'Indie',
    'Brazylia', 'Meksyk', 'Szwajcaria', 'Norwegia', 'Ukraina', 'Rosja'
  ];
  const filteredCountries = COUNTRIES.filter(c => 
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );
  
  // Items with extended fields
  const [items, setItems] = useState<ExtendedInvoiceItem[]>([
    { ...calculateItemTotals({ name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23' }), unit_gross_price: 0 }
  ]);
  
  // Preview modal
  const [showPreview, setShowPreview] = useState(false);
  
  // Auth modal for preview
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Invoice issuing state
  const [isIssuing, setIsIssuing] = useState(false);
  const [invoiceIssued, setInvoiceIssued] = useState(false);
  const [lastSavedInvoiceId, setLastSavedInvoiceId] = useState<string | null>(null);
  
  // Correction invoice state
  const [correctionData, setCorrectionData] = useState<CorrectionData | null>(null);
  
  // User's saved company
  const [savedCompanyId, setSavedCompanyId] = useState<string | null>(null);

  // NIP lookup for buyer
  const { lookup: nipLookup, loading: nipLoading, company: nipCompany, reset: nipReset } = useNipLookup();

  // Auto-fill buyer when NIP lookup succeeds
  useEffect(() => {
    if (nipCompany) {
      setBuyer(prev => ({
        ...prev,
        name: nipCompany.name || prev.name,
        nip: nipCompany.nip || prev.nip,
        address_street: nipCompany.street || prev.address_street,
        address_building_number: nipCompany.buildingNumber || prev.address_building_number,
        address_apartment_number: nipCompany.apartmentNumber || prev.address_apartment_number,
        address_city: nipCompany.city || prev.address_city,
        address_postal_code: nipCompany.postalCode || prev.address_postal_code,
      }));
      toast.success(`Znaleziono: ${nipCompany.name}`);
    }
  }, [nipCompany]);

  // Check auth state and load saved company data
  // Helper function to load user company data from multiple sources
  const loadUserCompanyData = async (userId: string) => {
    // First try user_invoice_companies
    const { data: company } = await supabase
      .from('user_invoice_companies')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();
    
    if (company) {
      setSavedCompanyId(company.id);
      setSeller({
        name: company.name || '',
        nip: company.nip || '',
        address_street: company.address_street || '',
        address_building_number: company.address_building_number || '',
        address_apartment_number: company.address_apartment_number || '',
        address_city: company.address_city || '',
        address_postal_code: company.address_postal_code || '',
        bank_name: company.bank_name || '',
        bank_account: company.bank_account || ''
      });
      setSellerExpanded(false);
      if (!issuePlace) setIssuePlace(company.address_city || '');
      return;
    }
    
    // Fallback to entities table (from ClientPortal company setup)
    const { data: entity } = await supabase
      .from('entities')
      .select('*')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (entity) {
      // DON'T set savedCompanyId here - entities.id is NOT the same as user_invoice_companies.id
      // The company will be created in user_invoice_companies when saving the invoice
      setSavedCompanyId(null);
      // Parse address_street to extract building/apartment numbers
      const streetParts = (entity.address_street || '').split(' ');
      const hasNumber = streetParts.length > 1 && /\d/.test(streetParts[streetParts.length - 1]);
      const street = hasNumber ? streetParts.slice(0, -1).join(' ') : entity.address_street || '';
      const buildingNum = hasNumber ? streetParts[streetParts.length - 1] : '';
      
      setSeller({
        name: entity.name || '',
        nip: entity.nip || '',
        address_street: street,
        address_building_number: buildingNum,
        address_apartment_number: '',
        address_city: entity.address_city || '',
        address_postal_code: entity.address_postal_code || '',
        bank_name: entity.bank_name || '',
        bank_account: entity.bank_account || ''
      });
      setSellerExpanded(false);
      if (!issuePlace) setIssuePlace(entity.address_city || '');
    }
  };

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
      
      if (session?.user) {
        await loadUserCompanyData(session.user.id);
        
        // Auto-generate next invoice number based on last invoice in DB
        if (!editInvoiceId) {
          const now = new Date();
          const year = parseInt(format(now, 'yyyy'));
          const month = parseInt(format(now, 'MM'));
          
          // Use atomic sequence to prevent duplicate numbers
          const { data: nextNum, error: seqErr } = await supabase
            .rpc('get_next_invoice_number', { p_user_id: session.user.id, p_year: year, p_month: month });
          
          if (seqErr) {
            console.error('Error getting next invoice number:', seqErr);
            // Fallback to old logic
            const prefix = `FV/${year}/${String(month).padStart(2, '0')}/`;
            setInvoiceNumber(`${prefix}001`);
          } else {
            const prefix = `FV/${year}/${String(month).padStart(2, '0')}/`;
            setInvoiceNumber(`${prefix}${String(nextNum).padStart(3, '0')}`);
          }
        }
        
        // Check if user has KSeF token configured
        const { data: cs } = await supabase
          .from('company_settings')
          .select('ksef_token')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (cs?.ksef_token) {
          setHasKsefToken(true);
          setAutoSendKsef(true);
        }
      }
    };
    checkAuthAndLoadData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsLoggedIn(!!session);
      if (session?.user) {
        // Reload company data on login
        setTimeout(() => {
          loadUserCompanyData(session.user.id);
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load invoice data for editing
  useEffect(() => {
    const loadInvoiceForEdit = async () => {
      if (!editInvoiceId) return;
      
      try {
        // Load invoice data
        const { data: invoice, error: invoiceError } = await supabase
          .from('user_invoices')
          .select('*')
          .eq('id', editInvoiceId)
          .single();

        if (invoiceError) throw invoiceError;

        // Set invoice fields
        setInvoiceNumber(invoice.invoice_number || '');
        setInvoiceType(invoice.invoice_type || 'invoice');
        setIssueDate(invoice.issue_date || today);
        setSaleDate(invoice.sale_date || today);
        setDueDate(invoice.due_date || defaultDueDate);
        setIssuePlace(invoice.issue_place || '');
        setPaymentMethod((invoice.payment_method || 'transfer') as 'transfer' | 'cash' | 'card');
        setNotes(invoice.notes || '');
        setCurrency((invoice.currency || 'PLN') as Currency);
        setPaidAmount(invoice.paid_amount || 0);
        setIsFullyPaid(invoice.is_paid || false);
        setSavedCompanyId(invoice.company_id || null);

        // Set buyer data
        setBuyer({
          name: invoice.buyer_name || '',
          nip: invoice.buyer_nip || '',
          address_street: invoice.buyer_address || '',
          address_building_number: '',
          address_apartment_number: '',
          address_city: '',
          address_postal_code: '',
          country: 'Polska'
        });

        // Load invoice items
        const { data: invoiceItems, error: itemsError } = await supabase
          .from('user_invoice_items')
          .select('*')
          .eq('invoice_id', editInvoiceId)
          .order('sort_order');

        if (itemsError) throw itemsError;

        if (invoiceItems && invoiceItems.length > 0) {
          setItems(invoiceItems.map(item => {
            const netPrice = item.unit_net_price || 0;
            const vatRateNum = parseFloat(item.vat_rate || '23') || 0;
            const grossPrice = netPrice * (1 + vatRateNum / 100);
            return {
              name: item.name || '',
              pkwiu: '',
              quantity: item.quantity || 1,
              unit: item.unit || 'szt.',
              unit_net_price: netPrice,
              unit_gross_price: grossPrice,
              vat_rate: item.vat_rate || '23',
              net_amount: item.net_amount || 0,
              vat_amount: item.vat_amount || 0,
              gross_amount: item.gross_amount || 0,
            };
          }));
        }

        // Load seller/company data
        if (invoice.company_id) {
          const { data: company } = await supabase
            .from('user_invoice_companies')
            .select('*')
            .eq('id', invoice.company_id)
            .maybeSingle();

          if (company) {
            setSeller({
              name: company.name || '',
              nip: company.nip || '',
              address_street: company.address_street || '',
              address_building_number: company.address_building_number || '',
              address_apartment_number: company.address_apartment_number || '',
              address_city: company.address_city || '',
              address_postal_code: company.address_postal_code || '',
              bank_name: company.bank_name || '',
              bank_account: company.bank_account || ''
            });
            setSellerExpanded(false);
          }
        }
      } catch (err: any) {
        console.error('Error loading invoice for edit:', err);
        toast.error('Błąd ładowania faktury do edycji');
      }
    };

    loadInvoiceForEdit();
  }, [editInvoiceId]);

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
      updated[index] = { 
        ...calculated, 
        unit_gross_price: item.unit_gross_price, 
        lastEditedField: item.lastEditedField, 
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        discount_type: item.discount_type
      };
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

    // Require login to see preview, save, or send
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    setShowPreview(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    // After successful login, show the preview
    setTimeout(() => {
      setShowPreview(true);
    }, 100);
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
        logo_url: companyLogo || undefined,
      },
      buyer: {
        ...buyer,
        address_street: buyerAddress,
      },
      // Payment info
      paid_amount: paidAmount,
      is_fully_paid: isFullyPaid,
      // Signature
      signature_type: signatureType as any,
      issued_by: issuedBy,
      // PDF options
      compact_pdf: compactPdf,
    };
  };

  const handleSave = async (asDraft?: boolean) => {
    try {
      // Use getSession() to get the user ID from the current auth token
      // This ensures the user_id matches auth.uid() in RLS policies
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error('Musisz być zalogowany, aby zapisać fakturę');
        return;
      }
      const user = session.user;

      const invoiceData = getInvoiceData();
      
      // Track company ID locally (state update is async, so we need local variable)
      let companyIdToUse = savedCompanyId;
      
      // Save or update company if data changed
      if (seller.name && seller.nip) {
        const sellerAddress = [
          seller.address_street,
          seller.address_building_number,
          seller.address_apartment_number ? `/${seller.address_apartment_number}` : ''
        ].filter(Boolean).join(' ');

        if (companyIdToUse) {
          // Update existing company
          await supabase
            .from('user_invoice_companies')
            .update({
              name: seller.name,
              nip: seller.nip,
              address_street: seller.address_street,
              address_building_number: seller.address_building_number,
              address_apartment_number: seller.address_apartment_number,
              address_city: seller.address_city,
              address_postal_code: seller.address_postal_code,
              bank_name: seller.bank_name,
              bank_account: seller.bank_account
            })
            .eq('id', companyIdToUse);
        } else {
          // Create new company in user_invoice_companies
          const { data: newCompany, error: companyError } = await supabase
            .from('user_invoice_companies')
            .insert({
              user_id: user.id,
              name: seller.name,
              nip: seller.nip,
              address_street: seller.address_street,
              address_building_number: seller.address_building_number,
              address_apartment_number: seller.address_apartment_number,
              address_city: seller.address_city,
              address_postal_code: seller.address_postal_code,
              bank_name: seller.bank_name,
              bank_account: seller.bank_account,
              is_default: true
            })
            .select()
            .single();
          
          if (companyError) {
            console.error('Error creating company:', companyError);
            throw companyError;
          }
          
          if (newCompany) {
            companyIdToUse = newCompany.id;
            setSavedCompanyId(newCompany.id);
          }
        }
      }

      // Calculate totals
      const netTotal = invoiceData.items.reduce((sum, item) => sum + item.net_amount, 0);
      const vatTotal = invoiceData.items.reduce((sum, item) => sum + item.vat_amount, 0);
      const grossTotal = invoiceData.items.reduce((sum, item) => sum + item.gross_amount, 0);

      // Build buyer address
      // Determine ksef_status based on invoice type
      const isNonKsefType = ['proforma', 'receipt', 'kp', 'kw', 'wz', 'pz', 'nota'].includes(invoiceType);
      const isDraft = asDraft === true;
      
      const buyerAddress = [
        buyer.address_street,
        buyer.address_building_number,
        buyer.address_apartment_number ? `/${buyer.address_apartment_number}` : ''
      ].filter(Boolean).join(' ');

      let resultInvoiceId: string | null = null;
      // Check if we're editing an existing invoice
      if (editInvoiceId) {
        // UPDATE existing invoice
        const { error } = await supabase
          .from('user_invoices')
          .update({
            company_id: companyIdToUse,
            invoice_number: invoiceData.invoice_number,
            invoice_type: invoiceData.type,
            issue_date: invoiceData.issue_date,
            sale_date: invoiceData.sale_date,
            due_date: invoiceData.due_date,
            issue_place: invoiceData.issue_place,
            payment_method: invoiceData.payment_method,
            currency: invoiceData.currency,
            buyer_name: buyer.name,
            buyer_nip: buyer.nip,
            buyer_address: `${buyerAddress}, ${buyer.address_postal_code} ${buyer.address_city}`,
            net_total: netTotal,
            vat_total: vatTotal,
            gross_total: grossTotal,
            paid_amount: paidAmount,
            is_paid: isFullyPaid,
            notes: notes
          })
          .eq('id', editInvoiceId);

        if (error) throw error;

        // Delete old items and insert new ones
        await supabase.from('user_invoice_items').delete().eq('invoice_id', editInvoiceId);
        
        const itemsToInsert = invoiceData.items.map((item, idx) => ({
          invoice_id: editInvoiceId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unit_net_price: item.unit_net_price,
          vat_rate: item.vat_rate,
          net_amount: item.net_amount,
          vat_amount: item.vat_amount,
          gross_amount: item.gross_amount,
          sort_order: idx
        }));

        await supabase.from('user_invoice_items').insert(itemsToInsert);
        
        toast.success('Zmiany zostały zapisane!');
        resultInvoiceId = editInvoiceId;
      } else {
        // INSERT new invoice
        // Determine correction-specific fields
        const isCorrection = invoiceType === 'correction' && correctionData;
        
        // Generate correction invoice number if needed
        let finalInvoiceNumber = asDraft ? null : invoiceData.invoice_number;
        if (isCorrection && !asDraft) {
          const now = new Date();
          const year = format(now, 'yyyy');
          const { data: lastCorr } = await supabase
            .from('user_invoices')
            .select('invoice_number')
            .eq('user_id', user.id)
            .eq('is_correction', true)
            .like('invoice_number', `KOR/${year}/%`)
            .order('invoice_number', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          let nextNum = 1;
          if (lastCorr?.invoice_number) {
            const parts = lastCorr.invoice_number.split('/');
            const ln = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(ln)) nextNum = ln + 1;
          }
          finalInvoiceNumber = `KOR/${year}/${String(nextNum).padStart(3, '0')}`;
        }

        const correctionReasonLabel = isCorrection 
          ? (correctionData!.correctionReasonText || correctionData!.correctionReason)
          : undefined;

        const insertData: any = {
            user_id: user.id,
            company_id: companyIdToUse,
            invoice_number: finalInvoiceNumber,
            invoice_type: invoiceData.type,
            issue_date: invoiceData.issue_date,
            sale_date: invoiceData.sale_date,
            due_date: invoiceData.due_date,
            issue_place: invoiceData.issue_place,
            payment_method: invoiceData.payment_method,
            currency: invoiceData.currency,
            buyer_name: buyer.name,
            buyer_nip: buyer.nip,
            buyer_address: `${buyerAddress}, ${buyer.address_postal_code} ${buyer.address_city}`,
            net_total: netTotal,
            vat_total: vatTotal,
            gross_total: grossTotal,
            paid_amount: paidAmount,
            is_paid: isFullyPaid,
            notes: notes,
            ksef_status: asDraft ? 'draft' : undefined,
        };
        if (isCorrection) {
          insertData.is_correction = true;
          insertData.invoice_type = 'KOR';
          insertData.corrected_invoice_id = correctionData!.originalInvoiceId;
          insertData.corrected_invoice_number = correctionData!.originalInvoiceNumber;
          insertData.corrected_invoice_date = correctionData!.originalIssueDate;
          insertData.corrected_ksef_reference = correctionData!.originalKsefReference || null;
          insertData.correction_reason = correctionReasonLabel;
          console.log('[Korekta] Zapisuję dane korekty:', {
            corrected_invoice_id: insertData.corrected_invoice_id,
            corrected_invoice_number: insertData.corrected_invoice_number,
            corrected_invoice_date: insertData.corrected_invoice_date,
            corrected_ksef_reference: insertData.corrected_ksef_reference,
            invoice_type: insertData.invoice_type,
          });
        }

        const { data: savedInvoice, error } = await supabase
          .from('user_invoices')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        const newInvoiceId = savedInvoice?.id || null;
        if (newInvoiceId) setLastSavedInvoiceId(newInvoiceId);
        resultInvoiceId = newInvoiceId;

        // Save invoice items
        if (savedInvoice) {
          const itemsToInsert = invoiceData.items.map((item, idx) => ({
            invoice_id: savedInvoice.id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unit_net_price: item.unit_net_price,
            vat_rate: item.vat_rate,
            net_amount: item.net_amount,
            vat_amount: item.vat_amount,
            gross_amount: item.gross_amount,
            sort_order: idx
          }));

          await supabase.from('user_invoice_items').insert(itemsToInsert);
        }

        // Save contractor if new (only for new invoices)
        if (buyer.name) {
          const { data: existingContractor } = await supabase
            .from('user_contractors')
            .select('id')
            .eq('user_id', user.id)
            .eq('nip', buyer.nip || '')
            .maybeSingle();

          if (!existingContractor && buyer.nip) {
            await supabase.from('user_contractors').insert({
              user_id: user.id,
              name: buyer.name,
              nip: buyer.nip,
              address_street: buyer.address_street,
              address_building_number: buyer.address_building_number,
              address_apartment_number: buyer.address_apartment_number,
              address_city: buyer.address_city,
              address_postal_code: buyer.address_postal_code
            });
          }
        }
      }

      onSaved?.();
      return resultInvoiceId; // Return saved invoice ID
    } catch (err) {
      console.error('Error saving invoice:', err);
      toast.error('Błąd podczas zapisywania faktury');
      throw err; // Re-throw for caller to handle
    }
  };

  const handleSend = async (email: string) => {
    toast.success(`Faktura została wysłana na adres ${email}`);
    setShowPreview(false);
  };

  // Handle "Wystaw fakturę" - saves invoice and opens preview
  const handleIssueInvoice = async () => {
    // Check if logged in
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    // Validate required fields
    if (!seller.name || !seller.nip) {
      toast.error('Uzupełnij dane sprzedawcy (nazwa i NIP)');
      setSellerExpanded(true);
      return;
    }

    if (!buyer.name) {
      toast.error('Uzupełnij dane nabywcy');
      return;
    }

    if (invoiceType === 'correction' && !correctionData) {
      toast.error('Wybierz fakturę pierwotną i zakres korekty');
      return;
    }

    if (invoiceType === 'correction' && correctionData) {
      if (!correctionData.originalInvoiceId) {
        toast.error('Brak ID faktury pierwotnej — wybierz dokument do korekty');
        return;
      }
      if (!correctionData.originalInvoiceNumber) {
        toast.error('Brak numeru faktury pierwotnej');
        return;
      }
      if (!correctionData.originalIssueDate) {
        toast.error('Brak daty wystawienia faktury pierwotnej');
        return;
      }
    }

    if (items.every(item => !item.name || item.quantity === 0)) {
      toast.error('Dodaj co najmniej jedną pozycję na fakturze');
      return;
    }

    setIsIssuing(true);
    try {
      const savedId = await handleSave();
      setInvoiceIssued(true);
      setShowPreview(true);
      toast.success('Faktura została wystawiona!');

      // Auto-send to KSeF if enabled (skip for proforma, drafts, non-VAT documents)
      const isKsefEligible = ['invoice', 'correction', 'advance', 'final'].includes(invoiceType);
      const invoiceIdToSend = editInvoiceId || savedId;
      if (autoSendKsef && invoiceIdToSend && isKsefEligible) {
        try {
          const { data, error } = await supabase.functions.invoke('ksef-integration', {
            body: { action: 'send', invoice_id: invoiceIdToSend },
          });
          if (error || !data?.success) {
            toast.error('Faktura wystawiona, ale błąd wysyłania do KSeF: ' + (data?.error || error?.message || ''));
          } else {
            if (data.status === 'accepted' && data.ksef_reference) {
              toast.success(`Faktura przyjęta przez KSeF: ${data.ksef_reference}`);
            } else {
              toast.success(data.message || 'Faktura wysłana do KSeF');
            }
            onSaved?.();
          }
        } catch (ksefErr: any) {
          toast.error('Błąd KSeF: ' + ksefErr.message);
        }
      }
    } catch (err) {
      console.error('Error issuing invoice:', err);
      // Error toast already shown in handleSave
    } finally {
      setIsIssuing(false);
    }
  };
  

  const paymentStatus = getPaymentStatus();
  const currencySymbol = getCurrencySymbol(currency);

  const formatAmount = (amount: number) => formatCurrencyAmount(amount, currency);


  return (
    <div className="max-w-3xl mx-auto">
      {/* Form */}
      <div className="space-y-4">
        {/* Compact Header */}
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Program do Fakturowania</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Bez rejestracji • Za darmo wygeneruj PDF w przeglądarce</p>
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
          {/* Main document type selector */}
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => setShowAllTypes(!showAllTypes)}
              className="flex-1 justify-between"
            >
              <span>{DOCUMENT_TYPES.find(t => t.value === invoiceType)?.label || 'Faktura VAT'}</span>
              {showAllTypes ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
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
                    setShowAllTypes(false); // Close after selection
                  }}
                  className="text-xs h-auto py-2 px-3 whitespace-nowrap"
                  size="sm"
                >
                  {type.label}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Correction Invoice Section - shown only for correction type */}
      {invoiceType === 'correction' && (
        <CorrectionInvoiceSection
          onOriginalSelected={(originalInvoice, originalItems) => {
            // Auto-fill buyer data from original invoice
            setBuyer(prev => ({
              ...prev,
              name: originalInvoice.buyer_name || prev.name,
              nip: originalInvoice.buyer_nip || prev.nip,
              address_street: originalInvoice.buyer_address || prev.address_street,
            }));
            // Load original items into the items list (user edits them as "after" values)
            if (originalItems.length > 0) {
              setItems(originalItems.map(item => ({
                ...item,
                unit_gross_price: Math.round(item.unit_net_price * (1 + (parseFloat(item.vat_rate) || 0) / 100) * 100) / 100,
              })));
            }
            // Add correction note
            setNotes(prev => prev || `Korekta do faktury ${originalInvoice.invoice_number}`);
          }}
          onCorrectionItemsChange={(afterItems) => {
            if (afterItems.length === 0) return;
            setItems(afterItems.map((item) => ({
              ...item,
              unit_gross_price: Math.round(item.unit_net_price * (1 + (parseFloat(item.vat_rate) || 0) / 100) * 100) / 100,
              lastEditedField: 'net',
            })));
          }}
          onCorrectionDataChange={setCorrectionData}
        />
      )}

      {/* Seller Section - Collapsible */}
      <Card>
        <CardHeader 
          className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setSellerExpanded(!sellerExpanded)}
        >
          <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Sprzedawca (Twoja firma)
              {seller.name && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {seller.name}
                </span>
              )}
            </div>
            {sellerExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </CardTitle>
        </CardHeader>
        {sellerExpanded && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <FloatingInput
                  label="Pełna nazwa firmy"
                  required
                  value={seller.name}
                  onChange={(e) => setSeller(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div>
                <FloatingInput
                  label="NIP"
                  required
                  value={seller.nip}
                  onChange={(e) => setSeller(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                  maxLength={10}
                />
              </div>
              <div>
                <FloatingInput
                  label="Ulica"
                  required
                  value={seller.address_street}
                  onChange={(e) => setSeller(prev => ({ ...prev, address_street: e.target.value }))}
                />
              </div>
              <div>
                <FloatingInput
                  label="Nr budynku"
                  required
                  value={seller.address_building_number}
                  onChange={(e) => setSeller(prev => ({ ...prev, address_building_number: e.target.value }))}
                />
              </div>
              <div>
                <FloatingInput
                  label="Nr lokalu"
                  value={seller.address_apartment_number || ''}
                  onChange={(e) => setSeller(prev => ({ ...prev, address_apartment_number: e.target.value }))}
                />
              </div>
              <div>
                <FloatingInput
                  label="Kod pocztowy"
                  value={seller.address_postal_code}
                  onChange={(e) => handlePostalCodeChange('seller', e.target.value)}
                  maxLength={6}
                />
              </div>
              <div>
                <FloatingInput
                  label="Miasto"
                  value={seller.address_city}
                  onChange={(e) => setSeller(prev => ({ ...prev, address_city: e.target.value }))}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Buyer Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" />
            Nabywca (Klient)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <FloatingInput
                label="Nazwa firmy / Imię i nazwisko"
                required
                value={buyer.name}
                onChange={(e) => setBuyer(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="relative">
              <FloatingInput
                label="NIP (opcjonalnie)"
                value={buyer.nip || ''}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, '');
                  setBuyer(prev => ({ ...prev, nip: clean }));
                  if (clean.length === 10) {
                    nipLookup(clean);
                  } else {
                    nipReset();
                  }
                }}
                maxLength={10}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-12 w-10"
                onClick={() => {
                  const clean = (buyer.nip || '').replace(/\D/g, '');
                  if (clean.length === 10) nipLookup(clean);
                  else toast.error('Wpisz 10-cyfrowy NIP');
                }}
                disabled={nipLoading}
                title="Wyszukaj firmę po NIP"
              >
                {nipLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Search className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="h-12 w-full justify-between text-left font-normal relative"
                >
                  <span className="absolute left-3 top-1 text-xs text-primary">Kraj</span>
                  <span className="pt-3 text-sm">{buyer.country || 'Polska'}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <Input
                  placeholder="Szukaj kraju..."
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  className="h-9 mb-2"
                  autoFocus
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredCountries.map(c => (
                    <div 
                      key={c} 
                      className="px-2 py-1.5 text-sm hover:bg-primary/10 rounded cursor-pointer transition-colors"
                      onClick={() => {
                        setBuyer(prev => ({ ...prev, country: c }));
                        setCountrySearch('');
                      }}
                    >
                      {c}
                    </div>
                  ))}
                  {filteredCountries.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">Nie znaleziono kraju</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <div>
              <FloatingInput
                label="Ulica"
                value={buyer.address_street}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_street: e.target.value }))}
              />
            </div>
            <div>
              <FloatingInput
                label="Nr budynku"
                value={buyer.address_building_number}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_building_number: e.target.value }))}
              />
            </div>
            <div>
              <FloatingInput
                label="Nr lokalu"
                value={buyer.address_apartment_number || ''}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_apartment_number: e.target.value }))}
              />
            </div>
            <div>
              <FloatingInput
                label="Kod pocztowy"
                value={buyer.address_postal_code}
                onChange={(e) => handlePostalCodeChange('buyer', e.target.value)}
                maxLength={6}
              />
            </div>
            <div>
              <FloatingInput
                label="Miasto"
                value={buyer.address_city}
                onChange={(e) => setBuyer(prev => ({ ...prev, address_city: e.target.value }))}
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
          <div className="space-y-3">
            {/* Row 1: Numer faktury + Waluta */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FloatingInput
                  label="Numer faktury"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div className="relative">
                <div className="flex h-12 w-full rounded-md border border-input bg-background items-center px-3">
                  <span className="absolute left-3 top-1 text-xs text-primary">Waluta</span>
                  <div className="pt-3 w-full">
                    <CurrencySelector value={currency} onChange={setCurrency} />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Miejscowość wystawienia - pełna szerokość */}
            <FloatingInput
              label="Miejscowość wystawienia"
              value={issuePlace}
              onChange={(e) => setIssuePlace(e.target.value)}
            />

            {/* Row 3: Data wystawienia + Data sprzedaży */}
            <div className="grid grid-cols-2 gap-3">
              <DatePickerButton
                label="Data wystawienia"
                value={issueDate}
                onChange={setIssueDate}
                required
              />
              <DatePickerButton
                label="Data sprzedaży"
                value={saleDate}
                onChange={setSaleDate}
                required
              />
            </div>

            {/* Row 4: Termin płatności + przycisk +7 dni */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <DatePickerButton
                  label="Termin płatności"
                  value={dueDate}
                  onChange={setDueDate}
                  required
                />
              </div>
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
              
              {/* Name - full width with floating label */}
              <FloatingInput
                label="Nazwa towaru/usługi"
                required
                value={item.name}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
              />
              
              {/* Row 1: Ilość + Jednostka (always side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <FloatingInput
                  label="Ilość"
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                />
                <div className="relative">
                  <div className="flex h-12 w-full rounded-md border border-input bg-background">
                    <span className="absolute left-3 top-1 text-xs text-primary">Jedn.</span>
                    <Select value={item.unit} onValueChange={(v) => updateItem(index, 'unit', v)}>
                      <SelectTrigger className="h-12 border-0 pt-4 pb-1 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              {/* Row 2: Cena netto + Cena brutto (always side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <FloatingInput
                  label="Cena netto"
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unit_net_price || ''}
                  onChange={(e) => updateItem(index, 'unit_net_price', parseFloat(e.target.value) || 0)}
                />
                <FloatingInput
                  label="Cena brutto"
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.unit_gross_price || ''}
                  onChange={(e) => updateItem(index, 'unit_gross_price', parseFloat(e.target.value) || 0)}
                />
              </div>
              
              {/* Row 3: VAT + Suma brutto (always side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <div className="flex h-12 w-full rounded-md border border-input bg-background">
                    <span className="absolute left-3 top-1 text-xs text-primary">VAT</span>
                    <Select value={item.vat_rate} onValueChange={(v) => updateItem(index, 'vat_rate', v)}>
                      <SelectTrigger className="h-12 border-0 pt-4 pb-1 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VAT_RATES.map(r => <SelectItem key={r} value={r}>{r}%</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <FloatingInput
                  label="Suma brutto"
                  value={formatAmount(item.gross_amount)}
                  disabled
                  className="bg-muted font-medium"
                />
              </div>

              {/* Discount row (only if per_item discount enabled) */}
              {discountConfig.type === 'per_item' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1 block text-muted-foreground">Typ rabatu</Label>
                    <Select 
                      value={item.discount_type || 'percent'} 
                      onValueChange={(v) => updateItem(index, 'discount_type', v)}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="amount">{currencySymbol}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <FloatingInput
                    label={`Rabat ${(item.discount_type || 'percent') === 'percent' ? '%' : currencySymbol}`}
                    type="number"
                    min={0}
                    max={(item.discount_type || 'percent') === 'percent' ? 100 : undefined}
                    step={(item.discount_type || 'percent') === 'percent' ? 1 : 0.01}
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
                  />
                </div>
              )}
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
                      <Label>Numer konta (IBAN)</Label>
                      <Input
                        value={seller.bank_account || ''}
                        onChange={(e) => setSeller(prev => ({ ...prev, bank_account: e.target.value }))}
                        placeholder="PL00 0000 0000 0000 0000 0000 0000"
                      />
                    </div>
                    <div>
                      <Label>Kod SWIFT/BIC (dla przelewów zagranicznych)</Label>
                      <Input
                        value={(seller as any).swift_code || ''}
                        onChange={(e) => setSeller(prev => ({ ...prev, swift_code: e.target.value }))}
                        placeholder="np. BREXPLPW"
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
              {/* Logo upload section */}
              <div>
                <Label className="mb-2 block">Logo firmy (opcjonalnie)</Label>
                {companyLogo ? (
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 border rounded-lg overflow-hidden flex items-center justify-center bg-muted">
                      <img src={companyLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCompanyLogo(null)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Usuń logo
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">Dodaj logo do faktury</p>
                    <label htmlFor="logo-upload">
                      <Button variant="outline" size="sm" asChild>
                        <span>
                          <Plus className="h-4 w-4 mr-2" />
                          Wybierz plik
                        </span>
                      </Button>
                    </label>
                    <input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setCompanyLogo(event.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Compact PDF toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <Label className="font-medium">Tryb kompaktowy PDF</Label>
                  <p className="text-xs text-muted-foreground">Mniejsze marginesy i czcionki - idealne dla wielu pozycji</p>
                </div>
                <Checkbox 
                  checked={compactPdf}
                  onCheckedChange={(checked) => setCompactPdf(checked as boolean)}
                />
              </div>

              <Separator />

              {/* KSeF auto-send */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <Label className="font-medium">Wyślij do KSeF po wystawieniu</Label>
                  <p className="text-xs text-muted-foreground">Wymagane od 1.04.2026 dla faktur VAT</p>
                  {autoSendKsef && !buyer.nip?.trim() && (
                    <p className="text-xs text-amber-500 mt-1">ℹ️ Faktura B2C — zostanie wysłana bez NIP nabywcy</p>
                  )}
                </div>
                <Checkbox 
                  checked={autoSendKsef}
                  onCheckedChange={(checked) => setAutoSendKsef(checked as boolean)}
                />
              </div>

              <Separator />

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

      {/* Sticky Issue Invoice Button - always visible */}
      <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 -mx-4 mt-4">
        <div className="flex gap-2">
          {/* Save as Draft */}
          {!editInvoiceId && (
            <Button 
              variant="outline"
              size="lg"
              className="gap-2"
              disabled={isIssuing}
              onClick={async () => {
                if (!isLoggedIn) { setShowAuthModal(true); return; }
                setIsIssuing(true);
                try {
                  await handleSave(true);
                  toast.success('Szkic został zapisany');
                  onSaved?.();
                } catch { /* handled in handleSave */ }
                finally { setIsIssuing(false); }
              }}
            >
              <FileText className="h-5 w-5" />
              Zapisz szkic
            </Button>
          )}
          
          {/* Preview PDF */}
          <Button 
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={() => setShowPreview(true)}
          >
            <Eye className="h-5 w-5" />
            Podgląd
          </Button>
          
          {/* Issue Invoice - main action */}
          <Button 
            onClick={handleIssueInvoice} 
            size="lg" 
            className="flex-1 gap-2"
            disabled={isIssuing}
          >
            {isIssuing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Wystawianie...
              </>
            ) : (
              <>
                <Receipt className="h-5 w-5" />
                {editInvoiceId ? 'Zapisz zmiany' : 'Wystaw fakturę'}
              </>
            )}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          {invoiceType === 'proforma' 
            ? 'Pro forma nie jest wysyłana do KSeF. Możesz ją później przekonwertować na fakturę VAT.'
            : 'Faktura zostanie zapisana na Twoim koncie. Będziesz mógł ją pobrać jako PDF lub wysłać emailem.'
          }
        </p>
      </div>

      {/* Preview Modal - shows after invoice is issued */}
      <InvoicePreviewModal
        open={showPreview}
        onOpenChange={setShowPreview}
        invoiceData={getInvoiceData()}
        isLoggedIn={isLoggedIn}
        onSave={undefined} // No save needed - already saved
        onSend={handleSend}
        invoiceIssued={invoiceIssued}
      />
      
      {/* Auth Modal for non-logged users */}
      <AuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        initialMode="login"
        onSuccess={handleAuthSuccess}
        customDescription="Zaloguj się, aby wystawić fakturę."
      />
      </div>
    </div>
  );
}
