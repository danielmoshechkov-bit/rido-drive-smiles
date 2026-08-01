/**
 * Tabela pozycji szybkiego paragonu — układ jak w edytorze faktury:
 * dla KAŻDEJ pozycji osobno cena netto i brutto (przeliczają się nawzajem)
 * oraz własny rabat (% albo zł). Kolejny pusty wiersz dokleja się sam.
 *
 * Powód rozbicia na osobny plik: dialog robił się nieczytelny, a ta tabela jest
 * najbardziej „mięsistą" częścią sprzedaży od ręki.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2 } from 'lucide-react';
import { formatPln, toGrosze, type FiscalItemInput } from '@/lib/fiscal';
import { applyLineDiscount, grossToNet, netToGross, parseAmount, type DiscountType } from '@/lib/fiscalPricing';

/** Minimalna liczba znaków znaczących w nazwie — wymóg drukarki (błąd „B"). */
export const MIN_NAME_CHARS = 5;

export interface QuickRow {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  priceNet: string;
  priceGross: string;
  vatRate: string;
  discountType: DiscountType;
  discountValue: string;
}

let rowSeq = 0;
export const emptyQuickRow = (vatRate = '23', unit = 'szt'): QuickRow => ({
  key: `row-${++rowSeq}`,
  name: '',
  quantity: '1',
  unit,
  priceNet: '',
  priceGross: '',
  vatRate,
  discountType: 'percent',
  discountValue: '',
});

function significantChars(name: string): number {
  return name.replace(/\s/g, '').length;
}

/** Co blokuje policzenie wiersza — pokazujemy to wprost, zamiast cicho pomijać pozycję. */
export function rowProblem(row: QuickRow): string | null {
  const name = row.name.trim();
  const gross = parseAmount(row.priceGross);
  const quantity = parseAmount(row.quantity);
  if (!name && !row.priceGross.trim()) return null; // pusty wiersz — nie zgłaszamy nic
  if (significantChars(name) < MIN_NAME_CHARS) return `nazwa: min. ${MIN_NAME_CHARS} znaków`;
  if (!Number.isFinite(quantity) || quantity <= 0) return 'ilość musi być większa od zera';
  if (!Number.isFinite(gross) || gross <= 0) return 'podaj cenę';
  return null;
}

/** Wiersz → pozycja paragonu. Na drukarkę idzie cena BRUTTO po rabacie. */
export function quickRowToItem(row: QuickRow, discountsEnabled: boolean): FiscalItemInput | null {
  if (rowProblem(row) !== null) return null;
  const name = row.name.replace(/\s+/g, ' ').trim();
  const quantity = parseAmount(row.quantity);
  const gross = parseAmount(row.priceGross);
  if (!name || !Number.isFinite(quantity) || !Number.isFinite(gross) || gross <= 0) return null;

  const discount = parseAmount(row.discountValue);
  const unitPrice =
    discountsEnabled && Number.isFinite(discount) && discount > 0
      ? applyLineDiscount(gross, quantity, discount, row.discountType)
      : gross;
  if (unitPrice <= 0) return null;

  return { name, quantity, unit: (row.unit || 'szt').slice(0, 4), unitPrice, vatRate: row.vatRate };
}

interface Props {
  rows: QuickRow[];
  vatKeys: string[];
  discountsEnabled: boolean;
  /** Współczynnik rabatu na cały paragon — tylko do podglądu wartości w wierszu. */
  globalFactor: number;
  onChange: (key: string, patch: Partial<QuickRow>) => void;
  onRemove: (key: string) => void;
  firstInputRef?: React.Ref<HTMLInputElement>;
  onNameFocus?: (key: string) => void;
  onNameBlur?: (key: string) => void;
  suggestionsFor?: string | null;
  suggestions?: Array<{ name: string; price: number; unit: string; vat: string }>;
  onPickSuggestion?: (key: string, suggestion: { name: string; price: number; unit: string; vat: string }) => void;
}

export function FiscalQuickReceiptRows({
  rows,
  vatKeys,
  discountsEnabled,
  globalFactor,
  onChange,
  onRemove,
  firstInputRef,
  onNameFocus,
  onNameBlur,
  suggestionsFor,
  suggestions = [],
  onPickSuggestion,
}: Props) {
  /** Wpisanie netto przelicza brutto i odwrotnie — jak w edytorze faktury. */
  const setNet = (row: QuickRow, value: string) => {
    const net = parseAmount(value);
    onChange(row.key, {
      priceNet: value,
      priceGross: Number.isFinite(net) && net > 0 ? String(netToGross(net, row.vatRate).toFixed(2)) : '',
    });
  };
  const setGross = (row: QuickRow, value: string) => {
    const gross = parseAmount(value);
    onChange(row.key, {
      priceGross: value,
      priceNet: Number.isFinite(gross) && gross > 0 ? String(grossToNet(gross, row.vatRate).toFixed(2)) : '',
    });
  };
  const setVat = (row: QuickRow, vatRate: string) => {
    const net = parseAmount(row.priceNet);
    onChange(row.key, {
      vatRate,
      priceGross: Number.isFinite(net) && net > 0 ? String(netToGross(net, vatRate).toFixed(2)) : row.priceGross,
    });
  };

  const cellInput = 'h-8 border-0 shadow-none focus-visible:ring-1 px-2';

  return (
    <div className="rounded-md border overflow-visible">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[26%]">Nazwa towaru/usługi</TableHead>
            <TableHead className="w-[8%] text-right">Ilość</TableHead>
            <TableHead className="w-[8%]">Jedn.</TableHead>
            <TableHead className="w-[13%] text-right">Cena netto</TableHead>
            <TableHead className="w-[13%] text-right">Cena brutto</TableHead>
            <TableHead className="w-[10%]">VAT</TableHead>
            {discountsEnabled && <TableHead className="w-[12%]">Rabat</TableHead>}
            <TableHead className="w-[12%] text-right">Wartość</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const item = quickRowToItem(row, discountsEnabled);
            const finalUnit = item ? Math.round(item.unitPrice * globalFactor * 100) / 100 : 0;
            const problem = rowProblem(row);
            const touched = row.name.trim() || row.priceGross.trim();
            const isLast = index === rows.length - 1;

            return (
              <TableRow key={row.key} className={problem ? 'bg-destructive/5' : ''}>
                <TableCell className="relative p-1 align-top">
                  <Input
                    ref={index === 0 ? firstInputRef : undefined}
                    value={row.name}
                    onChange={(e) => onChange(row.key, { name: e.target.value })}
                    onFocus={() => onNameFocus?.(row.key)}
                    onBlur={() => onNameBlur?.(row.key)}
                    data-row={row.key}
                    placeholder={isLast ? 'np. Żarówka H7 55W' : ''}
                    className={`${cellInput} ${problem?.startsWith('nazwa') ? 'ring-1 ring-destructive' : ''}`}
                  />
                  {problem && <div className="text-[10px] text-destructive px-2 pt-0.5">{problem}</div>}

                  {suggestionsFor === row.key && suggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-1 right-1 mt-0.5 rounded-md border bg-popover shadow-md max-h-44 overflow-auto">
                      {suggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          type="button"
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onPickSuggestion?.(row.key, suggestion)}
                        >
                          <span className="truncate">{suggestion.name}</span>
                          {suggestion.price > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">{suggestion.price.toFixed(2)} zł</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </TableCell>

                <TableCell className="p-1 align-top">
                  <Input
                    value={row.quantity}
                    onChange={(e) => onChange(row.key, { quantity: e.target.value })}
                    className={`${cellInput} text-right`}
                  />
                </TableCell>

                <TableCell className="p-1 align-top">
                  <Input
                    value={row.unit}
                    onChange={(e) => onChange(row.key, { unit: e.target.value })}
                    className={cellInput}
                  />
                </TableCell>

                <TableCell className="p-1 align-top">
                  <Input
                    value={row.priceNet}
                    onChange={(e) => setNet(row, e.target.value)}
                    placeholder="0,00"
                    className={`${cellInput} text-right`}
                  />
                </TableCell>

                <TableCell className="p-1 align-top">
                  <Input
                    value={row.priceGross}
                    onChange={(e) => setGross(row, e.target.value)}
                    placeholder="0,00"
                    className={`${cellInput} text-right font-medium`}
                  />
                </TableCell>

                <TableCell className="p-1 align-top">
                  <Select value={row.vatRate} onValueChange={(value) => setVat(row, value)}>
                    <SelectTrigger className="h-8 min-w-[72px] border-0 shadow-none focus:ring-1 px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vatKeys.map((rate) => (
                        <SelectItem key={rate} value={rate}>
                          {rate === 'zw' ? 'zw.' : `${rate}%`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                {discountsEnabled && (
                  <TableCell className="p-1 align-top">
                    <div className="flex gap-1">
                      <Input
                        value={row.discountValue}
                        onChange={(e) => onChange(row.key, { discountValue: e.target.value })}
                        placeholder="0"
                        className={`${cellInput} text-right w-14`}
                      />
                      <Select
                        value={row.discountType}
                        onValueChange={(value) => onChange(row.key, { discountType: value as DiscountType })}
                      >
                        <SelectTrigger className="h-8 w-14 border-0 shadow-none focus:ring-1 px-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="amount">zł</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                )}

                <TableCell className="text-right whitespace-nowrap text-sm align-top pt-3">
                  {item ? formatPln(Math.round(toGrosze(finalUnit) * item.quantity)) : '—'}
                </TableCell>

                <TableCell className="p-1 align-top">
                  {touched && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRemove(row.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
