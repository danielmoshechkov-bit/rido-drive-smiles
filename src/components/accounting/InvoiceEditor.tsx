import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Save, FileText, Send, Loader2, Calculator } from 'lucide-react';

interface InvoiceItem {
  id?: string;
  name: string;
  pkwiu?: string;
  quantity: number;
  unit: string;
  unit_net_price: number;
  vat_rate: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
}

interface InvoiceRecipient {
  id: string;
  name: string;
  nip?: string;
  address_street?: string;
  address_city?: string;
  address_postal_code?: string;
}

interface InvoiceEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  invoiceId?: string | null;
  onSaved?: () => void;
}

const VAT_RATES = [
  { value: '23', label: '23%' },
  { value: '8', label: '8%' },
  { value: '5', label: '5%' },
  { value: '0', label: '0%' },
  { value: 'zw', label: 'zw.' },
  { value: 'np', label: 'np.' },
];

const UNITS = ['szt.', 'usł.', 'godz.', 'km', 'kg', 'm', 'm²', 'm³', 'dni'];

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Przelew' },
  { value: 'cash', label: 'Gotówka' },
  { value: 'card', label: 'Karta' },
  { value: 'other', label: 'Inne' },
];

export function InvoiceEditor({ open, onOpenChange, entityId, invoiceId, onSaved }: InvoiceEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  
  // Invoice data
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceType, setInvoiceType] = useState('invoice');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('draft');
  
  // Buyer
  const [recipients, setRecipients] = useState<InvoiceRecipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');
  const [buyerSnapshot, setBuyerSnapshot] = useState<any>(null);
  
  // Items
  const [items, setItems] = useState<InvoiceItem[]>([
    { name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23', net_amount: 0, vat_amount: 0, gross_amount: 0 }
  ]);

  // Totals
  const [totals, setTotals] = useState({ net: 0, vat: 0, gross: 0 });

  useEffect(() => {
    if (open && entityId) {
      fetchRecipients();
      generateInvoiceNumber();
      
      // Set default due date (14 days from issue)
      const due = new Date();
      due.setDate(due.getDate() + 14);
      setDueDate(due.toISOString().split('T')[0]);
      
      if (invoiceId) {
        fetchInvoice();
      }
    }
  }, [open, entityId, invoiceId]);

  useEffect(() => {
    calculateTotals();
  }, [items]);

  const fetchRecipients = async () => {
    try {
      const { data, error } = await supabase
        .from('invoice_recipients')
        .select('*')
        .eq('entity_id', entityId)
        .order('name');

      if (error) throw error;
      setRecipients(data || []);
    } catch (error) {
      console.error('Error fetching recipients:', error);
    }
  };

  const generateInvoiceNumber = async () => {
    try {
      // Get default series for entity
      const { data: series } = await supabase
        .from('invoice_series')
        .select('*')
        .eq('entity_id', entityId)
        .eq('is_default', true)
        .maybeSingle();

      if (series) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const seq = String(series.sequence_current + 1).padStart(4, '0');
        
        let number = series.pattern || '{PREFIX}{SEQ}/{MM}/{YYYY}';
        number = number.replace('{PREFIX}', series.prefix || 'FV/');
        number = number.replace('{YYYY}', String(year));
        number = number.replace('{MM}', month);
        number = number.replace('{SEQ}', seq);
        
        setInvoiceNumber(number);
      } else {
        // Fallback numbering
        const now = new Date();
        const count = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('entity_id', entityId);
        
        const seq = String((count.count || 0) + 1).padStart(4, '0');
        setInvoiceNumber(`FV/${seq}/${now.getMonth() + 1}/${now.getFullYear()}`);
      }
    } catch (error) {
      console.error('Error generating invoice number:', error);
      setInvoiceNumber(`FV/${Date.now()}`);
    }
  };

  const fetchInvoice = async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', invoiceId)
        .single();

      if (error) throw error;
      
      setInvoiceNumber(invoice.invoice_number);
      setInvoiceType(invoice.type);
      setIssueDate(invoice.issue_date);
      setSaleDate(invoice.sale_date || invoice.issue_date);
      setDueDate(invoice.due_date);
      setPaymentMethod(invoice.payment_method);
      setNotes(invoice.notes || '');
      setStatus(invoice.status);
      setBuyerSnapshot(invoice.buyer_snapshot);
      
      if (invoice.invoice_items?.length > 0) {
        setItems(invoice.invoice_items.map((item: any) => ({
          id: item.id,
          name: item.name,
          pkwiu: item.pkwiu,
          quantity: item.quantity,
          unit: item.unit,
          unit_net_price: item.unit_net_price,
          vat_rate: item.vat_rate,
          net_amount: item.net_amount,
          vat_amount: item.vat_amount,
          gross_amount: item.gross_amount,
        })));
      }
    } catch (error: any) {
      console.error('Error fetching invoice:', error);
      toast.error('Błąd ładowania faktury');
    } finally {
      setLoading(false);
    }
  };

  const calculateItemAmounts = (item: InvoiceItem): InvoiceItem => {
    const net = item.quantity * item.unit_net_price;
    let vatRate = 0;
    if (!['zw', 'np'].includes(item.vat_rate)) {
      vatRate = parseFloat(item.vat_rate) / 100;
    }
    const vat = net * vatRate;
    const gross = net + vat;
    
    return {
      ...item,
      net_amount: Math.round(net * 100) / 100,
      vat_amount: Math.round(vat * 100) / 100,
      gross_amount: Math.round(gross * 100) / 100,
    };
  };

  const calculateTotals = () => {
    const net = items.reduce((sum, item) => sum + item.net_amount, 0);
    const vat = items.reduce((sum, item) => sum + item.vat_amount, 0);
    const gross = items.reduce((sum, item) => sum + item.gross_amount, 0);
    
    setTotals({
      net: Math.round(net * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      gross: Math.round(gross * 100) / 100,
    });
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    newItems[index] = calculateItemAmounts(newItems[index]);
    setItems(newItems);
  };

  const addItem = () => {
    setItems([
      ...items,
      { name: '', quantity: 1, unit: 'szt.', unit_net_price: 0, vat_rate: '23', net_amount: 0, vat_amount: 0, gross_amount: 0 }
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      toast.error('Faktura musi mieć co najmniej jedną pozycję');
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const selectRecipient = (recipientId: string) => {
    const recipient = recipients.find(r => r.id === recipientId);
    if (recipient) {
      setSelectedRecipientId(recipientId);
      setBuyerSnapshot({
        name: recipient.name,
        nip: recipient.nip,
        address_street: recipient.address_street,
        address_city: recipient.address_city,
        address_postal_code: recipient.address_postal_code,
      });
    }
  };

  const handleSave = async (andIssue: boolean = false) => {
    if (!invoiceNumber.trim()) {
      toast.error('Numer faktury jest wymagany');
      return;
    }
    if (items.some(item => !item.name.trim())) {
      toast.error('Wszystkie pozycje muszą mieć nazwę');
      return;
    }
    if (!buyerSnapshot?.name) {
      toast.error('Wybierz nabywcę');
      return;
    }

    setSaving(true);
    try {
      const invoiceData = {
        entity_id: entityId,
        invoice_number: invoiceNumber,
        type: invoiceType,
        status: andIssue ? 'issued' : 'draft',
        issue_date: issueDate,
        sale_date: saleDate,
        due_date: dueDate,
        payment_method: paymentMethod,
        currency: 'PLN',
        net_amount: totals.net,
        vat_amount: totals.vat,
        gross_amount: totals.gross,
        paid_amount: 0,
        buyer_entity_snapshot: buyerSnapshot,
        notes,
        created_by: 'user',
      };

      let savedInvoiceId = invoiceId;

      if (invoiceId) {
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', invoiceId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();
        if (error) throw error;
        savedInvoiceId = data.id;

        // Update series sequence by incrementing
        const { data: seriesData } = await supabase
          .from('invoice_series')
          .select('sequence_current')
          .eq('entity_id', entityId)
          .eq('is_default', true)
          .single();
        
        if (seriesData) {
          await supabase
            .from('invoice_series')
            .update({ sequence_current: (seriesData.sequence_current || 0) + 1 })
            .eq('entity_id', entityId)
            .eq('is_default', true);
        }
      }

      // Save items
      if (savedInvoiceId) {
        // Delete existing items
        await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', savedInvoiceId);

        // Insert new items
        const itemsToInsert = items.map((item, index) => ({
          invoice_id: savedInvoiceId,
          name: item.name,
          pkwiu: item.pkwiu || null,
          quantity: item.quantity,
          unit: item.unit,
          unit_net_price: item.unit_net_price,
          vat_rate: item.vat_rate,
          net_amount: item.net_amount,
          vat_amount: item.vat_amount,
          gross_amount: item.gross_amount,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      // Log to audit
      await supabase.from('audit_log').insert({
        action: invoiceId ? 'invoice_updated' : 'invoice_created',
        target_type: 'invoice',
        target_id: savedInvoiceId,
        metadata: { invoice_number: invoiceNumber, status: andIssue ? 'issued' : 'draft' },
      });

      // Auto-send to KSeF if configured and issuing
      if (andIssue && savedInvoiceId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: ksefSettings } = await supabase
              .from('company_settings')
              .select('nip, ksef_token, ksef_environment')
              .eq('user_id', user.id)
              .maybeSingle();

            if (ksefSettings?.ksef_token && ksefSettings?.nip) {
              const { data: ksefRes } = await supabase.functions.invoke('ksef-integration', {
                body: {
                  action: 'send',
                  invoice_id: savedInvoiceId,
                  nip: ksefSettings.nip,
                  token: ksefSettings.ksef_token,
                  environment: ksefSettings.ksef_environment || 'demo',
                },
              });

              if (ksefRes?.success) {
                const mode = ksefRes.demo ? ' (DEMO — brak skutków prawnych)' : '';
                toast.success('Faktura wysłana do KSeF' + mode + '. Numer KSeF: ' + (ksefRes.ksef_reference || ''));
              }
            }
          }
        } catch (ksefErr) {
          console.error('Błąd wysyłki do KSeF:', ksefErr);
          // Nie blokuj wystawiania faktury gdy KSeF zawiedzie
        }
      }

      toast.success(andIssue ? 'Faktura wystawiona' : 'Faktura zapisana jako robocza');
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast.error('Błąd zapisu faktury: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!invoiceId) {
      toast.error('Najpierw zapisz fakturę');
      return;
    }
    
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke('invoice-pdf', {
        body: { invoice_id: invoiceId },
      });

      if (error) throw error;
      
      if (data?.pdf_url) {
        window.open(data.pdf_url, '_blank');
        toast.success('PDF wygenerowany');
      }
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      toast.error('Błąd generowania PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {invoiceId ? 'Edycja faktury' : 'Nowa faktura'}
            {status !== 'draft' && <Badge>{status}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Numer faktury</Label>
              <Input 
                value={invoiceNumber} 
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="FV/0001/01/2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Typ dokumentu</Label>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Faktura VAT</SelectItem>
                  <SelectItem value="proforma">Proforma</SelectItem>
                  <SelectItem value="correction">Korekta</SelectItem>
                  <SelectItem value="receipt">Rachunek</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Metoda płatności</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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

          {/* Dates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Data wystawienia</Label>
              <Input 
                type="date" 
                value={issueDate} 
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data sprzedaży</Label>
              <Input 
                type="date" 
                value={saleDate} 
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Termin płatności</Label>
              <Input 
                type="date" 
                value={dueDate} 
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Buyer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nabywca</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Wybierz z listy</Label>
                  <Select value={selectedRecipientId} onValueChange={selectRecipient}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz kontrahenta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} {r.nip && `(NIP: ${r.nip})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {buyerSnapshot && (
                  <div className="text-sm space-y-1 p-3 bg-muted rounded-lg">
                    <p className="font-medium">{buyerSnapshot.name}</p>
                    {buyerSnapshot.nip && <p>NIP: {buyerSnapshot.nip}</p>}
                    {buyerSnapshot.address_street && <p>{buyerSnapshot.address_street}</p>}
                    {(buyerSnapshot.address_postal_code || buyerSnapshot.address_city) && (
                      <p>{buyerSnapshot.address_postal_code} {buyerSnapshot.address_city}</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Pozycje faktury</span>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj pozycję
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/50 rounded-lg">
                    <div className="col-span-12 md:col-span-4 space-y-1">
                      <Label className="text-xs">Nazwa</Label>
                      <Input 
                        value={item.name}
                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                        placeholder="Nazwa usługi/towaru"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-1 space-y-1">
                      <Label className="text-xs">Ilość</Label>
                      <Input 
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-1 space-y-1">
                      <Label className="text-xs">Jedn.</Label>
                      <Select value={item.unit} onValueChange={(v) => updateItem(index, 'unit', v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map(u => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4 md:col-span-2 space-y-1">
                      <Label className="text-xs">Cena netto</Label>
                      <Input 
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_net_price}
                        onChange={(e) => updateItem(index, 'unit_net_price', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-4 md:col-span-1 space-y-1">
                      <Label className="text-xs">VAT</Label>
                      <Select value={item.vat_rate} onValueChange={(v) => updateItem(index, 'vat_rate', v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_RATES.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 md:col-span-2 space-y-1">
                      <Label className="text-xs">Brutto</Label>
                      <div className="h-9 px-3 flex items-center bg-background border rounded-md text-sm font-medium">
                        {formatCurrency(item.gross_amount)}
                      </div>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Razem netto:</span>
                      <span className="font-medium">{formatCurrency(totals.net)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>VAT:</span>
                      <span className="font-medium">{formatCurrency(totals.vat)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Razem brutto:</span>
                      <span className="text-primary">{formatCurrency(totals.gross)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Uwagi</Label>
            <Textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dodatkowe informacje na fakturze..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            {invoiceId && (
              <Button 
                variant="outline" 
                onClick={handleGeneratePdf}
                disabled={generatingPdf}
              >
                {generatingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Pobierz PDF
              </Button>
            )}
            <Button 
              variant="secondary"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Zapisz roboczą
            </Button>
            <Button 
              onClick={() => handleSave(true)}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Wystaw fakturę
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
