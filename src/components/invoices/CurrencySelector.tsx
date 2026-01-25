import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type Currency = 'PLN' | 'EUR' | 'USD' | 'GBP' | 'CHF' | 'CZK';

interface CurrencyOption {
  value: Currency;
  label: string;
  symbol: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { value: 'PLN', label: 'PLN - Polski złoty', symbol: 'zł' },
  { value: 'EUR', label: 'EUR - Euro', symbol: '€' },
  { value: 'USD', label: 'USD - Dolar amerykański', symbol: '$' },
  { value: 'GBP', label: 'GBP - Funt brytyjski', symbol: '£' },
  { value: 'CHF', label: 'CHF - Frank szwajcarski', symbol: 'CHF' },
  { value: 'CZK', label: 'CZK - Korona czeska', symbol: 'Kč' },
];

interface CurrencySelectorProps {
  value: Currency;
  onChange: (currency: Currency) => void;
}

export function CurrencySelector({ value, onChange }: CurrencySelectorProps) {
  const selectedCurrency = CURRENCIES.find(c => c.value === value) || CURRENCIES[0];

  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger className="w-[140px]">
        <SelectValue>
          <span className="flex items-center gap-2">
            <span className="font-bold">{selectedCurrency.symbol}</span>
            <span>{selectedCurrency.value}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((currency) => (
          <SelectItem key={currency.value} value={currency.value}>
            <span className="flex items-center gap-2">
              <span className="font-bold w-6">{currency.symbol}</span>
              <span>{currency.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCIES.find(c => c.value === currency)?.symbol || 'zł';
}

export function formatCurrencyAmount(amount: number, currency: Currency): string {
  const localeMap: Record<Currency, string> = {
    PLN: 'pl-PL',
    EUR: 'de-DE',
    USD: 'en-US',
    GBP: 'en-GB',
    CHF: 'de-CH',
    CZK: 'cs-CZ',
  };

  return new Intl.NumberFormat(localeMap[currency], {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
