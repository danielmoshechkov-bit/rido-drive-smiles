/**
 * Szybki paragon — sprzedaż od ręki, bez zakładania zlecenia.
 *
 * Warsztat sprzedaje nie tylko naprawy: część, płyn, żarówka — klient płaci i wychodzi.
 * Pozycje wpisuje się z klawiatury (Enter dodaje kolejną), reszta logiki jest wspólna
 * z paragonem ze zlecenia: nazwa fiskalna, sekcja nabywcy z NIP-em, mostek/drukarka,
 * wpis w fiscal_receipts i blokada podwójnej fiskalizacji.
 *
 * Dokument źródłowy: document_type = 'kasa_szybka', document_id = własny UUID sprzedaży,
 * więc paragon nie jest powiązany z żadnym zleceniem, a mimo to jest pełnoprawną sprzedażą
 * widoczną w Kasie fiskalnej i w podsumowaniu obrotu.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Printer, Receipt, Trash2, TriangleAlert, CheckCircle2, Wallet, CreditCard, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFiscalPrinter, useFiscalizeReceipt, FiscalError } from '@/hooks/useFiscal';
import { computeReceiptTotalGrosze, formatPln, toGrosze, type FiscalItemInput } from '@/lib/fiscal';
import { DEFAULT_FISCAL_NAME_LENGTH, toFiscalName } from '@/lib/fiscalName';
import { FiscalBuyerSection, buyerBlocksPrint, buyerNipForPrint, type BuyerState } from './FiscalBuyerSection';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
}

type PaymentMethod = 'cash' | 'card' | 'blik';

const PAYMENT_LABELS: Record<PaymentMethod, { label: string; printer: string; icon: typeof Wallet }> = {
  cash: { label: 'Gotówka', printer: 'GOTOWKA', icon: Wallet },
  card: { label: 'Karta', printer: 'KARTA', icon: CreditCard },
  blik: { label: 'BLIK', printer: 'BLIK', icon: Smartphone },
};

/**
 * Wiersz tabeli — wszystkie pola jako tekst, żeby dało się je swobodnie edytować
 * w miejscu (np. skasować cenę i wpisać od nowa) bez walki z parsowaniem liczb.
 */
interface Row {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
}

let rowSeq = 0;
const emptyRow = (vatRate = '23', unit = 'szt'): Row => ({
  key: `row-${++rowSeq}`,
  name: '',
  quantity: '1',
  unit,
  unitPrice: '',
  vatRate,
});

/** Wiersz liczy się do paragonu, gdy ma sensowną nazwę, ilość i cenę. */
function rowToItem(row: Row): FiscalItemInput | null {
  const name = row.name.replace(/\s+/g, ' ').trim();
  const quantity = Number(String(row.quantity).replace(',', '.'));
  const unitPrice = Number(String(row.unitPrice).replace(',', '.'));
  if (name.replace(/\s/g, '').length < 5) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  return {
    name,
    quantity,
    unit: (row.unit || 'szt').slice(0, 4),
    unitPrice,
    vatRate: row.vatRate,
  };
}

export function FiscalQuickReceiptDialog({ open, onOpenChange, providerId }: Props) {
  const { data: printer } = useFiscalPrinter(providerId);
  const fiscalize = useFiscalizeReceipt(providerId);

  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [buyer, setBuyer] = useState<BuyerState>({ buyerType: 'individual', nip: '', printNip: true });
  const [suggestions, setSuggestions] = useState<Array<{ name: string; price: number; unit: string; vat: string }>>([]);
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [result, setResult] = useState<{ receiptNumber: number | null; total: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const nameLength = printer?.item_name_length ?? DEFAULT_FISCAL_NAME_LENGTH;
  const vatKeys = Object.keys((printer?.vat_map as Record<string, string>) ?? { '23': 'A', '8': 'B', '5': 'C', '0': 'D', zw: 'E' });

  useEffect(() => {
    if (!open) return;
    setRows([emptyRow()]);
    setMethod('cash');
    setBuyer({ buyerType: 'individual', nip: '', printNip: true });
    setResult(null);
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [open]);

  // Podpowiedzi z magazynu — wygodne, ale całość musi działać też w pełni ręcznie.
  const suggestTerm = rows.find((row) => row.key === suggestFor)?.name ?? '';
  useEffect(() => {
    const term = suggestTerm.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from('inventory_products')
        .select('name_sales, fiscal_name, default_sale_price_gross, unit, vat_rate')
        .ilike('name_sales', `%${term}%`)
        .eq('is_active', true)
        .limit(6);
      if (cancelled) return;
      setSuggestions(
        ((data as any[]) ?? []).map((row) => ({
          name: row.fiscal_name || row.name_sales || '',
          price: Number(row.default_sale_price_gross) || 0,
          unit: row.unit || 'szt',
          vat: row.vat_rate != null ? String(row.vat_rate) : '23',
        })),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [suggestTerm]);

  /** Pozycje wynikają wprost z tabeli — nic nie trzeba „zatwierdzać". */
  const items = useMemo(() => rows.map(rowToItem).filter(Boolean) as FiscalItemInput[], [rows]);
  const totalGrosze = useMemo(() => computeReceiptTotalGrosze(items), [items]);

  /** Pisanie w ostatnim wierszu dokleja pod spodem kolejny pusty — jak w wycenie zlecenia. */
  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => {
      const next = prev.map((row) => (row.key === key ? { ...row, ...patch } : row));
      const last = next[next.length - 1];
      const lastTouched = last.name.trim() || last.unitPrice.trim();
      if (lastTouched) next.push(emptyRow(last.vatRate, last.unit));
      return next;
    });
  };

  const removeRow = (key: string) =>
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length ? next : [emptyRow()];
    });

  const handlePrint = async () => {
    if (!items.length) return;
    setError(null);
    try {
      const response = await fiscalize.mutateAsync({
        printerId: printer?.id,
        printer,
        documentType: 'kasa_szybka',
        // Własny identyfikator sprzedaży — paragon nie jest powiązany ze zleceniem,
        // a blokada podwójnej fiskalizacji nadal działa (jeden paragon na tę sprzedaż).
        documentId: crypto.randomUUID(),
        items: items.map((item) => ({ ...item, name: toFiscalName(item.name, nameLength) })),
        payments: [{ name: PAYMENT_LABELS[method].printer, amount: totalGrosze / 100 }],
        buyerNip: buyerNipForPrint(buyer),
      });
      setResult({ receiptNumber: response.receiptNumber, total: response.total });
      toast.success(
        response.receiptNumber ? `Paragon wydrukowany (nr ${response.receiptNumber})` : 'Paragon wydrukowany',
      );
    } catch (e) {
      const fiscalError = e as FiscalError;
      setError({ code: fiscalError.code ?? 'UNKNOWN', message: fiscalError.message });
    }
  };

  const canPrint = Boolean(printer) && items.length > 0 && !buyerBlocksPrint(buyer) && !fiscalize.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Szybki paragon
          </DialogTitle>
          <DialogDescription>Sprzedaż od ręki — bez zakładania zlecenia.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Paragon wydrukowany</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Numer paragonu z drukarki: <b className="text-foreground">{result.receiptNumber ?? '—'}</b></div>
              <div>Kwota: <b className="text-foreground">{result.total.toFixed(2).replace('.', ',')} zł</b></div>
              <div>Forma płatności: <b className="text-foreground">{PAYMENT_LABELS[method].label}</b></div>
              {printer?.mode === 'training' && (
                <div className="text-amber-600">Drukarka pracuje w trybie szkoleniowym — wydruk niefiskalny.</div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setRows([emptyRow()]);
                setTimeout(() => nameRef.current?.focus(), 80);
              }}
            >
              Wystaw kolejny
            </Button>
          </div>
        ) : !printer ? (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              Nie skonfigurowano drukarki fiskalnej. Przejdź do <b>Ustawienia → Fiskalizacja</b>.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* Pozycje wpisywane wprost w tabelę — jak w wycenie zlecenia.
                Pod ostatnim wypełnianym wierszem sam dokleja się kolejny pusty,
                a paragon bierze wszystkie wypełnione wiersze: co widać, to się drukuje. */}
            <div className="rounded-md border overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[42%]">Nazwa</TableHead>
                    <TableHead className="w-[12%] text-right">Ilość</TableHead>
                    <TableHead className="w-[12%]">Jedn.</TableHead>
                    <TableHead className="w-[16%] text-right">Cena brutto</TableHead>
                    <TableHead className="w-[12%]">VAT</TableHead>
                    <TableHead className="w-[10%] text-right">Wartość</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const item = rowToItem(row);
                    const isLast = index === rows.length - 1;
                    const touched = row.name.trim() || row.unitPrice.trim();
                    return (
                      <TableRow key={row.key} className={item ? '' : 'opacity-90'}>
                        <TableCell className="relative p-1">
                          <Input
                            ref={index === 0 ? nameRef : undefined}
                            value={row.name}
                            onChange={(e) => { updateRow(row.key, { name: e.target.value }); setSuggestFor(row.key); }}
                            onBlur={() => setTimeout(() => setSuggestFor((current) => (current === row.key ? null : current)), 150)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const nextRow = rows[index + 1];
                                if (nextRow) {
                                  const input = document.querySelector<HTMLInputElement>(`[data-row="${nextRow.key}"]`);
                                  input?.focus();
                                }
                              }
                            }}
                            data-row={row.key}
                            placeholder={isLast ? 'np. Żarówka H7 55W' : ''}
                            className="h-8 border-0 shadow-none focus-visible:ring-1"
                          />
                          {suggestFor === row.key && suggestions.length > 0 && (
                            <div className="absolute z-50 top-full left-1 right-1 mt-0.5 rounded-md border bg-popover shadow-md max-h-44 overflow-auto">
                              {suggestions.map((suggestion, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    updateRow(row.key, {
                                      name: suggestion.name,
                                      unitPrice: suggestion.price ? String(suggestion.price) : row.unitPrice,
                                      unit: suggestion.unit || row.unit,
                                      vatRate: vatKeys.includes(suggestion.vat) ? suggestion.vat : row.vatRate,
                                    });
                                    setSuggestFor(null);
                                  }}
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
                        <TableCell className="p-1">
                          <Input
                            value={row.quantity}
                            onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                            className="h-8 text-right border-0 shadow-none focus-visible:ring-1"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={row.unit}
                            onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                            className="h-8 border-0 shadow-none focus-visible:ring-1"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            value={row.unitPrice}
                            onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                            placeholder="0,00"
                            className="h-8 text-right border-0 shadow-none focus-visible:ring-1"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Select value={row.vatRate} onValueChange={(value) => updateRow(row.key, { vatRate: value })}>
                            <SelectTrigger className="h-8 border-0 shadow-none focus:ring-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {vatKeys.map((rate) => (
                                <SelectItem key={rate} value={rate}>{rate === 'zw' ? 'zw.' : `${rate}%`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-sm">
                          {item ? formatPln(Math.round(toGrosze(item.unitPrice) * item.quantity)) : '—'}
                        </TableCell>
                        <TableCell className="p-1">
                          {touched && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeRow(row.key)}>
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
            <p className="text-[11px] text-muted-foreground">
              Wpisuj pozycje wierszami — kolejny pusty dokleja się sam. Enter przeskakuje niżej.
              Nazwy dłuższe niż {nameLength} znaków są skracane na paragonie.
            </p>

            <FiscalBuyerSection
              {...buyer}
              onChange={(patch) => setBuyer((prev) => ({ ...prev, ...patch }))}
              totalGrosze={totalGrosze}
            />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Forma płatności</div>
                <div className="flex gap-2">
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((key) => {
                    const { label, icon: Icon } = PAYMENT_LABELS[key];
                    return (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={method === key ? 'default' : 'outline'}
                        onClick={() => setMethod(key)}
                        className="gap-1"
                      >
                        <Icon className="h-4 w-4" /> {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Do zapłaty</div>
                <div className="text-2xl font-bold">{formatPln(totalGrosze)}</div>
              </div>
            </div>

            {printer.mode === 'training' && (
              <Alert>
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Drukarka pracuje w <b>trybie szkoleniowym</b> — paragon będzie niefiskalny.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Zamknij' : 'Anuluj'}
          </Button>
          {!result && (
            <Button onClick={handlePrint} disabled={!canPrint} className="gap-2">
              {fiscalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {fiscalize.isPending ? 'Drukowanie…' : 'Drukuj paragon'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
