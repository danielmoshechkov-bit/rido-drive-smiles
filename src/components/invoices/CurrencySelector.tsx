import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronDown, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Currency = string;

interface CurrencyOption {
  value: string;
  label: string;
}

// All world currencies - only codes, no symbols
export const CURRENCIES: CurrencyOption[] = [
  { value: 'PLN', label: 'Polski złoty' },
  { value: 'EUR', label: 'Euro' },
  { value: 'USD', label: 'Dolar amerykański' },
  { value: 'GBP', label: 'Funt brytyjski' },
  { value: 'CHF', label: 'Frank szwajcarski' },
  { value: 'CZK', label: 'Korona czeska' },
  { value: 'SEK', label: 'Korona szwedzka' },
  { value: 'NOK', label: 'Korona norweska' },
  { value: 'DKK', label: 'Korona duńska' },
  { value: 'HUF', label: 'Forint węgierski' },
  { value: 'RON', label: 'Lej rumuński' },
  { value: 'BGN', label: 'Lew bułgarski' },
  { value: 'HRK', label: 'Kuna chorwacka' },
  { value: 'UAH', label: 'Hrywna ukraińska' },
  { value: 'RUB', label: 'Rubel rosyjski' },
  { value: 'TRY', label: 'Lira turecka' },
  { value: 'JPY', label: 'Jen japoński' },
  { value: 'CNY', label: 'Juan chiński' },
  { value: 'KRW', label: 'Won południowokoreański' },
  { value: 'INR', label: 'Rupia indyjska' },
  { value: 'AUD', label: 'Dolar australijski' },
  { value: 'CAD', label: 'Dolar kanadyjski' },
  { value: 'NZD', label: 'Dolar nowozelandzki' },
  { value: 'MXN', label: 'Peso meksykańskie' },
  { value: 'BRL', label: 'Real brazylijski' },
  { value: 'ARS', label: 'Peso argentyńskie' },
  { value: 'ZAR', label: 'Rand południowoafrykański' },
  { value: 'AED', label: 'Dirham ZEA' },
  { value: 'SAR', label: 'Rial saudyjski' },
  { value: 'ILS', label: 'Nowy szekel izraelski' },
  { value: 'THB', label: 'Baht tajski' },
  { value: 'SGD', label: 'Dolar singapurski' },
  { value: 'HKD', label: 'Dolar hongkoński' },
  { value: 'IDR', label: 'Rupia indonezyjska' },
  { value: 'MYR', label: 'Ringgit malezyjski' },
  { value: 'PHP', label: 'Peso filipińskie' },
  { value: 'VND', label: 'Dong wietnamski' },
  { value: 'EGP', label: 'Funt egipski' },
  { value: 'NGN', label: 'Naira nigeryjska' },
  { value: 'KES', label: 'Szyling kenijski' },
  { value: 'PKR', label: 'Rupia pakistańska' },
  { value: 'BDT', label: 'Taka bangladeska' },
  { value: 'CLP', label: 'Peso chilijskie' },
  { value: 'COP', label: 'Peso kolumbijskie' },
  { value: 'PEN', label: 'Sol peruwiański' },
];

interface CurrencySelectorProps {
  value: Currency;
  onChange: (currency: Currency) => void;
}

export function CurrencySelector({ value, onChange }: CurrencySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedCurrency = CURRENCIES.find(c => c.value === value) || CURRENCIES[0];

  const filteredCurrencies = useMemo(() => {
    if (!search) return CURRENCIES;
    const searchLower = search.toLowerCase();
    return CURRENCIES.filter(c => 
      c.value.toLowerCase().includes(searchLower) ||
      c.label.toLowerCase().includes(searchLower)
    );
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="w-full justify-between h-12 pt-4 pb-1 px-3 hover:bg-transparent">
          <span className="font-medium text-sm">{selectedCurrency.value}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj waluty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {filteredCurrencies.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nie znaleziono waluty
              </p>
            ) : (
              filteredCurrencies.map((currency) => (
                <button
                  key={currency.value}
                  onClick={() => {
                    onChange(currency.value);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left",
                    value === currency.value && "bg-accent"
                  )}
                >
                  <span className="font-bold w-10 shrink-0">{currency.value}</span>
                  <span className="flex-1 truncate text-muted-foreground">{currency.label}</span>
                  {value === currency.value && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function getCurrencySymbol(currency: Currency): string {
  return currency; // Return just the code
}

export function formatCurrencyAmount(amount: number, currency: Currency): string {
  const localeMap: Record<string, string> = {
    PLN: 'pl-PL',
    EUR: 'de-DE',
    USD: 'en-US',
    GBP: 'en-GB',
    CHF: 'de-CH',
    CZK: 'cs-CZ',
    JPY: 'ja-JP',
    CNY: 'zh-CN',
  };

  try {
    return new Intl.NumberFormat(localeMap[currency] || 'en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
