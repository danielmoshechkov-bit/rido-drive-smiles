import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Save, Send, FileText, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface InvoiceItem {
  id: string;
  name: string;
  pkwiu: string;
  quantity: number;
  unit: string;
  unit_net_price: number;
  vat_rate: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
}

interface Recipient {
  id: string;
  name: string;
  nip: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
}

interface InvoiceEditorProps {
  entityId: string;
  invoiceId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const VAT_RATES = [
  { value: '23', label: '23%', rate: 0.23 },
  { value: '8', label: '8%', rate: 0.08 },
  { value: '5', label: '5%', rate: 0.05 },
  { value: '0', label: '0%', rate: 0 },
  { value: 'zw', label: 'zw.', rate: 0 },
  { value: 'np', label: 'np.', rate: 0 },
];

const UNITS = ['szt.', 'godz.', 'km', 'kg', 'l', 'm', 'm²', 'm³', 'usł.', 'kpl.'];

const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Przelew' },
  { value: 'cash', label: 'Gotówka' },
  { value: 'card', label: 'Karta' },
  { value: 'other', label: 'Inne' },
];

export function InvoiceEditor({ entityId, invoiceId, onClose, onSaved }: InvoiceEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entity, setEntity] = useState<any>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [showRecipientForm, setShowRecipientForm] = useState(false);

  // Invoice data
  const [invoiceType, setInvoiceType] = useState('invoice');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [notes, setNotes] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');
  const [items, setItems] = useState<InvoiceItem[]>([
    createEmptyItem(),
  ]);

  // New recipient form
  const [newRecipient, setNewRecipient] = useState({
    name: '',
    nip: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
  });

  function createEmptyItem(): InvoiceItem {
    return {
      id: crypto.randomUUID(),
      name: '',
      pkwiu: '',
      quantity: 1,
      unit: 'szt.',
      unit_net_price: 0,
      vat_rate: '23',
      net_amount: 0,
      vat_amount: 0,
      gross_amount: 0,
    };
  }

  useEffect(() => {
    fetchEntity();
    fetchRecipients();
    if (invoiceId) {
      fetchInvoice();
    }
  }, [entityId, invoiceId]);

  const fetchEntity = async () => {
    const { data } = await supabase
      .from('entities')
      .select('*')
      .eq('id', entityId)
      .single();
    if (data) setEntity(data);
  };

  const fetchRecipients = async () => {
    const { data } = await supabase
      .from('invoice_recipients')
      .select('*')
      .eq('entity_id', entityId)
      .order('name');
    if (data) setRecipients(data);
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
      if (invoice) {
        setInvoiceType(invoice.type);
        setIssueDate(invoice.issue_date);
        setSaleDate(invoice.sale_date || invoice.issue_date);
        setDueDate(invoice.due_date);
        setPaymentMethod(invoice.payment_method || 'transfer');
        setNotes(invoice.notes || '');
        setSelectedRecipientId(invoice.recipient_id || '');
        
        if (invoice.invoice_items && invoice.invoice_items.length > 0) {
          setItems(invoice.invoice_items.map((item: any) => ({
            id: item.id,
            name: item.name,
            pkwiu: item.pkwiu || '',
            quantity: item.quantity,
            unit: item.unit,
            unit_net_price: item.unit_net_price,
            vat_rate: item.vat_rate,
            net_amount: item.net_amount,
            vat_amount: item.vat_amount,
            gross_amount: item.gross_amount,
          })));
        }
      }
    } catch (error: any) {
      console.error('Error fetching invoice:', error);
      toast.error('Błąd ładowania faktury');
    } finally {
      setLoading(false);
    }
  };

  const calculateItemAmounts = (item: InvoiceItem): InvoiceItem => {
    const vatRateObj = VAT_RATES.find(r => r.value === item.vat_rate);
    const vatRate = vatRateObj?.rate || 0;
    const net = item.quantity * item.unit_net_price;
    const vat = net * vatRate;
    const gross = net + vat;
    
    return {
      ...item,
      net_amount: Math.round(net * 100) / 100,
      vat_amount: Math.round(vat * 100) / 100,
      gross_amount: Math.round(gross * 100) / 100,
    };
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      return calculateItemAmounts(updated);
    }));
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) {
      toast.error('Faktura musi mieć przynajmniej jedną pozycję');
      return;
    }
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const getTotals = () => {
    const totals = items.reduce(
      (acc, item) => ({
        net: acc.net + item.net_amount,
        vat: acc.vat + item.vat_amount,
        gross: acc.gross + item.gross_amount,
      }),
      { net: 0, vat: 0, gross: 0 }
    );
    return {
      net: Math.round(totals.net * 100) / 100,
      vat: Math.round(totals.vat * 100) / 100,
      gross: Math.round(totals.gross * 100) / 100,
    };
  };

  const handleSaveRecipient = async () => {
    if (!newRecipient.name) {
      toast.error('Podaj nazwę kontrahenta');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('invoice_recipients')
        .insert({
          entity_id: entityId,
          name: newRecipient.name,
          nip: newRecipient.nip || null,
          address_street: newRecipient.address_street || null,
          address_city: newRecipient.address_city || null,
          address_postal_code: newRecipient.address_postal_code || null,
        })
        .select()
        .single();

      if (error) throw error;

      setRecipients(prev => [...prev, data]);
      setSelectedRecipientId(data.id);
      setShowRecipientForm(false);
      setNewRecipient({ name: '', nip: '', address_street: '', address_city: '', address_postal_code: '' });
      toast.success('Kontrahent dodany');
    } catch (error: any) {
      console.error('Error saving recipient:', error);
      toast.error('Błąd zapisu kontrahenta');
    }
  };

  const handleSave = async (status: 'draft' | 'issued' = 'draft') => {
    if (!selectedRecipientId) {
      toast.error('Wybierz kontrahenta');
      return;
    }

    if (items.some(item => !item.name)) {
      toast.error('Wszystkie pozycje muszą mieć nazwę');
      return;
    }

    setSaving(true);
    const totals = getTotals();
    const recipient = recipients.find(r => r.id === selectedRecipientId);

    try {
      // Generate invoice number if issuing
      let invoiceNumber = '';
      if (status === 'issued') {
        const { data: series } = await supabase
          .from('invoice_series')
          .select('*')
          .eq('entity_id', entityId)
          .eq('is_default', true)
          .single();

        if (series) {
          const now = new Date();
          invoiceNumber = series.pattern
            .replace('{PREFIX}', series.prefix || '')
            .replace('{YYYY}', now.getFullYear().toString())
            .replace('{YY}', now.getFullYear().toString().slice(-2))
            .replace('{MM}', (now.getMonth() + 1).toString().padStart(2, '0'))
            .replace('{SEQ}', (series.sequence_current + 1).toString().padStart(4, '0'));

          // Update sequence
          await supabase
            .from('invoice_series')
            .update({ sequence_current: series.sequence_current + 1 })
            .eq('id', series.id);
        } else {
          invoiceNumber = `FV/${new Date().getFullYear()}/${Date.now()}`;
        }
      }

      const invoiceData = {
        entity_id: entityId,
        recipient_id: selectedRecipientId,
        buyer_snapshot: recipient ? {
          name: recipient.name,
          nip: recipient.nip,
          address_street: recipient.address_street,
          address_city: recipient.address_city,
          address_postal_code: recipient.address_postal_code,
        } : null,
        type: invoiceType,
        status,
        invoice_number: invoiceNumber || null,
        issue_date: issueDate,
        sale_date: saleDate,
        due_date: dueDate,
        payment_method: paymentMethod,
        currency: 'PLN',
        net_amount: totals.net,
        vat_amount: totals.vat,
        gross_amount: totals.gross,
        notes: notes || null,
      };

      let savedInvoiceId = invoiceId;

      if (invoiceId) {
        // Update existing
        const { error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', invoiceId);
        if (error) throw error;

        // Delete old items and insert new
        await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();
        if (error) throw error;
        savedInvoiceId = data.id;
      }

      // Insert items
      const itemsToInsert = items.map(item => ({
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
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Log to audit
      await supabase.from('audit_log').insert({
        actor_user_id: (await supabase.auth.getUser()).data.user?.id,
        actor_type: 'user',
        action: invoiceId ? 'INVOICE_UPDATED' : 'INVOICE_CREATED',
        target_type: 'invoice',
        target_id: savedInvoiceId,
        entity_id: entityId,
        metadata: { status, invoice_number: invoiceNumber, gross_amount: totals.gross },
      });

      toast.success(status === 'issued' ? 'Faktura wystawiona' : 'Zapisano roboczą');
      onSaved();
      onClose();
    } catch (error: any) {
      console.error('Error saving invoice:', error);
      toast.error('Błąd zapisu faktury');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(amount);
  };

  const totals = getTotals();

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {invoiceId ? 'Edycja faktury' : 'Nowa faktura'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Basic Info */}
          <div className="grid md:grid-cols-4 gap-4">
            <div>
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
            <div>
              <Label>Data wystawienia</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label>Data sprzedaży</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
            <div>
              <Label>Termin płatności</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Seller & Buyer */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Seller */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sprzedawca</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {entity ? (
                  <>
                    <p className="font-medium">{entity.name}</p>
                    {entity.nip && <p>NIP: {entity.nip}</p>}
                    {entity.address_street && <p>{entity.address_street}</p>}
                    {entity.address_postal_code && entity.address_city && (
                      <p>{entity.address_postal_code} {entity.address_city}</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Ładowanie...</p>
                )}
              </CardContent>
            </Card>

            {/* Buyer */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Nabywca</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-3">
                  <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Wybierz kontrahenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {recipients.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} {r.nip && `(${r.nip})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={() => setShowRecipientForm(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {selectedRecipientId && (() => {
                  const r = recipients.find(rec => rec.id === selectedRecipientId);
                  if (!r) return null;
                  return (
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{r.name}</p>
                      {r.nip && <p>NIP: {r.nip}</p>}
                      {r.address_street && <p>{r.address_street}</p>}
                      {r.address_postal_code && r.address_city && (
                        <p>{r.address_postal_code} {r.address_city}</p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Items Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Pozycje faktury</CardTitle>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj pozycję
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Nazwa</TableHead>
                      <TableHead className="w-20">Ilość</TableHead>
                      <TableHead className="w-20">J.m.</TableHead>
                      <TableHead className="w-28">Cena netto</TableHead>
                      <TableHead className="w-20">VAT</TableHead>
                      <TableHead className="w-28 text-right">Netto</TableHead>
                      <TableHead className="w-28 text-right">Brutto</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Input
                            value={item.name}
                            onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                            placeholder="Nazwa usługi/towaru"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={item.unit} onValueChange={(v) => updateItem(item.id, 'unit', v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNITS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_net_price}
                            onChange={(e) => updateItem(item.id, 'unit_net_price', parseFloat(e.target.value) || 0)}
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={item.vat_rate} onValueChange={(v) => updateItem(item.id, 'vat_rate', v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VAT_RATES.map(r => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.net_amount)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.gross_amount)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-medium">Razem:</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(totals.net)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(totals.gross)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right text-muted-foreground">VAT:</TableCell>
                      <TableCell colSpan={2} className="text-right">{formatCurrency(totals.vat)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Payment & Notes */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Forma płatności</Label>
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
            <div>
              <Label>Uwagi</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dodatkowe uwagi na fakturze..."
                rows={2}
              />
            </div>
          </div>

          {/* Summary */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Do zapłaty:</p>
                  <p className="text-2xl font-bold">{formatCurrency(totals.gross)}</p>
                </div>
                <Badge variant="outline" className="text-lg px-4 py-2">
                  {invoiceType === 'invoice' ? 'Faktura VAT' : 
                   invoiceType === 'proforma' ? 'Proforma' :
                   invoiceType === 'correction' ? 'Korekta' : 'Rachunek'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button variant="secondary" onClick={() => handleSave('draft')} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Zapisz roboczą
          </Button>
          <Button onClick={() => handleSave('issued')} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Wystaw fakturę
          </Button>
        </DialogFooter>

        {/* New Recipient Dialog */}
        <Dialog open={showRecipientForm} onOpenChange={setShowRecipientForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowy kontrahent</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>Nazwa firmy *</Label>
                <Input
                  value={newRecipient.name}
                  onChange={(e) => setNewRecipient(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nazwa firmy lub imię i nazwisko"
                />
              </div>
              <div>
                <Label>NIP</Label>
                <Input
                  value={newRecipient.nip}
                  onChange={(e) => setNewRecipient(prev => ({ ...prev, nip: e.target.value }))}
                  placeholder="0000000000"
                />
              </div>
              <div>
                <Label>Ulica i numer</Label>
                <Input
                  value={newRecipient.address_street}
                  onChange={(e) => setNewRecipient(prev => ({ ...prev, address_street: e.target.value }))}
                  placeholder="ul. Przykładowa 1/2"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Kod pocztowy</Label>
                  <Input
                    value={newRecipient.address_postal_code}
                    onChange={(e) => setNewRecipient(prev => ({ ...prev, address_postal_code: e.target.value }))}
                    placeholder="00-000"
                  />
                </div>
                <div>
                  <Label>Miasto</Label>
                  <Input
                    value={newRecipient.address_city}
                    onChange={(e) => setNewRecipient(prev => ({ ...prev, address_city: e.target.value }))}
                    placeholder="Warszawa"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRecipientForm(false)}>Anuluj</Button>
              <Button onClick={handleSaveRecipient}>Dodaj kontrahenta</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
