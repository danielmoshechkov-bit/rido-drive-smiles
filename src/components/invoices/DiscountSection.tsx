import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Percent, Tag } from 'lucide-react';

export type DiscountType = 'none' | 'global' | 'per_item';
export type DiscountMode = 'percent' | 'amount';

export interface DiscountConfig {
  type: DiscountType;
  mode: DiscountMode; // Used for global discount
  globalValue: number;
  allowPerItemModeChoice?: boolean; // When per_item, allow each item to choose percent or amount
}

interface DiscountSectionProps {
  config: DiscountConfig;
  onChange: (config: DiscountConfig) => void;
  currencySymbol?: string;
}

export function DiscountSection({ config, onChange, currencySymbol = 'zł' }: DiscountSectionProps) {
  const isEnabled = config.type !== 'none';

  const handleToggle = (enabled: boolean) => {
    onChange({
      ...config,
      type: enabled ? 'global' : 'none',
    });
  };

  return (
    <div className="space-y-4">
      {/* Enable discount toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <Label>Rabat / Zniżka</Label>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
        />
      </div>

      {isEnabled && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          {/* Discount type */}
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Zastosuj do</Label>
              <Select 
                value={config.type} 
                onValueChange={(v) => onChange({ ...config, type: v as DiscountType })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Cała faktura</SelectItem>
                  <SelectItem value="per_item">Każda pozycja osobno</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {config.type === 'global' && (
              <div>
                <Label className="text-xs">Typ rabatu</Label>
                <Select 
                  value={config.mode} 
                  onValueChange={(v) => onChange({ ...config, mode: v as DiscountMode })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">
                      <span className="flex items-center gap-2">
                        <Percent className="h-3 w-3 flex-shrink-0" />
                        <span>Procent (%)</span>
                      </span>
                    </SelectItem>
                    <SelectItem value="amount">
                      <span className="flex items-center gap-2">
                        <span className="font-bold flex-shrink-0">{currencySymbol}</span>
                        <span>Kwota</span>
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Global discount value */}
          {config.type === 'global' && (
            <div>
              <Label className="text-xs">
                Wartość rabatu {config.mode === 'percent' ? '(%)' : `(${currencySymbol})`}
              </Label>
              <Input
                type="number"
                min="0"
                step={config.mode === 'percent' ? '1' : '0.01'}
                max={config.mode === 'percent' ? '100' : undefined}
                value={config.globalValue || ''}
                onChange={(e) => onChange({ ...config, globalValue: parseFloat(e.target.value) || 0 })}
                placeholder={config.mode === 'percent' ? '0' : '0.00'}
              />
            </div>
          )}

          {config.type === 'per_item' && (
            <p className="text-xs text-muted-foreground">
              Przy każdej pozycji możesz wybrać rabat procentowy lub kwotowy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Calculate discount for an amount
export function calculateDiscount(
  amount: number,
  config: DiscountConfig
): { discountAmount: number; finalAmount: number } {
  if (config.type === 'none' || config.globalValue <= 0) {
    return { discountAmount: 0, finalAmount: amount };
  }

  let discountAmount: number;
  if (config.mode === 'percent') {
    discountAmount = amount * (config.globalValue / 100);
  } else {
    discountAmount = config.globalValue;
  }

  // Ensure discount doesn't exceed the amount
  discountAmount = Math.min(discountAmount, amount);
  
  return {
    discountAmount: Math.round(discountAmount * 100) / 100,
    finalAmount: Math.round((amount - discountAmount) * 100) / 100,
  };
}
