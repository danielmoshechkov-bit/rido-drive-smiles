import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, Trash2, Plus } from 'lucide-react';
import { DatePickerButton } from './DatePickerButton';

interface InvoiceItem {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  unit_net_price: number;
  vat_rate: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
}

interface InvoiceEditDialogProps {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];

export function InvoiceEditDialog({ invoiceId, open, onOpenChange, onSaved }: InvoiceEditDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Invoice data
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerNip, setBuyerNip] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);

  useEffect(() => {
    if (open && invoiceId) {
      loadInvoice();
    }
  }, [open, invoiceId]);

  const loadInvoice = async () => {
    setLoading(true);
    try {
      // Load invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('user_invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      setInvoiceNumber(invoice.invoice_number || '');
      setBuyerName(invoice.buyer_name || '');
      setBuyerNip(invoice.buyer_nip || '');
      setBuyerAddress(invoice.buyer_address || '');
      setDueDate(invoice.due_date || '');
      setNotes(invoice.notes || '');

      // Load items
      const { data: invoiceItems, error: itemsError } = await supabase
        .from('user_invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order');

      if (itemsError) throw itemsError;

      if (invoiceItems && invoiceItems.length > 0) {
        setItems(invoiceItems.map(item => ({
          id: item.id,
          name: item.name || '',
          quantity: item.quantity || 1,
          unit: item.unit || 'szt.',
          unit_net_price: item.unit_net_price || 0,
          vat_rate: item.vat_rate || '23',
          net_amount: item.net_amount || 0,
          vat_amount: item.vat_amount || 0,
          gross_amount: item.gross_amount || 0,
        })));
      } else {
        setItems([createEmptyItem()]);
      }
    } catch (err: any) {
      console.error('Error loading invoice:', err);
      toast.error('Błąd ładowania faktury');
    } finally {
      setLoading(false);
    }
  };

  const createEmptyItem = (): InvoiceItem => ({
    name: '',
    quantity: 1,
    unit: 'szt.',
    unit_net_price: 0,
    vat_rate: '23',
    net_amount: 0,
    vat_amount: 0,
    gross_amount: 0,
  });

  const calculateItem = (item: InvoiceItem): InvoiceItem => {
    const rate = parseFloat(item.vat_rate) || 0;
    const net_amount = item.quantity * item.unit_net_price;
    const vat_amount = net_amount * (rate / 100);
    const gross_amount = net_amount + vat_amount;
    
    return {
      ...item,
      net_amount: Math.round(net_amount * 100) / 100,
      vat_amount: Math.round(vat_amount * 100) / 100,
      gross_amount: Math.round(gross_amount * 100) / 100,
    };
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index] = calculateItem(updated[index]);
      return updated;
    });
  };

  const addItem = () => {
    setItems(prev => [...prev, createEmptyItem()]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Calculate totals
      const netTotal = items.reduce((sum, item) => sum + item.net_amount, 0);
      const vatTotal = items.reduce((sum, item) => sum + item.vat_amount, 0);
      const grossTotal = items.reduce((sum, item) => sum + item.gross_amount, 0);

      // Update invoice
      const { error: updateError } = await supabase
        .from('user_invoices')
        .update({
          invoice_number: invoiceNumber,
          buyer_name: buyerName,
          buyer_nip: buyerNip,
          buyer_address: buyerAddress,
          due_date: dueDate,
          notes,
          net_total: netTotal,
          vat_total: vatTotal,
          gross_total: grossTotal,
        })
        .eq('id', invoiceId);

      if (updateError) throw updateError;

      // Delete old items and insert new ones
      await supabase
        .from('user_invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);

      const itemsToInsert = items.map((item, idx) => ({
        invoice_id: invoiceId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_net_price: item.unit_net_price,
        vat_rate: item.vat_rate,
        net_amount: item.net_amount,
        vat_amount: item.vat_amount,
        gross_amount: item.gross_amount,
        sort_order: idx,
      }));

      await supabase.from('user_invoice_items').insert(itemsToInsert);

      toast.success('Faktura została zaktualizowana');
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving invoice:', err);
      toast.error('Błąd zapisywania faktury: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const netTotal = items.reduce((sum, item) => sum + item.net_amount, 0);
  const vatTotal = items.reduce((sum, item) => sum + item.vat_amount, 0);
  const grossTotal = items.reduce((sum, item) => sum + item.gross_amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edytuj fakturę</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Numer faktury</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Termin płatności</Label>
                <DatePickerButton
                  label=""
                  value={dueDate}
                  onChange={setDueDate}
                />
              </div>
            </div>

            {/* Buyer Info */}
            <div className="space-y-4">
              <h3 className="font-semibold">Nabywca</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nazwa</Label>
                  <Input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>NIP</Label>
                  <Input
                    value={buyerNip}
                    onChange={(e) => setBuyerNip(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Adres</Label>
                <Input
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Pozycje</h3>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj pozycję
                </Button>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/50 rounded-lg">
                    <div className="col-span-4 space-y-1">
                      <Label className="text-xs">Nazwa</Label>
                      <Input
                        value={item.name}
                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                        placeholder="Nazwa usługi/produktu"
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">Ilość</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">Jedn.</Label>
                      <Input
                        value={item.unit}
                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Cena netto</Label>
                      <Input
                        type="number"
                        value={item.unit_net_price}
                        onChange={(e) => updateItem(index, 'unit_net_price', parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                      />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">VAT %</Label>
                      <Select
                        value={item.vat_rate}
                        onValueChange={(v) => updateItem(index, 'vat_rate', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_RATES.map(rate => (
                            <SelectItem key={rate} value={rate}>
                              {rate === 'zw' ? 'zw' : rate === 'np' ? 'np' : `${rate}%`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Brutto</Label>
                      <div className="h-10 flex items-center px-3 bg-background border rounded-md text-sm font-medium">
                        {item.gross_amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                      </div>
                    </div>
                    <div className="col-span-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="space-y-1 text-sm w-48">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Netto:</span>
                    <span>{netTotal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT:</span>
                    <span>{vatTotal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t">
                    <span>Brutto:</span>
                    <span>{grossTotal.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Uwagi</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dodatkowe uwagi..."
                rows={3}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Zapisz zmiany
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
