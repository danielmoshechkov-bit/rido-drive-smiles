import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  ArrowRight, 
  Building2, 
  Search, 
  Plus, 
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldX,
  ShieldQuestion
} from 'lucide-react';
import { InvoiceTypeSelector, InvoiceType } from './InvoiceTypeSelector';
import { BankAccountSelector } from './BankAccountSelector';

interface VatStatus {
  checked: boolean;
  isActiveVat: boolean;
  statusLabel: string;
  statusVat: string;
  verifiedAt?: string;
  accountNumbers?: string[];
}

interface InvoiceItem {
  name: string;
  quantity: number;
  unit: string;
  unit_net_price: number;
  vat_rate: string;
}

interface Recipient {
  id: string;
  name: string;
  nip?: string;
  address_street?: string;
  address_city?: string;
  address_postal_code?: string;
  bank_account?: string;
}

interface SellerData {
  name: string;
  nip: string;
  regon?: string;
  address_street: string;
  address_postal_code: string;
  address_city: string;
  bank_name?: string;
  bank_account?: string;
}

interface NewInvoiceWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string; // może być pusty
  onCreated?: () => void;
  onOpenCompanySetup?: () => void;
}

const VAT_RATES = ['23%', '8%', '5%', '0%', 'zw.', 'np.'];
const UNITS = ['szt.', 'godz.', 'usł.', 'km', 'kg', 'm²', 'm³'];

export function NewInvoiceWizard({ open, onOpenChange, entityId, onCreated, onOpenCompanySetup }: NewInvoiceWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('invoice');
  
  // Seller (manual entry when no entityId)
  const [manualSellerData, setManualSellerData] = useState<SellerData>({
    name: '',
    nip: '',
    address_street: '',
    address_postal_code: '',
    address_city: ''
  });
  const [showManualSellerForm, setShowManualSellerForm] = useState(false);
  
  // Recipient state
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [nipSearch, setNipSearch] = useState('');
  const [isSearchingNip, setIsSearchingNip] = useState(false);
  const [newRecipientData, setNewRecipientData] = useState<Partial<Recipient>>({});
  
  // VAT verification state
  const [vatStatus, setVatStatus] = useState<VatStatus | null>(null);
  const [isVerifyingVat, setIsVerifyingVat] = useState(false);
  const [showVatWarningDialog, setShowVatWarningDialog] = useState(false);
  
  // Bank account verification state
  const [recipientBankAccount, setRecipientBankAccount] = useState('');
  const [bankAccountVerified, setBankAccountVerified] = useState<boolean | null>(null);
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const [showBankWarningDialog, setShowBankWarningDialog] = useState(false);
  
  // Invoice items
  const [items, setItems] = useState<InvoiceItem[]>([
    { name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23%' }
  ]);
  
  // Dates & payment
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('przelew');
  const [notes, setNotes] = useState('');
  
  const [saving, setSaving] = useState(false);
  
  // Bank account limit for whitelist verification (15000 PLN)
  const BANK_VERIFICATION_THRESHOLD = 15000;
  
  // Check if entity is available
  const hasEntity = !!entityId;

  useEffect(() => {
    if (open) {
      if (hasEntity) {
        fetchRecipients();
      }
      // Set default due date to 14 days from now
      const due = new Date();
      due.setDate(due.getDate() + 14);
      setDueDate(due.toISOString().split('T')[0]);
      
      // Show manual seller form if no entity
      if (!hasEntity) {
        setShowManualSellerForm(true);
      }
    }
  }, [open, entityId, hasEntity]);

  const fetchRecipients = async () => {
    if (!entityId) return;
    const { data } = await supabase
      .from('invoice_recipients')
      .select('*')
      .eq('entity_id', entityId)
      .order('name');
    
    if (data) setRecipients(data);
  };

  const verifyVatStatus = async (nip: string) => {
    setIsVerifyingVat(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-whitelist', {
        body: { nip }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const isActive = data.data.statusVat === 'Czynny';
        const isExempt = data.data.statusVat === 'Zwolniony';
        setVatStatus({
          checked: true,
          isActiveVat: isActive || isExempt,
          statusLabel: data.data.statusLabel || data.data.statusVat,
          statusVat: data.data.statusVat,
          verifiedAt: new Date().toISOString(),
          accountNumbers: data.data.accountNumbers
        });
        
        if (!isActive && !isExempt) {
          toast.warning(`Uwaga: ${data.data.statusLabel || data.data.statusVat}`);
        }
      } else {
        setVatStatus({
          checked: true,
          isActiveVat: false,
          statusLabel: data?.error || 'Nie znaleziono w bazie MF',
          statusVat: 'unknown',
          verifiedAt: new Date().toISOString()
        });
        toast.warning('Nie znaleziono kontrahenta w Wykazie Podatników VAT');
      }
    } catch (err) {
      console.error('VAT verification error:', err);
      setVatStatus({
        checked: true,
        isActiveVat: false,
        statusLabel: 'Błąd weryfikacji',
        statusVat: 'error',
        verifiedAt: new Date().toISOString()
      });
      toast.error('Błąd weryfikacji statusu VAT');
    } finally {
      setIsVerifyingVat(false);
    }
  };

  const searchGUS = async () => {
    if (!nipSearch || nipSearch.length !== 10) {
      toast.error('NIP musi mieć 10 cyfr');
      return;
    }

    setIsSearchingNip(true);
    setVatStatus(null); // Reset VAT status
    
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip: nipSearch }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const gus = data.data;
        setNewRecipientData({
          name: gus.name,
          nip: gus.nip,
          address_street: gus.address,
          address_city: gus.city,
          address_postal_code: gus.postalCode
        });
        toast.success('Dane pobrane z GUS');
        
        // Automatyczne sprawdzenie VAT po pobraniu z GUS
        await verifyVatStatus(gus.nip);
        
        setStep(2);
      } else {
        toast.error(data?.error || 'Nie znaleziono firmy');
      }
    } catch (err) {
      console.error('GUS error:', err);
      toast.error('Błąd pobierania danych z GUS');
    } finally {
      setIsSearchingNip(false);
    }
  };

  // VAT Status Badge Component
  const VatStatusBadge = () => {
    if (isVerifyingVat) {
      return (
        <Badge variant="outline" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Weryfikacja VAT...
        </Badge>
      );
    }

    if (!vatStatus?.checked) {
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <ShieldQuestion className="h-3 w-3" />
          VAT niesprawdzony
        </Badge>
      );
    }

    if (vatStatus.statusVat === 'Czynny') {
      return (
        <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
          <ShieldCheck className="h-3 w-3" />
          Czynny podatnik VAT
        </Badge>
      );
    }

    if (vatStatus.statusVat === 'Zwolniony') {
      return (
        <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <ShieldCheck className="h-3 w-3" />
          Zwolniony z VAT
        </Badge>
      );
    }

    // Niezarejestrowany, unknown, error
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldX className="h-3 w-3" />
        {vatStatus.statusLabel}
      </Badge>
    );
  };

  // Bank account verification function
  const verifyBankAccount = async (nip: string, bankAccount: string): Promise<boolean> => {
    const cleanAccount = bankAccount.replace(/[\s-]/g, '');
    
    if (!cleanAccount || cleanAccount.length < 26) {
      toast.error('Numer konta musi mieć 26 cyfr');
      return false;
    }
    
    // Check if we already have account numbers from whitelist
    if (vatStatus?.accountNumbers && vatStatus.accountNumbers.length > 0) {
      const isOnWhitelist = vatStatus.accountNumbers.some(
        acc => acc.replace(/[\s-]/g, '') === cleanAccount
      );
      setBankAccountVerified(isOnWhitelist);
      return isOnWhitelist;
    }
    
    // Fetch from API
    setIsVerifyingBank(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-whitelist', {
        body: { nip, bankAccount: cleanAccount }
      });
      
      if (error) throw error;
      
      if (data?.success && data?.data) {
        const isVerified = data.data.bankAccountVerified === true;
        setBankAccountVerified(isVerified);
        
        // Update vatStatus with account numbers
        if (data.data.accountNumbers) {
          setVatStatus(prev => prev ? {
            ...prev,
            accountNumbers: data.data.accountNumbers
          } : {
            checked: true,
            isActiveVat: data.data.statusVat === 'Czynny',
            statusLabel: data.data.statusLabel || data.data.statusVat,
            statusVat: data.data.statusVat,
            verifiedAt: new Date().toISOString(),
            accountNumbers: data.data.accountNumbers
          });
        }
        
        if (isVerified) {
          toast.success('Konto bankowe zweryfikowane na białej liście');
        } else {
          toast.warning('Konto NIE znajduje się na białej liście MF');
        }
        
        return isVerified;
      }
      
      setBankAccountVerified(false);
      return false;
    } catch (err) {
      console.error('Bank verification error:', err);
      setBankAccountVerified(null);
      toast.error('Błąd weryfikacji konta bankowego');
      return false;
    } finally {
      setIsVerifyingBank(false);
    }
  };

  // Bank Account Status Badge Component
  const BankAccountStatusBadge = () => {
    if (isVerifyingBank) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Weryfikacja konta...
        </div>
      );
    }

    if (bankAccountVerified === null) {
      return null;
    }

    if (bankAccountVerified) {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <ShieldCheck className="h-4 w-4" />
          Konto na białej liście MF
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <ShieldX className="h-4 w-4" />
        Konto NIE znajduje się na białej liście MF
      </div>
    );
  };

  const addItem = () => {
    setItems([...items, { name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23%' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const calculateTotals = () => {
    let totalNet = 0;
    let totalVat = 0;

    items.forEach(item => {
      const net = item.quantity * item.unit_net_price;
      totalNet += net;
      
      const vatRate = parseFloat(item.vat_rate.replace('%', '')) || 0;
      totalVat += net * (vatRate / 100);
    });

    return {
      net: totalNet,
      vat: totalVat,
      gross: totalNet + totalVat
    };
  };

  const handleSave = async () => {
    if (!selectedRecipient && !newRecipientData.name) {
      toast.error('Wybierz lub dodaj odbiorcę');
      return;
    }

    if (items.every(item => !item.name)) {
      toast.error('Dodaj co najmniej jedną pozycję');
      return;
    }

    const totals = calculateTotals();
    const recipientNip = selectedRecipient?.nip || newRecipientData.nip;
    
    // Check bank account verification for transactions >= 15000 PLN
    if (totals.gross >= BANK_VERIFICATION_THRESHOLD && paymentMethod === 'przelew') {
      if (!recipientBankAccount) {
        toast.error('Przy transakcjach powyżej 15 000 PLN wymagany jest numer konta bankowego');
        return;
      }
      
      if (recipientNip && bankAccountVerified !== true) {
        // Verify bank account first
        const isVerified = await verifyBankAccount(recipientNip, recipientBankAccount);
        if (!isVerified) {
          setShowBankWarningDialog(true);
          return;
        }
      }
    }

    // Sprawdź status VAT przed zapisem - pokaż ostrzeżenie jeśli nieaktywny
    if (vatStatus?.checked && !vatStatus.isActiveVat) {
      setShowVatWarningDialog(true);
      return;
    }

    await performSave();
  };
  
  const proceedAfterBankWarning = () => {
    setShowBankWarningDialog(false);
    // Continue to VAT check or save
    if (vatStatus?.checked && !vatStatus.isActiveVat) {
      setShowVatWarningDialog(true);
    } else {
      performSave();
    }
  };

  const performSave = async () => {
    setSaving(true);
    try {
      // If no entity, create one first from manual seller data
      let effectiveEntityId = entityId;
      
      if (!hasEntity && manualSellerData.name) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Musisz być zalogowany');
          setSaving(false);
          return;
        }
        
        // Create new entity - don't pass owner_user_id, let DB default handle it
        const { data: newEntity, error: entityError } = await supabase
          .from('entities')
          .insert({
            name: manualSellerData.name,
            nip: manualSellerData.nip || null,
            regon: manualSellerData.regon || null,
            address_street: manualSellerData.address_street || null,
            address_city: manualSellerData.address_city || null,
            address_postal_code: manualSellerData.address_postal_code || null,
            bank_name: manualSellerData.bank_name || null,
            bank_account: manualSellerData.bank_account || null,
            type: 'jdg'
            // owner_user_id uses DB default: auth.uid()
          })
          .select('id')
          .single();
        
        if (entityError) {
          console.error('Entity creation error:', entityError);
          toast.error('Nie udało się utworzyć firmy sprzedawcy');
          setSaving(false);
          return;
        }
        
        effectiveEntityId = newEntity.id;
        toast.success('Firma sprzedawcy utworzona automatycznie');
      }
      
      if (!effectiveEntityId) {
        toast.error('Brak danych sprzedawcy - wprowadź dane lub skonfiguruj firmę');
        setSaving(false);
        return;
      }
      
      let recipientId = selectedRecipient?.id;

      // Create new recipient if needed
      if (!recipientId && newRecipientData.name) {
        const { data: newRec, error: recError } = await supabase
          .from('invoice_recipients')
          .insert({
            entity_id: effectiveEntityId,
            name: newRecipientData.name,
            nip: newRecipientData.nip,
            address_street: newRecipientData.address_street,
            address_city: newRecipientData.address_city,
            address_postal_code: newRecipientData.address_postal_code,
            bank_account: recipientBankAccount || null
          })
          .select()
          .single();

        if (recError) throw recError;
        recipientId = newRec.id;
      } else if (recipientId && recipientBankAccount) {
        // Update existing recipient with bank account
        await supabase
          .from('invoice_recipients')
          .update({ bank_account: recipientBankAccount })
          .eq('id', recipientId);
      }

      const totals = calculateTotals();
      
      // Build buyer snapshot for invoice
      const buyerData = selectedRecipient || newRecipientData;
      const buyerSnapshot = {
        name: buyerData.name,
        nip: buyerData.nip,
        address: [
          buyerData.address_street,
          [buyerData.address_postal_code, buyerData.address_city].filter(Boolean).join(' ')
        ].filter(Boolean).join(', ')
      };

      // Generate invoice number
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      
      // Get next number in sequence
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('entity_id', effectiveEntityId)
        .gte('created_at', `${year}-01-01`);
      
      const nextNum = String((count || 0) + 1).padStart(3, '0');
      const invoiceNumber = `FV/${year}/${month}/${nextNum}`;
      
      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          entity_id: effectiveEntityId,
          recipient_id: recipientId,
          invoice_number: invoiceNumber,
          type: invoiceType,
          issue_date: issueDate,
          due_date: dueDate,
          payment_method: paymentMethod,
          net_amount: totals.net,
          vat_amount: totals.vat,
          gross_amount: totals.gross,
          notes,
          status: 'draft',
          buyer_snapshot: buyerSnapshot
        })
        .select()
        .single();

      if (invError) throw invError;

      // Create invoice items
      const itemsToInsert = items
        .filter(item => item.name)
        .map(item => {
          const net = item.quantity * item.unit_net_price;
          const vatRate = parseFloat(item.vat_rate.replace('%', '')) || 0;
          const vatAmount = net * (vatRate / 100);
          
          return {
            invoice_id: invoice.id,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unit_net_price: item.unit_net_price,
            vat_rate: item.vat_rate,
            net_amount: net,
            vat_amount: vatAmount,
            gross_amount: net + vatAmount
          };
        });

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      toast.success('Faktura utworzona jako szkic');
      onOpenChange(false);
      onCreated?.();
      
      // Reset form
      setStep(1);
      setInvoiceType('invoice');
      setSelectedRecipient(null);
      setNewRecipientData({});
      setVatStatus(null);
      setShowVatWarningDialog(false);
      setShowBankWarningDialog(false);
      setRecipientBankAccount('');
      setBankAccountVerified(null);
      setItems([{ name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23%' }]);
      setNotes('');
      
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Błąd zapisu faktury');
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Nowa faktura - Krok {step} z 4
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Invoice Type */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Alert when no company is configured */}
            {!hasEntity && (
              <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Nie masz skonfigurowanej firmy sprzedawcy</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Możesz kontynuować i wprowadzić dane ręcznie, lub skonfigurować firmę w ustawieniach aby korzystać z automatycznego wypełniania.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onOpenChange(false);
                            onOpenCompanySetup?.();
                          }}
                        >
                          <Building2 className="h-3 w-3 mr-1" />
                          Skonfiguruj firmę
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowManualSellerForm(true)}
                        >
                          Wprowadź ręcznie
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Manual Seller Data Form */}
            {showManualSellerForm && !hasEntity && (
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-4">
                  <Label className="text-sm font-semibold">Dane sprzedawcy (ręczne wprowadzanie)</Label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Nazwa firmy *</Label>
                      <Input
                        value={manualSellerData.name}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Nazwa firmy"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">NIP *</Label>
                      <Input
                        value={manualSellerData.nip}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                        placeholder="1234567890"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">REGON</Label>
                      <Input
                        value={manualSellerData.regon || ''}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, regon: e.target.value }))}
                        placeholder="REGON (opcjonalnie)"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Adres (ulica) *</Label>
                      <Input
                        value={manualSellerData.address_street}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, address_street: e.target.value }))}
                        placeholder="ul. Przykładowa 1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Kod pocztowy *</Label>
                      <Input
                        value={manualSellerData.address_postal_code}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, address_postal_code: e.target.value }))}
                        placeholder="00-000"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Miasto *</Label>
                      <Input
                        value={manualSellerData.address_city}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, address_city: e.target.value }))}
                        placeholder="Miasto"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Nazwa banku</Label>
                      <Input
                        value={manualSellerData.bank_name || ''}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, bank_name: e.target.value }))}
                        placeholder="PKO BP"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Numer konta</Label>
                      <Input
                        value={manualSellerData.bank_account || ''}
                        onChange={(e) => setManualSellerData(prev => ({ ...prev, bank_account: e.target.value }))}
                        placeholder="00 0000 0000 0000 0000 0000 0000"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <div>
              <Label className="text-base font-semibold mb-4 block">Wybierz rodzaj faktury</Label>
              <InvoiceTypeSelector value={invoiceType} onChange={setInvoiceType} />
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={() => setStep(2)}
                disabled={!hasEntity && showManualSellerForm && !manualSellerData.name}
              >
                Dalej <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Recipient */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-semibold mb-4 block">Odbiorca faktury</Label>
              
              {/* Search by NIP */}
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Wpisz NIP i pobierz dane z GUS..."
                  value={nipSearch}
                  onChange={(e) => setNipSearch(e.target.value.replace(/\D/g, ''))}
                  maxLength={10}
                />
                <Button onClick={searchGUS} disabled={isSearchingNip}>
                  {isSearchingNip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* GUS Result */}
              {newRecipientData.name && !selectedRecipient && (
                <Card className={`mb-4 border-2 ${
                  vatStatus?.isActiveVat 
                    ? 'border-green-500/50 bg-green-50/50 dark:bg-green-900/10' 
                    : vatStatus?.checked 
                      ? 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-900/10'
                      : 'border-muted'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="font-semibold">{newRecipientData.name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">NIP: {newRecipientData.nip}</p>
                        <p className="text-sm text-muted-foreground">
                          {newRecipientData.address_street}, {newRecipientData.address_postal_code} {newRecipientData.address_city}
                        </p>
                        
                        {/* VAT Status Info */}
                        {vatStatus?.checked && vatStatus.verifiedAt && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Sprawdzono: {new Date(vatStatus.verifiedAt).toLocaleString('pl-PL')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="secondary">Z GUS</Badge>
                        <VatStatusBadge />
                      </div>
                    </div>
                    
                    {/* Warning Alert */}
                    {vatStatus?.checked && !vatStatus.isActiveVat && (
                      <div className="mt-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-destructive">
                            Kontrahent nie jest czynnym podatnikiem VAT
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Wystawiając fakturę VAT dla tego kontrahenta, możesz narazić się na problemy z odliczeniem podatku.
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Whitelist Bank Accounts */}
                    {vatStatus?.accountNumbers && vatStatus.accountNumbers.length > 0 && (
                      <div className="mt-4">
                        <BankAccountSelector
                          accounts={vatStatus.accountNumbers}
                          selectedAccount={recipientBankAccount}
                          onSelectAccount={(account) => {
                            setRecipientBankAccount(account);
                            setBankAccountVerified(true);
                          }}
                          companyName={newRecipientData.name || nipSearch}
                          nip={nipSearch}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              
              {/* Existing Recipients with VAT Check */}
              {selectedRecipient && (
                <Card className="mb-4 ring-2 ring-primary">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{selectedRecipient.name}</p>
                        {selectedRecipient.nip && <p className="text-sm text-muted-foreground">NIP: {selectedRecipient.nip}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline">Wybrany</Badge>
                        {selectedRecipient.nip && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => verifyVatStatus(selectedRecipient.nip!)}
                            disabled={isVerifyingVat}
                          >
                            {isVerifyingVat ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <ShieldCheck className="h-3 w-3 mr-1" />
                            )}
                            Sprawdź VAT
                          </Button>
                        )}
                      </div>
                    </div>
                    {vatStatus?.checked && selectedRecipient.nip && (
                      <div className="mt-2">
                        <VatStatusBadge />
                        {!vatStatus.isActiveVat && (
                          <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            {vatStatus.statusLabel}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Existing Recipients */}
              {recipients.length > 0 && !selectedRecipient && (
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Lub wybierz z listy:</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recipients.map((rec) => (
                      <Card
                        key={rec.id}
                        className="cursor-pointer transition-all hover:bg-muted/50"
                        onClick={() => {
                          setSelectedRecipient(rec);
                          setNewRecipientData({});
                          setVatStatus(null); // Reset VAT when changing recipient
                          setRecipientBankAccount(rec.bank_account || '');
                          setBankAccountVerified(null);
                        }}
                      >
                        <CardContent className="p-3">
                          <p className="font-medium">{rec.name}</p>
                          {rec.nip && <p className="text-sm text-muted-foreground">NIP: {rec.nip}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Bank Account Input - visible when recipient is selected/created */}
              {(selectedRecipient || newRecipientData.name) && (
                <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                  <Label className="text-sm font-medium mb-2 block">
                    Numer konta bankowego kontrahenta
                    {paymentMethod === 'przelew' && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (wymagane powyżej 15 000 PLN)
                      </span>
                    )}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="00 0000 0000 0000 0000 0000 0000"
                      value={recipientBankAccount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d\s]/g, '');
                        setRecipientBankAccount(value);
                        setBankAccountVerified(null);
                      }}
                      className="font-mono"
                    />
                    {recipientBankAccount && (selectedRecipient?.nip || newRecipientData.nip) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => verifyBankAccount(
                          (selectedRecipient?.nip || newRecipientData.nip)!,
                          recipientBankAccount
                        )}
                        disabled={isVerifyingBank}
                      >
                        {isVerifyingBank ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  
                  <div className="mt-2">
                    <BankAccountStatusBadge />
                  </div>
                  
                  {/* Whitelist accounts for selected recipient */}
                  {selectedRecipient?.nip && vatStatus?.accountNumbers && vatStatus.accountNumbers.length > 0 && (
                    <div className="mt-4">
                      <BankAccountSelector
                        accounts={vatStatus.accountNumbers}
                        selectedAccount={recipientBankAccount}
                        onSelectAccount={(account) => {
                          setRecipientBankAccount(account);
                          setBankAccountVerified(true);
                        }}
                        companyName={selectedRecipient.name}
                        nip={selectedRecipient.nip}
                        compact
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Wstecz
              </Button>
              <Button 
                onClick={() => setStep(3)}
                disabled={!selectedRecipient && !newRecipientData.name}
              >
                Dalej <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Items */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <Label className="text-base font-semibold mb-4 block">Pozycje faktury</Label>
              
              <div className="space-y-3">
                {items.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="p-3">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 sm:col-span-4">
                          <Input
                            placeholder="Nazwa usługi/produktu"
                            value={item.name}
                            onChange={(e) => updateItem(index, 'name', e.target.value)}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            type="number"
                            placeholder="Ilość"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Select value={item.unit} onValueChange={(v) => updateItem(index, 'unit', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            type="number"
                            placeholder="Cena netto"
                            value={item.unit_net_price}
                            onChange={(e) => updateItem(index, 'unit_net_price', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-1">
                          <Select value={item.vat_rate} onValueChange={(v) => updateItem(index, 'vat_rate', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {VAT_RATES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-6 sm:col-span-1 flex items-center justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                            disabled={items.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button variant="outline" className="mt-3" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" /> Dodaj pozycję
              </Button>
            </div>

            {/* Totals */}
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-right">
                  <div>
                    <p className="text-sm text-muted-foreground">Netto</p>
                    <p className="text-lg font-semibold">{totals.net.toFixed(2)} PLN</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">VAT</p>
                    <p className="text-lg font-semibold">{totals.vat.toFixed(2)} PLN</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Brutto</p>
                    <p className="text-xl font-bold text-primary">{totals.gross.toFixed(2)} PLN</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Wstecz
              </Button>
              <Button onClick={() => setStep(4)}>
                Dalej <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Dates & Save */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data wystawienia</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
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
            </div>

            <div>
              <Label>Metoda płatności</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="przelew">Przelew bankowy</SelectItem>
                  <SelectItem value="gotowka">Gotówka</SelectItem>
                  <SelectItem value="karta">Karta płatnicza</SelectItem>
                  <SelectItem value="blik">BLIK</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Uwagi (opcjonalnie)</Label>
              <Textarea
                placeholder="Dodatkowe informacje..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Summary */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <h4 className="font-semibold mb-2">Podsumowanie</h4>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Typ:</span> {invoiceType === 'invoice' ? 'Faktura VAT' : invoiceType}</p>
                  <p><span className="text-muted-foreground">Odbiorca:</span> {selectedRecipient?.name || newRecipientData.name}</p>
                  <p><span className="text-muted-foreground">Pozycji:</span> {items.filter(i => i.name).length}</p>
                  <p className="text-lg font-bold text-primary">Do zapłaty: {totals.gross.toFixed(2)} PLN</p>
                </div>
              </CardContent>
            </Card>
            
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Wstecz
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Zapisz szkic
              </Button>
            </div>
          </div>
        )}

        {/* VAT Warning Dialog */}
        <AlertDialog open={showVatWarningDialog} onOpenChange={setShowVatWarningDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Ostrzeżenie - Status VAT kontrahenta
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Kontrahent <strong>{newRecipientData.name || selectedRecipient?.name}</strong> 
                  ma status: <strong className="text-destructive">{vatStatus?.statusLabel}</strong>
                </p>
                <p>
                  Wystawiając fakturę VAT dla podmiotu, który nie jest czynnym podatnikiem VAT, 
                  możesz narazić się na:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>Brak możliwości odliczenia VAT przez kontrahenta</li>
                  <li>Problemy podczas kontroli skarbowej</li>
                  <li>Konieczność korygowania dokumentów</li>
                </ul>
                <p className="font-medium pt-2">
                  Czy mimo to chcesz zapisać fakturę?
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => {
                  setShowVatWarningDialog(false);
                  performSave();
                }}
                className="bg-destructive hover:bg-destructive/90"
              >
                Zapisz mimo ostrzeżenia
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bank Account Warning Dialog */}
        <AlertDialog open={showBankWarningDialog} onOpenChange={setShowBankWarningDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Konto bankowe spoza białej listy VAT
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Kwota faktury wynosi <strong>{calculateTotals().gross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN brutto</strong>, 
                  co przekracza limit 15 000 PLN.
                </p>
                <p>
                  Podany numer konta bankowego kontrahenta 
                  <strong className="text-destructive"> nie znajduje się na białej liście </strong>
                  Ministerstwa Finansów.
                </p>
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded">
                  <p className="font-medium text-sm">Konsekwencje płatności na to konto (art. 117ba Ordynacji podatkowej):</p>
                  <ul className="list-disc list-inside text-sm mt-1 space-y-1 text-muted-foreground">
                    <li>Brak możliwości zaliczenia wydatku do kosztów podatkowych</li>
                    <li>Odpowiedzialność solidarna za VAT kontrahenta</li>
                    <li>Potencjalne sankcje podczas kontroli skarbowej</li>
                  </ul>
                </div>
                <p className="font-medium">
                  Czy mimo to chcesz zapisać fakturę?
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Popraw dane</AlertDialogCancel>
              <AlertDialogAction 
                onClick={proceedAfterBankWarning}
                className="bg-destructive hover:bg-destructive/90"
              >
                Zapisz mimo ostrzeżenia
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
