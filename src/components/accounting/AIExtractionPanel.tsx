import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Edit2, 
  Save, 
  X,
  Building2,
  Receipt,
  Calendar,
  Banknote,
  Percent,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';

export interface ExtractionData {
  invoice_number: string | null;
  issue_date: string | null;
  sale_date: string | null;
  due_date: string | null;
  supplier: {
    name: string | null;
    nip: string | null;
    address: string | null;
  } | null;
  amounts: {
    net: number | null;
    vat: number | null;
    gross: number | null;
    vat_rate: string | null;
  } | null;
  items: Array<{
    name: string;
    qty: number;
    net: number;
  }>;
  category: string | null;
  payment_method: string | null;
  bank_account: string | null;
  confidence: number;
}

interface AIExtractionPanelProps {
  extraction: ExtractionData;
  onConfirm: (data: ExtractionData) => void;
  onReject: () => void;
  isLoading?: boolean;
}

const CATEGORY_OPTIONS = [
  { value: 'transport', label: 'Transport' },
  { value: 'fuel', label: 'Paliwo' },
  { value: 'service', label: 'Serwis / Naprawa' },
  { value: 'rent', label: 'Wynajem' },
  { value: 'insurance', label: 'Ubezpieczenie' },
  { value: 'office', label: 'Biuro' },
  { value: 'telecommunication', label: 'Telekomunikacja' },
  { value: 'other', label: 'Inne' },
];

export function AIExtractionPanel({ 
  extraction, 
  onConfirm, 
  onReject,
  isLoading 
}: AIExtractionPanelProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<ExtractionData>(extraction);

  const confidencePercent = Math.round((extraction.confidence || 0) * 100);
  const isHighConfidence = confidencePercent >= 80;
  const isMediumConfidence = confidencePercent >= 50 && confidencePercent < 80;

  // Validate amounts consistency
  const amountsValid = (() => {
    if (!editedData.amounts) return true;
    const { net, vat, gross } = editedData.amounts;
    if (net === null || vat === null || gross === null) return true;
    const calculatedGross = net + vat;
    return Math.abs(calculatedGross - gross) < 0.02; // Allow 2 grosz tolerance
  })();

  const handleFieldChange = (field: string, value: any) => {
    setEditedData(prev => {
      const newData = { ...prev };
      
      if (field.startsWith('supplier.')) {
        const subField = field.replace('supplier.', '');
        newData.supplier = {
          ...newData.supplier,
          [subField]: value,
        } as ExtractionData['supplier'];
      } else if (field.startsWith('amounts.')) {
        const subField = field.replace('amounts.', '');
        const numValue = value === '' ? null : parseFloat(value);
        newData.amounts = {
          ...newData.amounts,
          [subField]: subField === 'vat_rate' ? value : numValue,
        } as ExtractionData['amounts'];
      } else {
        (newData as any)[field] = value;
      }
      
      return newData;
    });
  };

  const handleConfirm = () => {
    if (!amountsValid) {
      toast.error('Kwoty netto + VAT nie sumują się do brutto');
      return;
    }
    onConfirm(editedData);
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
    }).format(value);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Wyniki analizy AI
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant={isHighConfidence ? 'default' : isMediumConfidence ? 'secondary' : 'destructive'}
              className="gap-1"
            >
              {isHighConfidence ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {confidencePercent}%
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditMode(!editMode)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invoice Details */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Receipt className="h-3 w-3" />
              Nr faktury
            </Label>
            {editMode ? (
              <Input
                value={editedData.invoice_number || ''}
                onChange={(e) => handleFieldChange('invoice_number', e.target.value)}
                className="h-8 text-sm mt-1"
              />
            ) : (
              <p className="text-sm font-medium">{editedData.invoice_number || '-'}</p>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Data wystawienia
            </Label>
            {editMode ? (
              <Input
                type="date"
                value={editedData.issue_date || ''}
                onChange={(e) => handleFieldChange('issue_date', e.target.value)}
                className="h-8 text-sm mt-1"
              />
            ) : (
              <p className="text-sm font-medium">{editedData.issue_date || '-'}</p>
            )}
          </div>
        </div>

        {/* Supplier */}
        <div className="border-t pt-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <Building2 className="h-3 w-3" />
            Dostawca
          </Label>
          <div className="space-y-2">
            {editMode ? (
              <>
                <Input
                  placeholder="Nazwa firmy"
                  value={editedData.supplier?.name || ''}
                  onChange={(e) => handleFieldChange('supplier.name', e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="NIP"
                    value={editedData.supplier?.nip || ''}
                    onChange={(e) => handleFieldChange('supplier.nip', e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Adres"
                    value={editedData.supplier?.address || ''}
                    onChange={(e) => handleFieldChange('supplier.address', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{editedData.supplier?.name || '-'}</p>
                <p className="text-xs text-muted-foreground">
                  NIP: {editedData.supplier?.nip || '-'}
                </p>
                {editedData.supplier?.address && (
                  <p className="text-xs text-muted-foreground">{editedData.supplier.address}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Amounts */}
        <div className="border-t pt-3">
          <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <Banknote className="h-3 w-3" />
            Kwoty
          </Label>
          {!amountsValid && (
            <div className="flex items-center gap-2 text-destructive text-xs mb-2">
              <AlertTriangle className="h-3 w-3" />
              Niespójne kwoty (netto + VAT ≠ brutto)
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-xs text-muted-foreground">Netto</span>
              {editMode ? (
                <Input
                  type="number"
                  step="0.01"
                  value={editedData.amounts?.net ?? ''}
                  onChange={(e) => handleFieldChange('amounts.net', e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              ) : (
                <p className="text-sm font-medium">{formatCurrency(editedData.amounts?.net ?? null)}</p>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Percent className="h-3 w-3" />
                VAT
              </span>
              {editMode ? (
                <Input
                  type="number"
                  step="0.01"
                  value={editedData.amounts?.vat ?? ''}
                  onChange={(e) => handleFieldChange('amounts.vat', e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              ) : (
                <p className="text-sm font-medium">{formatCurrency(editedData.amounts?.vat ?? null)}</p>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Brutto</span>
              {editMode ? (
                <Input
                  type="number"
                  step="0.01"
                  value={editedData.amounts?.gross ?? ''}
                  onChange={(e) => handleFieldChange('amounts.gross', e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              ) : (
                <p className="text-sm font-medium font-semibold">{formatCurrency(editedData.amounts?.gross ?? null)}</p>
              )}
            </div>
          </div>
          {editedData.amounts?.vat_rate && (
            <p className="text-xs text-muted-foreground mt-1">
              Stawka VAT: {editedData.amounts.vat_rate}
            </p>
          )}
        </div>

        {/* Category */}
        <div className="border-t pt-3">
          <Label className="text-xs text-muted-foreground mb-2 block">Kategoria</Label>
          <Select
            value={editedData.category || 'other'}
            onValueChange={(value) => handleFieldChange('category', value)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Items preview */}
        {editedData.items && editedData.items.length > 0 && (
          <div className="border-t pt-3">
            <Label className="text-xs text-muted-foreground mb-2 block">Pozycje ({editedData.items.length})</Label>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {editedData.items.slice(0, 3).map((item, i) => (
                <div key={i} className="text-xs flex justify-between">
                  <span className="truncate flex-1">{item.name}</span>
                  <span className="text-muted-foreground ml-2">
                    {item.qty}x {formatCurrency(item.net)}
                  </span>
                </div>
              ))}
              {editedData.items.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  +{editedData.items.length - 3} więcej...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={isLoading || !amountsValid}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Zapisywanie...
              </span>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Zatwierdź i zaksięguj
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-2" />
            Odrzuć
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
