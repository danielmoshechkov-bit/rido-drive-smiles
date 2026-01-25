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
  symbol: string;
}

// All world currencies
export const CURRENCIES: CurrencyOption[] = [
  { value: 'PLN', label: 'Polski złoty', symbol: 'zł' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'USD', label: 'Dolar amerykański', symbol: '$' },
  { value: 'GBP', label: 'Funt brytyjski', symbol: '£' },
  { value: 'CHF', label: 'Frank szwajcarski', symbol: 'CHF' },
  { value: 'CZK', label: 'Korona czeska', symbol: 'Kč' },
  { value: 'SEK', label: 'Korona szwedzka', symbol: 'kr' },
  { value: 'NOK', label: 'Korona norweska', symbol: 'kr' },
  { value: 'DKK', label: 'Korona duńska', symbol: 'kr' },
  { value: 'HUF', label: 'Forint węgierski', symbol: 'Ft' },
  { value: 'RON', label: 'Lej rumuński', symbol: 'lei' },
  { value: 'BGN', label: 'Lew bułgarski', symbol: 'лв' },
  { value: 'HRK', label: 'Kuna chorwacka', symbol: 'kn' },
  { value: 'UAH', label: 'Hrywna ukraińska', symbol: '₴' },
  { value: 'RUB', label: 'Rubel rosyjski', symbol: '₽' },
  { value: 'TRY', label: 'Lira turecka', symbol: '₺' },
  { value: 'JPY', label: 'Jen japoński', symbol: '¥' },
  { value: 'CNY', label: 'Juan chiński', symbol: '¥' },
  { value: 'KRW', label: 'Won południowokoreański', symbol: '₩' },
  { value: 'INR', label: 'Rupia indyjska', symbol: '₹' },
  { value: 'AUD', label: 'Dolar australijski', symbol: 'A$' },
  { value: 'CAD', label: 'Dolar kanadyjski', symbol: 'C$' },
  { value: 'NZD', label: 'Dolar nowozelandzki', symbol: 'NZ$' },
  { value: 'MXN', label: 'Peso meksykańskie', symbol: '$' },
  { value: 'BRL', label: 'Real brazylijski', symbol: 'R$' },
  { value: 'ARS', label: 'Peso argentyńskie', symbol: '$' },
  { value: 'ZAR', label: 'Rand południowoafrykański', symbol: 'R' },
  { value: 'AED', label: 'Dirham ZEA', symbol: 'د.إ' },
  { value: 'SAR', label: 'Rial saudyjski', symbol: '﷼' },
  { value: 'ILS', label: 'Nowy szekel izraelski', symbol: '₪' },
  { value: 'THB', label: 'Baht tajski', symbol: '฿' },
  { value: 'SGD', label: 'Dolar singapurski', symbol: 'S$' },
  { value: 'HKD', label: 'Dolar hongkoński', symbol: 'HK$' },
  { value: 'IDR', label: 'Rupia indonezyjska', symbol: 'Rp' },
  { value: 'MYR', label: 'Ringgit malezyjski', symbol: 'RM' },
  { value: 'PHP', label: 'Peso filipińskie', symbol: '₱' },
  { value: 'VND', label: 'Dong wietnamski', symbol: '₫' },
  { value: 'EGP', label: 'Funt egipski', symbol: 'E£' },
  { value: 'NGN', label: 'Naira nigeryjska', symbol: '₦' },
  { value: 'KES', label: 'Szyling kenijski', symbol: 'KSh' },
  { value: 'PKR', label: 'Rupia pakistańska', symbol: '₨' },
  { value: 'BDT', label: 'Taka bangladeska', symbol: '৳' },
  { value: 'CLP', label: 'Peso chilijskie', symbol: '$' },
  { value: 'COP', label: 'Peso kolumbijskie', symbol: '$' },
  { value: 'PEN', label: 'Sol peruwiański', symbol: 'S/' },
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
      c.label.toLowerCase().includes(searchLower) ||
      c.symbol.toLowerCase().includes(searchLower)
    );
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between h-10">
          <span className="flex items-center gap-1 truncate">
            <span className="font-bold">{selectedCurrency.symbol}</span>
            <span className="text-xs">{selectedCurrency.value}</span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
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
                  <span className="font-bold w-8 shrink-0">{currency.symbol}</span>
                  <span className="flex-1 truncate">{currency.value} - {currency.label}</span>
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
  return CURRENCIES.find(c => c.value === currency)?.symbol || 'zł';
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
