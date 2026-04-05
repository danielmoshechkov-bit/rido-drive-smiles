import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  FileText,
  FileCheck,
  Percent,
  FileEdit,
  Coins,
  FilePlus,
  Receipt
} from 'lucide-react';

// UI-facing type values used in the selector
export type InvoiceType = 'invoice' | 'proforma' | 'margin' | 'correction' | 'advance' | 'final' | 'simplified';

interface InvoiceTypeOption {
  value: InvoiceType;
  label: string;
  description: string;
  icon: React.ElementType;
  /** KSeF-compliant value stored in DB */
  ksefType: string;
}

const INVOICE_TYPES: InvoiceTypeOption[] = [
  { value: 'invoice', label: 'Faktura VAT', description: 'Standardowa faktura', icon: FileText, ksefType: 'VAT' },
  { value: 'proforma', label: 'Proforma', description: 'Przed płatnością', icon: FileCheck, ksefType: 'proforma' },
  { value: 'margin', label: 'VAT marża', description: 'Sprzedaż używanych', icon: Percent, ksefType: 'VAT' },
  { value: 'correction', label: 'Korygująca', description: 'Korekta faktury', icon: FileEdit, ksefType: 'KOR' },
  { value: 'advance', label: 'Zaliczkowa', description: 'Zaliczka', icon: Coins, ksefType: 'ZAL' },
  { value: 'final', label: 'Końcowa', description: 'Po zaliczkach', icon: FilePlus, ksefType: 'ROZ' },
  { value: 'simplified', label: 'Uproszczona', description: 'Do 450 PLN', icon: Receipt, ksefType: 'UPR' },
];

/** Map UI selector value to KSeF-compliant DB value */
export function uiTypeToKsef(uiType: InvoiceType | string): string {
  const found = INVOICE_TYPES.find(t => t.value === uiType);
  return found?.ksefType || 'VAT';
}

/** Map DB value back to UI selector value (for editing) */
export function ksefTypeToUi(dbType: string | null | undefined): InvoiceType {
  if (!dbType) return 'invoice';
  const map: Record<string, InvoiceType> = {
    'VAT': 'invoice',
    'KOR': 'correction',
    'ZAL': 'advance',
    'ROZ': 'final',
    'UPR': 'simplified',
    // pass-through for already UI values
    'invoice': 'invoice',
    'proforma': 'proforma',
    'margin': 'margin',
    'correction': 'correction',
    'advance': 'advance',
    'final': 'final',
    'simplified': 'simplified',
  };
  return map[dbType] || 'invoice';
}

interface InvoiceTypeSelectorProps {
  value: InvoiceType;
  onChange: (type: InvoiceType) => void;
}

export function InvoiceTypeSelector({ value, onChange }: InvoiceTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {INVOICE_TYPES.map((type) => {
        const Icon = type.icon;
        const isSelected = value === type.value;
        
        return (
          <Card
            key={type.value}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md border-2",
              isSelected 
                ? "border-primary bg-primary/10 shadow-lg" 
                : "border-transparent hover:bg-muted/50 hover:border-muted"
            )}
            onClick={() => onChange(type.value)}
          >
            <CardContent className="p-4 text-center">
              <div className={cn(
                "w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center transition-colors",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <p className={cn(
                "font-semibold text-sm transition-colors",
                isSelected && "text-primary"
              )}>{type.label}</p>
              <p className={cn(
                "text-xs transition-colors",
                isSelected ? "text-primary/70" : "text-muted-foreground"
              )}>{type.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
