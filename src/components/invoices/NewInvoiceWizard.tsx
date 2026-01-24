import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  CheckCircle
} from 'lucide-react';
import { InvoiceTypeSelector, InvoiceType } from './InvoiceTypeSelector';

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
}

interface NewInvoiceWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  onCreated?: () => void;
}

const VAT_RATES = ['23%', '8%', '5%', '0%', 'zw.', 'np.'];
const UNITS = ['szt.', 'godz.', 'usł.', 'km', 'kg', 'm²', 'm³'];

export function NewInvoiceWizard({ open, onOpenChange, entityId, onCreated }: NewInvoiceWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('invoice');
  
  // Recipient state
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [nipSearch, setNipSearch] = useState('');
  const [isSearchingNip, setIsSearchingNip] = useState(false);
  const [newRecipientData, setNewRecipientData] = useState<Partial<Recipient>>({});
  
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

  useEffect(() => {
    if (open) {
      fetchRecipients();
      // Set default due date to 14 days from now
      const due = new Date();
      due.setDate(due.getDate() + 14);
      setDueDate(due.toISOString().split('T')[0]);
    }
  }, [open, entityId]);

  const fetchRecipients = async () => {
    const { data } = await supabase
      .from('invoice_recipients')
      .select('*')
      .eq('entity_id', entityId)
      .order('name');
    
    if (data) setRecipients(data);
  };

  const searchGUS = async () => {
    if (!nipSearch || nipSearch.length !== 10) {
      toast.error('NIP musi mieć 10 cyfr');
      return;
    }

    setIsSearchingNip(true);
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

    setSaving(true);
    try {
      let recipientId = selectedRecipient?.id;

      // Create new recipient if needed
      if (!recipientId && newRecipientData.name) {
        const { data: newRec, error: recError } = await supabase
          .from('invoice_recipients')
          .insert({
            entity_id: entityId,
            name: newRecipientData.name,
            nip: newRecipientData.nip,
            address_street: newRecipientData.address_street,
            address_city: newRecipientData.address_city,
            address_postal_code: newRecipientData.address_postal_code
          })
          .select()
          .single();

        if (recError) throw recError;
        recipientId = newRec.id;
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
        .eq('entity_id', entityId)
        .gte('created_at', `${year}-01-01`);
      
      const nextNum = String((count || 0) + 1).padStart(3, '0');
      const invoiceNumber = `FV/${year}/${month}/${nextNum}`;
      
      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          entity_id: entityId,
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
            <div>
              <Label className="text-base font-semibold mb-4 block">Wybierz rodzaj faktury</Label>
              <InvoiceTypeSelector value={invoiceType} onChange={setInvoiceType} />
            </div>
            
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>
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
                <Card className="mb-4 border-green-500/50 bg-green-50/50 dark:bg-green-900/10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="font-semibold">{newRecipientData.name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">NIP: {newRecipientData.nip}</p>
                        <p className="text-sm text-muted-foreground">
                          {newRecipientData.address_street}, {newRecipientData.address_postal_code} {newRecipientData.address_city}
                        </p>
                      </div>
                      <Badge variant="secondary">Z GUS</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Existing Recipients */}
              {recipients.length > 0 && (
                <div>
                  <Label className="text-sm text-muted-foreground mb-2 block">Lub wybierz z listy:</Label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {recipients.map((rec) => (
                      <Card
                        key={rec.id}
                        className={`cursor-pointer transition-all ${
                          selectedRecipient?.id === rec.id ? 'ring-2 ring-primary' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => {
                          setSelectedRecipient(rec);
                          setNewRecipientData({});
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
      </DialogContent>
    </Dialog>
  );
}
