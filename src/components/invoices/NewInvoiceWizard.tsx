import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Building2, 
  Plus, 
  Trash2,
  Loader2,
  AlertTriangle,
  FileText,
  Calculator,
  Settings2
} from 'lucide-react';
import { InvoiceTypeSelector, InvoiceType } from './InvoiceTypeSelector';
import { ContractorSelector } from './ContractorSelector';

interface InvoiceItem {
  name: string;
  quantity: number;
  unit: string;
  unit_net_price: number;
  vat_rate: string;
}

interface Contractor {
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
  entityId: string;
  onCreated?: () => void;
  onOpenCompanySetup?: () => void;
}

const VAT_RATES = ['23%', '8%', '5%', '0%', 'zw.', 'np.'];
const UNITS = ['szt.', 'godz.', 'usł.', 'km', 'kg', 'm²', 'm³'];
const BANK_VERIFICATION_THRESHOLD = 15000;

export function NewInvoiceWizard({ open, onOpenChange, entityId, onCreated, onOpenCompanySetup }: NewInvoiceWizardProps) {
  // Invoice type
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('invoice');
  
  // Contractor (recipient)
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null);
  
  // Seller (manual entry when no entityId)
  const [manualSellerData, setManualSellerData] = useState<SellerData>({
    name: '',
    nip: '',
    address_street: '',
    address_postal_code: '',
    address_city: ''
  });
  
  // Invoice items
  const [items, setItems] = useState<InvoiceItem[]>([
    { name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23%' }
  ]);
  
  // Dates & payment
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('przelew');
  const [notes, setNotes] = useState('');
  
  // UI state
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('items');
  
  // Alert dialogs
  const [showHighValueWarning, setShowHighValueWarning] = useState(false);
  
  const hasEntity = !!entityId;

  useEffect(() => {
    if (open) {
      // Set default due date to 14 days from now
      const due = new Date();
      due.setDate(due.getDate() + 14);
      setDueDate(due.toISOString().split('T')[0]);
    }
  }, [open]);

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
    // Validation
    if (!selectedContractor?.name) {
      toast.error('Wybierz lub dodaj kontrahenta');
      return;
    }

    if (items.every(item => !item.name)) {
      toast.error('Dodaj co najmniej jedną pozycję');
      return;
    }

    const totals = calculateTotals();
    
    // Check if high-value transaction - show warning but don't block
    if (totals.gross >= BANK_VERIFICATION_THRESHOLD && paymentMethod === 'przelew') {
      setShowHighValueWarning(true);
      return;
    }

    await performSave();
  };

  const performSave = async () => {
    setSaving(true);
    try {
      let effectiveEntityId = entityId;
      
      // If no entity, create one first from manual seller data
      if (!hasEntity && manualSellerData.name) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Musisz być zalogowany');
          setSaving(false);
          return;
        }
        
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
      
      // Create or find recipient
      let recipientId = selectedContractor?.id;

      if (!recipientId && selectedContractor?.name) {
        const { data: newRec, error: recError } = await supabase
          .from('invoice_recipients')
          .insert({
            entity_id: effectiveEntityId,
            name: selectedContractor.name,
            nip: selectedContractor.nip,
            address_street: selectedContractor.address_street,
            address_city: selectedContractor.address_city,
            address_postal_code: selectedContractor.address_postal_code,
            bank_account: selectedContractor.bank_account || null
          })
          .select()
          .single();

        if (recError) throw recError;
        recipientId = newRec.id;
      }

      const totals = calculateTotals();
      
      // Build buyer snapshot
      const buyerSnapshot = {
        name: selectedContractor.name,
        nip: selectedContractor.nip,
        address: [
          selectedContractor.address_street,
          [selectedContractor.address_postal_code, selectedContractor.address_city].filter(Boolean).join(' ')
        ].filter(Boolean).join(', ')
      };

      // Generate invoice number
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      
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
      resetForm();
      
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Błąd zapisu faktury');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setInvoiceType('invoice');
    setSelectedContractor(null);
    setItems([{ name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23%' }]);
    setNotes('');
    setActiveTab('items');
  };

  const handleContractorChange = (contractor: Contractor | null) => {
    setSelectedContractor(contractor);
  };

  const handleAddNewContractor = (contractor: Contractor) => {
    // New contractor added - will be saved on invoice save
    setSelectedContractor(contractor);
  };

  const totals = calculateTotals();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Nowa faktura
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Alert when no company is configured */}
          {!hasEntity && (
            <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Nie masz skonfigurowanej firmy sprzedawcy</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Skonfiguruj firmę w ustawieniach, aby korzystać z automatycznego wypełniania danych.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenCompanySetup?.();
                      }}
                    >
                      <Building2 className="h-3 w-3 mr-1" />
                      Skonfiguruj firmę
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invoice Type Selector - Compact */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Rodzaj dokumentu</Label>
            <InvoiceTypeSelector value={invoiceType} onChange={setInvoiceType} />
          </div>

          {/* Contractor Selector - Like ifirma */}
          <ContractorSelector
            entityId={entityId}
            value={selectedContractor}
            onChange={handleContractorChange}
            onAddNew={handleAddNewContractor}
          />

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="items" className="gap-2">
                <Calculator className="h-4 w-4" />
                Pozycje
              </TabsTrigger>
              <TabsTrigger value="dates" className="gap-2">
                <FileText className="h-4 w-4" />
                Daty i płatność
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Dodatkowe
              </TabsTrigger>
            </TabsList>

            {/* Items Tab */}
            <TabsContent value="items" className="space-y-4 mt-4">
              <div className="space-y-3">
                {items.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="p-3">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 sm:col-span-4">
                          <Label className="text-xs">Nazwa *</Label>
                          <Input
                            placeholder="Nazwa usługi/produktu"
                            value={item.name}
                            onChange={(e) => updateItem(index, 'name', e.target.value)}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-xs">Ilość</Label>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-1">
                          <Label className="text-xs">Jedn.</Label>
                          <Select value={item.unit} onValueChange={(v) => updateItem(index, 'unit', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-xs">Cena netto</Label>
                          <Input
                            type="number"
                            value={item.unit_net_price}
                            onChange={(e) => updateItem(index, 'unit_net_price', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-2">
                          <Label className="text-xs">VAT</Label>
                          <Select value={item.vat_rate} onValueChange={(v) => updateItem(index, 'vat_rate', v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {VAT_RATES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-6 sm:col-span-1 flex items-end justify-end pb-1">
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

              <Button variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-2" /> Dodaj pozycję
              </Button>

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
            </TabsContent>

            {/* Dates Tab */}
            <TabsContent value="dates" className="space-y-4 mt-4">
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
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="space-y-4 mt-4">
              <div>
                <Label>Uwagi na fakturze (opcjonalnie)</Label>
                <Textarea
                  placeholder="Dodatkowe informacje..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Summary & Actions */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {invoiceType === 'invoice' ? 'Faktura VAT' : invoiceType} 
                    {selectedContractor?.name && ` • ${selectedContractor.name}`}
                  </p>
                  <p className="text-xl font-bold text-primary">Do zapłaty: {totals.gross.toFixed(2)} PLN</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Anuluj
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Zapisz fakturę
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* High Value Transaction Warning - Like ifirma */}
        <AlertDialog open={showHighValueWarning} onOpenChange={setShowHighValueWarning}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Mechanizm podzielonej płatności
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4 text-left">
                <p>
                  <strong>Uwaga!</strong><br />
                  Ponieważ wartość faktury przekracza <strong>15 000,00 zł</strong> to konieczne jest 
                  sprawdzenie, czy nie jest ona objęta obowiązkiem zastosowania <strong>Mechanizmu 
                  Podzielonej Płatności (MPP)</strong>.
                </p>
                
                <p className="text-sm">
                  MPP jest bezwzględnie wymagany gdy łącznie są spełnione warunki:
                </p>
                
                <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                  <li>Wartość faktury przekracza 15 000,00 zł</li>
                  <li>Faktura jest wystawiona dla kontrahenta, który podał polski numer NIP</li>
                  <li>Faktura dotyczy towarów/usług objętych MPP (np. elektronika, paliwa, metale)</li>
                </ul>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-sm">
                  <p>
                    <strong>Informacja:</strong> Weryfikacja białej listy VAT jest zalecana przy 
                    <strong> płaceniu </strong> faktury, nie przy jej wystawianiu. Możesz kontynuować 
                    wystawienie faktury.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="mt-0">Anuluj</AlertDialogCancel>
              <Button variant="outline" onClick={() => {
                setShowHighValueWarning(false);
                performSave();
              }}>
                Wystaw fakturę
              </Button>
              <AlertDialogAction 
                onClick={() => {
                  setShowHighValueWarning(false);
                  performSave();
                }}
                className="bg-primary"
              >
                Wystaw ze split payment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
