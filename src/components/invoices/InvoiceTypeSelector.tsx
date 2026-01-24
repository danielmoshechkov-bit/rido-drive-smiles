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

export type InvoiceType = 'invoice' | 'proforma' | 'margin' | 'correction' | 'advance' | 'final' | 'simplified';

interface InvoiceTypeOption {
  value: InvoiceType;
  label: string;
  description: string;
  icon: React.ElementType;
}

const INVOICE_TYPES: InvoiceTypeOption[] = [
  { value: 'invoice', label: 'Faktura VAT', description: 'Standardowa faktura', icon: FileText },
  { value: 'proforma', label: 'Proforma', description: 'Przed płatnością', icon: FileCheck },
  { value: 'margin', label: 'VAT marża', description: 'Sprzedaż używanych', icon: Percent },
  { value: 'correction', label: 'Korygująca', description: 'Korekta faktury', icon: FileEdit },
  { value: 'advance', label: 'Zaliczkowa', description: 'Zaliczka', icon: Coins },
  { value: 'final', label: 'Końcowa', description: 'Po zaliczkach', icon: FilePlus },
  { value: 'simplified', label: 'Uproszczona', description: 'Do 450 PLN', icon: Receipt },
];

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
              "cursor-pointer transition-all hover:shadow-md",
              isSelected 
                ? "ring-2 ring-primary bg-primary/5" 
                : "hover:bg-muted/50"
            )}
            onClick={() => onChange(type.value)}
          >
            <CardContent className="p-4 text-center">
              <div className={cn(
                "w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="font-semibold text-sm">{type.label}</p>
              <p className="text-xs text-muted-foreground">{type.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
