import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, Upload, FileText, Check, X, Plus, AlertTriangle, Package } from 'lucide-react';
import { DatePickerButton } from './DatePickerButton';
import { CostCategorySelector } from './CostCategorySelector';
import { InventoryProductMapper } from './InventoryProductMapper';

const DEFAULT_COST_CATEGORIES = [
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

const VAT_RATES = ['23', '8', '5', '0', 'zw', 'np'];

interface ExtractedItem {
  name: string;
  quantity: number;
  unit: string;
  netPrice: number;
  vatRate: string;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  addToInventory: boolean;
  inventoryProductId?: string;
}

interface CostInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  onCreated?: () => void;
}

type Step = 'upload' | 'confirm' | 'saved';

export function CostInvoiceModal({ open, onOpenChange, entityId, onCreated }: CostInvoiceModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  
  // Extracted data
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierNip, setSupplierNip] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [paymentBank, setPaymentBank] = useState('');
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [notes, setNotes] = useState('');
  const [costCategory, setCostCategory] = useState('other');
  
  const [saving, setSaving] = useState(false);
  const [searchingNip, setSearchingNip] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setStep('upload');
    setInvoiceNumber('');
    setSupplierName('');
    setSupplierNip('');
    setSupplierAddress('');
    setIssueDate('');
    setSaleDate('');
    setDueDate('');
    setPaymentAccount('');
    setPaymentBank('');
    setItems([]);
    setNotes('');
    setCostCategory('other');
    setFileUrl('');
  };

  const processFile = async (file: File) => {
    setUploading(true);
    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${entityId}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      setFileUrl(publicUrl);

      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Extract data using Claude AI
      setExtracting(true);
      const { data: extractedData, error: extractError } = await supabase.functions.invoke('analyze-invoice', {
        body: { 
          fileBase64: base64,
          mimeType: file.type
        }
      });

      if (extractError) {
        console.error('Extraction error:', extractError);
        toast.error('Nie udało się odczytać faktury — sprawdź plik lub wprowadź ręcznie.');
        setItems([createEmptyItem()]);
        setStep('confirm');
        return;
      }

      if (extractedData?.success && extractedData?.data) {
        const d = extractedData.data;
        setInvoiceNumber(d.numer_faktury || '');
        setSupplierName(d.sprzedawca?.nazwa || '');
        setSupplierNip(d.sprzedawca?.nip || '');
        setSupplierAddress(d.sprzedawca?.adres || '');
        setIssueDate(d.data_wystawienia || new Date().toISOString().split('T')[0]);
        setSaleDate(d.data_sprzedazy || d.data_wystawienia || '');
        setDueDate(d.termin_platnosci || '');
        setPaymentAccount(d.sprzedawca?.numer_konta || '');
        setPaymentBank(d.sprzedawca?.bank || '');
        setNotes('');

        if (d.pozycje && Array.isArray(d.pozycje)) {
          setItems(d.pozycje.map((item: any) => {
            const qty = item.ilosc || 1;
            const net = item.cena_netto || 0;
            const vr = String(item.vat_proc || '23').replace('%', '');
            const netAmt = item.wartosc_netto || qty * net;
            const vatNum = parseFloat(vr) || 0;
            const vatAmt = item.wartosc_vat || netAmt * (vatNum / 100);
            const grossAmt = item.wartosc_brutto || netAmt + vatAmt;
            return {
            name: item.nazwa || '',
            quantity: qty,
            unit: item.jednostka || 'szt.',
            netPrice: net,
            vatRate: vr,
            netAmount: netAmt,
            vatAmount: vatAmt,
            grossAmount: grossAmt,
            addToInventory: false,
            inventoryProductId: undefined
            };
          }));
        } else {
          setItems([createEmptyItem()]);
        }

        toast.success('Dane wyekstraktowane! Sprawdź i potwierdź.');
      } else {
        setItems([createEmptyItem()]);
        toast.info('Nie udało się wyekstraktować danych. Wprowadź ręcznie.');
      }

      setStep('confirm');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Błąd przesyłania pliku');
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const createEmptyItem = (): ExtractedItem => ({
    name: '',
    quantity: 1,
    unit: 'szt.',
    netPrice: 0,
    vatRate: '23',
    netAmount: 0,
    vatAmount: 0,
    grossAmount: 0,
    addToInventory: false
  });

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
        setSupplierAddress(data.data.address || '');
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

  const updateItem = (index: number, field: keyof ExtractedItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Recalculate amounts
      const rate = parseFloat(updated[index].vatRate) || 0;
      updated[index].netAmount = updated[index].quantity * updated[index].netPrice;
      updated[index].vatAmount = updated[index].netAmount * (rate / 100);
      updated[index].grossAmount = updated[index].netAmount + updated[index].vatAmount;
      
      return updated;
    });
  };

  const addItem = () => setItems(prev => [...prev, createEmptyItem()]);
  
  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const totalNet = items.reduce((sum, item) => sum + item.netAmount, 0);
  const totalVat = items.reduce((sum, item) => sum + item.vatAmount, 0);
  const totalGross = items.reduce((sum, item) => sum + item.grossAmount, 0);

  const handleSave = async () => {
    if (!supplierName) {
      toast.error('Podaj nazwę dostawcy');
      return;
    }

    if (totalGross <= 0) {
      toast.error('Podaj kwotę faktury');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Brak autoryzacji');

      // Generate invoice number for costs
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const randomNum = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const costInvoiceNumber = invoiceNumber || `KOSZT/${year}/${month}/${randomNum}`;

      // Save to user_invoices (cost type)
      const { data: savedInvoice, error: invoiceError } = await supabase
        .from('user_invoices')
        .insert({
          user_id: user.id,
          company_id: entityId || null,
          invoice_number: costInvoiceNumber,
          invoice_type: 'cost',
          buyer_name: supplierName,
          buyer_nip: supplierNip || null,
          buyer_address: supplierAddress || null,
          issue_date: issueDate || new Date().toISOString().split('T')[0],
          sale_date: saleDate || null,
          due_date: dueDate || null,
          payment_method: 'transfer',
          net_total: totalNet,
          vat_total: totalVat,
          gross_total: totalGross,
          notes,
          is_paid: false,
          currency: 'PLN'
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Save invoice items
      const itemsToSave = items.map((item, idx) => ({
        invoice_id: savedInvoice.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_net_price: item.netPrice,
        vat_rate: item.vatRate,
        net_amount: item.netAmount,
        vat_amount: item.vatAmount,
        gross_amount: item.grossAmount,
        sort_order: idx
      }));

      await supabase.from('user_invoice_items').insert(itemsToSave);

      // Handle inventory items
      const inventoryItems = items.filter(item => item.addToInventory);
      for (const item of inventoryItems) {
        // Create inventory batch for this item
        // This links purchase to inventory for FIFO tracking
        if (item.inventoryProductId) {
          await supabase.from('inventory_batches').insert({
            product_id: item.inventoryProductId,
            purchase_document_id: savedInvoice.id,
            qty_in: item.quantity,
            qty_remaining: item.quantity,
            unit_cost_net: item.netPrice,
            vat_rate: item.vatRate,
            received_at: new Date().toISOString()
          });
        }
      }

      // Save supplier alias for future auto-matching
      if (supplierNip && supplierName) {
        try {
          await supabase.from('inventory_product_aliases').upsert({
            entity_id: entityId,
            source_label: supplierName,
            supplier_nip: supplierNip,
            product_id: items[0]?.inventoryProductId || null
          }, {
            onConflict: 'entity_id,source_label'
          });
        } catch (e) {
          // Ignore if table doesn't exist or constraint error
          console.log('Alias save skipped:', e);
        }
      }

      toast.success('Faktura kosztowa zapisana');
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Błąd zapisu faktury: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleManualEntry = () => {
    setIssueDate(new Date().toISOString().split('T')[0]);
    setItems([createEmptyItem()]);
    setStep('confirm');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {step === 'upload' ? 'Dodaj fakturę kosztową' : 'Sprawdź dane faktury'}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-6 py-8">
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => !uploading && !extracting && fileInputRef.current?.click()}
            >
              {uploading || extracting ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    {extracting ? 'Analizuję fakturę...' : 'Przesyłam plik...'}
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="font-semibold mb-2">Przeciągnij fakturę lub kliknij</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Obsługujemy PDF, JPG, PNG. System automatycznie odczyta dane.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    <Upload className="h-4 w-4 mr-2" />
                    Wybierz plik
                  </Button>
                </>
              )}
            </div>

            <div className="text-center">
              <Button variant="ghost" onClick={handleManualEntry}>
                Lub wprowadź dane ręcznie →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Confirm extracted data */}
        {step === 'confirm' && (
          <div className="space-y-6">
            {/* Alert if OCR was used */}
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <p className="text-yellow-700">
                Dane zostały odczytane automatycznie. <strong>Sprawdź poprawność</strong> przed zapisaniem.
                Kliknij pole, aby edytować.
              </p>
            </div>

            {/* Supplier Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold flex items-center gap-2">
                  Sprzedawca
                  {supplierNip && <Badge variant="outline">{supplierNip}</Badge>}
                </h3>
                
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label>NIP</Label>
                    <Input
                      placeholder="NIP dostawcy"
                      value={supplierNip}
                      onChange={(e) => setSupplierNip(e.target.value.replace(/\D/g, ''))}
                      maxLength={10}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" size="icon" onClick={searchGUS} disabled={searchingNip}>
                      {searchingNip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label>Nazwa firmy</Label>
                  <Input
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nazwa dostawcy"
                  />
                </div>

                <div>
                  <Label>Adres</Label>
                  <Input
                    value={supplierAddress}
                    onChange={(e) => setSupplierAddress(e.target.value)}
                    placeholder="Adres dostawcy"
                  />
                </div>
              </div>

              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold">Dane faktury</h3>

                <div>
                  <Label>Numer faktury</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="FV/2026/01/001"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Data wystawienia</Label>
                    <DatePickerButton
                      label=""
                      value={issueDate}
                      onChange={setIssueDate}
                    />
                  </div>
                  <div>
                    <Label>Data sprzedaży</Label>
                    <DatePickerButton
                      label=""
                      value={saleDate}
                      onChange={setSaleDate}
                    />
                  </div>
                </div>

                <div>
                  <Label>Termin płatności</Label>
                  <DatePickerButton
                    label=""
                    value={dueDate}
                    onChange={setDueDate}
                  />
                </div>
              </div>
            </div>

            {/* Payment Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nr konta bankowego</Label>
                <Input
                  value={paymentAccount}
                  onChange={(e) => setPaymentAccount(e.target.value)}
                  placeholder="XX XXXX XXXX XXXX XXXX XXXX XXXX"
                />
              </div>
              <div>
                <Label>Bank</Label>
                <Input
                  value={paymentBank}
                  onChange={(e) => setPaymentBank(e.target.value)}
                  placeholder="Nazwa banku"
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Pozycje faktury</h3>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj pozycję
                </Button>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="p-3 bg-muted/30 border rounded-lg space-y-3">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <Label className="text-xs">Nazwa</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => updateItem(index, 'name', e.target.value)}
                          placeholder="Nazwa produktu/usługi"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Ilość</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Jedn.</Label>
                        <Input
                          value={item.unit}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Cena netto</Label>
                        <Input
                          type="number"
                          value={item.netPrice}
                          onChange={(e) => updateItem(index, 'netPrice', parseFloat(e.target.value) || 0)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">VAT</Label>
                        <Select
                          value={item.vatRate}
                          onValueChange={(v) => updateItem(index, 'vatRate', v)}
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
                      <div className="col-span-2">
                        <Label className="text-xs">Brutto</Label>
                        <div className="h-10 flex items-center px-3 bg-background border rounded-md text-sm font-medium">
                          {item.grossAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                        </div>
                      </div>
                      <div className="col-span-1 flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Add to inventory checkbox */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Checkbox
                        id={`inventory-${index}`}
                        checked={item.addToInventory}
                        onCheckedChange={(checked) => updateItem(index, 'addToInventory', !!checked)}
                      />
                      <label htmlFor={`inventory-${index}`} className="text-sm flex items-center gap-1 cursor-pointer">
                        <Package className="h-3 w-3" />
                        Dodaj do magazynu
                      </label>
                      {item.addToInventory && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          <Plus className="h-3 w-3 mr-1" />
                          Przypisz do produktu
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="flex justify-between items-start pt-4">
                <div className="space-y-2">
                  <Label>Kategoria kosztu</Label>
                  <CostCategorySelector
                    value={costCategory}
                    onChange={setCostCategory}
                  />
                </div>

                <div className="space-y-1 text-sm w-56 p-4 bg-primary/5 rounded-lg">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Netto:</span>
                    <span>{totalNet.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VAT:</span>
                    <span>{totalVat.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t">
                    <span>Brutto:</span>
                    <span>{totalGross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Uwagi</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dodatkowe informacje..."
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>
                Wróć
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Akceptuj i zapisz
              </Button>
            </>
          )}
          {step === 'upload' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
