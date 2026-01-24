import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, Upload, FileText } from 'lucide-react';

const COST_CATEGORIES = [
  { value: 'fuel', label: 'Paliwo' },
  { value: 'materials', label: 'Materiały' },
  { value: 'services', label: 'Usługi obce' },
  { value: 'rent', label: 'Czynsz / Najem' },
  { value: 'utilities', label: 'Media' },
  { value: 'insurance', label: 'Ubezpieczenia' },
  { value: 'wages', label: 'Wynagrodzenia' },
  { value: 'marketing', label: 'Marketing / Reklama' },
  { value: 'office', label: 'Biuro / Administracja' },
  { value: 'other', label: 'Inne' },
];

interface CostInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  onCreated?: () => void;
}

export function CostInvoiceModal({ open, onOpenChange, entityId, onCreated }: CostInvoiceModalProps) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierNip, setSupplierNip] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [totalNet, setTotalNet] = useState('');
  const [totalVat, setTotalVat] = useState('');
  const [totalGross, setTotalGross] = useState('');
  const [costCategory, setCostCategory] = useState('other');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchingNip, setSearchingNip] = useState(false);

  const searchGUS = async () => {
    if (!supplierNip || supplierNip.length !== 10) {
      toast.error('NIP musi mieć 10 cyfr');
      return;
    }

    setSearchingNip(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip: supplierNip }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        setSupplierName(data.data.name);
        toast.success('Dane pobrane z GUS');
      } else {
        toast.error(data?.error || 'Nie znaleziono firmy');
      }
    } catch (err) {
      console.error('GUS error:', err);
      toast.error('Błąd pobierania danych');
    } finally {
      setSearchingNip(false);
    }
  };

  const calculateGross = () => {
    const net = parseFloat(totalNet) || 0;
    const vat = parseFloat(totalVat) || 0;
    setTotalGross((net + vat).toFixed(2));
  };

  const handleSave = async () => {
    if (!supplierName) {
      toast.error('Podaj nazwę dostawcy');
      return;
    }

    if (!totalGross || parseFloat(totalGross) <= 0) {
      toast.error('Podaj kwotę faktury');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .insert({
          entity_id: entityId,
          invoice_number: invoiceNumber || null,
          invoice_type: 'cost',
          direction: 'incoming',
          issue_date: issueDate,
          due_date: dueDate || null,
          total_net: parseFloat(totalNet) || 0,
          total_vat: parseFloat(totalVat) || 0,
          total_gross: parseFloat(totalGross) || 0,
          cost_category: costCategory,
          notes,
          status: 'pending',
          recipient_name: supplierName,
          recipient_nip: supplierNip || null
        });

      if (error) throw error;

      toast.success('Faktura kosztowa dodana');
      onOpenChange(false);
      onCreated?.();

      // Reset form
      setInvoiceNumber('');
      setSupplierName('');
      setSupplierNip('');
      setTotalNet('');
      setTotalVat('');
      setTotalGross('');
      setCostCategory('other');
      setNotes('');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Błąd zapisu faktury');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Dodaj fakturę kosztową
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Supplier NIP + search */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>NIP dostawcy</Label>
              <Input
                placeholder="Wpisz NIP..."
                value={supplierNip}
                onChange={(e) => setSupplierNip(e.target.value.replace(/\D/g, ''))}
                maxLength={10}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={searchGUS} disabled={searchingNip}>
                {searchingNip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div>
            <Label>Nazwa dostawcy *</Label>
            <Input
              placeholder="Nazwa firmy..."
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
            />
          </div>

          <div>
            <Label>Numer faktury</Label>
            <Input
              placeholder="FV/2026/01/001"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>

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

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Netto</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={totalNet}
                onChange={(e) => {
                  setTotalNet(e.target.value);
                  setTimeout(calculateGross, 100);
                }}
              />
            </div>
            <div>
              <Label>VAT</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={totalVat}
                onChange={(e) => {
                  setTotalVat(e.target.value);
                  setTimeout(calculateGross, 100);
                }}
              />
            </div>
            <div>
              <Label>Brutto *</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={totalGross}
                onChange={(e) => setTotalGross(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Kategoria kosztu</Label>
            <Select value={costCategory} onValueChange={setCostCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COST_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Uwagi</Label>
            <Textarea
              placeholder="Dodatkowe informacje..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
